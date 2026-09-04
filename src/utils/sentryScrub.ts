/**
 * Pure scrubbing helpers for the Sentry client config (kept out of
 * instrumentation-client.ts so they are unit-testable - Sentry.init runs on
 * import there).
 *
 * Two families of secrets must never reach Sentry:
 * - auth tokens/emails from the Supabase auth flow (URLs, headers), and
 * - the user's own AI provider key (Kirjuri BYOK). Fetch breadcrumbs carry no
 *   headers, but `logger.error(msg, err, extra)` ships `extra` verbatim and a
 *   provider error object can echo the request - so every string an event
 *   carries is scrubbed for key-shaped tokens.
 */

/** URL fragments that indicate auth-related data. */
export const AUTH_URL_PATTERNS = [
  '/auth/',
  '/token',
  '/callback',
  'access_token=',
  'refresh_token=',
  'type=recovery',
  'type=signup',
  'type=magiclink',
];

/** Query params redacted from any URL. */
export const SENSITIVE_QUERY_PARAMS = ['access_token', 'refresh_token', 'token', 'email', 'code', 'api_key', 'key'];

/** Hosts of user-connected AI providers (Kirjuri). Grows with the provider field. */
export const AI_PROVIDER_HOSTS = ['api.openai.com'];

/**
 * Key-shaped tokens: OpenAI/Anthropic-style `sk-...` keys, Google `AIza...`
 * keys, and bearer tokens. Extend when the provider field grows - a provider
 * whose key matches none of these relies on nothing else.
 */
const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\bAIza[0-9A-Za-z_-]{20,}/g,
  /\bBearer\s+[A-Za-z0-9._-]{16,}/g,
];

const MAX_DEPTH = 6;

/** Redact sensitive query params and token-bearing hash fragments. */
export function scrubUrl(url: string): string {
  try {
    const parsed = new URL(url, 'https://placeholder.local');
    for (const param of SENSITIVE_QUERY_PARAMS) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, '[REDACTED]');
      }
    }
    if (parsed.hash && AUTH_URL_PATTERNS.some((p) => parsed.hash.includes(p))) {
      parsed.hash = '#[REDACTED]';
    }
    return parsed.toString().replace('https://placeholder.local', '');
  } catch {
    // Not a URL - return as-is.
    return url;
  }
}

/** Hostname match, not substring - `api.openai.com.evil.example` must not count. */
export function isAiProviderUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return AI_PROVIDER_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

/** Replace key-shaped tokens inside a string. */
export function scrubSecretsInString(value: string): string {
  return SECRET_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, '[REDACTED]'), value);
}

/**
 * Walk any JSON-ish value and scrub every string in it. Returns a copy for
 * objects/arrays (Sentry event fields are plain data). Depth-capped so a
 * cyclic or huge `extra` cannot hang the SDK - and the cap FAILS CLOSED: a
 * subtree deeper than the cap is replaced by a placeholder, never passed
 * through unscrubbed (review #744).
 */
export function scrubSecretsDeep<T>(value: T, depth = 0): T {
  if (depth > MAX_DEPTH) {
    return (value && typeof value === 'object' ? '[TRUNCATED]' : scrubSecretsDeep(value, 0)) as T;
  }
  if (typeof value === 'string') return scrubSecretsInString(value) as T;
  if (Array.isArray(value)) return value.map((item) => scrubSecretsDeep(item, depth + 1)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = scrubSecretsDeep(item, depth + 1);
    }
    return out as T;
  }
  return value;
}
