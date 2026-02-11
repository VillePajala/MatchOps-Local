import { useCallback, useSyncExternalStore } from 'react';

/**
 * SSR-safe hook that tracks whether a CSS media query matches.
 * Returns `false` during SSR (hydration-safe), then updates
 * reactively via matchMedia change events.
 *
 * @param query - CSS media query string, e.g. '(min-width: 1024px)'
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', callback);
      return () => mql.removeEventListener('change', callback);
    },
    [query]
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
