import { expect, test, type Page } from '@playwright/test';

const tileOrigin = 'https://tile.openstreetmap.org';

async function openLoadedExplorer(page: Page) {
  const projectIndex = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/projects' && response.status() === 200;
  });
  const selectedProject = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.startsWith('/api/projects/') && response.status() === 200;
  });
  const response = await page.goto('/');
  await Promise.all([projectIndex, selectedProject]);
  return response;
}

test('renders the permitted production basemap without CSP violations', async ({ page }) => {
  const tileResponses: Array<{ status: number; contentType: string | undefined }> = [];
  const cspViolations: string[] = [];
  page.on('response', (response) => {
    if (response.url().startsWith(`${tileOrigin}/`))
      tileResponses.push({
        status: response.status(),
        contentType: response.headers()['content-type'],
      });
  });
  page.on('console', (message) => {
    if (/content security policy|violates the following directive/i.test(message.text()))
      cspViolations.push(message.text());
  });

  const response = await openLoadedExplorer(page);
  expect(response?.status()).toBe(200);
  const csp = response?.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("connect-src 'self' https://tile.openstreetmap.org");
  expect(csp).not.toMatch(/connect-src[^;]+\*/);

  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect(page.locator('.attribution')).toContainText('© OpenStreetMap contributors');
  await expect
    .poll(() => tileResponses.filter(({ status }) => status >= 200 && status < 300).length)
    .toBeGreaterThan(0);
  expect(tileResponses.every(({ contentType }) => contentType?.startsWith('image/'))).toBe(true);

  const renderedMap = await page.locator('.maplibregl-canvas').screenshot();
  expect(renderedMap.byteLength).toBeGreaterThan(10_000);
  expect(cspViolations).toEqual([]);
});

test('blocks an unrelated external connection', async ({ page }) => {
  const response = await openLoadedExplorer(page);
  const csp = response?.headers()['content-security-policy'] ?? '';
  expect(csp).not.toContain('example.com');

  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/townscape-csp-probe', { mode: 'no-cors' });
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
});

test('routes HES input validation through the production Fastify stack', async ({ request }) => {
  const response = await request.get('/api/hes-designations?bbox=%2C1%2C2%2C3');

  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({ message: 'A valid Web Mercator bbox is required.' });
});

test('compresses production JavaScript and CSS with their correct content types', async ({
  page,
  request,
}) => {
  await openLoadedExplorer(page);
  const assets = await page
    .locator('script[src], link[rel="stylesheet"]')
    .evaluateAll((elements) =>
      elements
        .map((element) => element.getAttribute('src') ?? element.getAttribute('href'))
        .filter((value): value is string => Boolean(value)),
    );
  expect(assets.length).toBeGreaterThanOrEqual(2);

  for (const asset of assets) {
    const response = await request.get(asset, {
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-encoding']).toBe('gzip');
    if (asset.endsWith('.js')) expect(response.headers()['content-type']).toContain('javascript');
    if (asset.endsWith('.css')) expect(response.headers()['content-type']).toContain('text/css');
  }
});

test('rejects repository-looking paths instead of using the SPA fallback', async ({ request }) => {
  for (const path of [
    '/.git/config',
    '/.env.production',
    '/src/App.tsx',
    '/package.json',
    '/Dockerfile',
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain('<div id="root">');
  }
});
