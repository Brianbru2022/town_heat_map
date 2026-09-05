// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function deploymentFile(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('production deployment boundary', () => {
  it('keeps the API private and binds the sole published service to loopback by default', async () => {
    const compose = await deploymentFile('docker-compose.yml');
    const api = compose.slice(compose.indexOf('  api:'), compose.indexOf('  tiles:'));

    expect(compose).toContain("'${WEB_BIND_ADDRESS:-127.0.0.1}:${WEB_PORT:-8080}:8080'");
    expect(api).toContain("expose: ['3001']");
    expect(api).not.toContain('ports:');
    expect(compose).toContain('internal: true');
    expect(compose).not.toContain('.:/app');
  });

  it('uses a least-privilege API image and excludes raw review inputs from its build context', async () => {
    const dockerfile = await deploymentFile('Dockerfile');
    const compose = await deploymentFile('docker-compose.yml');
    const ignored = await deploymentFile('.dockerignore');

    expect(dockerfile).toContain('pnpm install --prod --frozen-lockfile');
    expect(dockerfile).toContain('org.opencontainers.image.version=$APP_VERSION');
    expect(compose).toContain('APP_VERSION: ${APP_VERSION:-0.1.0}');
    expect(dockerfile).toContain('COPY data/exports/*-listed-buildings.csv');
    expect(dockerfile).toContain('USER node');
    expect(dockerfile).not.toContain('COPY . .');
    expect(ignored).toContain('data/review/');
    expect(ignored).toContain('scripts/');
  });

  it('proxies only API routes and denies raw, configuration and source-map paths', async () => {
    const nginx = await deploymentFile('docker/nginx.conf');

    for (const header of [
      'Content-Security-Policy',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Strict-Transport-Security',
    ])
      expect(nginx).toContain(header);
    expect(nginx).toContain('location ^~ /api/');
    expect(nginx).toContain('proxy_pass http://api:3001');
    expect(nginx).toContain('X-Forwarded-For');
    expect(nginx).toContain('(?:data|scripts|server|src|docker|schemas|node_modules)');
    expect(nginx).toContain('(?:map|sqlite|mbtiles|log|ya?ml|toml|ini)');
    expect(nginx).toContain('return 404;');
  });
});
