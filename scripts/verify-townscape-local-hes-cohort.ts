import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { booleanIntersects, booleanWithin } from '@turf/turf';
import type { Feature, Geometry, MultiPolygon, Polygon } from 'geojson';
import type { GeographicRelationship, HeritageFeature, ProjectPackage } from '../src/domain/models';
import { assessProjectPackage, setFeaturePublicationState } from '../src/domain/publication';
import { geometryIsStructurallyValid, validateFeatures } from '../src/domain/validation';

/** Controlled geography-only follow-on. It reviews only records escalated by
 * the previous cohort; it never moves source geometry or infers visitor facts. */
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
const reportPath = resolve('data/review/townscape-local-hes-verification-2026-09-03.json');
const reviewedAt = new Date().toISOString();
const visitorClaimPattern =
  /\b(access|admission|amenit(?:y|ies)|condition|current use|dog|facilit(?:y|ies)|opening hours|parking|public|recommend|toilet|visitor)\b/i;

type PriorReport = {
  geographicClassifications?: unknown;
  decisions: Array<{ id: string; projectId: string; decision: string }>;
};
type Decision = {
  projectId: string;
  town: string;
  id: string;
  name: string;
  sourceIds: string[];
  geometry: string;
  geographicRelationship: GeographicRelationship;
  evidenceScope: string;
  decision: 'promoted' | 'left_provisional' | 'escalated' | 'withheld';
  reason: string;
};

function expectedRecordId(feature: HeritageFeature): string | undefined {
  if (feature.id.startsWith('nrhe:')) return feature.id.slice('nrhe:'.length);
  return feature.id.match(
    /^hes-(?:listed-building|scheduled-monument|conservation-area|designed-landscape):(.+)$/,
  )?.[1];
}
function locallyHeldHesOnly(feature: HeritageFeature): boolean {
  const expected = expectedRecordId(feature);
  return Boolean(
    expected &&
    feature.sourceRecords.length > 0 &&
    feature.sourceRecords.every(
      (source) =>
        source.sourceOrganisation === 'Historic Environment Scotland' &&
        Boolean(source.licence?.trim()) &&
        Boolean(
          source.sourceUrl?.match(
            /^https:\/\/(?:www\.)?(?:trove\.scot|portal\.historicenvironment\.scot)\//,
          ),
        ),
    ) &&
    feature.sourceRecords.some((source) => source.sourceRecordId === expected),
  );
}
function limitedClaim(feature: HeritageFeature): boolean {
  return !visitorClaimPattern.test(
    `${feature.shortDescription ?? ''} ${feature.fullDescription ?? ''}`,
  );
}
function sourceIds(feature: HeritageFeature): string[] {
  return feature.sourceRecords.flatMap((source) =>
    source.sourceRecordId ? [source.sourceRecordId] : [],
  );
}
function geometryFeature(geometry: Geometry): Feature<Geometry> {
  return { type: 'Feature', properties: {}, geometry };
}
function geographicRelationship(
  feature: HeritageFeature,
  pkg: ProjectPackage,
): { classification: GeographicRelationship; rationale: string } {
  const townStudy = pkg.project.townStudyArea;
  if (!townStudy)
    return {
      classification: 'ambiguous',
      rationale:
        'No declared Townscape locality polygon is available for a deterministic comparison.',
    };
  if (!feature.geometry || !geometryIsStructurallyValid(feature.geometry))
    return {
      classification: 'ambiguous',
      rationale: 'The retained authoritative geometry is missing or structurally invalid.',
    };
  const candidate = geometryFeature(feature.geometry);
  const locality = townStudy.localityBoundary as Feature<Polygon | MultiPolygon>;
  const buffer = townStudy.bufferedBoundary as Feature<Polygon | MultiPolygon>;
  if (booleanWithin(candidate, locality))
    return {
      classification: 'within_town_locality',
      rationale:
        'The retained authoritative geometry is wholly within the declared Townscape locality polygon.',
    };
  if (booleanIntersects(candidate, locality))
    return {
      classification: 'ambiguous',
      rationale:
        'The retained authoritative geometry intersects but is not wholly within the locality polygon; a partial-overlap decision needs manual review.',
    };
  if (booleanWithin(candidate, buffer))
    return {
      classification: 'immediately_associated',
      rationale: `The retained authoritative geometry is outside the strict locality but wholly within its declared ${townStudy.bufferMetres}m heritage buffer. Proximity alone does not establish visitor relevance.`,
    };
  if (booleanIntersects(candidate, buffer))
    return {
      classification: 'ambiguous',
      rationale:
        'The retained authoritative geometry intersects but is not wholly within the locality heritage buffer; a partial-overlap decision needs manual review.',
    };
  if (feature.evidenceScope === 'related_context')
    return {
      classification: 'related_context',
      rationale:
        'An existing explicit related-context declaration is retained; this is not a new proximity-based inclusion.',
    };
  return {
    classification: 'out_of_scope',
    rationale:
      'The retained authoritative geometry is outside both the declared Townscape locality and its heritage buffer, with no existing related-context declaration.',
  };
}
function setGeographicScope(
  feature: HeritageFeature,
  pkg: ProjectPackage,
  classification: GeographicRelationship,
  rationale: string,
): void {
  const townStudy = pkg.project.townStudyArea!;
  feature.geographicScope = {
    classification,
    boundaryName: townStudy.localityName,
    boundarySource: `${townStudy.sourceName} (${townStudy.sourceVersion})`,
    verifiedAt: reviewedAt,
    rationale,
  };
  const marker = `Geographic scope verified ${reviewedAt.slice(0, 10)}.`;
  if (!feature.reviewNotes?.includes(marker))
    feature.reviewNotes = [feature.reviewNotes, `${marker} ${rationale}`].filter(Boolean).join(' ');
  feature.updatedAt = reviewedAt;
}

