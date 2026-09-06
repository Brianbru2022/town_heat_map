import cors from '@fastify/cors';
import compress from '@fastify/compress';
import rateLimit from '@fastify/rate-limit';
import Fastify, { LogController, type FastifyReply, type FastifyRequest } from 'fastify';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { publicProjectPackage, publishedLocalMapPackageIds } from '../src/domain/publication';
import { featureTimelineState } from '../src/domain/timeline';
import { sortPublishedProjects } from '../src/domain/projects';
import { csvRecordIds, publicListedBuildingsCsv } from './csv';
import { createProjectRepository, type ProjectRepository } from './repository';

const hesDesignationsExportUrl =
  'https://inspire.hes.scot/arcgis/rest/services/HES/HES_Designations/MapServer/export';
const localMapPackages = new Set([
  'nls-alloa-os-25-inch-1900',
  'nls-alloa-os-25-inch-1900-draft',
  'nls-alloa-os-25-inch-1900-mosaic-draft',
  'nls-alva-os-25-inch-1900-mosaic-draft',
  'nls-culross-os-25-inch-1896-mosaic-draft',
  'nls-kincardine-os-25-inch-1896-mosaic-draft',
  'nls-tillicoultry-os-25-inch-1900-mosaic-draft',
  'nls-alva-os-25-inch-1900',
  'nls-culross-os-25-inch-1896',
  'nls-kincardine-os-25-inch-1896',
]);
const localMapDatabases = new Map<string, DatabaseSync>();
const HES_CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400, stale-if-error=86400';

interface HesImageCacheEntry {
  body: Buffer;
  contentType: string;
  expiresAt: number;
  staleUntil: number;
}

interface SecuritySettings {
  corsOrigins: string[];
  trustedProxyCidrs: string[];
  requestTimeoutMs: number;
  cacheTtlMs: number;
  cacheStaleTtlMs: number;
  cacheMaxEntries: number;
  rateLimitMax: number;
  proxyRateLimitMax: number;
  rateLimitWindowMs: number;
}

export interface BuildAppOptions {
  repository?: ProjectRepository;
  fetchImplementation?: typeof fetch;
  now?: () => number;
  settings?: Partial<SecuritySettings>;
}

function positiveInteger(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}

function parseCorsOrigins(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value.split(',').map((candidate) => {
    const origin = candidate.trim();
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin)
      throw new Error('CORS_ORIGINS must contain comma-separated HTTP(S) origins without paths.');
    return origin;
  });
}

function parseTrustedProxyCidrs(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value.split(',').map((candidate) => {
    const cidr = candidate.trim();
    if (
      !['loopback', 'linklocal', 'uniquelocal'].includes(cidr) &&
      !/^[0-9a-fA-F:.]+(?:\/\d{1,3})?$/.test(cidr)
    )
      throw new Error(
        'TRUST_PROXY_CIDRS must contain comma-separated IP ranges or proxy-addr aliases.',
      );
    return cidr;
  });
}

function defaultSecuritySettings(): SecuritySettings {
  const configuredOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);
  return {
    // The production deployment is same-origin via nginx. Cross-origin access is opt-in.
    corsOrigins:
      configuredOrigins.length > 0 || process.env.NODE_ENV === 'production'
        ? configuredOrigins
        : ['http://localhost:5173', 'http://127.0.0.1:5173'],
    // Direct listeners do not trust forwarded headers. Production Compose supplies
    // the private reverse-proxy range explicitly because the API has no host port.
    trustedProxyCidrs: parseTrustedProxyCidrs(process.env.TRUST_PROXY_CIDRS),
    requestTimeoutMs: positiveInteger(process.env.HES_REQUEST_TIMEOUT_MS, 10_000, 30_000),
    cacheTtlMs: positiveInteger(process.env.HES_CACHE_TTL_MS, 3_600_000, 86_400_000),
    cacheStaleTtlMs: positiveInteger(process.env.HES_CACHE_STALE_TTL_MS, 86_400_000, 604_800_000),
    cacheMaxEntries: positiveInteger(process.env.HES_CACHE_MAX_ENTRIES, 256, 2_048),
    rateLimitMax: positiveInteger(process.env.API_RATE_LIMIT_MAX, 120, 10_000),
    proxyRateLimitMax: positiveInteger(process.env.HES_RATE_LIMIT_MAX, 30, 1_000),
    rateLimitWindowMs: positiveInteger(process.env.API_RATE_LIMIT_WINDOW_MS, 60_000, 3_600_000),
  };
}

