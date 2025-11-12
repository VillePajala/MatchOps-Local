/**
 * useFieldInteractions Hook
 *
 * Manages field interaction state (drawing mode, etc.)
 * Extracted from HomePage to reduce complexity and improve organization.
 *
 * @returns Field interaction state and handlers
 */

import { useState, useCallback } from 'react';

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
 * - Drawing mode (enabled/disabled)
 *
 * Future additions could include:
 * - Player placement mode
 * - Opponent placement mode
 * - Measurement mode
 */
export function useFieldInteractions(): UseFieldInteractionsReturn {
  const [isDrawingEnabled, setIsDrawingEnabled] = useState<boolean>(false);

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
