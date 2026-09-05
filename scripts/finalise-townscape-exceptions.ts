import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HeritageFeature, ProjectPackage, Reliability } from '../src/domain/models';
import { assessFeaturePublication, publicProjectPackage } from '../src/domain/publication';
import { validateFeatures } from '../src/domain/validation';

const checkedAt = new Date();
const checked = checkedAt.toISOString();
const operationExpires = new Date(checkedAt.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
const triagePath = resolve('data/review/townscape-provisional-verification-triage-2026-09-03.json');
const packageFiles = ['alloa', 'alva', 'biggar', 'culross', 'killin', 'kincardine', 'tillicoultry'];
const geometryIds = [
  'curated:context-bedford-place-expansion',
  'curated:context-railway-arrival',
  'curated:context-glebe-victorian-expansion',
  'curated:context-mill-street-3-29',
  'curated:context-baronial-buildings',
  'curated:context-oakleigh-house',
  'curated:context-alloa-harbour-docks',
  'curated:context-first-mill',
  'curated:memorial-carrie-johnstone-fountain',
  'curated:public-art-river-spirit',
  'curated:context-nts-royal-burgh-portfolio',
  'curated:context-burgh-of-barony-1663',
  'curated:context-power-station',
  'curated:context-cloth-1560s',
  'curated:context-three-villages',
  'curated:context-water-mill',
  'curated:context-high-street',
  'curated:context-workers-grid',
  'curated:context-railway',
  'curated:context-burgh',
  'curated:context-flood-1883',
  'curated:plaque-conn',
  'curated:mem-walker-fountain',
];
const deletedOsmIds = ['osm-community:way-896307613', 'osm-community:way-896307614'];
const hesConflictIds = [
  'curated:hes-gdl00155',
  'curated:hes-lb24059',
  'curated:hes-lb24060',
  'curated:hes-lb24067',
  'curated:hes-lb3359',
  'curated:hes-lb48796',
  'curated:hes-lb42057',
];
const historicContextIds = ['curated:context-mar-street-1785', 'curated:context-west-end-park'];
const businessIds = [
  'osm-community:node-10657179804',
  'osm-community:node-13648474029',
  'osm-community:node-10550529710',
  'osm-community:node-11780574253',
  'osm-community:way-1271991625',
  'osm-community:way-989738553',
];

const triage = JSON.parse(await readFile(triagePath, 'utf8')) as {
  records: Array<{ recordId: string; primaryCohort: string }>;
};
const cohortE = triage.records
  .filter((record) => record.primaryCohort === 'E')
  .map((record) => record.recordId);
const frozenIds = [
  ...new Set([
    ...cohortE,
    ...geometryIds,
    ...deletedOsmIds,
    ...hesConflictIds,
    ...historicContextIds,
    ...businessIds,
  ]),
].sort();
const membershipSha256 = createHash('sha256')
  .update(`${frozenIds.join('\n')}\n`)
  .digest('hex');
if (cohortE.length !== 29 || frozenIds.length !== 69)
  throw new Error('Frozen exception cohort mismatch.');

const packages = await Promise.all(
  packageFiles.map(async (file) => ({
    file,
    pkg: JSON.parse(
      await readFile(resolve(`data/projects/${file}.json`), 'utf8'),
    ) as ProjectPackage,
  })),
);
const allFeatures = packages.flatMap(({ pkg }) => pkg.features);
const featuresById = new Map(allFeatures.map((feature) => [feature.id, feature]));
if (frozenIds.some((id) => !featuresById.has(id)))
  throw new Error('A frozen exception record is absent from the active catalogue packages.');
const featureProject = (id: string) =>
  packages.find(({ pkg }) => pkg.features.some((feature) => feature.id === id))!;
const decisionFor = (id: string) => {
  if (cohortE.includes(id))
    return {
      category: 'prior_controlled_workflow_persistence',
      outcome: 'publishable',
      reason:
        'Cohort E was independently verified and its decision register retained; the active package write-back was corrected without changing its evidence decision.',
      humanReview: false,
    };
  if (geometryIds.includes(id))
    return {
      category: 'historic_or_representational_geometry',
      outcome: 'requires_review',
      reason:
        'Existing authoritative/local evidence establishes the historic claim but not reproducible geometry. No surrogate modern geometry is permitted.',
      humanReview: true,
    };
  if (deletedOsmIds.includes(id))
    return {
      category: 'deleted_osm_element',
      outcome: 'requires_review',
      reason:
        'The OSM way remains Gone; no defensible replacement object or exact current authority inventory was identified. OSM deletion does not establish real-world removal.',
      humanReview: true,
    };
  if (hesConflictIds.includes(id))
    return {
      category: 'authoritative_geometry_discrepancy',
      outcome: 'provisional',
      reason:
        'Existing HES/NHRE review records an unresolved authoritative-point discrepancy or locality-spanning ambiguity. Authoritative geometry is unchanged.',
      humanReview: true,
    };
  if (historicContextIds.includes(id))
    return {
      category: 'historic_context_geometry',
      outcome: 'provisional',
      reason:
        'A dated/georeferenced map or equivalent bounded historical evidence is needed; present-day geometry would overstate the historic claim.',
      humanReview: true,
    };
  if (id === 'osm-community:node-10657179804')
    return {
      category: 'business_current_operation',
      outcome: 'provisional',
      reason:
        'The authority licensing record documents cessation in 2018; later directory-style references are insufficient to establish present trading at the exact premises.',
      humanReview: false,
    };
  if (id === 'osm-community:node-13648474029')
    return {
      category: 'business_current_operation_conflict',
      outcome: 'provisional',
      reason:
        'Current secondary references conflict with the archived food-hygiene evidence. Neither establishes a sufficiently current, exact operation chain.',
      humanReview: true,
    };
  if (id === 'osm-community:node-10550529710')
    return {
      category: 'business_current_operation',
      outcome: 'publishable',
      reason:
        'Official operator contact information confirms Merry + Bright at 33–35 High Street, Biggar.',
      humanReview: false,
    };
  if (id === 'osm-community:node-11780574253')
    return {
      category: 'business_current_operation',
      outcome: 'provisional',
      reason:
        'Current searches located only unrelated Australian business material and OSM-derived listings; operation at this Tillicoultry point remains unestablished.',
      humanReview: false,
    };
  if (id === 'osm-community:way-1271991625')
    return {
      category: 'business_identity_current_operation',
      outcome: 'provisional',
      reason:
        'Current search results name a nearby Lily House but do not establish this exact premises, identity or operator.',
      humanReview: false,
    };
  if (id === 'osm-community:way-989738553')
    return {
      category: 'business_current_operation_reconciled',
      outcome: 'publishable',
      reason:
        'The operator ordering site names Tillicoultry but has a malformed address line; a current local directory independently supplies 157 High Street, Tillicoultry. Only operation/name/category are carried.',
      humanReview: false,
    };
  throw new Error(`No decision for ${id}`);
};

function applyOperatingDecision(
  feature: HeritageFeature,
  sources: Array<{
    name: string;
    organisation: string;
    url: string;
    reliability: Reliability;
    notes: string;
  }>,
  note: string,
) {
  const sourcePrefix = 'townscape-final-exception-';
  feature.sourceRecords = feature.sourceRecords.filter(
    (source) => !source.sourceRecordId?.startsWith(sourcePrefix),
  );
  const refs = sources.map((source, index) => {
    const ref = `${sourcePrefix}${checked.slice(0, 10)}-${index + 1}`;
    feature.sourceRecords.push({
      sourceName: source.name,
      sourceOrganisation: source.organisation,
      sourceUrl: source.url,
      sourceRecordId: ref,
      accessedAt: checked,
      reliability: source.reliability,
      notes: source.notes,
    });
    return ref;
  });
  const osmRef = feature.sourceRecords.find(
    (source) => source.reliability === 'discovery_only',
  )?.sourceRecordId;
  feature.claimEvidence = [
    ...(osmRef
      ? [
          {
            claim: 'mapped_identity' as const,
            tier: 'mapped_context' as const,
            sourceRecordRefs: [osmRef],
            reviewedAt: checked,
            notes: 'Mapped identity/location only.',
          },
        ]
      : []),
    {
      claim: 'current_operation' as const,
      tier: 'operational' as const,
      sourceRecordRefs: refs,
      reviewedAt: checked,
      expiresAt: operationExpires,
      notes: note,
    },
  ];
  feature.publication = {
    state: 'verified',
    profile: 'verified_facility',
    reviewedAt: checked,
    notes:
      'Final controlled exception review: current operation only; unrelated visitor claims are suppressed.',
  };
  feature.reviewed = true;
  feature.updatedAt = checked;
}

const changedBatches: Array<Record<string, unknown>> = [];
for (const id of ['osm-community:node-10550529710', 'osm-community:way-989738553']) {
  const holder = featureProject(id);
  const feature = featuresById.get(id)!;
  const preErrors = validateFeatures(holder.pkg.project, holder.pkg.features).filter(
    (issue) => issue.severity === 'error',
  );
  if (preErrors.length) throw new Error(`${holder.pkg.project.id}: pre-change validation error.`);
  if (id.endsWith('10550529710')) {
    applyOperatingDecision(
      feature,
      [
        {
          name: 'Merry + Bright contact',
          organisation: 'Merry + Bright',
          url: 'https://www.merryandbright.co/contact',
          reliability: 'official_non_statutory',
          notes:
            'Current operator contact page gives 33–35 High Street, Biggar, ML12 6DA and shop contact details.',
        },
      ],
      decisionFor(id).reason,
    );
  } else {
    applyOperatingDecision(
      feature,
      [
        {
          name: 'Good Year ordering site',
          organisation: 'Good Year Chinese',
          url: 'https://good-year.co.uk/',
          reliability: 'official_non_statutory',
          notes:
            'Current operator ordering site identifies Good Year as a Tillicoultry Chinese takeaway, but renders a malformed address line.',
        },
        {
          name: 'Good Year Chinese Takeaway current directory',
          organisation: 'Cylex',
          url: 'https://tillicoultry.cylex-uk.co.uk/company/good-year-chinese-takeaway-17961805.html',
          reliability: 'secondary',
          notes:
            'Updated 2026 directory gives the exact 157 High Street, Tillicoultry address; used only to reconcile the operator site’s malformed address.',
        },
      ],
      decisionFor(id).reason,
    );
  }
  const postErrors = validateFeatures(holder.pkg.project, holder.pkg.features).filter(
    (issue) => issue.severity === 'error',
  );
  if (postErrors.length) throw new Error(`${holder.pkg.project.id}: post-change validation error.`);
  const delivered = publicProjectPackage(holder.pkg)?.features.find(
    (candidate) => candidate.id === id,
  );
  if (delivered?.publication?.profile !== 'verified_facility')
    throw new Error(`${id}: current-operation claim not projected.`);
  await writeFile(
    resolve(`data/projects/${holder.file}.json`),
    `${JSON.stringify(holder.pkg, null, 2)}\n`,
  );
  const batch = {
    projectId: holder.pkg.project.id,
    recordId: id,
    checkedAt: checked,
    preflightValidationErrors: 0,
    postBatchValidationErrors: 0,
    publicProjection: 'passed',
    publishedClaim: 'Tier O current_operation',
    suppressed: [
      'hours',
      'fees',
      'access',
      'accessibility',
      'facilities',
      'booking',
      'quality',
      'recommendation',
    ],
  };
  await writeFile(
    resolve(
      `data/review/townscape-final-exception-batch-${String(changedBatches.length + 1).padStart(2, '0')}.json`,
    ),
    `${JSON.stringify(batch, null, 2)}\n`,
  );
  changedBatches.push(batch);
}

const auditBefore = { publishable: 1968, provisional: 44, requiresReview: 25, withheld: 5 };
const decisionRows = frozenIds.map((id) => {
  const feature = featuresById.get(id)!;
  const holder = featureProject(id);
  const decision = decisionFor(id);
  return {
    recordId: id,
    projectId: holder.pkg.project.id,
    name: feature.name,
    featureType: feature.featureType,
    category: decision.category,
    finalOutcome: decision.outcome,
    reason: decision.reason,
    evidenceScope: feature.evidenceScope,
    geographicScope: feature.geographicScope,
    publication: feature.publication,
    effectiveState: assessFeaturePublication(holder.pkg, feature).effectiveState,
    sourceHistoryRetained: true,
    humanOrExpertReviewNeeded: decision.humanReview,
  };
});
const counts = (outcome: string) =>
  decisionRows.filter((row) => row.finalOutcome === outcome).length;
const categoryCounts = decisionRows.reduce<Record<string, number>>((out, row) => {
  out[row.category] = (out[row.category] ?? 0) + 1;
  return out;
}, {});
const report = {
  registerType: 'controlled final Townscape non-public exception decision register',
  checkedAt: checked,
  policy: [
    'CLAIM_EVIDENCE_POLICY.md',
    'current publication/provenance framework',
    'geographic-scope rules',
  ],
  frozenCohort: {
    exactRecords: frozenIds.length,
    membershipSha256,
    recordIds: frozenIds,
    basis: [
      'current publication audit',
      'Cohort C/D/E registers',
      'HES/NRHE exception review',
      'publication remediation register',
    ],
    excludedFinalWithheld:
      'Deliberate out-of-scope exclusions and the previously final Butterfly closure decision were not re-opened.',
  },
  categories: Object.entries(categoryCounts).map(([category, records]) => ({ category, records })),
  outcomes: {
    newlyPublished: counts('publishable'),
    remainingProvisional: counts('provisional'),
    remainingRequiresReview: counts('requires_review'),
    finallyWithheld: 0,
  },
  evidenceCases: {
    contradictory: decisionRows.filter(
      (row) =>
        row.category.includes('conflict') || row.recordId === 'osm-community:node-10657179804',
    ),
    geometry: decisionRows.filter((row) => row.category.includes('geometry')),
    deletedOsm: decisionRows.filter((row) => row.category === 'deleted_osm_element'),
    business: decisionRows.filter((row) => row.category.includes('business')),
  },
  suppressedClaims: [
    'access',
    'hours',
    'fees/prices',
    'accessibility',
    'facilities',
    'dog policy',
    'booking',
    'quality',
    'recommendation',
    'editorial description',
  ],
  publicationTotals: {
    before: auditBefore,
    after: {
      publishable: auditBefore.publishable + counts('publishable'),
      provisional: auditBefore.provisional - counts('publishable'),
      requiresReview: auditBefore.requiresReview,
      withheld: auditBefore.withheld,
    },
  },
  validation: {
    changedBatches,
    controls: [
      'Cohort E re-projection was run in seven per-project validated/public-projection batches.',
      'Two business promotions were written as separate validated/public-projection batches.',
      'No authoritative geometry was moved.',
      'No score/rating/methodology changed.',
    ],
  },
  decisions: decisionRows,
};
await writeFile(
  resolve('data/review/townscape-final-exception-decision-register-2026-09-04.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  resolve('data/review/townscape-final-exception-decision-register-2026-09-04.md'),
  `# Final Townscape non-public exception decision register\n\nReviewed: ${checked}\n\n- Frozen cohort: **${frozenIds.length}** records\n- Membership SHA-256: **${membershipSha256}**\n- Newly publishable: **${counts('publishable')}**\n- Remaining provisional: **${counts('provisional')}**\n- Remaining requires review: **${counts('requires_review')}**\n- Newly withheld: **0**\n\n## Categories\n\n${report.categories.map((category) => `- ${category.category}: **${category.records}**`).join('\n')}\n\n## Decisions\n\nThe full per-record outcome, reason, effective state, retained provenance and human-review flag are in the JSON register. Existing final out-of-scope exclusions were not reopened. No authoritative geometry was moved.\n\n## Claims suppressed\n\n${report.suppressedClaims.map((claim) => `- ${claim}`).join('\n')}\n\n## Catalogue totals\n\nBefore: ${auditBefore.publishable} publishable, ${auditBefore.provisional} provisional, ${auditBefore.requiresReview} requires review, ${auditBefore.withheld} withheld.\n\nAfter: ${report.publicationTotals.after.publishable} publishable, ${report.publicationTotals.after.provisional} provisional, ${report.publicationTotals.after.requiresReview} requires review, ${report.publicationTotals.after.withheld} withheld.\n\n## Human/expert review\n\n${decisionRows
    .filter((row) => row.humanOrExpertReviewNeeded)
    .map((row) => `- ${row.projectId} / ${row.recordId} — ${row.name}: ${row.reason}`)
    .join('\n')}\n`,
);
console.log(
  `Final exception cohort ${frozenIds.length}: ${counts('publishable')} publishable, ${counts('provisional')} provisional, ${counts('requires_review')} requires review; ${membershipSha256}`,
);
