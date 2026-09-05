export interface MapAttribution {
  provider?: string;
  openStreetMap: '© OpenStreetMap contributors';
  additional?: string[];
}

/** A configured basemap credit is additive; it can never replace OSM attribution. */
export function mapAttribution(custom?: string, additional: string[] = []): MapAttribution {
  const provider = custom?.trim();
  const duplicatesOsm = provider ? /openstreetmap contributors/i.test(provider) : false;
  const visibleAdditional = [
    ...new Set(
      additional
        .map((item) => item.trim())
        .filter(
          (item) =>
            item && !/openstreetmap contributors/i.test(item) && (!provider || item !== provider),
        ),
    ),
  ];
  return {
    ...(provider && !duplicatesOsm ? { provider } : {}),
    openStreetMap: '© OpenStreetMap contributors',
    ...(visibleAdditional.length > 0 ? { additional: visibleAdditional } : {}),
  };
}
