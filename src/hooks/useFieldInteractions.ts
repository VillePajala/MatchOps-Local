/**
 * useFieldInteractions Hook
 *
 * Manages field interaction state (drawing mode, etc.)
 * Extracted from HomePage to reduce complexity and improve organization.
 *
 * Features:
 * - Persists drawing mode preference to IndexedDB via appSettings
 * - Loads saved preference on mount
 *
 * @returns Field interaction state and handlers
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { getDrawingModeEnabled, saveDrawingModeEnabled } from '@/utils/appSettings';
import { useAuth } from '@/contexts/AuthProvider';

export interface UseFieldInteractionsReturn {
  isDrawingEnabled: boolean;
  isPersisting: boolean;
  toggleDrawingMode: () => void;
  enableDrawingMode: () => void;
  disableDrawingMode: () => void;
}

export interface UseFieldInteractionsOptions {
  onPersistError?: (error: unknown) => void;
}

/**
 * Hook for managing soccer field interaction modes
 *
 * Currently manages:
 * - Drawing mode (enabled/disabled) - persisted to appSettings
 *
 * Future additions could include:
 * - Player placement mode
 * - Opponent placement mode
 * - Measurement mode
 */
export function useFieldInteractions(options?: UseFieldInteractionsOptions): UseFieldInteractionsReturn {
  const [isDrawingEnabled, setIsDrawingEnabled] = useState<boolean>(false);
  const [isPersisting, setIsPersisting] = useState<boolean>(false);

  // Get user ID for user-scoped storage operations
  const { user } = useAuth();
  const userId = user?.id;

  // Refs grouped together for maintainability
  const isInitialMount = useRef(true);
  const onPersistErrorRef = useRef<UseFieldInteractionsOptions['onPersistError']>(options?.onPersistError);
  const previousValueRef = useRef<boolean>(false); // Track previous value for rollback on persistence failure

  useEffect(() => {
    onPersistErrorRef.current = options?.onPersistError;
  }, [options?.onPersistError]);

  // Load saved drawing mode preference on mount (with unmount safety)
  useEffect(() => {
    let isMounted = true;
    const loadPreference = async () => {
      const saved = await getDrawingModeEnabled(userId);
      if (isMounted) {
        setIsDrawingEnabled(saved);
        previousValueRef.current = saved;
      }
    };
    loadPreference();
    return () => {
      isMounted = false;
    };
  }, [userId]);

  // Reload drawing mode preference when app returns from background (Android TWA / iOS Safari fix)
  // This prevents stale state after bfcache restoration where the preference might have
  // been changed in another tab/session or the state became inconsistent
  useEffect(() => {
    let isMounted = true;
    const handleVisibilityChange = async () => {
      if (!document.hidden && isMounted) {
        // Re-sync with IndexedDB to ensure state consistency
        const saved = await getDrawingModeEnabled(userId);
        if (isMounted) {
          setIsDrawingEnabled(saved);
          previousValueRef.current = saved;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [userId]);

  // Persist drawing mode preference to IndexedDB with rollback on failure
  // Skip initial mount to avoid redundant write (value just loaded)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      previousValueRef.current = isDrawingEnabled;
      return;
    }

    const previousValue = previousValueRef.current;
    const newValue = isDrawingEnabled;

    // Skip persistence if value hasn't changed (prevents redundant save on rollback)
    if (newValue === previousValue) return;

    let isMounted = true;
    // Attempt to persist the change
    (async () => {
      setIsPersisting(true);
      const ok = await saveDrawingModeEnabled(newValue, userId);
      if (!isMounted) {
        return;
      }

      setIsPersisting(false);

      if (!ok) {
        // Persistence failed - rollback to previous value
        setIsDrawingEnabled(previousValue);

        // Notify error handler with clearer feedback
        if (onPersistErrorRef.current) {
          onPersistErrorRef.current(
            new Error('Failed to persist drawing mode preference. Change has been reverted.')
          );
        }
      } else {
        // Success - update previous value for next change
        previousValueRef.current = newValue;
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isDrawingEnabled, userId]);

  const toggleDrawingMode = useCallback(() => {
    setIsDrawingEnabled(prev => !prev);
  }, []);

  const enableDrawingMode = useCallback(() => {
    setIsDrawingEnabled(true);
  }, []);

  const disableDrawingMode = useCallback(() => {
    setIsDrawingEnabled(false);
  }, []);

  return {
    isDrawingEnabled,
    isPersisting,
    toggleDrawingMode,
    enableDrawingMode,
    disableDrawingMode,
  };
}
