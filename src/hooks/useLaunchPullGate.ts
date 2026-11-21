import { useCallback, useEffect, useRef, useState } from 'react';
import { markLaunch } from '@/utils/launchTiming';

/** Longest a match waits for the launch-time cloud pull, counted from when it starts waiting. */
export const LAUNCH_PULL_MAX_WAIT_MS = 8000;

/**
 * Holds the MATCH (not Start/Home) while the launch-time cloud pull is pending.
 *
 * The pull runs in the background, but a match opened before it finished kept the stale
 * copy, and its first autosave (seconds after mounting, before the pull even read the
 * games) overwrote the newer version from another device - in the cloud too (review 3.5).
 *
 * - The pull is pending until `pullFinished()` (it ended and the lists have reloaded),
 *   or until the post-login check completes without `pullStarted()` having been called.
 *   Call `pullStarted()` BEFORE releasing the post-login check, or the gate may open in
 *   between.
 * - A match waits at most `maxWaitMs`, counted from when it starts waiting (a coach who
 *   stays on Start while the pull runs is still held when opening a match). Past that it
 *   opens on what the device has: a hung loading screen is worse, and the stale-copy risk
 *   is back for that launch only.
 * - Launch-time only: not reset on a later sign-in within the same page load.
 * - `rearm()` makes a later pull pending again, for the pull page.tsx runs when the app
 *   returns from a long background stay (which used to be a full page reload, and so a
 *   fresh launch pull). Same rules as at launch: pending until `pullFinished()`, and a
 *   match waits at most `maxWaitMs`. Call it only while no match is open - the gate
 *   would swap a mounted match for the loading screen.
 */
export function useLaunchPullGate(
  matchWantsToOpen: boolean,
  postLoginCheckComplete: boolean,
  maxWaitMs: number = LAUNCH_PULL_MAX_WAIT_MS,
) {
  const [pullStartedFlag, setPullStartedFlag] = useState(false);
  const [pullDone, setPullDone] = useState(false);
  const [waitExpired, setWaitExpired] = useState(false);

  // Nothing to wait for once the pull ended, or once the post-login check completed
  // without starting one (pullStarted is called in the same synchronous step that
  // releases the check, so React applies both together).
  const nothingPending = pullDone || (postLoginCheckComplete && !pullStartedFlag);
  const matchWaits = matchWantsToOpen && !nothingPending && !waitExpired;

  useEffect(() => {
    if (!matchWaits) return;
    const timer = setTimeout(() => setWaitExpired(true), maxWaitMs);
    return () => clearTimeout(timer);
  }, [matchWaits, maxWaitMs]);

  // Launch timing (first wait only - later marks are ignored).
  const matchWaitedRef = useRef(false);
  useEffect(() => {
    if (matchWaits) {
      matchWaitedRef.current = true;
      markLaunch('match_wait_start');
    } else if (matchWaitedRef.current) {
      markLaunch('match_wait_end');
    }
  }, [matchWaits]);

  const pullStarted = useCallback(() => {
    markLaunch('launch_pull_start');
    setPullStartedFlag(true);
  }, []);
  const pullFinished = useCallback(() => {
    markLaunch('launch_pull_end');
    setPullDone(true);
  }, []);
  const rearm = useCallback(() => {
    setPullStartedFlag(true);
    setPullDone(false);
    setWaitExpired(false);
  }, []);

  return { matchWaits, pullStarted, pullFinished, rearm };
}
