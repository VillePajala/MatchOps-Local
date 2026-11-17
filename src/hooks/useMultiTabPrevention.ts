/**
 * Prevents multi-tab usage via the Web Locks API.
 *
 * Acquires an exclusive lock ('matchops-active-tab') on mount.
 * If another tab already holds the lock, returns isBlocked: true
 * so the caller can show a blocking screen.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
 */

import { useState, useEffect } from 'react';
import { setTabOwnership, type TabOwnership } from '@/utils/tabOwnership';

/**
 * `status` (review 7.19): the data layer must wait for 'owner' (or 'unsupported'),
 * so a blocked tab stays completely passive. Also published to tabOwnership for
 * code outside React (the data-store factory).
 */
export function useMultiTabPrevention(): { isBlocked: boolean; status: TabOwnership } {
  const [status, setStatus] = useState<TabOwnership>('pending');
  const isBlocked = status === 'blocked';

  useEffect(() => {
    let answered = false;
    const publish = (value: TabOwnership) => {
      answered = true;
      setStatus(value);
      setTabOwnership(value);
    };
    if (typeof navigator === 'undefined' || !navigator.locks) {
      publish('unsupported');
      return;
    }

    let released = false;
    // Releases the held lock at once on unmount (it used to poll every 500 ms).
    let releaseLock: (() => void) | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    // A "not available" answer is asked once more before the app is blocked (review
    // 10.9c): under React StrictMode (development) the first mount's request is
    // granted only after its cleanup, so the second mount's request saw that lock
    // still held and showed "MatchOps is already open" in a single tab. Another real
    // tab holds the lock for as long as it is open, so it is still blocked.
    const RECHECK_DELAY_MS = 300;
    const attempt = (isRetry: boolean) => {
      navigator.locks.request(
        'matchops-active-tab',
        { ifAvailable: true },
        (lock) => {
          if (released) return Promise.resolve(); // unmounted meanwhile: publish nothing
          if (!lock) {
            if (isRetry) publish('blocked');
            else retryTimer = setTimeout(() => { if (!released) attempt(true); }, RECHECK_DELAY_MS);
            return Promise.resolve();
          }
          publish('owner');
          // We got the lock — hold it until component unmounts
          return new Promise<void>((resolve) => {
            releaseLock = resolve;
          });
        }
      ).catch(() => {
        // Web Locks API failure is non-critical — app works without multi-tab prevention.
        // Only if the lock never answered: a late failure must not overwrite owner/blocked.
        if (!answered && !released) publish('unsupported');
      });
    };
    attempt(false);

    return () => {
      released = true;
      if (retryTimer) clearTimeout(retryTimer);
      releaseLock?.();
    };
  }, []);

  return { isBlocked, status };
}
