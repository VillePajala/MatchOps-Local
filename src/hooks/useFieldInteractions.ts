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

export interface UseFieldInteractionsReturn {
  isDrawingEnabled: boolean;
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
  const isInitialMount = useRef(true);
  const onPersistErrorRef = useRef<UseFieldInteractionsOptions['onPersistError']>(options?.onPersistError);

  useEffect(() => {
    onPersistErrorRef.current = options?.onPersistError;
  }, [options?.onPersistError]);

  // Load saved drawing mode preference on mount (with unmount safety)
  useEffect(() => {
    let isMounted = true;
    const loadPreference = async () => {
      const saved = await getDrawingModeEnabled();
      if (isMounted) {
        setIsDrawingEnabled(saved);
      }
    };
    loadPreference();
    return () => {
      isMounted = false;
    };
  }, []);

  // Persist drawing mode preference to IndexedDB
  // Skip initial mount to avoid redundant write (value just loaded)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    (async () => {
      const ok = await saveDrawingModeEnabled(isDrawingEnabled);
      if (!ok && onPersistErrorRef.current) {
        onPersistErrorRef.current(new Error('Failed to persist drawing mode preference'));
      }
    })();
  }, [isDrawingEnabled]);

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
    toggleDrawingMode,
    enableDrawingMode,
    disableDrawingMode,
  };
}
