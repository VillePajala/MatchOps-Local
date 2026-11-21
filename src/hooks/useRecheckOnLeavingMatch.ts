import { useEffect, useRef } from 'react';

/**
 * Re-checks the start state whenever the coach lands back on the start screen after a
 * match (deep-review fix, stale Home): all Home flags (canResume, hasPlayers,
 * hasSavedGames, first-time mode, setup card) were computed once at boot, so returning
 * via Koti showed the BOOT-time Home - most visibly, a brand-new user's first game left
 * Home in first-time mode until a reload.
 *
 * In the background (loading-speed stage 1): the foreground check raised the
 * full-screen loading gate, which swapped the whole tree for the logo screen (plus its
 * fade) on every exit from a match, although Home already has the values from the last
 * check and this one only refreshes them. A failed background read keeps the last
 * known values (page.tsx checkAppState).
 */
export function useRecheckOnLeavingMatch(
  screen: 'start' | 'home',
  checkAppState: (options: { inBackground: boolean }) => unknown,
): void {
  const hasVisitedMatchRef = useRef(false);
  useEffect(() => {
    if (screen === 'home') {
      hasVisitedMatchRef.current = true;
    } else if (hasVisitedMatchRef.current) {
      void checkAppState({ inBackground: true });
    }
  }, [screen, checkAppState]);
}
