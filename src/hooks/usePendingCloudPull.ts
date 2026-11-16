/**
 * Keeps retrying a first sign-in's cloud check and pull until they succeed
 * (review 7.3).
 *
 * The first sign-in on a device checks what the account holds and pulls it before
 * the app opens. When that fails for good (flaky mobile network), the coach is let
 * in, but as "not known yet": page.tsx sets `pending`, which keeps the new-coach
 * setup wizard and checklist away (for the whole pull, so this hook does not touch
 * the shared isHydratingFromCloud flag) and leaves the migration flag unset.
 *
 * This hook tries at once, then backs off to once a minute - and tries at once
 * when the device comes back online - until the check answers. With data it pulls
 * it (`onPulled` refreshes the UI), and either way `onResolved` then marks the
 * account as checked. It returns how many tries have failed (for the notice) and
 * `retryNow` for a manual "Try again".
 *
 * Every cold launch with the flag unset runs the blocking check again; that costs a
 * few seconds per launch only while the cloud stays unreachable.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import logger from '@/utils/logger';

export interface PendingCloudPullOptions {
  pending: boolean;
  userId: string | undefined;
  /** After a successful pull: refetch queries and re-derive Home. */
  onPulled: () => Promise<void>;
  /** The account is known now: set the migration flag, clear `pending`. */
  onResolved: (userId: string) => void;
}

/** 10 s, 20 s, 40 s, then once a minute. */
export const pendingCloudPullDelayMs = (failures: number): number =>
  Math.min(60_000, 10_000 * 2 ** Math.min(Math.max(failures - 1, 0), 3));

export interface PendingCloudPull {
  /** Failed tries in the current pending run (0 when not pending). */
  failures: number;
  /** Try now, skipping the wait (no-op while a try is running or not pending). */
  retryNow: () => void;
}

export function usePendingCloudPull({ pending, userId, onPulled, onResolved }: PendingCloudPullOptions): PendingCloudPull {
  const [failureCount, setFailureCount] = useState(0);
  const tryNowRef = useRef<(() => void) | null>(null);
  // Latest callbacks without restarting the loop on every render.
  const callbacksRef = useRef({ onPulled, onResolved });
  useEffect(() => {
    callbacksRef.current = { onPulled, onResolved };
  }, [onPulled, onResolved]);

  useEffect(() => {
    if (!pending || !userId) return;
    let cancelled = false;
    let running = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setFailureCount(0);

    const schedule = () => {
      if (cancelled) return;
      failures += 1;
      setFailureCount(failures);
      timer = setTimeout(() => { void tryOnce(); }, pendingCloudPullDelayMs(failures));
    };

    const tryOnce = async () => {
      if (cancelled || running) return;
      running = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        const { hasCloudData, hydrateLocalFromCloudWithRetry } = await import('@/services/reverseMigrationService');
        const check = await hasCloudData();
        if (cancelled) return;
        if (check.checkFailed) {
          logger.info('[usePendingCloudPull] Cloud check still failing, will retry', { failures, error: check.error });
          schedule();
          return;
        }
        if (check.hasData) {
          const hydration = await hydrateLocalFromCloudWithRetry(userId);
          if (cancelled) return;
          if (!hydration.success) {
            logger.warn('[usePendingCloudPull] Cloud pull failed, will retry', { failures, errors: hydration.errors });
            schedule();
            return;
          }
          await callbacksRef.current.onPulled();
          if (cancelled) return;
        }
        logger.info('[usePendingCloudPull] Resolved', { hadData: check.hasData });
        callbacksRef.current.onResolved(userId);
      } catch (err) {
        logger.warn('[usePendingCloudPull] Check threw, will retry', { failures, err });
        schedule();
      } finally {
        running = false;
      }
    };

    const onOnline = () => { void tryOnce(); };
    tryNowRef.current = () => { void tryOnce(); };
    window.addEventListener('online', onOnline);
    // First try at once: "Not now" / "Discard" on the pre-sign-in offer start here
    // with nothing tried yet. After a failed launch check it is one more attempt.
    void tryOnce();
    return () => {
      cancelled = true;
      tryNowRef.current = null;
      if (timer) clearTimeout(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [pending, userId]);

  const retryNow = useCallback(() => { tryNowRef.current?.(); }, []);
  return { failures: pending && userId ? failureCount : 0, retryNow };
}
