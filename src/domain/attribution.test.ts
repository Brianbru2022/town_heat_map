import { describe, expect, it } from 'vitest';
import { mapAttribution } from './attribution';

describe('map attribution', () => {
  it('keeps OSM attribution when a custom provider credit is configured', () => {
    expect(mapAttribution('Example tiles')).toEqual({
      provider: 'Example tiles',
      openStreetMap: '© OpenStreetMap contributors',
    });
  });

  it('does not duplicate an OSM-only custom credit', () => {
    expect(mapAttribution('© OpenStreetMap contributors')).toEqual({
      openStreetMap: '© OpenStreetMap contributors',
    });
  });
});
