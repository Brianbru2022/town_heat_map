import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  claimIsSupported,
  parseCurrentPlaceDetails,
  projectPublicClaims,
} from '../src/domain/claims';
import type { HeritageFeature, ProjectPackage, SourceRecord } from '../src/domain/models';
import { assessFeaturePublication, publicProjectPackage } from '../src/domain/publication';
import { validateFeatures } from '../src/domain/validation';

const reviewDirectory = 'data/review';
const triagePath = resolve(
  `${reviewDirectory}/townscape-provisional-verification-triage-2026-09-03.json`,
);
const migrationRegisterPath = resolve(
  `${reviewDirectory}/townscape-cohort-d-migration-decision-register-2026-09-04.json`,
);
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
const forbiddenPublicKeys = new Set([
  'access',
  'opening_hours',
  'charge',
  'fee',
  'operator',
  'capacity',
  'wheelchair',
  'website',
  'phone',
  'description',
  'network',
  'operational_status',
]);
const maxTierMAgeMs = 366 * 24 * 60 * 60 * 1000;

type MigrationDecision = {
  recordId: string;
  projectId: string;
  decision: string;
  osmStatus: string;
};

type MigrationRegister = {
  sourceTriage: { membershipSha256: string; inputSha256: string; exactRecords: number };
  summary: {
    currentOsmElementsMigratedToMappedContext: number;
    recordsEscalatedRequiresReview: number;
  };
  decisions: MigrationDecision[];
};

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function stateTotals(features: HeritageFeature[], packages: ProjectPackage[]) {
  const assessments = packages.flatMap((pkg) => {
    const validation = validateFeatures(pkg.project, pkg.features);
    return pkg.features
      .filter((feature) => features.some((candidate) => candidate.id === feature.id))
      .map((feature) => assessFeaturePublication(pkg, feature, validation));
  });
  return {
    publishable: assessments.filter((record) => record.effectiveState === 'publishable').length,
    provisional: assessments.filter((record) => record.effectiveState === 'provisional').length,
    verified: assessments.filter((record) => record.effectiveState === 'verified').length,
    requiresReview: assessments.filter((record) => record.effectiveState === 'requires_review')
      .length,
    withheld: assessments.filter((record) => record.effectiveState === 'withheld').length,
  };
}

function sourceHasOsmAttribution(source: SourceRecord): boolean {
  return (
    /openstreetmap/i.test(`${source.sourceName} ${source.sourceOrganisation}`) &&
    /odbl|open database licence/i.test(source.licence ?? '') &&
    /openstreetmap contributors/i.test(source.licence ?? '')
  );
}

function publicDetails(feature: HeritageFeature) {
  return projectPublicClaims(feature).sourceRecords.flatMap((source) =>
    parseCurrentPlaceDetails(source.notes),
  );
}

function candidateFailureReasons(feature: HeritageFeature, now: Date): string[] {
  const failures: string[] = [];
  if (feature.osmElement?.status !== 'current') failures.push('OSM element is not current');
  if (feature.publication?.profile !== 'mapped_context')
    failures.push('mapped_context profile missing');
  if (!claimIsSupported(feature, 'mapped_identity', now))
    failures.push('Tier M mapped identity is missing, stale or blocked');
  const evidence = feature.claimEvidence ?? [];
  if (
    evidence.length !== 1 ||
    evidence[0]?.claim !== 'mapped_identity' ||
    evidence[0]?.tier !== 'mapped_context' ||
    !Number.isFinite(Date.parse(evidence[0]?.reviewedAt ?? '')) ||
    now.getTime() - Date.parse(evidence[0]?.reviewedAt ?? '') > maxTierMAgeMs
  )
    failures.push('fresh Tier M mapped_identity evidence is not exactly recorded');
  if (!feature.sourceRecords.some(sourceHasOsmAttribution))
    failures.push('OSM attribution/licence metadata missing');
  const projected = publicDetails(feature);
  if (
    projected.some(
      (detail) =>
        forbiddenPublicKeys.has(detail.key) ||
        detail.key.startsWith('operator:') ||
        detail.key.startsWith('opening_hours:') ||
        detail.key.startsWith('capacity:') ||
        detail.key.startsWith('payment:') ||
        detail.key.startsWith('contact:') ||
        detail.key.startsWith('socket:') ||
        detail.key.startsWith('charging_station:') ||
        detail.key.startsWith('authentication:') ||
        detail.key.startsWith('toilets:'),
    )
  )
    failures.push('unsupported Tier F/O/E field survives the public projection');
  return failures;
}

