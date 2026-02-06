/**
 * Handles PWA shortcut query parameters (e.g., /?action=newGame).
 *
 * On mount, reads the `action` query parameter and maps it to a valid
 * app action. Clears the parameter from the URL to prevent re-triggering.
 *
 * Returns the parsed action (or null) and a setter for manual navigation.
 */

import { useState, useEffect, useCallback } from 'react';

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

export function useDeepLinkHandler(): DeepLinkResult {
  const [initialAction, setInitialAction] = useState<AppAction | null>(null);
  const [hasDeepLink, setHasDeepLink] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');

    if (action) {
      const mappedAction = VALID_ACTIONS[action];
      if (mappedAction) {
        // Clear the query parameter from URL to prevent re-triggering
        window.history.replaceState({}, '', window.location.pathname);
        setInitialAction(mappedAction);
        setHasDeepLink(true);
      }
    }
  }, []);

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

  return { initialAction, hasDeepLink, setAction, clearAction };
}
