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

import { useState, useCallback, useEffect } from 'react';
import { getDrawingModeEnabled, saveDrawingModeEnabled } from '@/utils/appSettings';

export interface UseFieldInteractionsReturn {
  isDrawingEnabled: boolean;
  toggleDrawingMode: () => void;
  enableDrawingMode: () => void;
  disableDrawingMode: () => void;
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
export function useFieldInteractions(): UseFieldInteractionsReturn {
  const [isDrawingEnabled, setIsDrawingEnabled] = useState<boolean>(false);

  // Load saved drawing mode preference on mount
  useEffect(() => {
    const loadPreference = async () => {
      const saved = await getDrawingModeEnabled();
      setIsDrawingEnabled(saved);
    };
    loadPreference();
  }, []);

  // Save preference when it changes
  useEffect(() => {
    saveDrawingModeEnabled(isDrawingEnabled);
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