const prior = JSON.parse(await readFile(reportPath, 'utf8')) as PriorReport;
const escalatedIds = new Map<string, Set<string>>();
// The first run consumes the prior escalation register. Later runs consume the
// saved cohort decision log, making the verification idempotent and avoiding a
// silent reduction to only the genuinely ambiguous tail.
const cohort = prior.geographicClassifications
  ? prior.decisions
  : prior.decisions.filter((decision) => decision.decision === 'escalated');
for (const item of cohort)
  escalatedIds.set(item.projectId, new Set([...(escalatedIds.get(item.projectId) ?? []), item.id]));
const packages = await Promise.all(
  projectPaths.map(async (path) => ({
    path,
    pkg: JSON.parse(await readFile(resolve(path), 'utf8')) as ProjectPackage,
  })),
);
const beforePublication = packages.map(({ pkg }) => ({
  projectId: pkg.project.id,
  ...assessProjectPackage(pkg).summary,
}));
const priorWithTotals = prior as PriorReport & {
  publicationTotals?: {
    before?: typeof beforePublication;
    byProject?: { before?: typeof beforePublication };
  };
};
const baselineBeforePublication = prior.geographicClassifications
  ? (priorWithTotals.publicationTotals?.byProject?.before ??
    priorWithTotals.publicationTotals?.before ??
    beforePublication)
  : beforePublication;
const decisions: Decision[] = [];
const batches: Array<{ projectId: string; examined: number; validationEntries: number }> = [];

