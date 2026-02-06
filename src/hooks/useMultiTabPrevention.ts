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

export function useMultiTabPrevention(): { isBlocked: boolean } {
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.locks) return;

    let released = false;

    navigator.locks.request(
      'matchops-active-tab',
      { ifAvailable: true },
      (lock) => {
        if (!lock) {
          // Another tab holds the lock
          setIsBlocked(true);
          return Promise.resolve();
        }
        // We got the lock — hold it until component unmounts
        return new Promise<void>((resolve) => {
          const check = () => {
            if (released) resolve();
            else setTimeout(check, 500);
          };
          check();
        });
      }
    );

    return () => { released = true; };
  }, []);

  return { isBlocked };
}
