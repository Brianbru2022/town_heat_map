import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { projectPublicClaims } from '../src/domain/claims';
import type { ProjectPackage, SourceRecord } from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const triagePath = resolve('data/review/townscape-provisional-verification-triage-2026-09-03.json');
const triage = JSON.parse(await readFile(triagePath, 'utf8')) as {
  records: Array<{ recordId: string; primaryCohort: string }>;
};
const cohort = triage.records.filter((record) => record.primaryCohort === 'D');
const cohortIds = cohort.map((record) => record.recordId).sort();
const membershipSha256 = createHash('sha256')
  .update(`${cohortIds.join('\n')}\n`)
  .digest('hex');
const packageNames = [
  'alloa',
  'alva',
  'biggar',
  'culross',
  'killin',
  'kincardine',
  'quarriers-village',
  'tillicoultry',
];
const packages = await Promise.all(
  packageNames.map(
    async (name) =>
      JSON.parse(await readFile(resolve(`data/projects/${name}.json`), 'utf8')) as ProjectPackage,
  ),
);
const ids = new Set(cohortIds);
const features = packages.flatMap((pkg) => pkg.features.filter((feature) => ids.has(feature.id)));
if (cohort.length !== 414 || features.length !== 414)
  throw new Error('Cohort/package membership mismatch.');
if (new Set(features.map((feature) => feature.id)).size !== 414)
  throw new Error('Duplicate Cohort D record ID.');

const decisions = (
  await Promise.all(
    Array.from(
      { length: 8 },
      async (_, index) =>
        JSON.parse(
          await readFile(
            resolve(
              `data/review/townscape-cohort-d-migration-batch-${String(index + 1).padStart(2, '0')}.json`,
            ),
            'utf8',
          ),
        ) as { decisions: Array<Record<string, unknown>> },
    ),
  )
).flatMap((batch) => batch.decisions);
if (
  decisions.length !== 414 ||
  new Set(decisions.map((decision) => decision.recordId)).size !== 414
)
  throw new Error(`Expected 414 unique batch decisions; found ${decisions.length}.`);

const validation = packages.flatMap((pkg) => validateFeatures(pkg.project, pkg.features));
const errors = validation.filter((item) => item.severity === 'error');
if (errors.length) throw new Error(`Validation errors remain: ${errors.length}.`);
for (const feature of features) {
  if (!feature.osmElement || feature.publication?.profile !== 'mapped_context')
    throw new Error(`Missing mapped-context migration fields for ${feature.id}.`);
  if (feature.osmElement.status === 'current') {
    if (
      feature.claimEvidence?.length !== 1 ||
      feature.claimEvidence[0]?.claim !== 'mapped_identity'
    )
      throw new Error(`Current OSM record lacks exactly one Tier M claim for ${feature.id}.`);
    const projection = projectPublicClaims(feature);
    const notes = projection.sourceRecords
      .map((source: SourceRecord) => source.notes ?? '')
      .join(' ');
    if (
      /\b(?:access|opening_hours?|charge|fee|operator|capacity|wheelchair|website|phone|description)=/i.test(
        notes,
      )
    )
      throw new Error(`Unsupported OSM field survived final projection for ${feature.id}.`);
  } else if (feature.claimEvidence?.length)
    throw new Error(`Gone element has claim evidence: ${feature.id}.`);
}
const current = features.filter((feature) => feature.osmElement?.status === 'current').length;
const requiresReview = features.filter(
  (feature) => feature.osmElement?.status !== 'current',
).length;
const report = {
  registerType: 'controlled Cohort D claim-evidence migration decision register',
  policy: 'CLAIM_EVIDENCE_POLICY.md',
  migrationDate: new Date().toISOString(),
  sourceTriage: {
    path: 'data/review/townscape-provisional-verification-triage-2026-09-03.json',
    exactCohort: 'D',
    exactRecords: 414,
    membershipSha256,
    inputSha256: createHash('sha256')
      .update(await readFile(triagePath))
      .digest('hex'),
  },
  summary: {
    exactCohortSize: 414,
    currentOsmElementsMigratedToMappedContext: current,
    recordsEscalatedRequiresReview: requiresReview,
    recordsRemainingProvisional: current,
    recordsWithheld: 0,
    osmMetadataCaptured: features.filter((feature) => Boolean(feature.osmElement)).length,
    geometryChecksPassedOrRecorded: decisions.filter(
      (decision) => decision.geometryChecked === true,
    ).length,
    identityGeometryHistoryAnomalies: decisions.filter((decision) => decision.geometryAnomaly)
      .length,
    unsupportedTierFoeFieldsSuppressed: true,
    publicationTotalsBefore: { publishable: 0, provisional: 414, requiresReview: 0, withheld: 0 },
    publicationTotalsAfter: { publishable: 0, provisional: current, requiresReview, withheld: 0 },
    humanSignOffRequiredBeforeFinalPublication: requiresReview,
  },
  batches: Array.from({ length: 8 }, (_, index) => {
    const batch = decisions.filter(
      (decision) => decision.projectId === packages[index]!.project.id,
    );
    return {
      batch: index + 1,
      projectId: packages[index]!.project.id,
      records: batch.length,
      validation: 'passed with zero errors',
      publicProjectionAllowlist: 'passed; only mapped-context fields retained',
    };
  }),
  rulesApplied: [
    'Current OSM elements received only mapped_context and Tier M mapped_identity evidence.',
    'Gone/deleted elements were routed to requires_review; disappearance of the real-world feature was not asserted.',
    'No visitor scores, town ratings, scoring methodology, HES/NRHE records or unrelated content were changed.',
    'OSM operational fields cannot establish public access, hours, fees, capacity, operator, accessibility, operation, suitability or recommendation.',
    'Private/customer parking is not exposed as public visitor parking.',
  ],
  decisions,
};
await writeFile(
  resolve('data/review/townscape-cohort-d-migration-decision-register-2026-09-04.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
await writeFile(
  resolve('data/review/townscape-cohort-d-migration-decision-register-2026-09-04.md'),
  [
    '# Cohort D controlled claim-evidence migration decision register',
    '',
    `Migration date: ${report.migrationDate}`,
    `Exact cohort: 414 records`,
    `Membership SHA-256: ${membershipSha256}`,
    '',
    `- Current OSM elements migrated to mapped context: **${current}**`,
    `- Escalated/requiring review: **${requiresReview}**`,
    `- Remaining provisional: **${current}**`,
    '- Withheld: **0**',
    '- OSM metadata captured: **414/414**',
    '- Unsupported Tier F/O/E OSM fields suppressed: **confirmed**',
    '- Human sign-off before final publication: **required for the two Gone/deleted records**',
    '',
    'Publication totals before: 0 publishable, 414 provisional, 0 requires_review, 0 withheld.',
    `Publication totals after: 0 publishable, ${current} provisional, ${requiresReview} requires_review, 0 withheld.`,
    '',
    'Eight small project batches passed validation and mapped-context public projection checks. The two Gone elements remain source/history-preserved review cases; no real-world disappearance is asserted.',
    '',
  ].join('\n'),
  'utf8',
);
console.log(
  `Finalised Cohort D: ${current} mapped_context, ${requiresReview} requires_review, 0 withheld.`,
);
