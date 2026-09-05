import { describe, expect, it } from 'vitest';
import { alloaPackage } from '../data/alloa';
import type { ProjectPackage } from './models';
import { validateProjectPackageSchema } from './packageSchema';
import { assessProjectPackage, publicProjectPackage } from './publication';

function clonePackage(): ProjectPackage {
  const sourceFeature = alloaPackage.features.find(
    (feature) => feature.id === 'hes-listed-building:LB20953',
  )!;
  return structuredClone({
    ...alloaPackage,
    publication: { state: 'publishable' },
    features: [sourceFeature],
    historicMaps: [],
    settlementPolygons: [],
    validation: [],
  });
}

function expectSchemaBlocked(value: unknown) {
  const schema = validateProjectPackageSchema(value);
  const assessment = assessProjectPackage(value as ProjectPackage);

  expect(schema.valid).toBe(false);
  expect(assessment).toMatchObject({
    packageState: 'withheld',
    canPublishPackage: false,
    schemaErrors: expect.any(Array),
  });
  expect(assessment.summary.publishable).toBe(0);
  expect(publicProjectPackage(value as ProjectPackage)).toBeUndefined();
}

describe('runtime project-package schema', () => {
  it('accepts the current valid catalogue and safe legacy record defaults', () => {
    const legacy = clonePackage();
    legacy.features[0].publication = undefined;
    legacy.features[0].reviewed = true;

    expect(validateProjectPackageSchema(legacy)).toEqual({ valid: true, errors: [] });
    expect(publicProjectPackage(legacy)?.features[0].id).toBe(legacy.features[0].id);
  });

  it('fails closed for an unknown package publication state', () => {
    const pkg = clonePackage();
    (pkg.publication as unknown as { state: string }).state = 'unexpected-package-state';
    expectSchemaBlocked(pkg);
  });

  it('fails closed for an unknown feature publication state', () => {
    const pkg = clonePackage();
    pkg.features[0].publication = { state: 'publishable' };
    (pkg.features[0].publication as { state: string }).state = 'unexpected-feature-state';
    expectSchemaBlocked(pkg);
  });

  it.each([
    [
      'claim tier',
      (pkg: ProjectPackage) =>
        ((pkg.features[0].claimEvidence![0] as { tier: string }).tier = 'tier-x'),
    ],
    [
      'publication profile',
      (pkg: ProjectPackage) =>
        ((pkg.features[0].publication as { profile?: string }).profile = 'unrestricted-profile'),
    ],
  ])('fails closed for a malformed %s', (_label, mutate) => {
    const pkg = clonePackage();
    pkg.features[0].publication = { state: 'publishable', profile: 'mapped_context' };
    pkg.features[0].claimEvidence = [
      {
        claim: 'mapped_identity',
        tier: 'mapped_context',
        sourceRecordRefs: [pkg.features[0].sourceRecords[0].sourceName],
        reviewedAt: '2026-09-04T00:00:00.000Z',
      },
    ];
    mutate(pkg);
    expectSchemaBlocked(pkg);
  });

  it('fails closed for malformed claim evidence', () => {
    const pkg = clonePackage();
    pkg.features[0].claimEvidence = [
      {
        claim: 'operator',
        tier: 'corroborated_facility',
        sourceRecordRefs: [],
        reviewedAt: 'not-a-date',
      },
    ];
    expectSchemaBlocked(pkg);
  });

  it.each([
    ['unknown status', (metadata: Record<string, unknown>) => (metadata.status = 'ghost')],
    ['missing checked date', (metadata: Record<string, unknown>) => delete metadata.checkedAt],
    ['invalid version', (metadata: Record<string, unknown>) => (metadata.version = 0)],
  ])('fails closed for OSM metadata with %s', (_label, mutate) => {
    const pkg = clonePackage();
    pkg.features[0].osmElement = {
      elementType: 'way',
      elementId: '123',
      version: 1,
      visible: true,
      status: 'current',
      checkedAt: '2026-09-04T00:00:00.000Z',
    };
    mutate(pkg.features[0].osmElement as unknown as Record<string, unknown>);
    expectSchemaBlocked(pkg);
  });

  it('fails closed for a structurally schema-invalid package', () => {
    const pkg = clonePackage() as unknown as Record<string, unknown>;
    delete pkg.project;
    expectSchemaBlocked(pkg);
  });
});
