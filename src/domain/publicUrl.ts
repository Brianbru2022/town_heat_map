export interface PublicUrlOptions {
  allowSameOrigin?: boolean;
  requireHttps?: boolean;
  allowedOrigins?: readonly string[];
  allowTemplateTokens?: boolean;
}

const canonicalBase = 'https://townscape.invalid';
const windowsPath = /^(?:[a-z]:[\\/]|\\\\)/i;

function hasUnsafeRawCharacters(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x20 || codePoint === 0x7f;
  });
}

function hideTemplateTokens(value: string): { value: string; tokens: Map<string, string> } {
  const tokens = new Map<string, string>();
  let index = 0;
  return {
    value: value.replace(/\{[A-Za-z0-9_]+\}/g, (token) => {
      const marker = `__townscape_token_${index++}__`;
      tokens.set(marker, token);
      return marker;
    }),
    tokens,
  };
}

function restoreTemplateTokens(value: string, tokens: ReadonlyMap<string, string>): string {
  let restored = value;
  for (const [marker, token] of tokens) restored = restored.replaceAll(marker, token);
  return restored;
}

function decodedPathIsSafe(pathname: string): boolean {
  try {
    const decoded = decodeURIComponent(pathname);
    return !hasUnsafeRawCharacters(decoded) && !decoded.includes('\\') && !decoded.startsWith('//');
  } catch {
    return false;
  }
}

/**
 * Canonical public URL boundary shared by API projection, configuration and UI.
 * It never accepts filesystem paths, credentials, protocol-relative URLs or
 * parser-dependent whitespace/control-character forms.
 */
export function canonicalPublicUrl(
  value: unknown,
  options: PublicUrlOptions = {},
): string | undefined {
  if (typeof value !== 'string' || !value || value !== value.trim()) return undefined;
  if (hasUnsafeRawCharacters(value) || windowsPath.test(value)) return undefined;
  const hidden = options.allowTemplateTokens
    ? hideTemplateTokens(value)
    : { value, tokens: new Map() };
  if (!options.allowTemplateTokens && /[{}]/.test(value)) return undefined;

  if (hidden.value.startsWith('/')) {
    if (!options.allowSameOrigin || hidden.value.startsWith('//') || hidden.value.startsWith('/\\'))
      return undefined;
    try {
      const parsed = new URL(hidden.value, canonicalBase);
      if (
        parsed.origin !== canonicalBase ||
        parsed.username ||
        parsed.password ||
        !decodedPathIsSafe(parsed.pathname)
      )
        return undefined;
      return restoreTemplateTokens(
        `${parsed.pathname}${parsed.search}${parsed.hash}`,
        hidden.tokens,
      );
    } catch {
      return undefined;
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(hidden.value);
  } catch {
    return undefined;
  }
  const supportedProtocols = options.requireHttps ? ['https:'] : ['http:', 'https:'];
  if (
    !supportedProtocols.includes(parsed.protocol.toLowerCase()) ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.origin === 'null' ||
    !decodedPathIsSafe(parsed.pathname)
  )
    return undefined;
  if (options.allowedOrigins) {
    const allowed = new Set(
      options.allowedOrigins.flatMap((origin) => {
        try {
          return [new URL(origin).origin.toLowerCase()];
        } catch {
          return [];
        }
      }),
    );
    if (!allowed.has(parsed.origin.toLowerCase())) return undefined;
  }
  return restoreTemplateTokens(parsed.href, hidden.tokens);
}

export function canonicalPublicTileUrl(value: unknown): string | undefined {
  return canonicalPublicUrl(value, { allowSameOrigin: true, allowTemplateTokens: true });
}
