/**
 * Handles PWA shortcut query parameters (e.g., /?action=newGame).
 *
 * On mount, reads the `action` query parameter and maps it to a valid
 * app action. Clears the parameter from the URL to prevent re-triggering.
 *
 * Returns the parsed action (or null) and a setter for manual navigation.
 */

import { useState, useCallback } from 'react';

export type AppAction =
  | 'newGame' | 'loadGame' | 'resumeGame' | 'explore'
  | 'season' | 'stats' | 'roster' | 'teams' | 'settings';

const VALID_ACTIONS: Record<string, AppAction> = {
  newGame: 'newGame',
  stats: 'stats',
  roster: 'roster',
  settings: 'settings',
  loadGame: 'loadGame',
};

interface DeepLinkResult {
  initialAction: AppAction | null;
  /** Whether a deep link was detected (should skip start screen) */
  hasDeepLink: boolean;
  /** Navigate to an action programmatically */
  setAction: (action: AppAction | 'getStarted') => void;
  /** Clear the current action */
  clearAction: () => void;
}

/**
 * Parse deep link from URL query parameters.
 * Executed once as a lazy state initializer to avoid useEffect + setState.
 */
function parseDeepLink(): { action: AppAction | null; detected: boolean } {
  if (typeof window === 'undefined') return { action: null, detected: false };

  const params = new URLSearchParams(window.location.search);
  const raw = params.get('action');

  if (raw) {
    const mapped = VALID_ACTIONS[raw];
    if (mapped) {
      // Clear the query parameter from URL to prevent re-triggering
      window.history.replaceState({}, '', window.location.pathname);
      return { action: mapped, detected: true };
    }
  }

  return { action: null, detected: false };
}

export function useDeepLinkHandler(): DeepLinkResult {
  // Parse URL once on mount via lazy initializer (avoids react-hooks/set-state-in-effect).
  const [deepLink] = useState(parseDeepLink);
  const [initialAction, setInitialAction] = useState<AppAction | null>(deepLink.action);

  const setAction = useCallback((action: AppAction | 'getStarted') => {
    if (action === 'getStarted') {
      setInitialAction(null);
    } else {
      setInitialAction(action);
    }
  }, []);

  const clearAction = useCallback(() => {
    setInitialAction(null);
  }, []);

  return { initialAction, hasDeepLink: deepLink.detected, setAction, clearAction };
}
