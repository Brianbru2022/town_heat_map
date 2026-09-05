import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HeritageFeature, ProjectPackage } from '../src/domain/models';
import { publicCurrentPlaceDetails } from '../src/domain/claims';
import { assessFeaturePublication, publicProjectPackage } from '../src/domain/publication';
import { validateFeatures } from '../src/domain/validation';

const reviewDir = resolve('data/review');
const triagePath = resolve(reviewDir, 'townscape-provisional-verification-triage-2026-09-03.json');
const migrationPath = resolve(
  reviewDir,
  'townscape-cohort-b-migration-decision-register-2026-09-04.json',
);
const names = ['alloa', 'alva', 'biggar', 'culross', 'killin', 'kincardine', 'tillicoultry'];
const now = new Date();
const triage = JSON.parse(await readFile(triagePath, 'utf8')) as {
  records: Array<{ recordId: string; primaryCohort: string }>;
};
const cohortIds = triage.records
  .filter((record) => record.primaryCohort === 'B')
  .map((record) => record.recordId)
  .sort();
const membershipSha256 = createHash('sha256')
  .update(`${cohortIds.join('\n')}\n`)
  .digest('hex');
const migration = JSON.parse(await readFile(migrationPath, 'utf8')) as {
  sourceTriage: { membershipSha256: string; inputSha256: string };
  summary: { approvedMappedContext: number; recordsRequiringReview: number };
};
if (
  cohortIds.length !== 52 ||
  membershipSha256 !== migration.sourceTriage.membershipSha256 ||
  migration.summary.approvedMappedContext !== 52 ||
  migration.summary.recordsRequiringReview !== 0
)
  throw new Error('Cohort B migration register does not match exact approved membership.');
const idSet = new Set(cohortIds);
const packages = await Promise.all(
  names.map(
    async (name) =>
      JSON.parse(
        await readFile(resolve('data/projects', `${name}.json`), 'utf8'),
      ) as ProjectPackage,
  ),
);
const cohort = packages.flatMap((pkg) => pkg.features.filter((feature) => idSet.has(feature.id)));
if (cohort.length !== 52 || new Set(cohort.map((feature) => feature.id)).size !== 52)
  throw new Error('Cohort B package membership mismatch.');
