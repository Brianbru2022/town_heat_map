import { describe, expect, it } from 'vitest';
import { alloaPackage } from '../data/alloa';
import type {
  HeritageFeature,
  HistoricMapLayer,
  LicenceDecision,
  LicenceDecisionState,
  ProjectPackage,
  PublicationState,
} from './models';
import {
  assessFeaturePublication,
  assessProjectPackage,
  publicProjectPackage,
  publishedLocalMapPackageIds,
} from './publication';

const sourceFeature = alloaPackage.features.find(
  (feature) => feature.id === 'hes-listed-building:LB20953',
)!;

function licenceDecision(
  evidenceText?: string,
  state: LicenceDecisionState = 'approved',
): LicenceDecision {
  return {
    state,
    scope: 'public_metadata',
    reviewedAt: '2026-09-05T00:00:00.000Z',
    ...(evidenceText ? { evidenceText } : {}),
  };
}

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
  decisionState: LicenceDecisionState = 'approved',
): HistoricMapLayer {
  return {
    id,
    projectId: alloaPackage.project.id,
    title: id,
    displayDate: '1900',
    sourceInstitution: 'Historic Environment Scotland',
    licence,
    licenceDecision: licenceDecision(licence, decisionState),
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
      licenceDecision: licenceDecision(
        'Not stated in service metadata; redistribution must be reviewed.',
        'unresolved',
      ),
    });
    const assessment = assessFeaturePublication(projectPackage([record]), record);

    expect(assessment.canPublish).toBe(false);
    expect(assessment.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'licence.unresolved' })]),
    );
  });

  it.each([
    ['empty', ''],
    ['conditional', 'Open Government Licence v3.0; conditional on confirmation'],
    ['pending', 'Reuse pending provider confirmation'],
    ['denied', 'Permission not granted'],
    ['ambiguous', 'Collection-specific'],
  ])('fails %s feature licensing closed', (_label, licence) => {
    const record = feature({ licence });

    expect(assessFeaturePublication(projectPackage([record]), record).canPublish).toBe(false);
  });

  it('publishes unfamiliar affirmative text only through a matching explicit decision', () => {
    const licence = 'Provider authorises this metadata snapshot for public reuse.';
    const undecided = feature({ licence, licenceDecision: undefined });
    const approved = feature({ licence, licenceDecision: licenceDecision(licence) });

    expect(assessFeaturePublication(projectPackage([undecided]), undecided).canPublish).toBe(false);
    expect(assessFeaturePublication(projectPackage([approved]), approved).canPublish).toBe(true);
  });

  it('invalidates an approval when its recorded evidence text changes', () => {
    const record = feature({
      licence: `${sourceFeature.licence}; pending a new condition`,
      licenceDecision: sourceFeature.licenceDecision,
    });
    const assessment = assessFeaturePublication(projectPackage([record]), record);

    expect(assessment.canPublish).toBe(false);
    expect(assessment.blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'licence.decision_stale' })]),
    );
  });

  it('resolves delegated feature licensing only when every retained source licence is resolved', () => {
    const resolved = feature({
      licence: 'See individual source records.',
      licenceDecision: {
        ...licenceDecision('See individual source records.', 'inherited'),
        inheritedFrom: 'source_records',
      },
      sourceRecords: [
        {
          ...sourceFeature.sourceRecords[0],
          licence: 'Open Database Licence (ODbL) v1.0',
          licenceDecision: licenceDecision('Open Database Licence (ODbL) v1.0'),
        },
      ],
    });
    const unresolved = feature({
      id: 'publication:delegated-unresolved',
      licence: 'See individual source records.',
      licenceDecision: {
        ...licenceDecision('See individual source records.', 'inherited'),
        inheritedFrom: 'source_records',
      },
      sourceRecords: [
        {
          ...sourceFeature.sourceRecords[0],
          licence: 'Awaiting confirmation',
          licenceDecision: licenceDecision('Awaiting confirmation', 'unresolved'),
        },
      ],
    });

    expect(assessFeaturePublication(projectPackage([resolved]), resolved).canPublish).toBe(true);
    expect(assessFeaturePublication(projectPackage([unresolved]), unresolved).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'licence.delegated_unresolved' }),
        expect.objectContaining({ code: 'licence.source_not_approved' }),
      ]),
    );
  });

  it('blocks a feature whose source-record licence is missing or unresolved', () => {
    const missing = feature({
      sourceRecords: [
        { ...sourceFeature.sourceRecords[0], licence: undefined, licenceDecision: undefined },
      ],
    });
    const unresolved = feature({
      id: 'publication:source-unresolved',
      sourceRecords: [
        {
          ...sourceFeature.sourceRecords[0],
          licence: 'Open licence pending confirmation',
          licenceDecision: licenceDecision('Open licence pending confirmation', 'unresolved'),
        },
      ],
    });

    expect(assessFeaturePublication(projectPackage([missing]), missing).blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'licence.source_decision_missing' }),
      ]),
    );
    expect(assessFeaturePublication(projectPackage([unresolved]), unresolved).blockers).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'licence.source_not_approved' })]),
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
      documentedDateText: 'Open daily; dogs welcome; wheelchair access; toilets; £5 family price.',
      reviewNotes: 'Internal feature research.',
      publication: { state: 'publishable', notes: 'Internal publication decision.' },
      sourceRecords: [
        {
          ...sourceFeature.sourceRecords[0],
          quotedDateText: 'Unsupported nested narrative.',
          notes: 'Internal source analysis.',
          sourceUrl: 'file:///C:/Users/curator/private-source.html',
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
    (record.geometry as unknown as Record<string, unknown>).privateGeometry =
      'NESTED_GEOMETRY_SENTINEL';
    record.additionalPointLocations = [
      {
        type: 'Point',
        coordinates: [-3.79, 56.11],
        privatePoint: 'NESTED_POINT_SENTINEL',
      } as never,
    ];
    const source = {
      ...projectPackage([record]),
      project: {
        ...alloaPackage.project,
        researchNotes: 'Internal project research.',
        boundary: {
          ...alloaPackage.project.boundary,
          properties: {
            ...alloaPackage.project.boundary.properties,
            reviewNotes: 'Internal boundary review.',
          },
          geometry: {
            ...alloaPackage.project.boundary.geometry,
            privateBoundary: 'NESTED_BOUNDARY_SENTINEL',
          },
        },
        methodology: {
          ...alloaPackage.project.methodology,
          age: {
            ...alloaPackage.project.methodology.age,
            internalWeight: 99,
          },
        },
      },
      sources: alloaPackage.sources.map((entry, index) =>
        index === 0
          ? {
              ...entry,
              limitations: 'Internal limitations analysis.',
              coverage: 'Dogs, toilets, opening hours, prices and family recommendation.',
              sourceUrl: 'file:///C:/Users/curator/private-catalogue.csv',
            }
          : entry,
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
      'quotedDateText',
      'reviewNotes',
      'internalWeight',
      'documentedDateText',
      'privateGeometry',
      'privatePoint',
      'privateBoundary',
    ])
      expect(publicText).not.toContain(`"${field}"`);
    expect(publicText).not.toContain('file:///');
    expect(publicText).not.toContain('dogs welcome');
    expect(publicText).not.toContain('family recommendation');
    expect(delivered.project.boundary.properties).toEqual({});
  });

  it('omits unresolved source definitions, maps, polygons and licence components', () => {
    const record = feature();
    const resolvedPolygon = structuredClone(alloaPackage.settlementPolygons[0]);
    if (!resolvedPolygon) throw new Error('Expected a settlement polygon fixture.');
    resolvedPolygon.id = 'resolved-polygon';
    resolvedPolygon.publication = { state: 'publishable' };
    resolvedPolygon.licenceDecision = {
      ...licenceDecision(undefined, 'inherited'),
      inheritedFrom: 'source_records',
    };
    resolvedPolygon.sourceRecords = [
      {
        ...sourceFeature.sourceRecords[0],
        licence: 'Creative Commons Attribution 4.0',
        licenceDecision: licenceDecision('Creative Commons Attribution 4.0'),
      },
    ];
    const unresolvedPolygon = structuredClone(resolvedPolygon);
    unresolvedPolygon.id = 'unresolved-polygon';
    unresolvedPolygon.sourceRecords[0].licence = 'Permission denied';
    unresolvedPolygon.sourceRecords[0].licenceDecision = licenceDecision(
      'Permission denied',
      'denied',
    );
    const pkg = {
      ...projectPackage([record]),
      sources: [
        {
          ...alloaPackage.sources[0],
          id: 'resolved-source',
          licence: 'CC0',
          licenceDecision: licenceDecision('CC0'),
        },
        {
          ...alloaPackage.sources[0],
          id: 'unresolved-source',
          licence: 'Pending review',
          licenceDecision: licenceDecision('Pending review', 'unresolved'),
        },
      ],
      historicMaps: [
        historicMap('resolved-map', 'publishable', 'Open Government Licence v3.0'),
        historicMap('denied-map', 'publishable', 'Permission not granted', 'denied'),
      ],
      settlementPolygons: [resolvedPolygon, unresolvedPolygon],
      licensingMetadata: {
        components: [
          {
            id: 'resolved-component',
            name: 'Resolved component',
            source: 'Example',
            licence: 'CC BY 4.0',
            attribution: 'Example',
            scope: 'Example data',
            licenceDecision: licenceDecision('CC BY 4.0'),
          },
          {
            id: 'unresolved-component',
            name: 'Unresolved component',
            source: 'Example',
            licence: 'Confirmation required',
            attribution: 'Example',
            scope: 'Example data',
            licenceDecision: licenceDecision('Confirmation required', 'unresolved'),
          },
        ],
      },
    };
    const delivered = publicProjectPackage(pkg)!;

    expect(delivered.sources.map((source) => source.id)).toEqual(['resolved-source']);
    expect(delivered.historicMaps.map((map) => map.id)).toEqual(['resolved-map']);
    expect(delivered.settlementPolygons.map((polygon) => polygon.id)).toEqual(['resolved-polygon']);
    expect(delivered.licensingMetadata?.components.map((component) => component.id)).toEqual(
      expect.arrayContaining(['resolved-component']),
    );
    expect(delivered.licensingMetadata?.components.map((component) => component.id)).not.toContain(
      'unresolved-component',
    );
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
          'unresolved',
        ),
        historicMap(
          'conditional-rights',
          'publishable',
          'Public display remains conditional on confirmation from the provider.',
          'restricted',
        ),
        historicMap(
          'placeholder-rights',
          'publishable',
          'Licence placeholder — TBC.',
          'unresolved',
        ),
        historicMap('empty-rights', 'publishable', '', 'unresolved'),
      ],
    };

    expect(publicProjectPackage(pkg)?.historicMaps.map((map) => map.id)).toEqual(['resolved-ogl']);
    expect(publicProjectPackage(alloaPackage)?.historicMaps.map((map) => map.id)).not.toContain(
      'hes-listed-buildings-by-category',
    );
  });
});
