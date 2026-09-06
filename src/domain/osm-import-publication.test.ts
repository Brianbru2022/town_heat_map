import { describe, expect, it } from 'vitest';
import { alloaPackage } from '../data/alloa';
import { withRecordedLicenceDecisions } from '../data/recordedLicenceDecisions';
import type { LicenceDecisionState, ProjectPackage, SourceRecord } from './models';
import { replaceImportedSourceRecord } from './osmImport';
import { publicProjectPackage } from './publication';

const targetId = 'osm-community:node-4884199850';
const odbl = 'Open Database Licence (ODbL) v1.0; © OpenStreetMap contributors.';

function fixture(): ProjectPackage {
  const pkg = structuredClone(alloaPackage);
  const feature = pkg.features.find((candidate) => candidate.id === targetId)!;
  const source = feature.sourceRecords.find(
    (record) => record.sourceRecordId === 'node/4884199850',
  )!;
  feature.sourceRecords = [{ ...source, licenceDecision: undefined }];
  feature.claimEvidence = [
    {
      claim: 'mapped_identity',
      tier: 'mapped_context',
      sourceRecordRefs: ['node/4884199850'],
      reviewedAt: '2026-09-05',
    },
  ];
  feature.licence = 'See individual source records.';
  feature.licenceDecision = {
    state: 'inherited',
    scope: 'public_metadata',
    reviewedAt: '2026-09-05',
    evidenceText: 'See individual source records.',
    inheritedFrom: 'source_records',
  };
  feature.publication = { state: 'publishable', profile: 'mapped_context' };
  pkg.features = [feature];
  pkg.historicMaps = [];
  pkg.settlementPolygons = [];
  pkg.validation = [];
  return pkg;
}

function replacement(source: SourceRecord, changes: Partial<SourceRecord> = {}): SourceRecord {
  return {
    ...source,
    accessedAt: '2026-09-06T09:00:00.000Z',
    notes: 'Current OSM details: historic=memorial; memorial=statue.',
    licenceDecision: undefined,
    ...changes,
  };
}

function deliveredIds(pkg: ProjectPackage): string[] {
  return publicProjectPackage(pkg)?.features.map((feature) => feature.id) ?? [];
}

describe('supported OSM importer to public projection', () => {
  it.each([
    ['denied', 'internal_only'],
    ['restricted', 'internal_only'],
    ['unresolved', 'public_metadata'],
  ] as const)(
    'keeps an explicit %s source decision through refresh, bridge and every public export',
    (state, scope) => {
      const before = withRecordedLicenceDecisions(fixture());
      const feature = before.features[0];
      const source = feature.sourceRecords[0];
      source.licenceDecision = {
        state: state as LicenceDecisionState,
        scope,
        reviewedAt: '2026-09-05',
        evidenceText: odbl,
      };

      replaceImportedSourceRecord(feature, replacement(source));
      const after = withRecordedLicenceDecisions(before);

      expect(after.features[0].sourceRecords[0].licenceDecision?.state).toBe(state);
      expect(deliveredIds(after)).not.toContain(targetId);
    },
  );

  it('keeps an unchanged approved decision authorising after a harmless OSM refresh', () => {
    const before = withRecordedLicenceDecisions(fixture());
    const feature = before.features[0];
    const source = feature.sourceRecords[0];

    replaceImportedSourceRecord(
      feature,
      replacement(source, { notes: 'Current OSM details: historic=memorial.' }),
    );
    const after = withRecordedLicenceDecisions(before);

    expect(after.features[0].sourceRecords[0].licenceDecision?.state).toBe('approved');
    expect(deliveredIds(after)).toContain(targetId);
  });

  it.each([
    ['licence text', { licence: 'Different licence terms.' }],
    ['licence URL', { sourceUrl: 'https://www.openstreetmap.org/node/4884199850/licence' }],
    ['reviewed source organisation', { sourceOrganisation: 'A different mapping publisher' }],
  ] as const)(
    'makes a retained approved decision stale and non-authorising when %s changes',
    (_label, changes) => {
      const before = withRecordedLicenceDecisions(fixture());
      const feature = before.features[0];
      const source = feature.sourceRecords[0];

      replaceImportedSourceRecord(feature, replacement(source, changes));
      const after = withRecordedLicenceDecisions(before);

      expect(after.features[0].sourceRecords[0].licenceDecision?.state).toBe('approved');
      expect(deliveredIds(after)).not.toContain(targetId);
    },
  );

  it('does not attach a prior decision to a changed source identity and retains the prior source record', () => {
    const before = withRecordedLicenceDecisions(fixture());
    const feature = before.features[0];
    feature.sourceRecords[0].licenceDecision = {
      state: 'denied',
      scope: 'internal_only',
      reviewedAt: '2026-09-05',
      evidenceText: odbl,
    };

    replaceImportedSourceRecord(
      feature,
      replacement(feature.sourceRecords[0], {
        sourceRecordId: 'node/9999999999',
        sourceUrl: 'https://www.openstreetmap.org/node/9999999999',
      }),
    );
    const after = withRecordedLicenceDecisions(before);

    expect(after.features[0].sourceRecords).toHaveLength(2);
    expect(after.features[0].sourceRecords[0].licenceDecision?.state).toBe('denied');
    expect(after.features[0].sourceRecords[1].licenceDecision?.state).toBe('approved');
    expect(deliveredIds(after)).not.toContain(targetId);
  });

  it('keeps delegated feature approval dependent on its retained source decisions', () => {
    const pkg = withRecordedLicenceDecisions(fixture());
    expect(pkg.features[0].licenceDecision).toMatchObject({
      state: 'inherited',
      inheritedFrom: 'source_records',
    });
    expect(deliveredIds(pkg)).toContain(targetId);
  });

  it('limits the recorded bridge to its listed package scope and never creates decisions out of scope', () => {
    const pkg = fixture();
    pkg.project.id = 'unrecorded-test-package';
    delete pkg.licenceDecision;
    delete pkg.features[0].licenceDecision;
    delete pkg.features[0].sourceRecords[0].licenceDecision;

    const migrated = withRecordedLicenceDecisions(pkg);

    expect(migrated.licenceDecision).toBeUndefined();
    expect(migrated.features[0].licenceDecision).toBeUndefined();
    expect(migrated.features[0].sourceRecords[0].licenceDecision).toBeUndefined();
  });
});