function localMapDatabase(packageId: string): DatabaseSync | undefined {
  if (!localMapPackages.has(packageId)) return undefined;
  const existing = localMapDatabases.get(packageId);
  if (existing) return existing;
  const filename = resolve('data/runtime/tiles', `${packageId}.mbtiles`);
  if (!existsSync(filename)) return undefined;
  const database = new DatabaseSync(filename, { readOnly: true });
  localMapDatabases.set(packageId, database);
  return database;
}

function isWebMercatorBbox(value: string): boolean {
  if (value.length > 128) return false;
  const parts = value.split(',').map(Number);
  return (
    parts.length === 4 &&
    parts.every(Number.isFinite) &&
    parts.every((coordinate) => Math.abs(coordinate) <= 20037509) &&
    parts[0] < parts[2] &&
    parts[1] < parts[3]
  );
}

function singleQueryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function tileBbox(z: number, x: number, y: number): string | undefined {
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 22)
    return undefined;
  const tiles = 2 ** z;
  if (x < 0 || y < 0 || x >= tiles || y >= tiles) return undefined;
  const edge = 20_037_508.342789244;
  const size = (edge * 2) / tiles;
  return `${-edge + x * size},${edge - (y + 1) * size},${-edge + (x + 1) * size},${edge - y * size}`;
}

