import { describe, expect, it } from 'vitest';
import { alloaPackage } from '../data/alloa';
import { publishedProjectPackages } from '../data/publishedProjects';
import type { ClaimEvidence, HeritageFeature, ProjectPackage } from './models';
import { claimIsSupported, publicCurrentPlaceDetails } from './claims';
import { assessFeaturePublication, publicProjectPackage } from './publication';

const hesFeature = alloaPackage.features.find(
  (feature) => feature.id === 'hes-listed-building:LB20953',
)!;
const nrheFeature = alloaPackage.features.find((feature) => feature.id === 'nrhe:47179')!;

function evidence(claim: ClaimEvidence['claim'], tier: ClaimEvidence['tier']): ClaimEvidence {
  return {
    claim,
    tier,
    sourceRecordRefs: ['operator:test-facility'],
    reviewedAt: '2026-09-03T10:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
}

function osmFeature(overrides: Partial<HeritageFeature> = {}): HeritageFeature {
  return {
    ...hesFeature,
    id: 'osm-community:node-123',
    name: 'Test visitor facility',
    featureType: 'other',
    reviewed: true,
    shortDescription: 'A recommended and fully accessible visitor facility.',
    fullDescription: 'Editorial copy that must not be inferred from mapping.',
    tags: ['current-context', 'osm-community-place', 'osm-community-parking'],
    licence: 'Open Database Licence (ODbL) v1.0; © OpenStreetMap contributors.',
    publication: { state: 'verified', profile: 'mapped_context' },
    osmElement: {
      elementType: 'node',
      elementId: '123',
      version: 7,
      lastEditedAt: '2026-08-30T12:00:00.000Z',
      changesetId: 456,
      visible: true,
      status: 'current',
      checkedAt: '2026-09-03T09:00:00.000Z',
    },
    sourceRecords: [
      {
        sourceName: 'OpenStreetMap current community places',
        sourceOrganisation: 'OpenStreetMap contributors',
        sourceRecordId: 'node/123',
        sourceUrl: 'https://www.openstreetmap.org/node/123',
        accessedAt: '2026-09-03T09:00:00.000Z',
        licence: 'Open Database Licence (ODbL) v1.0',
        reliability: 'discovery_only',
        notes:
          'Current OSM details: amenity=parking; name=Test car park; access=customers; opening_hours=24/7; fee=yes; wheelchair=yes; operator=Example Council; capacity=20; website=https://example.test/.',
      },
      {
        sourceName: 'Example Council facility page',
        sourceOrganisation: 'Example Council',
        sourceRecordId: 'operator:test-facility',
        sourceUrl: 'https://example.test/facility',
        accessedAt: '2026-09-03T10:00:00.000Z',
        reliability: 'local_authority',
        notes:
          'Current-place curation: access=yes; opening_hours=09:00-17:00; fee=no; wheelchair=yes; operator=Example Council; capacity=18; website=https://example.test/facility; description=Recommended stop.',
      },
    ],
    claimEvidence: [],
    ...overrides,
  };
}

function packageWith(feature: HeritageFeature): ProjectPackage {
  return {
    ...alloaPackage,
    publication: { state: 'publishable' },
    features: [feature],
    historicMaps: [],
    settlementPolygons: [],
    validation: [],
  };
}

describe('claim-relative public projection', () => {
  it('allows an OSM-only Tier M identity/location claim and suppresses stronger fields', () => {
    const feature = osmFeature();
    const delivered = publicProjectPackage(packageWith(feature))?.features[0];
    const details = publicCurrentPlaceDetails(delivered!, delivered?.sourceRecords[0]);

    expect(details).toEqual([
      { key: 'amenity', value: 'parking' },
      { key: 'name', value: 'Test car park' },
    ]);
    expect(delivered?.shortDescription).toContain('Mapped present-day context');
    expect(delivered?.fullDescription).toBeUndefined();
  });

  it('removes arbitrary Tier F/O/E narrative variants while retaining supported structured fields', () => {
    const feature = osmFeature({
      sourceRecords: [
        osmFeature().sourceRecords[0],
        {
          ...osmFeature().sourceRecords[1],
          notes:
            'Run by Example Council. Open daily, booking advised, dogs welcome, excellent for families, wheelchair accessible, 20 spaces and £5 admission.',
        },
      ],
      reviewNotes: 'The operator says this is a high-quality recommendation.',
      publication: {
        state: 'verified',
        profile: 'mapped_context',
        notes: 'Internal approval note mentioning the operator.',
      },
    });
    const originalNotes = feature.sourceRecords[1].notes;
    const delivered = publicProjectPackage(packageWith(feature))?.features[0];
    const publicText = JSON.stringify(delivered);

    expect(publicText).not.toContain('Run by Example Council');
    expect(publicText).not.toContain('booking advised');
    expect(publicText).not.toContain('£5 admission');
    expect(publicText).not.toContain('Internal approval note');
    expect(publicText).not.toContain('high-quality recommendation');
    expect(publicCurrentPlaceDetails(delivered!, delivered?.sourceRecords[0])).toEqual([
      { key: 'amenity', value: 'parking' },
      { key: 'name', value: 'Test car park' },
    ]);
    expect(feature.sourceRecords[1].notes).toBe(originalNotes);
  });

  it.each([
    ['alva-scotland', 'curated:context-games', 'OpenStreetMap Johnstone Park boundary'],
    ['tillicoultry-scotland', 'osm-community:way-989738553', 'Good Year ordering site'],
    [
      'tillicoultry-scotland',
      'osm-community:way-989738553',
      'Good Year Chinese Takeaway current directory',
    ],
    ['biggar-scotland', 'osm-community:node-10550529710', 'Merry + Bright contact'],
  ])(
    'suppresses the audited operator-note bypass in %s / %s / %s',
    (townId, featureId, sourceName) => {
      const sourcePackage = publishedProjectPackages.find((pkg) => pkg.project.id === townId)!;
      const sourceFeature = sourcePackage.features.find((candidate) => candidate.id === featureId)!;
      const internalSource = sourceFeature.sourceRecords.find(
        (source) => source.sourceName === sourceName,
      )!;
      const delivered = publicProjectPackage(sourcePackage)?.features.find(
        (candidate) => candidate.id === featureId,
      );
      const publicSource = delivered?.sourceRecords.find(
        (source) => source.sourceName === sourceName,
      );

      expect(internalSource.notes).toMatch(/operator/i);
      expect(claimIsSupported(sourceFeature, 'operator')).toBe(false);
      expect(publicSource?.notes).toBeUndefined();
      expect(JSON.stringify(delivered)).not.toContain(internalSource.notes);
    },
  );

  it.each(['private', 'customers'])(
    '%s parking remains mapped context, not a public-access claim',
    (access) => {
      const feature = osmFeature({
        sourceRecords: [
          {
            ...osmFeature().sourceRecords[0],
            notes: `Current OSM details: amenity=parking; access=${access}.`,
          },
        ],
      });
      const delivered = publicProjectPackage(packageWith(feature))?.features[0];
      const details = publicCurrentPlaceDetails(delivered!, delivered?.sourceRecords[0]);

      expect(details).toEqual([{ key: 'amenity', value: 'parking' }]);
      expect(details).not.toContainEqual({ key: 'access', value: access });
    },
  );

  it('does not let legacy reviewed=true bypass claim filtering', () => {
    const feature = osmFeature({ publication: undefined, claimEvidence: undefined });
    const delivered = publicProjectPackage(packageWith(feature))?.features[0];
    const details = publicCurrentPlaceDetails(delivered!, delivered?.sourceRecords[0]);

    expect(delivered?.publication).toMatchObject({ state: 'verified', profile: 'mapped_context' });
    expect(details.some(({ key }) => key === 'opening_hours' || key === 'operator')).toBe(false);
  });

  it('shows Tier F fields only when corroborating claim evidence identifies a retained source', () => {
    const feature = osmFeature({
      publication: { state: 'verified', profile: 'verified_facility' },
      claimEvidence: [
        evidence('public_access', 'corroborated_facility'),
        evidence('opening_hours', 'corroborated_facility'),
        evidence('fees', 'corroborated_facility'),
        evidence('operator', 'corroborated_facility'),
        evidence('capacity', 'corroborated_facility'),
      ],
    });
    const delivered = publicProjectPackage(packageWith(feature))?.features[0];
    const details = publicCurrentPlaceDetails(delivered!, delivered?.sourceRecords[1]);

    expect(details.map(({ key }) => key)).toEqual([
      'access',
      'opening_hours',
      'fee',
      'operator',
      'capacity',
    ]);
    expect(details.some(({ key }) => key === 'wheelchair' || key === 'website')).toBe(false);
  });

  it('requires current Tier O evidence for accessibility, operation, EV and route/access claims', () => {
    const feature = osmFeature({
      publication: { state: 'verified', profile: 'verified_facility' },
      claimEvidence: [
        evidence('accessibility', 'operational'),
        evidence('current_operation', 'operational'),
        evidence('ev_charging_operation', 'operational'),
        evidence('route_access', 'operational'),
      ],
    });

    expect(claimIsSupported(feature, 'accessibility')).toBe(true);
    expect(claimIsSupported(feature, 'current_operation')).toBe(true);
    expect(claimIsSupported(feature, 'ev_charging_operation')).toBe(true);
    expect(claimIsSupported(feature, 'route_access')).toBe(true);
    expect(claimIsSupported(osmFeature(), 'accessibility')).toBe(false);
  });

  it('requires an editorial profile and explicit Tier E evidence for recommendations', () => {
    const evidenceRecord = evidence('editorial_recommendation', 'editorial');
    const wrongProfile = osmFeature({ claimEvidence: [evidenceRecord] });
    const editorial = osmFeature({
      publication: { state: 'verified', profile: 'editorial' },
      claimEvidence: [evidenceRecord],
    });

    expect(claimIsSupported(wrongProfile, 'editorial_recommendation')).toBe(false);
    expect(
      publicProjectPackage(packageWith(wrongProfile))?.features[0].fullDescription,
    ).toBeUndefined();
    expect(publicProjectPackage(packageWith(editorial))?.features[0].fullDescription).toBe(
      editorial.fullDescription,
    );
  });

  it('escalates Gone/deleted OSM elements to requires_review without asserting removal', () => {
    const feature = osmFeature({
      osmElement: { ...osmFeature().osmElement!, status: 'deleted', visible: false },
    });
    const assessment = assessFeaturePublication(packageWith(feature), feature);

    expect(assessment).toMatchObject({ effectiveState: 'requires_review', canPublish: false });
    expect(assessment.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'osm.element_not_current',
          message: expect.stringContaining('not proof'),
        }),
      ]),
    );
  });

  it('requires annual Tier M rechecking and suppresses expired stronger claims', () => {
    const stale = osmFeature({
      osmElement: {
        ...osmFeature().osmElement!,
        checkedAt: '2020-01-01T00:00:00.000Z',
      },
    });
    const expired = osmFeature({
      publication: { state: 'verified', profile: 'verified_facility' },
      claimEvidence: [
        {
          ...evidence('opening_hours', 'corroborated_facility'),
          expiresAt: '2026-09-02T00:00:00.000Z',
        },
      ],
    });

    expect(assessFeaturePublication(packageWith(stale), stale)).toMatchObject({
      effectiveState: 'requires_review',
      canPublish: false,
    });
    expect(claimIsSupported(expired, 'opening_hours', new Date('2026-09-03T00:00:00.000Z'))).toBe(
      false,
    );
  });

  it('adds component-level ODbL status without changing authoritative public facts', () => {
    const osmDelivery = publicProjectPackage(packageWith(osmFeature()))!;
    const hesDelivery = publicProjectPackage(packageWith(hesFeature))!;
    const nrheDelivery = publicProjectPackage(packageWith(nrheFeature))!;

    expect(osmDelivery.licensingMetadata?.components).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'openstreetmap-current-place-data',
          licence: expect.stringContaining('ODbL'),
          attribution: '© OpenStreetMap contributors',
          legalReviewNote: expect.stringContaining('legal review'),
        }),
      ]),
    );
    expect(hesDelivery.features[0]).toMatchObject({
      id: hesFeature.id,
      name: hesFeature.name,
      geometry: hesFeature.geometry,
      shortDescription: hesFeature.shortDescription,
    });
    expect(nrheDelivery.features[0]).toMatchObject({
      id: nrheFeature.id,
      name: nrheFeature.name,
      geometry: nrheFeature.geometry,
      shortDescription: nrheFeature.shortDescription,
    });
    expect(hesDelivery.features[0].reviewNotes).toBeUndefined();
    expect(hesDelivery.features[0].sourceRecords.every((source) => !source.notes)).toBe(true);
    expect(hesDelivery.licensingMetadata).toBeUndefined();
    expect(nrheDelivery.licensingMetadata).toBeUndefined();
  });
});
