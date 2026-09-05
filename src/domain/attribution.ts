export interface MapAttribution {
  provider?: string;
  openStreetMap: '© OpenStreetMap contributors';
}

/** A configured basemap credit is additive; it can never replace OSM attribution. */
export function mapAttribution(custom?: string): MapAttribution {
  const provider = custom?.trim();
  const duplicatesOsm = provider ? /openstreetmap contributors/i.test(provider) : false;
  return {
    ...(provider && !duplicatesOsm ? { provider } : {}),
    openStreetMap: '© OpenStreetMap contributors',
  };
}
