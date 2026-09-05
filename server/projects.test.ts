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
    pkg.project.researchNotes = 'C:\\Users\\curator\\private-research.md';
    pkg.features[0].reviewNotes = 'Internal reviewer identity and decision.';
    pkg.features[0].createdAt = '2026-09-05T09:00:00.000Z';
    pkg.features[0].sourceRecords[0].notes = 'Internal workflow batch 42.';
    pkg.features[0].sourceRecords[0].quotedDateText = 'Unsupported nested source narrative.';
    pkg.project.boundary.properties = {
      ...pkg.project.boundary.properties,
      reviewNotes: 'Internal boundary decision.',
    };
    pkg.features[0].claimEvidence = [
      {
        claim: 'mapped_identity',
        tier: 'mapped_context',
        sourceRecordRefs: [pkg.features[0].sourceRecords[0].sourceName],
        reviewedAt: '2026-09-05T09:00:00.000Z',
        notes: 'Internal evidence mechanics.',
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
      'documentedDateText',
      'earliestPossibleYear',
      'latestPossibleYear',
      'datePrecision',
      'dateBasis',
      'dateConfidence',
      'locationConfidence',
      'survival',
      'shortDescription',
      'licence',
      'tags',
      'evidenceScope',
      'publication',
      'currentPlaceDetails',
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
    ])
      expect(publicText).not.toContain(`"${forbidden}"`);
    expect(body.project.boundary.properties).toEqual({});
    expect(geoJson.statusCode).toBe(200);
    expect(
      geoJson.json<{ features: Array<{ properties: unknown }> }>().features[0]?.properties,
    ).toEqual(feature);
    expect(geoJson.body).not.toContain('Internal evidence mechanics.');
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

  it('does not publish the curator-only undated heritage-review export', async () => {
    const app = await buildApp();
    apps.push(app);

    expect(
      (await app.inject('/api/projects/alloa-scotland/exports/undated-heritage-review.csv'))
        .statusCode,
    ).toBe(404);
  });
});
