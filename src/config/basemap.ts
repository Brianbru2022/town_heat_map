export const developmentBasemapTileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function validateBasemapTileUrl(value: string | undefined, production: boolean): string {
  const configured = value?.trim();
  if (!configured) {
    if (production) throw new Error('VITE_BASEMAP_TILE_URL is required for a production build.');
    return developmentBasemapTileUrl;
  }
  if (!configured.includes('{z}') || !configured.includes('{x}') || !configured.includes('{y}'))
    throw new Error('VITE_BASEMAP_TILE_URL must contain {z}, {x} and {y} tile placeholders.');
  if (configured.startsWith('/') && !configured.startsWith('//') && !configured.includes('\\'))
    return configured;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('VITE_BASEMAP_TILE_URL must be a same-origin path or an absolute HTTPS URL.');
  }
  if (url.protocol !== 'https:') throw new Error('VITE_BASEMAP_TILE_URL must use HTTPS.');
  if (url.origin !== 'https://tile.openstreetmap.org')
    throw new Error(
      'VITE_BASEMAP_TILE_URL origin is not permitted by the production Content Security Policy.',
    );
  return configured;
}
