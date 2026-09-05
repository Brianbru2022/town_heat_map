// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app';

const bbox = '-1000,-1000,1000,1000';
const apps: FastifyInstance[] = [];

async function createTestApp(options: Parameters<typeof buildApp>[0] = {}) {
  const app = await buildApp({
    settings: { rateLimitMax: 100, proxyRateLimitMax: 100, ...options?.settings },
    ...options,
  });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('public API safeguards', () => {
  it('only returns CORS headers for configured origins', async () => {
    const app = await createTestApp({ settings: { corsOrigins: ['https://guides.example.test'] } });

    const allowed = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://guides.example.test' },
    });
    const denied = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://untrusted.example.test' },
    });

    expect(allowed.headers['access-control-allow-origin']).toBe('https://guides.example.test');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();

    const sameOrigin = await app.inject({ method: 'GET', url: '/health' });
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/api/projects',
      headers: {
        origin: 'https://guides.example.test',
        'access-control-request-method': 'GET',
      },
    });
    expect(sameOrigin.statusCode).toBe(200);
    expect(sameOrigin.headers['access-control-allow-origin']).toBeUndefined();
    expect(preflight.headers['access-control-allow-origin']).toBe('https://guides.example.test');
  });

  it('sets defensive headers on direct API responses', async () => {
    const app = await createTestApp();
    const response = await app.inject('/health');

    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(response.headers['permissions-policy']).toContain('geolocation=()');
    expect(response.headers['x-frame-options']).toBe('DENY');
  });

  it('caches successful HES images and sends shared-cache directives', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(
      async () =>
        new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { 'content-type': 'image/png' },
        }),
    );
    const app = await createTestApp({ fetchImplementation });

    const first = await app.inject(`/api/hes-designations?bbox=${encodeURIComponent(bbox)}`);
    const second = await app.inject(`/api/hes-designations?bbox=${encodeURIComponent(bbox)}`);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.headers['cache-control']).toContain('s-maxage=86400');
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('times out a stalled HES request without exposing the underlying error', async () => {
    const fetchImplementation: typeof fetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    const app = await createTestApp({ fetchImplementation, settings: { requestTimeoutMs: 10 } });

    const response = await app.inject(`/api/hes-designations?bbox=${encodeURIComponent(bbox)}`);

    expect(response.statusCode).toBe(504);
    expect(response.json()).toEqual({
      message: 'Historic Environment Scotland map service timed out.',
    });
  });

  it('returns a generic error when the upstream request fails', async () => {
    const app = await createTestApp({
      fetchImplementation: async () => {
        throw new Error('database password should never be exposed');
      },
    });

    const response = await app.inject(`/api/hes-designations?bbox=${encodeURIComponent(bbox)}`);

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      message: 'Historic Environment Scotland map service is unavailable.',
    });
    expect(response.body).not.toContain('password');
  });

  it('rate limits public endpoints', async () => {
    const app = await createTestApp({ settings: { rateLimitMax: 2 } });

    await app.inject('/health');
    await app.inject('/health');
    const limited = await app.inject('/health');

    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ message: 'Too many requests. Please try again shortly.' });
  });

  it('does not accept spoofed forwarded client addresses from an untrusted listener', async () => {
    const app = await createTestApp({ settings: { rateLimitMax: 1, trustedProxyCidrs: [] } });

    await app.inject({
      url: '/health',
      remoteAddress: '203.0.113.8',
      headers: { 'x-forwarded-for': '198.51.100.1' },
    });
    const limited = await app.inject({
      url: '/health',
      remoteAddress: '203.0.113.8',
      headers: { 'x-forwarded-for': '198.51.100.2' },
    });

    expect(limited.statusCode).toBe(429);
  });

  it('uses forwarded client addresses only from configured private proxies', async () => {
    const app = await createTestApp({
      settings: { rateLimitMax: 1, trustedProxyCidrs: ['127.0.0.1'] },
    });

    await app.inject({
      url: '/health',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '198.51.100.1' },
    });
    const sameClient = await app.inject({
      url: '/health',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '198.51.100.1' },
    });
    const anotherClient = await app.inject({
      url: '/health',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '198.51.100.2' },
    });

    expect(sameClient.statusCode).toBe(429);
    expect(anotherClient.statusCode).toBe(200);
  });

  it('does not serve raw repository paths from the API', async () => {
    const app = await createTestApp();

    for (const path of [
      '/data/projects/alloa.json',
      '/data/review/alloa-review.json',
      '/scripts/seed-db.ts',
      '/.env',
    ])
      expect((await app.inject(path)).statusCode).toBe(404);
  });

  it('rejects malformed proxy requests before calling HES', async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const app = await createTestApp({ fetchImplementation });

    const response = await app.inject('/api/hes-designations?bbox=1,1,1,1');

    expect(response.statusCode).toBe(400);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
