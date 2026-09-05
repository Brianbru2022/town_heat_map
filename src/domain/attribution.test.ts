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

  it('keeps provider, OSM and HES credits additive without duplicates', () => {
    const hes =
      'Contains Historic Environment Scotland and OS data © Historic Environment Scotland and Crown Copyright and database right 2026, licensed under the Open Government Licence v3.0.';

    expect(mapAttribution('Example tiles', [hes, hes, '© OpenStreetMap contributors'])).toEqual({
      provider: 'Example tiles',
      openStreetMap: '© OpenStreetMap contributors',
      additional: [hes],
    });
  });
});
