import { useEffect, useRef } from 'react';
import logger from '@/utils/logger';

/**
 * State group configuration for auto-save
 */
interface StateGroup {
  states: Record<string, unknown>;
  delay: number; // milliseconds
}

/**
 * Configuration for useAutoSave hook
 */
interface UseAutoSaveConfig {
  immediate?: StateGroup;  // 0ms delay - save instantly (e.g., goals, scores)
  short?: StateGroup;      // 500ms delay - user-visible metadata (e.g., names, notes)
  long?: StateGroup;       // 2000ms delay - tactical data (e.g., positions, drawings)
  saveFunction: () => void | Promise<void>;
  enabled: boolean;
  currentGameId: string | null;
}

/**
 * Smart auto-save hook with tiered debouncing
 *
 * Different state changes trigger saves with different delays:
 * - immediate: Critical data (goals, scores) - saves instantly
 * - short: User-visible metadata (names, notes) - 500ms delay
 * - long: Tactical data (positions, drawings) - 2000ms delay
 *
 * @example
 * useAutoSave({
 *   immediate: {
 *     states: { gameEvents, homeScore, awayScore },
 *     delay: 0
 *   },
 *   short: {
 *     states: { teamName, opponentName },
 *     delay: 500
 *   },
 *   long: {
 *     states: { playersOnField, drawings },
 *     delay: 2000
 *   },
 *   saveFunction: handleQuickSaveGame,
 *   enabled: currentGameId !== DEFAULT_GAME_ID,
 *   currentGameId
 * });
 */
export const useAutoSave = ({
  immediate,
  short,
  long,
  saveFunction,
  enabled,
  currentGameId,
}: UseAutoSaveConfig): void => {
  // Track previous values for each state group
  const prevImmediateRef = useRef<string | null>(null);
  const prevShortRef = useRef<string | null>(null);
  const prevLongRef = useRef<string | null>(null);

  // Debounce timers for each group
  const shortTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Serialize states for comparison (deep equality check via JSON)
  const serializeStates = (states: Record<string, unknown> | undefined): string | null => {
    if (!states) return null;
    try {
      return JSON.stringify(states);
    } catch (error) {
      logger.error('[useAutoSave] Failed to serialize states:', error);
      return null;
    }
  };

  // --- Immediate Save (0ms delay) ---
  useEffect(() => {
    if (!enabled || !immediate) return;

    const currentSerialized = serializeStates(immediate.states);
    if (currentSerialized === null) return;

    // Check if states changed
    if (prevImmediateRef.current !== null && prevImmediateRef.current !== currentSerialized) {
      logger.log(`[useAutoSave] Immediate save triggered for game ${currentGameId}`);
      saveFunction();
    }

    prevImmediateRef.current = currentSerialized;
  }, [enabled, immediate, saveFunction, currentGameId]);

  // --- Short Delay Save (500ms) ---
  useEffect(() => {
    if (!enabled || !short) return;

    const currentSerialized = serializeStates(short.states);
    if (currentSerialized === null) return;

    // Check if states changed
    if (prevShortRef.current !== null && prevShortRef.current !== currentSerialized) {
      // Clear existing timer
      if (shortTimerRef.current) {
        clearTimeout(shortTimerRef.current);
      }

      // Set new debounced timer
      shortTimerRef.current = setTimeout(() => {
        // Double-check enabled at fire time to avoid saving while temporarily disabled (e.g., modal open)
        if (enabled) {
          logger.log(`[useAutoSave] Short-delay save triggered for game ${currentGameId}`);
          saveFunction();
        } else {
          logger.log('[useAutoSave] Short-delay skipped: disabled at fire time');
        }
      }, short.delay);
    }

    prevShortRef.current = currentSerialized;
  }, [enabled, short, saveFunction, currentGameId]);

  // --- Long Delay Save (2000ms) ---
  useEffect(() => {
    if (!enabled || !long) return;

    const currentSerialized = serializeStates(long.states);
    if (currentSerialized === null) return;

    // Check if states changed
    if (prevLongRef.current !== null && prevLongRef.current !== currentSerialized) {
      // Clear existing timer
      if (longTimerRef.current) {
        clearTimeout(longTimerRef.current);
      }

      // Set new debounced timer
      longTimerRef.current = setTimeout(() => {
        // Double-check enabled at fire time to avoid saving while temporarily disabled (e.g., modal open)
        if (enabled) {
          logger.log(`[useAutoSave] Long-delay save triggered for game ${currentGameId}`);
          saveFunction();
        } else {
          logger.log('[useAutoSave] Long-delay skipped: disabled at fire time');
        }
      }, long.delay);
    }

    prevLongRef.current = currentSerialized;
  }, [enabled, long, saveFunction, currentGameId]);

  // --- Cleanup on unmount ---
  useEffect(() => {
    return () => {
      if (shortTimerRef.current) {
        clearTimeout(shortTimerRef.current);
      }
      if (longTimerRef.current) {
        clearTimeout(longTimerRef.current);
      }
    };
  }, []);

  // --- Cancel any pending saves when disabled (e.g., when a modal opens) ---
  useEffect(() => {
    if (!enabled) {
      if (shortTimerRef.current) {
        clearTimeout(shortTimerRef.current);
        shortTimerRef.current = null;
      }
      if (longTimerRef.current) {
        clearTimeout(longTimerRef.current);
        longTimerRef.current = null;
      }
    }
  }, [enabled]);
};
