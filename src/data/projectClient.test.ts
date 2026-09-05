import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearProjectClientCache, loadProjectCatalogue, loadProjectPackage } from './projectClient';

afterEach(() => {
  clearProjectClientCache();
  vi.unstubAllGlobals();
});

describe('project client', () => {
  it('sorts and caches the published catalogue', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json([
        {
          id: 'z-town',
          name: 'Z Town',
          countryCode: 'GB-SCT',
          country: 'Scotland',
          locality: 'Z Town',
          centre: [0, 0],
        },
        {
          id: 'a-town',
          name: 'A Town',
          countryCode: 'GB-SCT',
          country: 'Scotland',
          locality: 'A Town',
          centre: [0, 0],
        },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = await loadProjectCatalogue();
    const second = await loadProjectCatalogue();

    expect(first.map((project) => project.id)).toEqual(['a-town', 'z-town']);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('deduplicates package requests and retries after a failure', async () => {
    const projectPackage = { project: { id: 'alloa-scotland' } };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(Response.json(projectPackage));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadProjectPackage('alloa-scotland')).rejects.toThrow(
      'The selected town guide could not be loaded (503).',
    );
    const firstRetry = loadProjectPackage('alloa-scotland');
    const secondRetry = loadProjectPackage('alloa-scotland');

    await expect(firstRetry).resolves.toEqual(projectPackage);
    await expect(secondRetry).resolves.toEqual(projectPackage);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
