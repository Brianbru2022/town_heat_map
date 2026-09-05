// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { alloaPackage } from '../src/data/alloa';
import type { HeritageFeature, ProjectPackage } from '../src/domain/models';
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

  it('delivers only effectively publishable records and reports retained review counts', async () => {
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
        publicationSummary: expect.objectContaining({
          totalRecords: 3,
          publishable: 1,
          provisional: 1,
          requiresReview: 1,
        }),
      }),
    ]);
    expect(packageResponse.json<ProjectPackage>().features.map((feature) => feature.id)).toEqual([
      'public-record',
    ]);
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
});
