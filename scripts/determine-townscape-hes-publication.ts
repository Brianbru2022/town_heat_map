import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { booleanEqual, booleanIntersects, booleanWithin, distance, point } from '@turf/turf';
import type { Feature, Geometry, MultiPolygon, Polygon } from 'geojson';
import shp from 'shpjs';
import type {
  GeographicRelationship,
  HeritageFeature,
  ProjectPackage,
  SourceRecord,
} from '../src/domain/models';
import { assessProjectPackage, setFeaturePublicationState } from '../src/domain/publication';
import { geometryIsStructurallyValid, validateFeatures } from '../src/domain/validation';

const reviewedAt = new Date().toISOString();
const reviewDate = reviewedAt.slice(0, 10);
const dryRun = process.argv.includes('--dry-run');
const auditPath = resolve('data/review/published-project-final-audit.json');
const decisionRegisterPath = resolve('data/review/townscape-hes-exception-review-2026-09-03.json');
const reportPath = resolve('data/review/townscape-hes-individual-determinations-2026-09-03.json');
const localLibraryArchive = resolve('data/reference/scotland-hes-library.zip');
const extractedLibraryRoot = resolve('data/runtime/townscape-hes-evidence-2026-09-03/scotland-hes');
const projectPaths = [
  'data/projects/alloa.json',
  'data/projects/alva.json',
  'data/projects/culross.json',
  'data/projects/kincardine.json',
  'data/projects/tillicoultry.json',
  'data/projects/quarriers-village.json',
  'data/projects/biggar.json',
  'data/projects/killin.json',
];

type Dataset =
  | 'listedBuildings'
  | 'conservationAreas'
  | 'designedLandscapes'
  | 'scheduledMonuments'
  | 'canmorePoints';
type AuthoritativeFeature = Feature<Geometry, Record<string, unknown>>;
type CohortRecord = { projectId: string; id: string; name: string; state: string; reason: string };
type DecisionRegister = {
  reviewedAt: string;
  remainingHesNrheCohorts: Array<{
    state: string;
    reason: string;
    count: number;
    records: CohortRecord[];
  }>;
};

const datasetFiles: Record<Dataset, string> = {
  listedBuildings: 'lb_scotland/Listed_Buildings',
  conservationAreas: 'ca_scotland/Conservation_Areas',
  designedLandscapes: 'gdl_scotland/Gardens_and_Designed_Landscapes',
  scheduledMonuments: 'sam_scotland/Scheduled_Monuments',
  canmorePoints: 'Canmore_Points/Canmore_Points',
};
const alloaReferences: Record<string, { dataset: Dataset; reference: string }> = {
  'curated:area-old-alloa-conservation': { dataset: 'conservationAreas', reference: 'CA507' },
  'curated:area-alloa-glebe-conservation': { dataset: 'conservationAreas', reference: 'CA506' },
  'curated:context-alloa-house': { dataset: 'listedBuildings', reference: 'LB20959' },
  'curated:context-alloa-glassworks-site': { dataset: 'canmorePoints', reference: '47211' },
};
const visitorClaimPattern =
  /\b(access|admission|amenit(?:y|ies)|condition|current use|dog|facilit(?:y|ies)|opening hours|parking|public|recommend|toilet|visitor)\b/i;

function referenceFor(
  feature: HeritageFeature,
): { dataset: Dataset; reference: string } | undefined {
  const alloa = alloaReferences[feature.id];
  if (alloa) return alloa;
  const listed = feature.id.match(/^curated:hes-lb(\d+)$/i);
  if (listed) return { dataset: 'listedBuildings', reference: `LB${listed[1]}` };
  const landscape = feature.id.match(/^curated:hes-gdl(\d+)$/i);
  if (landscape)
    return { dataset: 'designedLandscapes', reference: `GDL${landscape[1].padStart(5, '0')}` };
  const scheduled = feature.id.match(/^curated:hes-sm(\d+)$/i);
  if (scheduled) return { dataset: 'scheduledMonuments', reference: `SM${scheduled[1]}` };
  return undefined;
}

function sourceReference(record: AuthoritativeFeature): string | undefined {
  const properties = record.properties;
  for (const field of ['DES_REF', 'CANMOREID', 'SITE_ID', 'SMR_ID']) {
    const value = properties[field];
    if (typeof value === 'string' || typeof value === 'number') return String(value);
  }
  return undefined;
}

