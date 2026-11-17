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

    navigator.locks.request(
      'matchops-active-tab',
      { ifAvailable: true },
      (lock) => {
        if (!lock) {
          // Another tab holds the lock
          publish('blocked');
          return Promise.resolve();
        }
        publish('owner');
        // We got the lock — hold it until component unmounts
        return new Promise<void>((resolve) => {
          const check = () => {
            if (released) resolve();
            else setTimeout(check, 500);
          };
          check();
        });
      }
    ).catch(() => {
      // Web Locks API failure is non-critical — app works without multi-tab prevention.
      // Only if the lock never answered: a late failure must not overwrite owner/blocked.
      if (!answered) publish('unsupported');
    });

    return () => { released = true; };
  }, []);

  return { isBlocked, status };
}
