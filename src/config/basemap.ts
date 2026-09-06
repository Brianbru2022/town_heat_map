import { canonicalPublicUrl } from '../domain/publicUrl';

export const developmentBasemapTileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function validateBasemapTileUrl(value: string | undefined, production: boolean): string {
  const configured = value;
  if (!configured?.trim()) {
    if (production) throw new Error('VITE_BASEMAP_TILE_URL is required for a production build.');
    return developmentBasemapTileUrl;
  }
  if (!configured.includes('{z}') || !configured.includes('{x}') || !configured.includes('{y}'))
    throw new Error('VITE_BASEMAP_TILE_URL must contain {z}, {x} and {y} tile placeholders.');
  const canonical = canonicalPublicUrl(configured, {
    allowSameOrigin: true,
    requireHttps: true,
    allowedOrigins: ['https://tile.openstreetmap.org'],
    allowTemplateTokens: true,
  });
  if (!canonical)
    throw new Error(
      'VITE_BASEMAP_TILE_URL must be a canonical same-origin path or a permitted HTTPS URL.',
    );
  return canonical;
}
