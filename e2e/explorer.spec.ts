import { expect, test } from '@playwright/test';

test('opens the published explorer and information pages', async ({ page }) => {
  const projectLoads: string[] = [];
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (/^\/api\/projects\/[^/]+$/.test(path)) projectLoads.push(path);
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Historic Town Explorer' })).toBeVisible();
  await expect(page.getByLabel('Country')).toHaveValue('Scotland');
  await expect(page.getByLabel('County')).toHaveValue('Clackmannanshire');
  await expect(page.getByLabel('Town', { exact: true })).toHaveValue('alloa-scotland');
  await expect(page.getByText('Data status:')).toHaveCount(0);
  await page.getByLabel('Search towns').fill('Alva');
  await page.getByLabel('Town', { exact: true }).selectOption('alva-scotland');
  await expect(page.getByLabel('Town', { exact: true })).toHaveValue('alva-scotland');
  await expect(page).toHaveURL(/town=alva-scotland/);
  await expect(page.getByText('Alva, Scotland')).toBeVisible();
  await expect(page.getByLabel('Only community layers')).toBeHidden();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByLabel('Only community layers')).toBeVisible();
  await expect(page.getByLabel('Show historic-date colours')).toBeChecked();
  await page.getByLabel('Show OSM category icons').check();
  await expect(page.getByLabel('Show OSM category icons')).toBeChecked();
  await page.getByLabel('Only community layers').check();
  await expect(page.getByLabel('Show public art')).toBeChecked();
  await expect(page.getByLabel('Show plaques & memorials')).toBeChecked();
  await expect(page.getByLabel('Food & drink')).toBeChecked();
  await expect(page.getByLabel('Picnic & rest')).toBeChecked();
  await expect(page.getByLabel('Art & culture')).toBeChecked();
  await expect(page.getByLabel('Memorials & plaques')).toBeChecked();
  await expect(page.getByLabel('Historic places')).toBeChecked();
  await expect(page.getByLabel('Leisure')).toBeChecked();
  await expect(page.getByLabel('Visitor information')).toBeChecked();
  await expect(page.getByLabel('Amenities')).toBeChecked();
  await expect(page.getByLabel('Parking')).toBeChecked();
  await expect(page.getByLabel('Natural sights')).toBeChecked();
  await page.getByLabel('Only community layers').uncheck();
  await page.getByLabel('Search towns').fill('Tillicoultry');
  await page.getByLabel('Town', { exact: true }).selectOption('tillicoultry-scotland');
  await expect(page.getByLabel('Town', { exact: true })).toHaveValue('tillicoultry-scotland');
  await expect(page.getByText('Tillicoultry, Scotland')).toBeVisible();
  await expect(
    page.locator('fieldset').filter({ hasText: 'Historic map' }).locator('select option'),
  ).toHaveCount(1);
  await page.getByLabel('County').selectOption('Fife');
  await page.getByLabel('Search towns').fill('Kincardine');
  await page.getByLabel('Town', { exact: true }).selectOption('kincardine-on-forth-scotland');
  await expect(page.getByLabel('Town', { exact: true })).toHaveValue(
    'kincardine-on-forth-scotland',
  );
  await expect(page.getByText('Kincardine-on-Forth, Scotland')).toBeVisible();
  await page.getByLabel('County').selectOption('Clackmannanshire');
  await page.getByLabel('Search towns').fill('Alloa');
  await page.getByLabel('Town', { exact: true }).selectOption('alloa-scotland');
  const currentContext = page.getByLabel('Show current parks & open spaces');
  await expect(currentContext).not.toBeChecked();
  await currentContext.check();
  await expect(currentContext).toBeChecked();
  const cafes = page.getByLabel('Food & drink');
  await cafes.uncheck();
  await cafes.check();
  await expect(cafes).toBeChecked();
  const excludeUndated = page.getByLabel('Show only entries with established dates');
  await expect(excludeUndated).not.toBeChecked();
  await excludeUndated.check();
  await expect(excludeUndated).toBeChecked();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Explorer settings' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sources & licences' }).click();
  await expect(page.getByRole('heading', { name: 'Sources & licences' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Download Alloa listed buildings/i }),
  ).toHaveAttribute('href', '/api/projects/alloa-scotland/exports/listed-buildings.csv');
  await expect(page.getByRole('button', { name: 'Data review' })).toHaveCount(0);
  const alloaLoads = projectLoads.filter((path) => path === '/api/projects/alloa-scotland').length;
  expect(alloaLoads).toBeGreaterThanOrEqual(1);
  expect(alloaLoads).toBeLessThanOrEqual(2);
});