const triage = JSON.parse(await readFile(triagePath, 'utf8')) as {
  records: Array<{ recordId: string; primaryCohort: string }>;
};
const cohortIds = triage.records
  .filter((record) => record.primaryCohort === 'D')
  .map((record) => record.recordId)
  .sort();
const membershipSha256 = sha256(`${cohortIds.join('\n')}\n`);
const migrationRegister = JSON.parse(
  await readFile(migrationRegisterPath, 'utf8'),
) as MigrationRegister;
const batchRegisters = await Promise.all(
  Array.from({ length: 8 }, (_, index) =>
    readFile(
      resolve(
        `${reviewDirectory}/townscape-cohort-d-migration-batch-${String(index + 1).padStart(2, '0')}.json`,
      ),
      'utf8',
    ).then((value) => JSON.parse(value) as { decisions: MigrationDecision[] }),
  ),
);
const decisions = batchRegisters.flatMap((batch) => batch.decisions);
if (cohortIds.length !== 414 || migrationRegister.sourceTriage.exactRecords !== 414)
  throw new Error('Cohort D exact membership count is not 414.');
if (membershipSha256 !== migrationRegister.sourceTriage.membershipSha256)
  throw new Error('Cohort D membership SHA-256 does not match the migration register.');
if (sha256(await readFile(triagePath)) !== migrationRegister.sourceTriage.inputSha256)
  throw new Error('Cohort D triage input SHA-256 does not match the migration register.');
if (
  decisions.length !== 414 ||
  new Set(decisions.map((decision) => decision.recordId)).size !== 414
)
  throw new Error('Migration batch decision registers do not contain exactly 414 unique records.');
if (
  new Set(decisions.map((decision) => decision.recordId)).size !== new Set(cohortIds).size ||
  decisions.some((decision) => !cohortIds.includes(decision.recordId))
)
  throw new Error('Migration batch decisions do not match Cohort D membership.');

const packages = await Promise.all(
  packageNames.map(
    async (name) =>
      JSON.parse(await readFile(resolve(`data/projects/${name}.json`), 'utf8')) as ProjectPackage,
  ),
);
const cohort = packages.flatMap((pkg) =>
  pkg.features.filter((feature) => cohortIds.includes(feature.id)),
);
if (cohort.length !== 414 || new Set(cohort.map((feature) => feature.id)).size !== 414)
  throw new Error('Project data does not contain exactly one copy of each Cohort D record.');
const now = new Date();
const current = cohort.filter((feature) => feature.osmElement?.status === 'current');
const review = cohort.filter((feature) => feature.osmElement?.status !== 'current');
if (current.length !== 412 || review.length !== 2)
  throw new Error(
    `Expected 412 current and 2 review records; found ${current.length} and ${review.length}.`,
  );
if (
  migrationRegister.summary.currentOsmElementsMigratedToMappedContext !== current.length ||
  migrationRegister.summary.recordsEscalatedRequiresReview !== review.length
)
  throw new Error('Current/review totals do not match the migration decision register.');
if (
  review.some(
    (feature) =>
      feature.osmElement?.status === 'current' || feature.publication?.state !== 'provisional',
  )
)
  throw new Error(
    'Gone/deleted records must retain their existing provisional declaration and effective requires_review status.',
  );

const failures = current
  .map((feature) => ({ recordId: feature.id, reasons: candidateFailureReasons(feature, now) }))
  .filter((result) => result.reasons.length > 0);
