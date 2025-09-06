import { useEffect, useRef, useCallback } from 'react';

interface PrecisionTimerOptions {
  onTick: (elapsedSeconds: number) => void;
  isRunning: boolean;
  startTime?: number; // Initial elapsed time in seconds
  interval?: number; // Update interval in ms (default 100ms for precision)
}

/**
 * High-precision timer hook that uses performance.now() to avoid drift
 * Updates at configurable intervals but calculates precise elapsed time
 */
export const usePrecisionTimer = ({
  onTick,
  isRunning,
  startTime = 0,
  interval = 100
}: PrecisionTimerOptions) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimestampRef = useRef<number | null>(null);
  const initialTimeRef = useRef<number>(startTime);
  const lastTickRef = useRef<number>(Math.floor(startTime));

  // Update initial time when startTime changes and timer is not running
  useEffect(() => {
    if (!startTimestampRef.current) {
      initialTimeRef.current = startTime;
      lastTickRef.current = Math.floor(startTime);
    }
  }, [startTime]);

  const tick = useCallback(() => {
    if (!startTimestampRef.current) return;

    const now = performance.now();
    const elapsedMs = now - startTimestampRef.current;
    const preciseElapsedSeconds = initialTimeRef.current + (elapsedMs / 1000);
    const roundedSeconds = Math.floor(preciseElapsedSeconds);

    // Only call onTick when we cross a second boundary to avoid excessive updates
    if (roundedSeconds !== lastTickRef.current) {
      lastTickRef.current = roundedSeconds;
      onTick(roundedSeconds);
    }
  }, [onTick]);

  const start = useCallback(() => {
    if (startTimestampRef.current) return; // Already running

    startTimestampRef.current = performance.now();
    lastTickRef.current = Math.floor(initialTimeRef.current);

    // Single setInterval for precision checking - no requestAnimationFrame conflicts
    intervalRef.current = setInterval(tick, interval);
  }, [tick, interval]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    startTimestampRef.current = null;
  }, []);

  const reset = useCallback((newStartTime = 0) => {
    stop();
    initialTimeRef.current = newStartTime;
    lastTickRef.current = Math.floor(newStartTime);
    // Immediately call onTick to update UI with reset time
    onTick(Math.floor(newStartTime));
  }, [stop, onTick]);

  // Handle isRunning changes
  useEffect(() => {
    if (isRunning) {
      start();
    } else {
      stop();
    }

    return () => {
      stop();
    };
  }, [isRunning, start, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    start,
    stop,
    reset,
    getCurrentTime: useCallback(() => {
      if (!startTimestampRef.current) {
        return initialTimeRef.current;
      }
      const now = performance.now();
      const elapsedMs = now - startTimestampRef.current;
      return initialTimeRef.current + (elapsedMs / 1000);
    }, [])
  };
};

/**
 * Timer restoration helper for handling visibility changes
 */
export const useTimerRestore = () => {
  const handleVisibilityChange = useCallback(
    (
      savedTimestamp: number,
      currentElapsed: number,
      onRestore: (newElapsed: number) => void
    ) => {
      if (!document.hidden) {
        const now = Date.now();
        const timeSinceLastSave = (now - savedTimestamp) / 1000;
        const restoredTime = currentElapsed + timeSinceLastSave;
        onRestore(Math.floor(restoredTime));
      }
    },
    []
  );

  return { handleVisibilityChange };
};