for (const { path, pkg } of packages) {
  const targetIds = escalatedIds.get(pkg.project.id) ?? new Set<string>();
  if (!targetIds.size) continue;
  const blockersById = new Set(
    validateFeatures(pkg.project, pkg.features)
      .filter((item) => item.severity === 'error' || item.publicationImpact === 'blocker')
      .map((item) => item.recordId),
  );
  let examined = 0;
  for (const feature of pkg.features.filter((item) => targetIds.has(item.id))) {
    examined += 1;
    const relationship = geographicRelationship(feature, pkg);
    setGeographicScope(feature, pkg, relationship.classification, relationship.rationale);
    const base = {
      projectId: pkg.project.id,
      town: pkg.project.locality,
      id: feature.id,
      name: feature.name,
      sourceIds: sourceIds(feature),
      geometry: feature.geometry?.type ?? 'none',
      geographicRelationship: relationship.classification,
      evidenceScope: feature.evidenceScope ?? 'unspecified',
    };
    if (relationship.classification === 'out_of_scope') {
      feature.evidenceScope = 'out_of_scope';
      feature.reviewed = true;
      setFeaturePublicationState(feature, 'withheld', reviewedAt, relationship.rationale);
      decisions.push({
        ...base,
        evidenceScope: feature.evidenceScope,
        decision: 'withheld',
        reason: relationship.rationale,
      });
      continue;
    }
    if (relationship.classification === 'ambiguous') {
      setFeaturePublicationState(feature, 'provisional', reviewedAt, relationship.rationale);
      decisions.push({ ...base, decision: 'escalated', reason: relationship.rationale });
      continue;
    }
    if (relationship.classification === 'immediately_associated') {
      feature.evidenceScope = 'related_context';
      setFeaturePublicationState(feature, 'provisional', reviewedAt, relationship.rationale);
      decisions.push({
        ...base,
        evidenceScope: feature.evidenceScope,
        decision: 'left_provisional',
        reason: relationship.rationale,
      });
      continue;
    }
    feature.evidenceScope =
      relationship.classification === 'related_context' ? 'related_context' : 'parish_evidence';
    if (!locallyHeldHesOnly(feature)) {
      setFeaturePublicationState(
        feature,
        'provisional',
        reviewedAt,
        'Geographic relationship is recorded, but the source history remains outside the clean local HES/NRHE authoritative-record cohort.',
      );
      decisions.push({
        ...base,
        evidenceScope: feature.evidenceScope,
        decision: 'left_provisional',
        reason: 'Geographically classified; source-history eligibility remains unresolved.',
      });
      continue;
    }
    if (blockersById.has(feature.id)) {
      setFeaturePublicationState(
        feature,
        'provisional',
        reviewedAt,
        'Geographic relationship is recorded, but an existing material validation blocker remains.',
      );
      decisions.push({
        ...base,
        evidenceScope: feature.evidenceScope,
        decision: 'left_provisional',
        reason: 'Geographically classified; existing material validation blocker remains.',
      });
      continue;
    }
    if (!limitedClaim(feature)) {
      setFeaturePublicationState(
        feature,
        'provisional',
        reviewedAt,
        'Geographic relationship is recorded, but the description includes an unsupported visitor or current-place claim.',
      );
      decisions.push({
        ...base,
        evidenceScope: feature.evidenceScope,
        decision: 'left_provisional',
        reason: 'Geographically classified; unsupported visitor/current-place wording remains.',
      });
      continue;
    }
    feature.reviewed = true;
    setFeaturePublicationState(
      feature,
      'publishable',
      reviewedAt,
      relationship.classification === 'related_context'
        ? 'Publishable only as clearly labelled existing related official-record context; it does not establish a visitor claim or say that the asset is within the locality.'
        : 'The limited official HES/NRHE identity, classification/designation and retained authoritative geometry pass the existing publication gates.',
    );
    decisions.push({
      ...base,
      evidenceScope: feature.evidenceScope,
      decision: 'promoted',
      reason:
        'Within the declared locality with clean local HES/NRHE provenance, valid geometry and a limited official-record claim.',
    });
  }
  pkg.validation = validateFeatures(pkg.project, pkg.features);
  const errors = pkg.validation.filter((item) => item.severity === 'error');
  if (errors.length)
    throw new Error(`${pkg.project.id}: refusing to write ${errors.length} validation error(s).`);
  batches.push({ projectId: pkg.project.id, examined, validationEntries: pkg.validation.length });
  await writeFile(resolve(path), `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

const afterPublication = packages.map(({ pkg }) => ({
  projectId: pkg.project.id,
  ...assessProjectPackage(pkg).summary,
}));
function publicationTotal(summaries: Array<ReturnType<typeof assessProjectPackage>['summary']>) {
  return summaries.reduce(
    (total, summary) => ({
      totalRecords: total.totalRecords + summary.totalRecords,
      publishable: total.publishable + summary.publishable,
      provisional: total.provisional + summary.provisional,
      verified: total.verified + summary.verified,
      requiresReview: total.requiresReview + summary.requiresReview,
      withheld: total.withheld + summary.withheld,
      blockerCount: total.blockerCount + summary.blockerCount,
      advisoryCount: total.advisoryCount + summary.advisoryCount,
    }),
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
const count = (decision: Decision['decision']) =>
  decisions.filter((item) => item.decision === decision).length;
const relationshipCounts = Object.fromEntries(
  (
    [
      'within_town_locality',
      'immediately_associated',
      'related_context',
      'ambiguous',
      'out_of_scope',
    ] as const
  ).map((relationship) => [
    relationship,
    decisions.filter((item) => item.geographicRelationship === relationship).length,
  ]),
);
const report = {
  reviewedAt,
  precedent: 'Controlled local HES/NRHE verification cohort',
  policy:
    'Authoritative geometry is compared unchanged with the declared NRS Townscape locality and its configured heritage buffer. Buffer proximity never establishes visitor relevance. Existing related-context declarations are preserved but not newly inferred. Outside-scope records are retained with HES/NRHE provenance and withheld; ambiguous geometry remains provisional.',
  geographicClassifications: relationshipCounts,
  publicationTotals: {
    before: publicationTotal(baselineBeforePublication),
    after: publicationTotal(afterPublication),
    byProject: { before: baselineBeforePublication, after: afterPublication },
  },
  batches,
  summary: {
    examined: decisions.length,
    confirmedInScope: relationshipCounts.within_town_locality,
    relatedContextRetained: relationshipCounts.related_context,
    promoted: count('promoted'),
    remainingProvisional: count('left_provisional'),
    withheld: count('withheld'),
    escalated: count('escalated'),
  },
  decisions,
};
const markdown = [
  '# Controlled HES/NRHE geographic-scope verification cohort',
  '',
  `Reviewed: ${reviewedAt}`,
  '',
  `- Examined: ${report.summary.examined}`,
  `- Confirmed within the locality: ${report.summary.confirmedInScope}`,
  `- Immediately associated (buffer only; still provisional): ${relationshipCounts.immediately_associated}`,
  `- Existing related context retained: ${report.summary.relatedContextRetained}`,
  `- Promoted: ${report.summary.promoted}`,
  `- Remaining provisional: ${report.summary.remainingProvisional}`,
  `- Withheld as outside scope: ${report.summary.withheld}`,
  `- Escalated for genuinely ambiguous geographic identity: ${report.summary.escalated}`,
  '',
  'Classification is made against the declared NRS Townscape locality and configured 500m heritage buffer. An asset in the buffer is not published solely because it is nearby. The JSON companion records each retained authoritative geometry, classification, scope treatment and publication outcome.',
  '',
].join('\n');
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(reportPath.replace(/\.json$/i, '.md'), markdown, 'utf8');
console.log(
  `Examined ${report.summary.examined}: promoted ${report.summary.promoted}; provisional ${report.summary.remainingProvisional}; withheld ${report.summary.withheld}; ambiguous ${report.summary.escalated}.`,
);