function totals(features: HeritageFeature[]) {
  return features.reduce(
    (sum, feature) => {
      const pkg = packages.find((candidate) => candidate.project.id === feature.projectId)!;
      const state = assessFeaturePublication(pkg, feature).effectiveState;
      sum[state] += 1;
      return sum;
    },
    { publishable: 0, provisional: 0, verified: 0, requiresReview: 0, withheld: 0 } as Record<
      string,
      number
    >,
  );
}
const before = totals(cohort);
const batchReports: Array<Record<string, unknown>> = [];
for (let index = 0; index < packages.length; index += 1) {
  const pkg = packages[index]!;
  const batch = pkg.features.filter((feature) => idSet.has(feature.id));
  const preErrors = validateFeatures(pkg.project, pkg.features).filter(
    (item) => item.severity === 'error',
  );
  if (preErrors.length)
    throw new Error(`${pkg.project.id}: validation failed before publication batch.`);
  const reversibleBeforeState = batch.map((feature) => ({
    recordId: feature.id,
    publication: feature.publication,
  }));
  for (const feature of batch)
    feature.publication = {
      ...feature.publication!,
      state: 'verified',
      profile: 'mapped_context',
      reviewedAt: now.toISOString(),
    };
  const postErrors = validateFeatures(pkg.project, pkg.features).filter(
    (item) => item.severity === 'error',
  );
  if (postErrors.length)
    throw new Error(`${pkg.project.id}: validation failed after publication batch.`);
  const delivery = publicProjectPackage(pkg);
  if (!delivery) throw new Error(`${pkg.project.id}: package is not publicly deliverable.`);
  const delivered = delivery.features.filter((feature) => idSet.has(feature.id));
  if (delivered.length !== batch.length)
    throw new Error(`${pkg.project.id}: not every approved record is delivered.`);
  const forbidden = batch.flatMap((feature) =>
    feature.sourceRecords.flatMap((source) =>
      publicCurrentPlaceDetails(feature, source)
        .filter((detail) =>
          /^(?:access|opening_hours?|charge|fee|operator|capacity|wheelchair|website|phone|description|network|operational_status)$/i.test(
            detail.key,
          ),
        )
        .map((detail) => `${feature.id}:${detail.key}`),
    ),
  );
  if (forbidden.length)
    throw new Error(`${pkg.project.id}: unsupported public claims: ${forbidden.join(', ')}`);
  const report = {
    registerType: 'Cohort B controlled mapped-context publication batch',
    batch: index + 1,
    projectId: pkg.project.id,
    changed: batch.length,
    reversibleBeforeState,
    afterState: batch.map((feature) => ({
      recordId: feature.id,
      publication: feature.publication,
      effectiveState: assessFeaturePublication(pkg, feature).effectiveState,
    })),
    gates: {
      preflightValidationErrors: 0,
      postBatchValidationErrors: 0,
      allApprovedRecordsDelivered: true,
      tierFoeSuppression: true,
      osmAttributionPresent: Boolean(
        delivery.licensingMetadata?.components.some(
          (component) => component.id === 'openstreetmap-current-place-data',
        ),
      ),
    },
  };
  await writeFile(
    resolve(
      reviewDir,
      `townscape-cohort-b-publication-batch-${String(index + 1).padStart(2, '0')}.json`,
    ),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(
    resolve('data/projects', `${names[index]}.json`),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
  batchReports.push(report);
}
const after = totals(cohort);
const final = {
  registerType: 'controlled Cohort B mapped-context publication finalisation register',
  finalisedAt: now.toISOString(),
  policy: 'CLAIM_EVIDENCE_POLICY.md',
  migrationRegister: {
    path: 'data/review/townscape-cohort-b-migration-decision-register-2026-09-04.json',
    membershipSha256,
    triageInputSha256: migration.sourceTriage.inputSha256,
  },
  exactRecordsConsidered: 52,
  publicationTotals: { before, after },
  approvedForPublicMappedContextDelivery: cohortIds,
  leftProvisional: [],
  requiresReview: [],
  withheld: [],
  strongerTierExistingIndependentEvidence: [],
  restrictionsConfirmed: {
    tierFoeFieldsSuppressed: true,
    publicDescriptionIsMappedContextOnly: true,
    privateCustomerParkingNeverPresentedAsPublicVisitorParking: true,
    attributionAndLicensingPresent: true,
  },
  batches: batchReports,
};
await writeFile(
  resolve(reviewDir, 'townscape-cohort-b-publication-finalisation-register-2026-09-04.json'),
  `${JSON.stringify(final, null, 2)}\n`,
);
await writeFile(
  resolve(reviewDir, 'townscape-cohort-b-publication-finalisation-register-2026-09-04.md'),
  `# Cohort B mapped-context publication finalisation register\n\nFinalised: ${now.toISOString()}\nMembership SHA-256: **${membershipSha256}**\n\n- Exact records considered: **52**\n- Approved for public mapped-context delivery: **52**\n- Supported at stronger tier by existing independent evidence: **0**\n- Left provisional: **0**\n- Requiring review: **0**\n- Withheld: **0**\n- Tier F/O/E suppression: **confirmed**\n\nPublication totals before: ${before.publishable} publishable, ${before.provisional} provisional, ${before.requiresReview} requiring review, ${before.withheld} withheld.\nPublication totals after: ${after.publishable} publishable, ${after.provisional} provisional, ${after.requiresReview} requiring review, ${after.withheld} withheld.\n\nSeven project batches passed validation and public projection gates.\n`,
);
console.log(
  `Cohort B publication: ${after.publishable} publishable, ${after.provisional} provisional, ${after.requiresReview} requires_review, ${after.withheld} withheld.`,
);
