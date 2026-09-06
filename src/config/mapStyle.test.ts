import { describe, expect, it } from 'vitest';
import { validateMapStyleUrl } from './mapStyle';

describe('map style configuration boundary', () => {
  it('uses the built-in style when no external style is configured', () => {
    expect(validateMapStyleUrl(undefined)).toBeUndefined();
    expect(validateMapStyleUrl('')).toBeUndefined();
  });

  it('accepts only a canonical same-origin style path', () => {
    expect(validateMapStyleUrl('/map/style.json')).toBe('/map/style.json');
    expect(() => validateMapStyleUrl('https://example.test/style.json')).toThrow(
      /VITE_MAP_STYLE_URL/,
    );
  });
});
