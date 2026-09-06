import { canonicalPublicUrl } from '../domain/publicUrl';

/** Map styles must remain same-origin unless deployment CSP is deliberately expanded. */
export function validateMapStyleUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const canonical = canonicalPublicUrl(value, {
    allowSameOrigin: true,
    requireHttps: true,
    allowedOrigins: [],
  });
  if (!canonical)
    throw new Error('VITE_MAP_STYLE_URL must be a canonical same-origin HTTPS style URL.');
  return canonical;
}