function sendHesImage(reply: FastifyReply, image: HesImageCacheEntry) {
  reply.header('Content-Type', image.contentType);
  reply.header('Cache-Control', HES_CACHE_CONTROL);
  return reply.send(image.body);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

export async function buildApp(options: BuildAppOptions = {}) {
  const settings = { ...defaultSecuritySettings(), ...options.settings };
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
        censor: '[REDACTED]',
      },
    },
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: settings.trustedProxyCidrs.length > 0 ? settings.trustedProxyCidrs : false,
    bodyLimit: 1_048_576,
  });
  const repository = options.repository ?? (await createProjectRepository());
  const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const hesImageCache = new Map<string, HesImageCacheEntry>();
  const allowedOrigins = new Set(settings.corsOrigins);
  let localMapPublicationCache: { expiresAt: number; packageIds: ReadonlySet<string> } | undefined;

  async function publicLocalMapPackages(): Promise<ReadonlySet<string>> {
    const requestedAt = now();
    if (localMapPublicationCache && localMapPublicationCache.expiresAt > requestedAt)
      return localMapPublicationCache.packageIds;
    const projects = await repository.list();
    const packages = await Promise.all(projects.map((project) => repository.get(project.id)));
    const packageIds = publishedLocalMapPackageIds(
      packages.filter((pkg): pkg is NonNullable<typeof pkg> => Boolean(pkg)),
    );
    localMapPublicationCache = { expiresAt: requestedAt + 300_000, packageIds };
    return packageIds;
  }

  await app.register(cors, {
    credentials: false,
    maxAge: 86_400,
    methods: ['GET'],
    origin: (origin, callback) => callback(null, Boolean(origin && allowedOrigins.has(origin))),
  });
  await app.register(compress, { global: true, threshold: 1_024 });
  await app.register(rateLimit, {
    global: true,
    max: settings.rateLimitMax,
    timeWindow: settings.rateLimitWindowMs,
    errorResponseBuilder: () => ({
      statusCode: 429,
      message: 'Too many requests. Please try again shortly.',
    }),
  });
  app.addHook('onSend', async (_request, reply, payload) => {
    // The nginx policy protects the browser shell. Keep direct API responses safe too.
    reply
      .header(
        'Content-Security-Policy',
        "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      )
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'strict-origin-when-cross-origin')
      .header('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()')
      .header('X-Frame-Options', 'DENY');
    return payload;
  });
  app.addHook('onResponse', (request, reply, done) => {
    request.log.info(
      { route: request.routeOptions.url, statusCode: reply.statusCode },
      'API request completed',
    );
    done();
  });

  async function hesDesignationImage(bbox: string, request: FastifyRequest, reply: FastifyReply) {
    const upstream = new URL(hesDesignationsExportUrl);
    upstream.search = new URLSearchParams({
      bbox,
      bboxSR: '3857',
      imageSR: '3857',
      size: '256,256',
      format: 'png32',
      transparent: 'true',
      layers: 'show:0,2,5,7',
      f: 'image',
    }).toString();
    const cacheKey = upstream.toString();
    const cached = hesImageCache.get(cacheKey);
    const requestedAt = now();
    if (cached && cached.expiresAt > requestedAt) return sendHesImage(reply, cached);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), settings.requestTimeoutMs);
    try {
      const response = await fetchImplementation(upstream, {
        headers: { Accept: 'image/png' },
        signal: controller.signal,
      });
      if (!response.ok) {
        request.log.warn({ statusCode: response.status }, 'HES map service returned an error');
        if (cached && cached.staleUntil > requestedAt) return sendHesImage(reply, cached);
        return reply
          .code(502)
          .send({ message: 'Historic Environment Scotland map service is unavailable.' });
      }
      const contentType = response.headers.get('content-type') ?? 'image/png';
      if (!contentType.startsWith('image/')) {
        request.log.warn({ contentType }, 'HES map service returned a non-image response');
        if (cached && cached.staleUntil > requestedAt) return sendHesImage(reply, cached);
        return reply
          .code(502)
          .send({ message: 'Historic Environment Scotland map service is unavailable.' });
      }
      const image = {
        body: Buffer.from(await response.arrayBuffer()),
        contentType,
        expiresAt: requestedAt + settings.cacheTtlMs,
        staleUntil: requestedAt + settings.cacheTtlMs + settings.cacheStaleTtlMs,
      };
      if (hesImageCache.size >= settings.cacheMaxEntries) {
        const oldestKey = hesImageCache.keys().next().value;
        if (oldestKey) hesImageCache.delete(oldestKey);
      }
      hesImageCache.set(cacheKey, image);
      return sendHesImage(reply, image);
    } catch (error) {
      if (cached && cached.staleUntil > requestedAt) return sendHesImage(reply, cached);
      if (isAbortError(error))
        return reply
          .code(504)
          .send({ message: 'Historic Environment Scotland map service timed out.' });
      request.log.error(
        { errorName: error instanceof Error ? error.name : 'unknown' },
        'HES map service request failed',
      );
      return reply
        .code(502)
        .send({ message: 'Historic Environment Scotland map service is unavailable.' });
    } finally {
      clearTimeout(timeout);
    }
  }

  app.setErrorHandler((error, request, reply) => {
    request.log.error(
      {
        errorName: error instanceof Error ? error.name : 'unknown',
        statusCode:
          typeof error === 'object' && error !== null && 'statusCode' in error
            ? error.statusCode
            : undefined,
      },
      'Unhandled API request error',
    );
    if (reply.sent) return reply;
    const requestedStatusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : undefined;
    const statusCode =
      requestedStatusCode && requestedStatusCode >= 400 && requestedStatusCode < 500
        ? requestedStatusCode
        : reply.statusCode >= 400 && reply.statusCode < 500
          ? reply.statusCode
          : 500;
    const message =
      statusCode === 429
        ? 'Too many requests. Please try again shortly.'
        : 'Request could not be processed.';
    return reply.code(statusCode).send({ message });
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ message: 'Not found.' }));

  app.get('/health', async () => ({ status: 'ok' }));
  app.get(
    '/api/hes-designations',
    {
      config: {
        rateLimit: { max: settings.proxyRateLimitMax, timeWindow: settings.rateLimitWindowMs },
      },
    },
    async (request, reply) => {
      const rawBbox = (request.query as { bbox?: unknown }).bbox;
      const bbox = singleQueryString(rawBbox) ?? '';
      if (!isWebMercatorBbox(bbox))
        return reply.code(400).send({ message: 'A valid Web Mercator bbox is required.' });
      return hesDesignationImage(bbox, request, reply);
    },
  );
  app.get(
    '/api/hes-designations/:z/:x/:y.png',
    {
      config: {
        rateLimit: { max: settings.proxyRateLimitMax, timeWindow: settings.rateLimitWindowMs },
      },
    },
    async (request, reply) => {
      const { z, x, y } = request.params as { z: string; x: string; y: string };
      const bbox = tileBbox(Number(z), Number(x), Number(y));
      if (!bbox) return reply.code(400).send({ message: 'A valid Web Mercator tile is required.' });
      return hesDesignationImage(bbox, request, reply);
    },
  );
  app.get('/api/local-historic-maps/:packageId/:z/:x/:y.png', async (request, reply) => {
    const { packageId, z, x, y } = request.params as {
      packageId: string;
      z: string;
      x: string;
      y: string;
    };
    const zoom = Number(z);
    const column = Number(x);
    const row = Number(y);
    if (!Number.isInteger(zoom) || !Number.isInteger(column) || !Number.isInteger(row) || zoom < 0)
      return reply.code(400).send({ message: 'A valid tile coordinate is required.' });
    if (!(await publicLocalMapPackages()).has(packageId))
      return reply
        .code(404)
        .send({ message: 'The requested local historic map package is unavailable.' });
    const database = localMapDatabase(packageId);
    if (!database)
      return reply
        .code(404)
        .send({ message: 'The requested local historic map package is unavailable.' });
    const tmsRow = 2 ** zoom - row - 1;
    const tile = database
      .prepare(
        'SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ?',
      )
      .get(zoom, column, tmsRow) as { tile_data?: Uint8Array } | undefined;
    if (!tile?.tile_data) return reply.code(204).send();
    reply.header('Content-Type', 'image/png');
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.send(Buffer.from(tile.tile_data));
  });
  app.get('/api/projects', async (_request, reply) => {
    const projects = sortPublishedProjects(await repository.list());
    const packages = await Promise.all(projects.map((project) => repository.get(project.id)));
    const publicPackages = packages
      .map((projectPackage) => (projectPackage ? publicProjectPackage(projectPackage) : undefined))
      .filter((projectPackage): projectPackage is NonNullable<typeof projectPackage> =>
        Boolean(projectPackage),
      );
    reply.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    return publicPackages.map((projectPackage) => {
      const project = projectPackage.project;
      const { id, name, countryCode, country, region, locality, centre } = project;
      return {
        id,
        name,
        countryCode,
        country,
        region,
        locality,
        centre,
        featureCount: projectPackage.features.length,
      };
    });
  });
  app.get('/api/projects/:id/exports/listed-buildings.csv', async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const project = await repository.get(id);
    const publicProject = project ? publicProjectPackage(project) : undefined;
    if (!publicProject) return reply.code(404).send({ message: 'Published project not found.' });
    const filename = resolve('data/exports', `${id}-listed-buildings.csv`);
    if (!existsSync(filename))
      return reply
        .code(404)
        .send({ message: 'Listed-building export has not been generated yet.' });
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${id}-listed-buildings.csv"`);
    reply.header('Cache-Control', 'no-cache');
    const listedBuildingIds = csvRecordIds(await readFile(filename, 'utf8'), 'feature_id');
    const csv = publicListedBuildingsCsv(publicProject, listedBuildingIds);
    return reply.send(csv);
  });
  app.get('/api/projects/:id', async (request, reply) => {
    const project = await repository.get((request.params as { id: string }).id);
    const publicProject = project ? publicProjectPackage(project) : undefined;
    if (!publicProject) return reply.code(404).send({ message: 'Published project not found.' });
    reply.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
    return publicProject;
  });
  app.get('/api/projects/:id/features', async (request, reply) => {
    const project = await repository.get((request.params as { id: string }).id);
    const publicProject = project ? publicProjectPackage(project) : undefined;
    if (!publicProject) return reply.code(404).send({ message: 'Published project not found.' });
    const { year: rawYear, includePossible: rawIncludePossible } = request.query as {
      year?: unknown;
      includePossible?: unknown;
    };
    const yearText = rawYear === undefined ? undefined : singleQueryString(rawYear);
    const includePossibleText =
      rawIncludePossible === undefined ? 'true' : singleQueryString(rawIncludePossible);
    if (
      (rawYear !== undefined &&
        (yearText === undefined ||
          !/^-?\d{1,6}$/.test(yearText) ||
          !Number.isSafeInteger(Number(yearText)))) ||
      (rawIncludePossible !== undefined &&
        (includePossibleText === undefined || !['true', 'false'].includes(includePossibleText)))
    )
      return reply
        .code(400)
        .send({ message: 'Year must be one integer and includePossible must be true or false.' });
    const year = yearText === undefined ? undefined : Number(yearText);
    const features =
      year !== undefined
        ? publicProject.features.filter((feature) => {
            const state = featureTimelineState(feature, year);
            return state === 'definite' || (includePossibleText === 'true' && state === 'possible');
          })
        : publicProject.features;
    return {
      type: 'FeatureCollection',
      features: features.map((feature) => ({
        type: 'Feature',
        geometry: feature.geometry,
        properties: feature,
      })),
    };
  });
  app.get('/api/geocode', async (request, reply) => {
    const rawQuery = (request.query as { q?: unknown }).q;
    if (rawQuery !== undefined && singleQueryString(rawQuery) === undefined)
      return reply.code(400).send({ message: 'A single search query is required.' });
    const q = singleQueryString(rawQuery) ?? '';
    if (q.length > 200) return reply.code(400).send({ message: 'The search query is too long.' });
    const search = q.trim().toLocaleLowerCase();
    const projects = sortPublishedProjects(await repository.list());
    const packages = await Promise.all(projects.map((project) => repository.get(project.id)));
    const publicProjects = packages.flatMap((projectPackage) => {
      const delivery = publicProjectPackage(projectPackage);
      return delivery ? [delivery.project] : [];
    });
    return publicProjects
      .filter(
        (project) =>
          project.name.toLocaleLowerCase().includes(search) ||
          project.locality.toLocaleLowerCase().includes(search),
      )
      .map((project) => ({
        label: `${project.locality}, ${project.region ?? project.country}`,
        centre: project.centre,
        projectId: project.id,
      }));
  });

  return app;
}