function sourceTitle(record: AuthoritativeFeature): string | undefined {
  for (const field of ['DES_TITLE', 'NMRSNAME', 'SITE_NAME', 'NAME']) {
    const value = record.properties[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function sourcePrecision(record: AuthoritativeFeature): string | undefined {
  const value = record.properties.PRECISION ?? record.properties.ACCURACY;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function loadLayer(dataset: Dataset): Promise<AuthoritativeFeature[]> {
  const base = resolve(extractedLibraryRoot, datasetFiles[dataset]);
  const [shape, dbf, prj, cpg] = await Promise.all(
    ['.shp', '.dbf', '.prj', '.cpg'].map((suffix) => readFile(`${base}${suffix}`)),
  );
  // shpjs supports its documented component-buffer form, but its bundled
  // DefinitelyTyped declaration exposes only the zip-buffer overload.
  const collection = (await shp({ shp: shape, dbf, prj, cpg } as never)) as {
    features: AuthoritativeFeature[];
  };
  return collection.features;
}

function geographicRelationship(
  geometry: Geometry,
  pkg: ProjectPackage,
): { classification: GeographicRelationship; rationale: string } {
  const townStudy = pkg.project.townStudyArea;
  if (!townStudy)
    return {
      classification: 'ambiguous',
      rationale: 'No declared Townscape locality polygon is available.',
    };
  if (!geometryIsStructurallyValid(geometry))
    return {
      classification: 'ambiguous',
      rationale: 'The retained authoritative geometry is invalid.',
    };
  const candidate: Feature<Geometry> = { type: 'Feature', properties: {}, geometry };
  const locality = townStudy.localityBoundary as Feature<Polygon | MultiPolygon>;
  if (booleanWithin(candidate, locality))
    return {
      classification: 'within_town_locality',
      rationale: 'The locally held HES geometry is wholly within the declared Townscape locality.',
    };
  if (booleanIntersects(candidate, locality))
    return {
      classification: 'ambiguous',
      rationale:
        'The locally held HES geometry crosses the locality boundary; a designation-identity decision is required.',
    };
  return {
    classification: 'out_of_scope',
    rationale: 'The locally held HES geometry is outside the declared Townscape locality.',
  };
}

function geometryMatches(
  feature: HeritageFeature,
  evidence: Geometry,
): { matches: boolean; note: string } {
  if (!feature.geometry || !geometryIsStructurallyValid(feature.geometry))
    return { matches: false, note: 'The catalogue geometry is missing or invalid.' };
  if (feature.geometry.type === 'Point' && evidence.type === 'Point') {
    const metres =
      distance(point(feature.geometry.coordinates), point(evidence.coordinates), {
        units: 'kilometres',
      }) * 1000;
    return {
      matches: metres <= 20,
      note: `Catalogue and locally held HES points are ${metres.toFixed(2)}m apart.`,
    };
  }
  const candidate: Feature<Geometry> = {
    type: 'Feature',
    properties: {},
    geometry: feature.geometry,
  };
  const authoritative: Feature<Geometry> = { type: 'Feature', properties: {}, geometry: evidence };
  return {
    matches: booleanEqual(candidate, authoritative),
    note: booleanEqual(candidate, authoritative)
      ? 'Catalogue geometry is identical to the locally held HES geometry.'
      : 'Catalogue geometry is not identical to the locally held HES geometry.',
  };
}

function hasUsableHesSource(feature: HeritageFeature, reference: string): boolean {
  return feature.sourceRecords.some(
    (source) =>
      source.sourceOrganisation === 'Historic Environment Scotland' &&
      source.sourceRecordId === reference &&
      Boolean(source.sourceUrl?.trim()),
  );
}

function hasUsableFeatureLicence(feature: HeritageFeature): boolean {
  return /open government licence/i.test(feature.licence ?? '');
}

function isNamedLocalityDesignation(
  feature: HeritageFeature,
  authoritative: AuthoritativeFeature,
  pkg: ProjectPackage,
): boolean {
  const designationType = authoritative.properties.DES_TYPE;
  const title = sourceTitle(authoritative)?.toLocaleLowerCase('en-GB') ?? '';
  return (
    typeof designationType === 'string' &&
    designationType.toLocaleLowerCase('en-GB') === 'conservation area' &&
    title.includes(pkg.project.locality.toLocaleLowerCase('en-GB')) &&
    /conservation area/i.test(feature.name)
  );
}

function sourceHistory(
  feature: HeritageFeature,
): Array<
  Pick<SourceRecord, 'sourceName' | 'sourceOrganisation' | 'sourceRecordId' | 'reliability'>
> {
  return feature.sourceRecords.map(
    ({ sourceName, sourceOrganisation, sourceRecordId, reliability }) => ({
      sourceName,
      sourceOrganisation,
      sourceRecordId,
      reliability,
    }),
  );
}

function sourceType(feature: HeritageFeature): string {
  const organisations = new Set(feature.sourceRecords.map((source) => source.sourceOrganisation));
  if (organisations.size === 1 && organisations.has('Historic Environment Scotland')) {
    return feature.sourceRecords.some((source) => source.reliability === 'official_statutory')
      ? 'HES statutory or mixed HES record'
      : 'HES/NRHE non-statutory record';
  }
  if (organisations.has('Historic Environment Scotland'))
    return 'HES/NRHE with supplementary evidence';
  if (organisations.has('Clackmannanshire Council')) return 'Local-authority evidence';
  return 'Other or mixed evidence';
}

function summaryTotal(packages: ProjectPackage[]) {
  return packages.reduce(
    (total, pkg) => {
      const summary = assessProjectPackage(pkg).summary;
      for (const [key, value] of Object.entries(summary)) total[key as keyof typeof total] += value;
      return total;
    },
    {
      totalRecords: 0,
      publishable: 0,
      provisional: 0,
      verified: 0,
      requiresReview: 0,
      withheld: 0,
      blockerCount: 0,
      advisoryCount: 0,
    },
  );
}

const packageInputs = await Promise.all(
  projectPaths.map(async (path) => ({
    path,
    pkg: JSON.parse(await readFile(resolve(path), 'utf8')) as ProjectPackage,
  })),
);
const beforePackages = packageInputs.map(({ pkg }) => structuredClone(pkg));
const decisionRegister = JSON.parse(
  await readFile(decisionRegisterPath, 'utf8'),
) as DecisionRegister;
const latestAudit = JSON.parse(await readFile(auditPath, 'utf8')) as { generatedAt?: string };
if (decisionRegister.remainingHesNrheCohorts.length !== 1)
  throw new Error(
    'The decision register contains an unexpected number of HES/NRHE provisional cohorts.',
  );
const cohort = decisionRegister.remainingHesNrheCohorts[0];
if (
  cohort.state !== 'provisional' ||
  cohort.reason !== 'No individual publication determination is recorded.' ||
  cohort.count !== 144 ||
  cohort.records.length !== 144
)
  throw new Error(
    'The decision register no longer defines the expected 144-record provisional HES/NRHE cohort.',
  );
const expectedCounts = {
  'alloa-scotland': 4,
  'culross-scotland': 127,
  'tillicoultry-scotland': 13,
};
const targetProjectIds = new Set(Object.keys(expectedCounts));
for (const [projectId, count] of Object.entries(expectedCounts)) {
  if (cohort.records.filter((record) => record.projectId === projectId).length !== count)
    throw new Error(`Decision-register cohort drift for ${projectId}.`);
}
for (const record of cohort.records) {
  const pkg = packageInputs.find((candidate) => candidate.pkg.project.id === record.projectId)?.pkg;
  const feature = pkg?.features.find((candidate) => candidate.id === record.id);
  if (
    !feature ||
    feature.publication?.state === 'publishable' ||
    feature.evidenceScope === 'out_of_scope'
  )
    throw new Error(
      `The current catalogue no longer matches the registered provisional record ${record.projectId}/${record.id}.`,
    );
}

const archiveSha256 = createHash('sha256')
  .update(await readFile(localLibraryArchive))
  .digest('hex');
const layers = new Map<Dataset, AuthoritativeFeature[]>();
for (const dataset of Object.keys(datasetFiles) as Dataset[])
  layers.set(dataset, await loadLayer(dataset));
const indexedEvidence = new Map<Dataset, Map<string, AuthoritativeFeature>>();
for (const [dataset, records] of layers) {
  indexedEvidence.set(
    dataset,
    new Map(
      records.flatMap((record) => {
        const reference = sourceReference(record);
        return reference ? [[reference, record] as const] : [];
      }),
    ),
  );
}

const decisions: Array<Record<string, unknown>> = [];
for (const cohortRecord of cohort.records) {
  const input = packageInputs.find(
    (candidate) => candidate.pkg.project.id === cohortRecord.projectId,
  )!;
  const feature = input.pkg.features.find((candidate) => candidate.id === cohortRecord.id)!;
  const reference = referenceFor(feature);
  const authoritative = reference
    ? indexedEvidence.get(reference.dataset)?.get(reference.reference)
    : undefined;
  const targetIssues = validateFeatures(input.pkg.project, input.pkg.features).filter(
    (issue) =>
      issue.recordId === feature.id &&
      (issue.severity === 'error' || issue.publicationImpact === 'blocker'),
  );
  const evidenceGeometry = authoritative?.geometry;
  const relationship = evidenceGeometry
    ? geographicRelationship(evidenceGeometry, input.pkg)
    : {
        classification: 'ambiguous' as const,
        rationale: 'No matching local HES geometry was found.',
      };
  const agreement = evidenceGeometry
    ? geometryMatches(feature, evidenceGeometry)
    : { matches: false, note: 'No matching local HES geometry was found.' };
  const sourceVerified = Boolean(
    reference && authoritative && hasUsableHesSource(feature, reference.reference),
  );
  const licenceVerified = hasUsableFeatureLicence(feature) || sourceVerified;
  const wordingLimited = !visitorClaimPattern.test(
    `${feature.shortDescription ?? ''} ${feature.fullDescription ?? ''}`,
  );
  const scopeIsNamedDesignation = Boolean(
    authoritative && isNamedLocalityDesignation(feature, authoritative, input.pkg),
  );
  let determination: 'publishable' | 'withheld' | 'provisional';
  let outcome: 'promoted_publishable' | 'withheld_out_of_scope' | 'escalated_provisional';
  let reason: string;
  let classification = relationship.classification;
  if (!reference || !authoritative || !sourceVerified) {
    determination = 'provisional';
    outcome = 'escalated_provisional';
    classification = 'ambiguous';
    reason =
      'Escalated: the expected locally held HES record and catalogue source history could not be matched exactly.';
  } else if (!licenceVerified) {
    determination = 'provisional';
    outcome = 'escalated_provisional';
    reason = 'Escalated: the feature-level Open Government Licence provenance is incomplete.';
  } else if (!agreement.matches) {
    determination = 'provisional';
    outcome = 'escalated_provisional';
    reason = `Escalated: authoritative identity is matched but geometry cannot be reconciled. ${agreement.note}`;
  } else if (targetIssues.length) {
    determination = 'provisional';
    outcome = 'escalated_provisional';
    reason = `Escalated: ${targetIssues.map((issue) => issue.code ?? issue.message).join(', ')} remains a material publication blocker.`;
  } else if (!wordingLimited) {
    determination = 'provisional';
    outcome = 'escalated_provisional';
    reason =
      'Escalated: the current wording includes a visitor or present-use claim that HES/NRHE evidence alone cannot establish.';
  } else if (relationship.classification === 'out_of_scope') {
    determination = 'withheld';
    outcome = 'withheld_out_of_scope';
    feature.evidenceScope = 'out_of_scope';
    reason = `${relationship.rationale} It is retained with its authoritative provenance but is not publicly delivered for this locality.`;
  } else if (relationship.classification === 'ambiguous' && scopeIsNamedDesignation) {
    determination = 'publishable';
    outcome = 'promoted_publishable';
    classification = 'related_context';
    feature.evidenceScope = 'related_context';
    reason =
      'The authoritative conservation-area designation explicitly names this locality and legitimately crosses its statistical boundary. It is published only as locality-spanning designation context, not as wholly in-boundary evidence.';
  } else if (relationship.classification === 'within_town_locality') {
    determination = 'publishable';
    outcome = 'promoted_publishable';
    feature.evidenceScope = 'parish_evidence';
    reason =
      'The exact local HES record, OGL provenance, limited historic/designation wording and authoritative geometry all pass the individual publication gates within the declared locality.';
  } else {
    determination = 'provisional';
    outcome = 'escalated_provisional';
    reason = `${relationship.rationale} No explicit authoritative locality-identity relationship supports cross-boundary publication.`;
  }
  if (!hasUsableFeatureLicence(feature) && sourceVerified)
    feature.licence =
      'Open Government Licence v3.0; retain Historic Environment Scotland and Ordnance Survey attribution.';
  feature.geographicScope = {
    classification,
    boundaryName: input.pkg.project.townStudyArea!.localityName,
    boundarySource: `${input.pkg.project.townStudyArea!.sourceName} (${input.pkg.project.townStudyArea!.sourceVersion})`,
    verifiedAt: reviewedAt,
    rationale: reason,
  };
  const historyRecord: SourceRecord = {
    sourceName: 'HES local spatial-library verification',
    sourceOrganisation: 'Historic Environment Scotland',
    sourceRecordId: reference?.reference,
    sourceUrl:
      typeof authoritative?.properties.LINK === 'string'
        ? authoritative.properties.LINK
        : 'https://inspire.hes.scot/AtomService/DATA/lb_scotland.zip',
    accessedAt: reviewedAt,
    licence:
      'Open Government Licence v3.0; retain Historic Environment Scotland and Ordnance Survey attribution.',
    notes: `Verified against ${reference ? datasetFiles[reference.dataset] : 'unmatched HES layer'} in data/reference/scotland-hes-library.zip (SHA-256 ${archiveSha256}).`,
    reliability:
      reference?.dataset === 'listedBuildings' ||
      reference?.dataset === 'conservationAreas' ||
      reference?.dataset === 'designedLandscapes' ||
      reference?.dataset === 'scheduledMonuments'
        ? 'official_statutory'
        : 'official_non_statutory',
  };
  if (
    !feature.sourceRecords.some(
      (source) =>
        source.sourceName === historyRecord.sourceName &&
        source.sourceRecordId === historyRecord.sourceRecordId,
    )
  )
    feature.sourceRecords.push(historyRecord);
  feature.reviewed = true;
  feature.updatedAt = reviewedAt;
  feature.reviewNotes = [
    feature.reviewNotes,
    `Individual HES publication determination ${reviewDate}: ${reason}`,
  ]
    .filter(Boolean)
    .join(' ');
  setFeaturePublicationState(feature, determination, reviewedAt, reason);
  decisions.push({
    projectId: input.pkg.project.id,
    locality: input.pkg.project.locality,
    id: feature.id,
    name: feature.name,
    determination: outcome,
    publicationState: determination,
    geographicRelationship: classification,
    reason,
    sourceHistory: sourceHistory(feature),
    evidence: {
      dataset: reference?.dataset,
      recordId: reference?.reference,
      title: authoritative ? sourceTitle(authoritative) : undefined,
      precision: authoritative ? sourcePrecision(authoritative) : undefined,
      geometryType: authoritative?.geometry.type,
      geometryAgreement: agreement.note,
      sourceVerified,
      licenceVerified,
      wordingLimited,
    },
    validationBlockers: targetIssues.map((issue) => ({ code: issue.code, message: issue.message })),
  });
}

for (const { pkg } of packageInputs)
  if (targetProjectIds.has(pkg.project.id))
    pkg.validation = validateFeatures(pkg.project, pkg.features);
const afterErrors = packageInputs.flatMap(({ pkg }) =>
  pkg.validation
    .filter((issue) => issue.severity === 'error')
    .map((issue) => `${pkg.project.id}/${issue.recordId}: ${issue.message}`),
);
if (afterErrors.length)
  throw new Error(`Refusing to write invalid catalogue data: ${afterErrors.join(' | ')}`);
const count = (outcome: string) =>
  decisions.filter((decision) => decision.determination === outcome).length;
const remainingBySourceType = packageInputs
  .flatMap(({ pkg }) => pkg.features)
  .filter(
    (feature) =>
      assessProjectPackage(
        packageInputs.find(({ pkg }) => pkg.project.id === feature.projectId)!.pkg,
      ).records.find((record) => record.recordId === feature.id)?.effectiveState === 'provisional',
  )
  .reduce<Record<string, number>>((groups, feature) => {
    const key = sourceType(feature);
    groups[key] = (groups[key] ?? 0) + 1;
    return groups;
  }, {});
const report = {
  reviewedAt,
  inputs: {
    latestPublicationAudit: auditPath,
    latestPublicationAuditGeneratedAt: latestAudit.generatedAt,
    decisionRegister: decisionRegisterPath,
    decisionRegisterReviewedAt: decisionRegister.reviewedAt,
    cohort: { expected: expectedCounts, examined: cohort.records.length },
    authoritativeEvidence: {
      archive: 'data/reference/scotland-hes-library.zip',
      sha256: archiveSha256,
      layers: datasetFiles,
      licence:
        'Open Government Licence v3.0; retain Historic Environment Scotland and Ordnance Survey attribution.',
    },
  },
  policy:
    'Each determination matches the individual catalogue record to its exact locally held HES designation record, checks existing source history, OGL provenance, source and catalogue geometry, the declared Townscape locality, validation blockers and wording. HES/NRHE evidence supports only limited historic/designation/classification claims. Buffer distance is not used to establish relevance.',
  summary: {
    examined: decisions.length,
    promotedPublishable: count('promoted_publishable'),
    withheldOutOfScope: count('withheld_out_of_scope'),
    remainingProvisional: count('escalated_provisional'),
    escalated: decisions
      .filter((decision) => decision.determination === 'escalated_provisional')
      .map((decision) => ({
        projectId: decision.projectId,
        id: decision.id,
        name: decision.name,
        reason: decision.reason,
      })),
    remainingHesNrheOnlyCohort: count('escalated_provisional') > 0,
    publicationTotals: {
      before: summaryTotal(beforePackages),
      after: summaryTotal(packageInputs.map(({ pkg }) => pkg)),
    },
    remainingProvisionalByEvidenceSourceType: remainingBySourceType,
  },
  validation: {
    packageValidationEntries: Object.fromEntries(
      packageInputs.map(({ pkg }) => [pkg.project.id, pkg.validation.length]),
    ),
    errors: afterErrors,
  },
  decisions,
};
const markdown = [
  '# Townscape HES/NRHE individual publication determinations',
  '',
  `Reviewed: ${reviewedAt}`,
  '',
  `- Records examined: ${report.summary.examined}`,
  `- Promoted publishable: ${report.summary.promotedPublishable}`,
  `- Withheld / out of scope: ${report.summary.withheldOutOfScope}`,
  `- Remaining provisional: ${report.summary.remainingProvisional}`,
  `- HES/NRHE-only cohort remains: ${report.summary.remainingHesNrheOnlyCohort ? 'yes' : 'no'}`,
  '',
  'Every decision is in the JSON companion with the exact local HES dataset record, source history, geometry comparison, scope relationship, wording check and validation result.',
  '',
  '## Publication totals',
  '',
  `- Before: ${report.summary.publicationTotals.before.publishable} publishable, ${report.summary.publicationTotals.before.provisional} provisional, ${report.summary.publicationTotals.before.withheld} withheld, ${report.summary.publicationTotals.before.requiresReview} requires review.`,
  `- After: ${report.summary.publicationTotals.after.publishable} publishable, ${report.summary.publicationTotals.after.provisional} provisional, ${report.summary.publicationTotals.after.withheld} withheld, ${report.summary.publicationTotals.after.requiresReview} requires review.`,
  '',
  '## Escalations',
  '',
  report.summary.escalated.length
    ? report.summary.escalated
        .map((item) => `- ${item.projectId} / ${item.id}: ${item.reason}`)
        .join('\n')
    : '- None.',
  '',
  '## Remaining provisional catalogue by evidence/source type',
  '',
  ...Object.entries(report.summary.remainingProvisionalByEvidenceSourceType)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, count]) => `- ${type}: ${count}`),
  '',
].join('\n');
if (!dryRun) {
  await Promise.all([
    ...packageInputs
      .filter(({ pkg }) => targetProjectIds.has(pkg.project.id))
      .map(({ path, pkg }) =>
        writeFile(resolve(path), `${JSON.stringify(pkg, null, 2)}\n`, 'utf8'),
      ),
    writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    writeFile(reportPath.replace(/\.json$/i, '.md'), `${markdown}\n`, 'utf8'),
  ]);
}
console.log(
  `Examined ${report.summary.examined}; promoted ${report.summary.promotedPublishable}; withheld ${report.summary.withheldOutOfScope}; provisional ${report.summary.remainingProvisional}.`,
);
if (dryRun && report.summary.escalated.length)
  console.log(
    report.summary.escalated
      .map((item) => `${item.projectId}/${item.id}: ${item.reason}`)
      .join('\n'),
  );
