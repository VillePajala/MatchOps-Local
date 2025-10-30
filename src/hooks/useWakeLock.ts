import { useState, useEffect, useCallback, useRef } from 'react';
import logger from '@/utils/logger';

export const useWakeLock = () => {
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const desiredActiveRef = useRef(false); // Track if we WANT the lock to be active

  useEffect(() => {
    // Check for support once on mount
    const supported = 'wakeLock' in navigator;
    setIsSupported(supported);
    if (!supported) {
      logger.log('Screen Wake Lock API not supported.');
    }
  }, []);

  // Extracted function to request wake lock with re-acquisition logic
  const requestWakeLock = useCallback(async () => {
    if (!isSupported) return;

    try {
      const lock = await navigator.wakeLock.request('screen');

      lock.addEventListener('release', () => {
        logger.log('Screen Wake Lock was released by the system.');
        setWakeLock(null);

        // Re-acquire if we still want it active (e.g., timer still running)
        if (desiredActiveRef.current) {
          logger.log('Attempting to re-acquire Wake Lock after system release...');
          // Use setTimeout to avoid rapid re-request loops in case of repeated failures
          setTimeout(() => {
            if (desiredActiveRef.current) {
              requestWakeLock();
            }
          }, 1000);
        }
      });

      logger.log('Screen Wake Lock is active.');
      setWakeLock(lock);
    } catch (err: unknown) {
      if (err instanceof Error) {
        logger.error(`Wake Lock request failed: ${err.name}, ${err.message}`);
      }
    }
  }, [isSupported]);

  const syncWakeLock = useCallback(async (shouldBeActive: boolean) => {
    if (!isSupported) return;

    // Update desired state
    desiredActiveRef.current = shouldBeActive;

    if (shouldBeActive) {
      // If we need it and don't have it, request it.
      if (wakeLock === null) {
        await requestWakeLock();
      }
    } else {
      // If we don't need it and have it, release it.
      if (wakeLock) {
        await wakeLock.release();
        setWakeLock(null);
        logger.log('Screen Wake Lock released programmatically.');
      }
    }
  }, [isSupported, wakeLock, requestWakeLock]);

  // Handle document visibility change to re-acquire the lock if needed
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (wakeLock && document.visibilityState === 'visible') {
        // If we had a lock and the page became visible again, re-request it
        syncWakeLock(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [wakeLock, syncWakeLock]);


  return { syncWakeLock, isWakeLockActive: !!wakeLock };
}; 