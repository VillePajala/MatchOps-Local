/**
 * "The sign-in server couldn't be reached" signal.
 *
 * With an expired access token, Supabase renews it on startup and retries a failed
 * renewal for up to 30 seconds. Startup waits on that, so an offline cold start used
 * to sit on the loading screen until AuthProvider's 20 s safety timeout. The Supabase
 * client's fetch reports the FIRST failed auth request here, so AuthProvider can let
 * the user into their local data (grace period) straight away.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Called by the Supabase client's fetch when an auth request fails at the network level. */
export function notifyAuthServerUnreachable(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A failing listener must not break the request path or the other listeners.
    }
  }
}

/** Subscribes to the signal; returns the unsubscribe function. */
export function onAuthServerUnreachable(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True for a Supabase Auth endpoint URL (token renewal, user lookup, ...). */
export function isAuthRequestUrl(input: RequestInfo | URL): boolean {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return url.includes('/auth/v1/');
}
