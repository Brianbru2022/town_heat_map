import { describe, expect, it } from 'vitest';
import { developmentBasemapTileUrl, validateBasemapTileUrl } from './basemap';

describe('production basemap configuration', () => {
  it('accepts the CSP-permitted HTTPS provider and same-origin tile routes', () => {
    expect(validateBasemapTileUrl(developmentBasemapTileUrl, true)).toBe(developmentBasemapTileUrl);
    expect(validateBasemapTileUrl('/api/tiles/{z}/{x}/{y}.png', true)).toBe(
      '/api/tiles/{z}/{x}/{y}.png',
    );
  });

  it.each([
    undefined,
    '',
    'https://example.com/{z}/{x}/{y}.png',
    'https://user:secret@tile.openstreetmap.org/{z}/{x}/{y}.png',
    'https://tile.openstreetmap.org/%0a/{z}/{x}/{y}.png',
    'https://tile.openstreetmap.org/%ZZ/{z}/{x}/{y}.png',
    'HTTPS://EVIL.TEST\\@tile.openstreetmap.org/{z}/{x}/{y}.png',
    '//example.com/{z}/{x}/{y}.png',
    '/\\example.com/{z}/{x}/{y}.png',
    'http://tile.openstreetmap.org/{z}/{x}/{y}.png',
    'https://tile.openstreetmap.org/static.png',
  ])('rejects missing or unusable production configuration: %s', (value) => {
    expect(() => validateBasemapTileUrl(value, true)).toThrow(/VITE_BASEMAP_TILE_URL/);
  });

  it('retains the OSM fallback in development only', () => {
    expect(validateBasemapTileUrl(undefined, false)).toBe(developmentBasemapTileUrl);
  });
});
