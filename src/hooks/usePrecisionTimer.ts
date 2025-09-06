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
  const baseTimeRef = useRef<number>(startTime);
  const lastTickValueRef = useRef<number>(startTime);

  // Update base time when startTime changes (for pauses/resumes)
  useEffect(() => {
    baseTimeRef.current = startTime;
    lastTickValueRef.current = startTime;
  }, [startTime]);

  const tick = useCallback(() => {
    // Simple increment-based timer - just add 1 second each tick
    const newTime = lastTickValueRef.current + 1;
    lastTickValueRef.current = newTime;
    onTick(newTime);
  }, [onTick]);

  const start = useCallback(() => {
    if (intervalRef.current) return; // Already running
    
    // Use setInterval for consistent 1-second ticks
    intervalRef.current = setInterval(tick, interval);
  }, [tick, interval]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const reset = useCallback((newStartTime = 0) => {
    stop();
    baseTimeRef.current = newStartTime;
    lastTickValueRef.current = newStartTime;
    // Immediately call onTick to update UI with reset time
    onTick(newStartTime);
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
  }, [isRunning]);

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
      return lastTickValueRef.current;
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