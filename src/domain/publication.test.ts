import { describe, expect, it } from 'vitest';
import { alloaPackage } from '../data/alloa';
import type { HeritageFeature, HistoricMapLayer, ProjectPackage, PublicationState } from './models';
import {
  assessFeaturePublication,
  assessProjectPackage,
  publicProjectPackage,
  publishedLocalMapPackageIds,
} from './publication';

const sourceFeature = alloaPackage.features.find(
  (feature) => feature.id === 'hes-listed-building:LB20953',
)!;

function feature(overrides: Partial<HeritageFeature> = {}): HeritageFeature {
  return {
    ...sourceFeature,
    id: 'publication:test',
    name: 'Publication test record',
    reviewed: true,
    publication: undefined,
    ...overrides,
  };
}

function projectPackage(features: HeritageFeature[], publishable = true): ProjectPackage {
  return {
    ...alloaPackage,
    publication: publishable ? { state: 'publishable' } : undefined,
    features,
    validation: [],
  };
}

function historicMap(
  id: string,
  state: PublicationState,
  licence: string | undefined = 'Open Government Licence v3.0',
): HistoricMapLayer {
  return {
    id,
    projectId: alloaPackage.project.id,
    title: id,
    displayDate: '1900',
    sourceInstitution: 'Historic Environment Scotland',
    licence,
    attribution:
      'Contains Historic Environment Scotland and OS data © Historic Environment Scotland and Crown Copyright and database right 2026, licensed under the Open Government Licence v3.0.',
    layerType: 'georeferenced_raster_tiles',
    tileUrl: `/api/local-historic-maps/${id}/{z}/{x}/{y}.png`,
    opacity: 0.8,
    publication: { state },
  };
}