const failedIds = new Set(failures.map((failure) => failure.recordId));
const candidates = current.filter((feature) => !failedIds.has(feature.id));
const beforeTotals = stateTotals(cohort, packages);
const batchReports: Array<Record<string, unknown>> = [];

for (let index = 0; index < packages.length; index += 1) {
  const pkg = packages[index]!;
  const batchCandidates = candidates.filter((feature) => feature.projectId === pkg.project.id);
  const before = batchCandidates.map((feature) => ({
    recordId: feature.id,
    publication: feature.publication,
  }));
  const preflightErrors = validateFeatures(pkg.project, pkg.features).filter(
    (issue) => issue.severity === 'error',
  );
  if (preflightErrors.length) throw new Error(`${pkg.project.id}: validation errors before batch.`);
  for (const feature of batchCandidates) {
    feature.publication = {
      state: 'verified',
      profile: 'mapped_context',
      reviewedAt: now.toISOString(),
      ...(feature.publication?.notes ? { notes: feature.publication.notes } : {}),
    };
  }
  const postValidation = validateFeatures(pkg.project, pkg.features);
  const postErrors = postValidation.filter((issue) => issue.severity === 'error');
  if (postErrors.length) throw new Error(`${pkg.project.id}: validation errors after batch.`);
  const delivery = publicProjectPackage(pkg);
  const delivered = delivery?.features.filter((feature) =>
    batchCandidates.some((candidate) => candidate.id === feature.id),
  );
  if (!delivery || delivered?.length !== batchCandidates.length)
    throw new Error(`${pkg.project.id}: not every approved batch record is publicly deliverable.`);
  if (
    !delivery.licensingMetadata?.components.some(
      (component) =>
        component.id === 'openstreetmap-current-place-data' &&
        /ODbL/i.test(component.licence) &&
        component.attribution === '© OpenStreetMap contributors',
    )
  )
    throw new Error(`${pkg.project.id}: public OSM attribution/licensing component missing.`);
  const projectedFailures = delivered.flatMap((feature) => {
    const details = publicDetails(feature);
    return details
      .filter((detail) => forbiddenPublicKeys.has(detail.key))
      .map((detail) => `${feature.id}:${detail.key}`);
  });
  if (projectedFailures.length)
    throw new Error(`${pkg.project.id}: prohibited public claims: ${projectedFailures.join(', ')}`);
  const privateParkingFailures = delivered.flatMap((feature) => {
    const rawAccess = feature.sourceRecords
      .flatMap((source) => parseCurrentPlaceDetails(source.notes))
      .filter((detail) => detail.key === 'access' && /^(?:private|customers)$/i.test(detail.value));
    return rawAccess.length && publicDetails(feature).some((detail) => detail.key === 'access')
      ? [feature.id]
      : [];
  });
  if (privateParkingFailures.length)
    throw new Error(`${pkg.project.id}: private/customer parking appears as public access.`);
  const after = batchCandidates.map((feature) => ({
    recordId: feature.id,
    publication: feature.publication,
    effectiveState: assessFeaturePublication(pkg, feature, postValidation).effectiveState,
  }));
  const batchReport = {
    registerType: 'Cohort D controlled publication finalisation batch',
    batch: index + 1,
    projectId: pkg.project.id,
    changed: batchCandidates.length,
    reversibleBeforeState: before,
    afterState: after,
    gates: {
      preflightValidationErrors: 0,
      postBatchValidationErrors: 0,
      allApprovedRecordsPubliclyDeliverable: true,
      mappedContextProjectionOnly: true,
      privateCustomerParkingNotPublicAccess: true,
      osmAttributionAndOdblComponentPresent: true,
    },
  };
  await writeFile(
    resolve(
      `${reviewDirectory}/townscape-cohort-d-publication-finalisation-batch-${String(index + 1).padStart(2, '0')}.json`,
    ),
    `${JSON.stringify(batchReport, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    resolve(`data/projects/${packageNames[index]}.json`),
    `${JSON.stringify(pkg, null, 2)}\n`,
    'utf8',
  );
  batchReports.push(batchReport);
}

const afterTotals = stateTotals(cohort, packages);
const representativeTypes = Object.entries(
  candidates.reduce<Record<string, { count: number; publicKeys: Set<string> }>>(
    (types, feature) => {
      const category = feature.featureType;
      const entry = (types[category] ??= { count: 0, publicKeys: new Set<string>() });
      entry.count += 1;
      for (const detail of publicDetails(feature)) entry.publicKeys.add(detail.key);
      return types;
    },
    {},
  ),
).map(([featureType, entry]) => ({
  featureType,
  records: entry.count,
  publicMappedContextKeys: [...entry.publicKeys].sort(),
}));
const finalRegister = {
  registerType: 'controlled Cohort D mapped-context publication finalisation register',
  finalisedAt: now.toISOString(),
  policy: 'CLAIM_EVIDENCE_POLICY.md',
  migrationRegister: {
    path: 'data/review/townscape-cohort-d-migration-decision-register-2026-09-04.json',
    membershipSha256,
    triageInputSha256: sha256(await readFile(triagePath)),
    batchDecisionRegisterCount: 8,
  },
  exactRecordsConsidered: cohort.length,
  publicationTotals: { before: beforeTotals, after: afterTotals },
  approvedForPublicMappedContextDelivery: candidates.map((feature) => feature.id),
  leftProvisional: failures,
  requiresReview: review.map((feature) => ({
    recordId: feature.id,
    osmStatus: feature.osmElement?.status,
    declaredState: feature.publication?.state,
    effectiveState: assessFeaturePublication(
      packages.find((pkg) => pkg.project.id === feature.projectId)!,
      feature,
    ).effectiveState,
    reason: 'OSM element is deleted or unavailable; no real-world removal is asserted.',
  })),
  representativeMappedContextProjection: representativeTypes,
  restrictionsConfirmed: {
    tierFoeFieldsSuppressed: true,
    privateCustomerParkingNeverPresentedAsPublicVisitorParking: true,
    publicDescriptionIsMappedContextOnly: true,
    attributionAndLicensingPresent: true,
  },
  batches: batchReports,
  anomaliesRequiringManualReview: failures,
};
await writeFile(
  resolve(
    `${reviewDirectory}/townscape-cohort-d-publication-finalisation-register-2026-09-04.json`,
  ),
  `${JSON.stringify(finalRegister, null, 2)}\n`,
  'utf8',
);
await writeFile(
  resolve(`${reviewDirectory}/townscape-cohort-d-publication-finalisation-register-2026-09-04.md`),
  [
    '# Cohort D mapped-context publication finalisation register',
    '',
    `Finalised: ${now.toISOString()}`,
    `Membership SHA-256: ${membershipSha256}`,
    '',
    `- Records considered: **${cohort.length}**`,
    `- Approved for public mapped-context delivery: **${candidates.length}**`,
    `- Left provisional: **${failures.length}**`,
    `- Requiring review: **${review.length}**`,
    '',
    `Cohort effective totals before: ${beforeTotals.publishable} publishable, ${beforeTotals.provisional} provisional, ${beforeTotals.requiresReview} requiring review.`,
    `Cohort effective totals after: ${afterTotals.publishable} publishable, ${afterTotals.provisional} provisional, ${afterTotals.requiresReview} requiring review.`,
    '',
    'Each project was applied and validated as a separate reversible batch. The public projection remains mapped context only: unsupported Tier F/O/E fields are suppressed, and private/customer parking is never presented as public visitor parking. The two deleted/unavailable OSM elements retain their source history and effective `requires_review` status; no real-world removal is asserted.',
    '',
  ].join('\n'),
  'utf8',
);
console.log(
  `Finalised Cohort D publication: ${candidates.length} mapped-context records approved, ${failures.length} left provisional, ${review.length} requiring review.`,
);