test('opens direct town and information-page links and honours browser history', async ({
  page,
}) => {
  await page.goto('/?town=killin-scotland&view=sources');

  await expect(page.getByRole('heading', { name: 'Sources & licences' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Download Killin listed buildings/i })).toBeVisible();

  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await expect(page.getByText('Killin, Scotland')).toBeVisible();
  await expect(page).not.toHaveURL(/view=/);

  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Sources & licences' })).toBeVisible();
  await expect(page).toHaveURL(/town=killin-scotland&view=sources/);
});

test('provides keyboard discovery and manages settings focus as a modal', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Explore town guides' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Places in Alloa/ })).toBeVisible();

  const firstPlace = page.locator('[data-feature-id]').first();
  await firstPlace.focus();
  await firstPlace.press('Enter');
  await expect(page.getByRole('heading', { name: 'Feature details' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Close details' })).toBeVisible();
  await page.getByRole('button', { name: 'Close details' }).press('Enter');
  await expect(firstPlace).toBeFocused();

  const settings = page.getByRole('button', { name: 'Open settings' });
  await settings.focus();
  await settings.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Explorer settings' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close settings' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(
    await page.locator(':focus').evaluate((element) => Boolean(element.closest('[role="dialog"]'))),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeFocused();
});

test('keeps feature details available on a narrow touch viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');

  const firstPlace = page.locator('[data-feature-id]').first();
  await expect(firstPlace).toBeVisible();
  await firstPlace.click();
  await expect(page.getByRole('button', { name: 'Close details' })).toBeVisible();
  await expect(page.locator('.details h2')).toContainText(/./);
  const widths = await page.locator('body').evaluate((body) => ({
    client: body.clientWidth,
    scroll: body.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
});

test('keeps controls and the non-map route usable at phone and tablet widths', async ({ page }) => {
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 820 });
    await page.goto('/');
    const firstPlace = page.locator('[data-feature-id]').first();
    await expect(page.getByLabel('Town', { exact: true })).toBeVisible();
    await expect(firstPlace).toBeVisible();
    await expect(firstPlace).toHaveCSS('min-height', '44px');
    const widths = await page.locator('body').evaluate((body) => ({
      client: body.clientWidth,
      scroll: body.scrollWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
  }
});

test('keeps selected feature details inside the tablet viewport', async ({ page }) => {
  for (const width of [651, 700, 768, 820, 900]) {
    await page.setViewportSize({ width, height: 820 });
    await page.goto('/');
    await page.locator('[data-feature-id]').first().click();
    await expect(page.getByRole('button', { name: 'Close details' })).toBeVisible();

    const position = await page.locator('.details').evaluate((details) => {
      const bounds = details.getBoundingClientRect();
      return {
        top: bounds.top,
        bottom: bounds.bottom,
        viewportHeight: window.innerHeight,
      };
    });
    expect(position.bottom).toBeGreaterThan(0);
    expect(position.top).toBeLessThan(position.viewportHeight);
  }
});

test('renders resolved HES attribution alongside provider and OSM credits', async ({ page }) => {
  const hesAttribution =
    'Contains Historic Environment Scotland and OS data © Historic Environment Scotland and Crown Copyright and database right 2026, licensed under the Open Government Licence v3.0.';
  await page.route('**/api/projects/alloa-scotland', async (route) => {
    const response = await route.fetch();
    const project = await response.json();
    project.historicMaps.push({
      id: 'hes-listed-buildings-by-category',
      title: 'HES listed buildings by category',
      displayDate: 'Current',
      sourceInstitution: 'Historic Environment Scotland',
      sourceUrl: 'https://portal.historicenvironment.scot/',
      licence: 'Open Government Licence v3.0',
      attribution: hesAttribution,
      layerType: 'xyz',
      tileUrl: '/api/hes-designations/{z}/{x}/{y}.png',
      opacity: 0.8,
    });
    await route.fulfill({ response, json: project });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByLabel('Show current HES designations (external symbols)').check();

  const attribution = page.locator('.attribution');
  await expect(attribution).toContainText('Example tile provider');
  await expect(attribution).toContainText('© OpenStreetMap contributors');
  await expect(attribution).toContainText(hesAttribution);
});

test('exposes HES component licensing on the Sources page', async ({ page }) => {
  await page.goto('/?town=alloa-scotland&view=sources');

  const component = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Historic Environment Scotland spatial data' }),
  });
  await expect(component).toContainText(
    'Contains Historic Environment Scotland and OS data © Historic Environment Scotland',
  );
  await expect(
    component.getByRole('link', { name: 'Open Government Licence v3.0' }),
  ).toHaveAttribute(
    'href',
    'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
  );
  await expect(component).toContainText('professional legal review');
});
