import { expect, test } from '@playwright/test';

const tileOrigin = 'https://tile.openstreetmap.org';

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

  const response = await page.goto('/');
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
  const response = await page.goto('/');
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

test('compresses production JavaScript and CSS with their correct content types', async ({
  page,
  request,
}) => {
  await page.goto('/');
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
  for (const path of ['/.git/config', '/.env.production', '/src/App.tsx']) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain('<div id="root">');
  }
});
