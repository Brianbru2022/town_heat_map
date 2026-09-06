import { describe, expect, it } from 'vitest';
import { validateBasemapTileUrl } from '../config/basemap';
import { canonicalPublicTileUrl, canonicalPublicUrl } from './publicUrl';

describe('canonical public URL boundary', () => {
  it.each([
    'file:///C:/Users/curator/private.txt',
    'C:\\Users\\curator\\private.txt',
    '\\\\server\\share\\private.txt',
    'javascript:alert(1)',
    'data:text/html,unsafe',
    '//example.test/path',
    'https://user:password@example.test/private',
    'https://example.test/has space',
    'https://example.test/line\nbreak',
    'https://example.test/tab\tbreak',
    'https://example.test/%0aheader',
    '/%2f%2fevil.test/path',
    '/%5cevil.test/path',
    'not a url',
  ])('rejects unsafe or parser-dependent input: %s', (value) => {
    expect(canonicalPublicUrl(value, { allowSameOrigin: true })).toBeUndefined();
  });

  it('canonicalises supported external URLs and rejects disallowed final origins', () => {
    expect(canonicalPublicUrl('HTTPS://EXAMPLE.TEST:443/a/../b?q=1')).toBe(
      'https://example.test/b?q=1',
    );
    expect(
      canonicalPublicUrl('https://example.test/path', {
        requireHttps: true,
        allowedOrigins: ['https://different.test'],
      }),
    ).toBeUndefined();
  });

  it('accepts only canonical same-origin paths and safely retains tile tokens', () => {
    expect(canonicalPublicUrl('/api/projects/alloa', { allowSameOrigin: true })).toBe(
      '/api/projects/alloa',
    );
    expect(canonicalPublicTileUrl('/api/tiles/{z}/{x}/{y}.png')).toBe('/api/tiles/{z}/{x}/{y}.png');
  });

  it.each([
    ' https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png\n',
    'https://user@example.test/{z}/{x}/{y}.png',
    'HTTPS://EVIL.TEST\\@tile.openstreetmap.org/{z}/{x}/{y}.png',
  ])('applies the same boundary to production basemap values: %s', (value) => {
    expect(() => validateBasemapTileUrl(value, true)).toThrow(/VITE_BASEMAP_TILE_URL/);
  });
});
