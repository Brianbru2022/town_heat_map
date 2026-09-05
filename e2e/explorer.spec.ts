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
  await page.getByRole('button', { name: 'Data review' }).click();
  await expect(page.getByRole('heading', { name: 'Curator review' })).toBeVisible();
  await expect(page).toHaveURL(/view=data-review/);
  await expect(page.getByRole('link', { name: 'Download undated heritage CSV' })).toHaveAttribute(
    'href',
    '/api/projects/alloa-scotland/exports/undated-heritage-review.csv',
  );
  await page.getByLabel('Review queue').selectOption('date');
  await expect(page.getByRole('heading', { name: /record\(s\) to review/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save research note' })).toBeVisible();
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