describe('publication assessment', () => {
  it('publishes a verified record with adequate provenance, licence and geometry', () => {
    const record = feature();
    const assessment = assessFeaturePublication(projectPackage([record]), record);

    expect(assessment).toMatchObject({
      declaredState: 'verified',
      effectiveState: 'publishable',
      canPublish: true,
      usedLegacyDefault: true,
      blockers: [],
    });
  });

  it('blocks missing or insufficient provenance', () => {
    const missing = feature({ sourceRecords: [] });
    const incomplete = feature({
      id: 'publication:incomplete-source',
      sourceRecords: [{ ...sourceFeature.sourceRecords[0], sourceOrganisation: '' }],
    });
    const pkg = projectPackage([missing, incomplete]);

    expect(assessFeaturePublication(pkg, missing).blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'provenance.missing' })]),
    );
    expect(assessFeaturePublication(pkg, incomplete)).toMatchObject({
      effectiveState: 'requires_review',
      canPublish: false,
    });
  });

  it('blocks unresolved licence terms', () => {
    const record = feature({
      licence: 'Not stated in service metadata; redistribution must be reviewed.',
    });
    const assessment = assessFeaturePublication(projectPackage([record]), record);

    expect(assessment.canPublish).toBe(false);
    expect(assessment.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'licence.unresolved' })]),
    );
  });

  it('blocks material missing geometry even when it is an intentional validation warning', () => {
    const record = feature({ geometry: null, locationType: 'geometry_to_digitise' });
    const assessment = assessFeaturePublication(projectPackage([record]), record);

    expect(assessment).toMatchObject({ effectiveState: 'requires_review', canPublish: false });
    expect(assessment.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'geometry.pending',
          severity: 'warning',
          publicationImpact: 'blocker',
        }),
      ]),
    );
  });

  it('keeps advisory duplicate warnings visible without blocking publication', () => {
    const original = feature({ id: 'publication:original' });
    const duplicate = feature({ id: 'publication:duplicate' });
    const pkg = projectPackage([original, duplicate]);
    const assessment = assessFeaturePublication(pkg, duplicate);

    expect(assessment.canPublish).toBe(true);
    expect(assessment.advisories).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'record.possible_duplicate' })]),
    );
  });

  it('uses safe backwards-compatible defaults for legacy records and packages', () => {
    const reviewed = feature({ id: 'publication:reviewed', reviewed: true });
    const unreviewed = feature({ id: 'publication:unreviewed', reviewed: false });
    const approvedPackage = projectPackage([reviewed, unreviewed]);
    const legacyPackage = projectPackage([reviewed], false);

    expect(assessFeaturePublication(approvedPackage, reviewed).effectiveState).toBe('publishable');
    expect(assessFeaturePublication(approvedPackage, unreviewed).effectiveState).toBe(
      'provisional',
    );
    expect(assessFeaturePublication(legacyPackage, reviewed)).toMatchObject({
      declaredState: 'verified',
      effectiveState: 'provisional',
      canPublish: false,
    });
    expect(assessProjectPackage(legacyPackage).canPublishPackage).toBe(false);
  });

  it('honours explicit withholding without discarding retained source data', () => {
    const published = feature({ id: 'publication:published' });
    const withheld = feature({
      id: 'publication:withheld',
      publication: { state: 'withheld', notes: 'Awaiting rights review.' },
    });
    const outOfScope = feature({
      id: 'publication:out-of-scope',
      evidenceScope: 'out_of_scope',
    });
    const source = projectPackage([published, withheld, outOfScope]);
    const delivered = publicProjectPackage(source);

    expect(source.features).toHaveLength(3);
    expect(delivered?.features.map((record) => record.id)).toEqual(['publication:published']);
    expect(JSON.stringify(delivered)).not.toContain('publicationSummary');
  });

  it('projects internal narrative out of the public package without changing source data', () => {
    const record = feature({
      reviewNotes: 'Internal feature research.',
      publication: { state: 'publishable', notes: 'Internal publication decision.' },
      sourceRecords: [
        {
          ...sourceFeature.sourceRecords[0],
          notes: 'Internal source analysis.',
        },
      ],
      claimEvidence: [
        {
          claim: 'mapped_identity',
          tier: 'mapped_context',
          sourceRecordRefs: [sourceFeature.sourceRecords[0].sourceName],
          reviewedAt: '2026-09-04T00:00:00.000Z',
          notes: 'Internal claim analysis.',
        },
      ],
    });
    const source = {
      ...projectPackage([record]),
      project: {
        ...alloaPackage.project,
        researchNotes: 'Internal project research.',
      },
      sources: alloaPackage.sources.map((entry, index) =>
        index === 0 ? { ...entry, limitations: 'Internal limitations analysis.' } : entry,
      ),
      curationMetadata: {
        importedPacks: [
          {
            datasetId: 'internal-pack',
            title: 'Internal pack',
            importedAt: '2026-09-04T00:00:00.000Z',
          },
        ],
      },
      publication: { state: 'publishable' as const, notes: 'Internal package decision.' },
    };
    const delivered = publicProjectPackage(source)!;

    expect(source.project.researchNotes).toBe('Internal project research.');
    expect(source.features[0].sourceRecords[0].notes).toBe('Internal source analysis.');
    const publicText = JSON.stringify(delivered);
    for (const field of [
      'researchNotes',
      'curationMetadata',
      'publicationSummary',
      'reviewNotes',
      'claimEvidence',
      'sourceRecordRefs',
      'limitations',
      'notes',
    ])
      expect(publicText).not.toContain(`"${field}"`);
  });

  it('exposes direct local tiles only for map layers that pass publication projection', () => {
    const pkg = {
      ...projectPackage([feature()]),
      historicMaps: [
        historicMap('public-map', 'verified'),
        historicMap('draft-map', 'provisional'),
      ],
    };

    expect(publishedLocalMapPackageIds([pkg])).toEqual(new Set(['public-map']));
  });

  it('publishes resolved HES/OGL layers and fails unresolved licensing closed', () => {
    const pkg = {
      ...projectPackage([feature()]),
      historicMaps: [
        historicMap('resolved-ogl', 'publishable'),
        historicMap(
          'confirmation-required',
          'publishable',
          'Live service; confirm current reproduction terms before export or redistribution.',
        ),
        historicMap(
          'conditional-rights',
          'publishable',
          'Public display remains conditional on confirmation from the provider.',
        ),
        historicMap('placeholder-rights', 'publishable', 'Licence placeholder — TBC.'),
        historicMap('empty-rights', 'publishable', ''),
      ],
    };

    expect(publicProjectPackage(pkg)?.historicMaps.map((map) => map.id)).toEqual(['resolved-ogl']);
    expect(publicProjectPackage(alloaPackage)?.historicMaps.map((map) => map.id)).not.toContain(
      'hes-listed-buildings-by-category',
    );
  });
});
