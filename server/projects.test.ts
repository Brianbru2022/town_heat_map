// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { alloaPackage } from '../src/data/alloa';
import type { HeritageFeature, ProjectPackage } from '../src/domain/models';
import type { PublicProjectPackage } from '../src/domain/publicDto';
import { publicProjectPackage } from '../src/domain/publication';
import { buildApp } from './app';
import type { ProjectRepository } from './repository';

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('project delivery', () => {
  it('returns a lightweight, cacheable project catalogue', async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject('/api/projects');
    const projects = response.json<Array<Record<string, unknown>>>();

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toContain('max-age=300');
    expect(projects.length).toBeGreaterThan(0);
    expect(projects[0]).toMatchObject({
      id: expect.any(String),
      locality: expect.any(String),
      featureCount: expect.any(Number),
    });
    expect(projects[0]).not.toHaveProperty('boundary');
    expect(projects[0]).not.toHaveProperty('methodology');
  });

  it('compresses large town packages and makes them briefly cacheable', async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/alloa-scotland',
      headers: { 'accept-encoding': 'gzip' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-encoding']).toBe('gzip');
    expect(response.headers['cache-control']).toContain('max-age=300');
  });

  it('delivers only effectively publishable records without exposing retained review counts', async () => {
    const base = alloaPackage.features.find(
      (feature) => feature.id === 'hes-listed-building:LB20953',
    )!;
    const record = (id: string, overrides: Partial<HeritageFeature> = {}): HeritageFeature => ({
      ...base,
      id,
      name: id,
      reviewed: true,
      publication: undefined,
      ...overrides,
    });
    const pkg: ProjectPackage = {
      ...alloaPackage,
      publication: { state: 'publishable' },
      features: [
        record('public-record'),
        record('provisional-record', { reviewed: false }),
        record('blocked-record', { geometry: null, locationType: 'geometry_to_digitise' }),
      ],
      validation: [],
    };
    const repository: ProjectRepository = {
      list: async () => [pkg.project],
      get: async (id) => (id === pkg.project.id ? pkg : undefined),
    };
    const app = await buildApp({ repository });
    apps.push(app);

    const catalogue = await app.inject('/api/projects');
    const packageResponse = await app.inject(`/api/projects/${pkg.project.id}`);
    const featuresResponse = await app.inject(`/api/projects/${pkg.project.id}/features`);

    expect(catalogue.json()).toEqual([
      expect.objectContaining({
        id: pkg.project.id,
        featureCount: 1,
      }),
    ]);
    expect(catalogue.body).not.toContain('publicationSummary');
    expect(
      packageResponse.json<PublicProjectPackage>().features.map((feature) => feature.id),
    ).toEqual(['public-record']);
    expect(
      featuresResponse
        .json<{ features: Array<{ properties: HeritageFeature }> }>()
        .features.map((feature) => feature.properties.id),
    ).toEqual(['public-record']);
  });

  it('does not list a legacy package without an explicit publication declaration', async () => {
    const pkg: ProjectPackage = { ...alloaPackage, publication: undefined };
    const repository: ProjectRepository = {
      list: async () => [pkg.project],
      get: async () => pkg,
    };
    const app = await buildApp({ repository });
    apps.push(app);

    expect((await app.inject('/api/projects')).json()).toEqual([]);
    expect((await app.inject(`/api/projects/${pkg.project.id}`)).statusCode).toBe(404);
  });

  it('does not expose a schema-invalid package returned by a repository', async () => {
    const pkg = structuredClone(alloaPackage);
    (pkg.publication as unknown as { state: string }).state = 'unexpected-state';
    const repository: ProjectRepository = {
      list: async () => [pkg.project],
      get: async () => pkg,
    };
    const app = await buildApp({ repository });
    apps.push(app);

    expect((await app.inject('/api/projects')).json()).toEqual([]);
    expect((await app.inject(`/api/projects/${pkg.project.id}`)).statusCode).toBe(404);
  });

  it('enforces the explicit visitor DTO allowlist across package and GeoJSON responses', async () => {
    const pkg = structuredClone(alloaPackage);
    const target = pkg.features.find(
      (candidate) => candidate.id === 'hes-listed-building:LB20953',
    )!;
    pkg.project.researchNotes = 'C:\\Users\\curator\\private-research.md';
    target.reviewNotes = 'Internal reviewer identity and decision.';
    target.createdAt = '2026-09-05T09:00:00.000Z';
    target.documentedDateText =
      'Open daily; dogs welcome; wheelchair access; toilets; family tickets cost £5.';
    target.sourceRecords[0].notes =
      'Public claim details: description=Recommended, dogs welcome, wheelchair access, toilets, £5 admission, open daily and booking required; operator=Example Council, dogs welcome; contact:website=javascript:alert(1).';
    target.sourceRecords[0].quotedDateText = 'Unsupported nested source narrative.';
    target.sourceRecords[0].sourceUrl = 'file:///private-source.html';
    // This fixture models a newly reviewed source snapshot; the assertion below
    // remains about public URL filtering rather than stale licence evidence.
    if (target.sourceRecords[0].licenceDecision?.evidenceSnapshot)
      target.sourceRecords[0].licenceDecision.evidenceSnapshot.sourceUrl =
        target.sourceRecords[0].sourceUrl;
    (target.geometry as unknown as Record<string, unknown>).privateGeometry =
      'ROUTE_GEOMETRY_SENTINEL';
    target.additionalPointLocations = [
      {
        type: 'Point',
        coordinates: [-3.79, 56.11],
        privatePoint: 'ROUTE_POINT_SENTINEL',
      } as never,
    ];
    pkg.project.boundary.properties = {
      ...pkg.project.boundary.properties,
      reviewNotes: 'Internal boundary decision.',
    };
    (pkg.project.boundary.geometry as unknown as Record<string, unknown>).privateBoundary =
      'ROUTE_BOUNDARY_SENTINEL';
    if (pkg.settlementPolygons[0])
      (pkg.settlementPolygons[0].geometry as unknown as Record<string, unknown>).privateSettlement =
        'ROUTE_SETTLEMENT_SENTINEL';
    pkg.sources[0].coverage =
      'Opening hours, prices, toilets, dogs, wheelchair access and family recommendations.';
    pkg.sources[0].sourceUrl = 'file:///C:/Users/curator/private-catalogue.csv';
    const sourceRef =
      target.sourceRecords[0].sourceRecordId ??
      target.sourceRecords[0].sourceUrl ??
      target.sourceRecords[0].sourceName;
    target.publication = { state: 'publishable', profile: 'editorial' };
    target.claimEvidence = [
      {
        claim: 'editorial_recommendation',
        tier: 'editorial',
        sourceRecordRefs: [sourceRef],
        reviewedAt: '2026-09-05T09:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
        notes: 'Internal evidence mechanics.',
      },
      {
        claim: 'operator',
        tier: 'corroborated_facility',
        sourceRecordRefs: [sourceRef],
        reviewedAt: '2026-09-05T09:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
      {
        claim: 'current_operation',
        tier: 'operational',
        sourceRecordRefs: [sourceRef],
        reviewedAt: '2026-09-05T09:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    ];
    const repository: ProjectRepository = {
      list: async () => [pkg.project],
      get: async () => pkg,
    };
    const app = await buildApp({ repository });
    apps.push(app);

    const response = await app.inject(`/api/projects/${pkg.project.id}`);
    const geoJson = await app.inject(`/api/projects/${pkg.project.id}/features`);
    const csv = await app.inject(`/api/projects/${pkg.project.id}/exports/listed-buildings.csv`);
    const body = response.json<PublicProjectPackage>();
    const publicText = response.body;

    expect(response.statusCode).toBe(200);
    expect(Object.keys(body).sort()).toEqual(
      ['features', 'historicMaps', 'licensingMetadata', 'project', 'settlementPolygons', 'sources']
        .filter((key) => key in body)
        .sort(),
    );
    expect(Object.keys(body.project).sort()).toEqual(
      [
        'boundary',
        'centre',
        'country',
        'countryCode',
        'id',
        'locality',
        'methodology',
        'name',
        'region',
        'timelineEnd',
        'timelineStart',
      ]
        .filter((key) => key in body.project)
        .sort(),
    );
    const feature = body.features[0]!;
    const allowedFeatureKeys = new Set([
      'id',
      'name',
      'alternativeNames',
      'featureType',
      'designationType',
      'designationCategory',
      'significance',
      'statutoryStatus',
      'geometry',
      'additionalPointLocations',
      'locationType',
      'earliestPossibleYear',
      'latestPossibleYear',
      'datePrecision',
      'dateBasis',
      'dateConfidence',
      'locationConfidence',
      'survival',
      'shortDescription',
      'narrative',
      'licence',
      'tags',
      'evidenceScope',
      'publication',
      'currentPlaceDetails',
      'currentPlaceClaims',
      'osmCheckedAt',
      'sourceRecords',
    ]);
    expect(Object.keys(feature).every((key) => allowedFeatureKeys.has(key))).toBe(true);
    expect(Object.keys(feature.sourceRecords[0]!).sort()).toEqual(
      ['accessedAt', 'licence', 'reliability', 'sourceName', 'sourceOrganisation', 'sourceUrl']
        .filter((key) => key in feature.sourceRecords[0]!)
        .sort(),
    );
    for (const forbidden of [
      'researchNotes',
      'reviewNotes',
      'claimEvidence',
      'sourceRecordRefs',
      'sourceRecordId',
      'createdAt',
      'updatedAt',
      'notes',
      'curationMetadata',
      'validation',
      'publicationSummary',
      'osmElement',
      'changesetId',
      'localPath',
      'quotedDateText',
      'documentedDateText',
      'coverage',
      'accessMethod',
      'privateGeometry',
      'privatePoint',
      'privateBoundary',
      'privateSettlement',
    ])
      for (const output of [publicText, geoJson.body, csv.body])
        expect(output).not.toContain(`"${forbidden}"`);
    for (const sentinel of [
      'ROUTE_GEOMETRY_SENTINEL',
      'ROUTE_POINT_SENTINEL',
      'ROUTE_BOUNDARY_SENTINEL',
      'ROUTE_SETTLEMENT_SENTINEL',
      'file:///',
      'dogs welcome',
      'family recommendations',
      'booking required',
      'javascript:',
    ])
      for (const output of [publicText, geoJson.body, csv.body])
        expect(output).not.toContain(sentinel);
    expect(body.project.boundary.properties).toEqual({});
    expect(geoJson.statusCode).toBe(200);
    expect(
      geoJson.json<{ features: Array<{ properties: unknown }> }>().features[0]?.properties,
    ).toEqual(feature);
    expect(geoJson.body).not.toContain('Internal evidence mechanics.');
    expect(csv.statusCode).toBe(200);
    expect(csv.body).toContain(target.id);
  });

  it('fails conditional feature licensing closed in JSON, GeoJSON and CSV projections', async () => {
    const pkg = structuredClone(alloaPackage);
    const publicId = pkg.features.find((candidate) =>
      publicProjectPackage(alloaPackage)?.features.some((feature) => feature.id === candidate.id),
    )!.id;
    const record = pkg.features.find((candidate) => candidate.id === publicId)!;
    record.licence = 'Open Government Licence v3.0; conditional on confirmation';
    pkg.features = [record];
    const repository: ProjectRepository = {
      list: async () => [pkg.project],
      get: async () => pkg,
    };
    const app = await buildApp({ repository });
    apps.push(app);

    const json = await app.inject(`/api/projects/${pkg.project.id}`);
    const geoJson = await app.inject(`/api/projects/${pkg.project.id}/features`);
    const csv = await app.inject(`/api/projects/${pkg.project.id}/exports/listed-buildings.csv`);

    expect(json.json<PublicProjectPackage>().features).toEqual([]);
    expect(geoJson.json<{ features: unknown[] }>().features).toEqual([]);
    expect(csv.statusCode).toBe(200);
    expect(csv.body).not.toContain(publicId);
  });

  it('fails malformed feature geometry closed without a generic server error', async () => {
    const pkg = structuredClone(alloaPackage);
    const record = pkg.features.find(
      (candidate) => candidate.id === 'hes-listed-building:LB20953',
    )!;
    record.geometry = { type: 'Point', coordinates: [-3.79] } as never;
    pkg.features = [record];
    const repository: ProjectRepository = {
      list: async () => [pkg.project],
      get: async () => pkg,
    };
    const app = await buildApp({ repository });
    apps.push(app);

    const json = await app.inject(`/api/projects/${pkg.project.id}`);
    const geoJson = await app.inject(`/api/projects/${pkg.project.id}/features`);
    const csv = await app.inject(`/api/projects/${pkg.project.id}/exports/listed-buildings.csv`);

    expect(json.statusCode).not.toBe(500);
    expect(geoJson.statusCode).not.toBe(500);
    expect(csv.statusCode).not.toBe(500);
    if (json.statusCode === 200) expect(json.json<PublicProjectPackage>().features).toEqual([]);
  });

  it.each([
    'year=not-a-year',
    'year=1900.5',
    'year=1900&year=2000',
    'includePossible=yes',
    'includePossible=true&includePossible=false',
  ])('returns a controlled 400 for malformed or repeated timeline filters: %s', async (query) => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject(`/api/projects/alloa-scotland/features?${query}`);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: 'Year must be one integer and includePossible must be true or false.',
    });
  });

  it('does not publish the curator-only undated heritage-review export', async () => {
    const app = await buildApp();
    apps.push(app);

    expect(
      (await app.inject('/api/projects/alloa-scotland/exports/undated-heritage-review.csv'))
        .statusCode,
    ).toBe(404);
  });
});
