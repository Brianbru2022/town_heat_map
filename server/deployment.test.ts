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
    expect(compose).toContain('condition: service_healthy');
    expect(compose).not.toMatch(/\n\s+api:\n\s+internal: true/);
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
    expect(dockerfile).toContain("fetch('http://127.0.0.1:3001/health')");
    expect(dockerfile).not.toContain('COPY . .');
    expect(ignored).toContain('data/review/');
    expect(ignored).toContain('scripts/');
  });

  it('carries the reviewed pnpm lifecycle policy into every dependency install stage', async () => {
    const dockerfile = await deploymentFile('Dockerfile');
    const packageJson = JSON.parse(await deploymentFile('package.json')) as {
      packageManager?: string;
    };
    const workspace = await deploymentFile('pnpm-workspace.yaml');
    const installStages = dockerfile
      .split(/^FROM /m)
      .filter((stage) => stage.includes('pnpm install'));

    expect(installStages).toHaveLength(2);
    for (const stage of installStages) {
      expect(stage).toMatch(
        /COPY package\.json pnpm-lock\.yaml pnpm-workspace\.yaml \.\/[\s\S]*pnpm install/,
      );
    }
    expect(packageJson.packageManager).toBe('pnpm@11.19.0');
    expect(dockerfile.match(/corepack enable && pnpm install/g)).toHaveLength(2);
    expect(workspace).toMatch(/^allowBuilds:\s*\r?\n\s+esbuild: true\s*$/);
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
    expect(nginx).toContain('proxy_set_header X-Forwarded-For $remote_addr;');
    expect(nginx).not.toContain('proxy_add_x_forwarded_for');
    expect(nginx).toContain('(?:data|scripts|server|src|docker|schemas|node_modules)');
    expect(nginx).toContain('(?:map|sqlite|mbtiles|log|ya?ml|toml|ini)');
    expect(nginx).toContain('package(?:-lock)?\\.json');
    expect(nginx).toContain('dockerfile');
    expect(nginx).toContain('return 404;');
    expect(nginx).toContain('(?:^|/)(?:\\.env(?:[./]|$)|\\.git(?:/|$))');
  });

  it('keeps the explicit production basemap, CSP and static compression aligned', async () => {
    const nginx = await deploymentFile('docker/nginx.conf');
    const productionEnvironment = await deploymentFile('.env.production');
    const dockerfile = await deploymentFile('Dockerfile');

    expect(productionEnvironment).toContain(
      'VITE_BASEMAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    );
    expect(dockerfile).toContain('COPY index.html vite.config.ts .env.production ./');
    expect(nginx).toContain("connect-src 'self' https://tile.openstreetmap.org");
    expect(nginx).not.toMatch(/connect-src[^;"]+\*/);
    expect(nginx).toContain('gzip on;');
    expect(nginx).toContain('gzip_types application/javascript application/json');
  });
});
