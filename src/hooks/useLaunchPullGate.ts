import { useCallback, useEffect, useState } from 'react';

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

  const pullStarted = useCallback(() => {
    setPullStartedFlag(true);
  }, []);
  const pullFinished = useCallback(() => {
    setPullDone(true);
  }, []);

  return { matchWaits, pullStarted, pullFinished };
}
