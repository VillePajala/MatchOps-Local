import { useState, useEffect, useCallback, useRef } from 'react';
import logger from '@/utils/logger';

const MAX_RETRY_ATTEMPTS = 5;

// Check support at module level (safe for SSR - returns false)
const checkWakeLockSupport = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  return 'wakeLock' in navigator;
};

export const useWakeLock = () => {
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);

  // Initialize support check with lazy initializer (React 19 compliant)
  const [isSupported] = useState(() => {
    const supported = checkWakeLockSupport();
    if (!supported && typeof window !== 'undefined') {
      logger.log('Screen Wake Lock API not supported.');
    }
    return supported;
  });

  // Track desired state and retry count
  const desiredActiveRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Sync wakeLockRef with wakeLock state
  useEffect(() => {
    wakeLockRef.current = wakeLock;
  }, [wakeLock]);

  // Store request function in ref to allow recursive calls without stale closures
  const requestWakeLockRef = useRef<(() => Promise<void>) | null>(null);

  // Extracted function to request wake lock with re-acquisition logic
  const requestWakeLock = useCallback(async () => {
    if (!isSupported) return;

    try {
      const lock = await navigator.wakeLock.request('screen');

      // Use { once: true } to automatically remove listener after first call
      // This prevents memory leak from accumulating listeners
      lock.addEventListener('release', () => {
        logger.log('Screen Wake Lock was released by the system.');
        setWakeLock(null);

        // Re-acquire if we still want it active AND haven't exceeded retry limit
        if (desiredActiveRef.current && retryCountRef.current < MAX_RETRY_ATTEMPTS) {
          retryCountRef.current++;
          logger.log(`Attempting to re-acquire Wake Lock (attempt ${retryCountRef.current}/${MAX_RETRY_ATTEMPTS})...`);

          // Use setTimeout to avoid rapid re-request loops
          retryTimeoutRef.current = setTimeout(() => {
            if (desiredActiveRef.current && requestWakeLockRef.current) {
              requestWakeLockRef.current();
            }
          }, 1000);
        } else if (retryCountRef.current >= MAX_RETRY_ATTEMPTS) {
          logger.warn('Wake Lock re-acquisition failed after maximum retry attempts. Giving up.');
          desiredActiveRef.current = false;
        }
      }, { once: true }); // Critical: prevents listener accumulation

      logger.log('Screen Wake Lock is active.');
      setWakeLock(lock);
      retryCountRef.current = 0; // Reset retry count on successful acquisition
    } catch (err: unknown) {
      if (err instanceof Error) {
        logger.error(`Wake Lock request failed: ${err.name}, ${err.message}`);
      }
    }
  }, [isSupported]);

  // Keep ref in sync with callback (React 19 compliant - done in effect)
  useEffect(() => {
    requestWakeLockRef.current = requestWakeLock;
  }, [requestWakeLock]);

  const syncWakeLock = useCallback(async (shouldBeActive: boolean) => {
    if (!isSupported) return;

    // Update desired state
    desiredActiveRef.current = shouldBeActive;

    // Clear any pending retry timeouts to prevent race conditions
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (shouldBeActive) {
      // Reset retry count when explicitly requesting
      retryCountRef.current = 0;

      // If we need it and don't have it, request it.
      if (wakeLockRef.current === null) {
        await requestWakeLock();
      }
    } else {
      // If we don't need it and have it, release it.
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        setWakeLock(null);
        logger.log('Screen Wake Lock released programmatically.');
      }
    }
  }, [isSupported, requestWakeLock]); // Stable dependencies - wakeLock removed

  // Handle document visibility change to re-acquire the lock if needed
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Check desiredActiveRef instead of wakeLock to avoid re-acquiring when not wanted
      if (desiredActiveRef.current && document.visibilityState === 'visible') {
        // If we want the lock and the page became visible again, re-request it
        syncWakeLock(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [syncWakeLock]); // syncWakeLock is now stable

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Release wake lock if active
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {
          // Ignore errors during cleanup
        });
      }

      // Clear any pending retry timeouts
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }

      // Reset desired state
      desiredActiveRef.current = false;
    };
  }, []); // Run only on unmount

  return { syncWakeLock, isWakeLockActive: !!wakeLock };
};
