import { useEffect, useRef } from 'react';
import logger from '@/utils/logger';
import * as Sentry from '@sentry/nextjs';

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

  // Ref to store the latest saveFunction to prevent stale closures
  // This ensures we always call the latest version even if it changes during debounce
  const saveFunctionRef = useRef(saveFunction);

  // Update ref when saveFunction changes (doesn't trigger effect re-runs)
  useEffect(() => {
    saveFunctionRef.current = saveFunction;
  }, [saveFunction]);

  /**
   * Serializes state for deep equality comparison via JSON.stringify
   *
   * Typical state sizes per tier:
   * - Immediate: ~5KB (30 game events + scores)
   * - Short: ~10KB (team names + 15 player assessments)
   * - Long: ~5KB (15 field positions + tactical drawings)
   *
   * Performance: JSON.stringify on 20KB is ~0.1-0.5ms (acceptable)
   *
   * Note: Only current game state is serialized, NOT entire database.
   * The 100+ players and 50+ saved games live in IndexedDB, not here.
   *
   * @param states - State object to serialize
   * @returns Serialized JSON string, or null if serialization fails
   * @throws Circular reference errors (caught and logged)
   */
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

      // Defensive try-catch: Assume saveFunction handles errors internally,
      // but catch any unexpected errors to prevent app crashes
      // Use async IIFE since useEffect callbacks can't be async
      (async () => {
        try {
          await saveFunctionRef.current();
        } catch (error) {
          logger.error('[useAutoSave] Unexpected error from saveFunction (immediate):', error);
          Sentry.captureException(error, {
            tags: { operation: 'auto_save_immediate', gameId: currentGameId || 'unknown' },
            extra: { trigger: 'immediate_state_change' },
          });
          // Don't re-throw - let app continue running
        }
      })();
    }

    prevImmediateRef.current = currentSerialized;
  }, [enabled, immediate, currentGameId]);

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
      shortTimerRef.current = setTimeout(async () => {
        // Double-check enabled at fire time to avoid saving while temporarily disabled (e.g., modal open)
        if (enabled) {
          logger.log(`[useAutoSave] Short-delay save triggered for game ${currentGameId}`);

          // Defensive try-catch: Assume saveFunction handles errors internally,
          // but catch any unexpected errors to prevent app crashes
          try {
            await saveFunctionRef.current();
          } catch (error) {
            logger.error('[useAutoSave] Unexpected error from saveFunction (short-delay):', error);
            Sentry.captureException(error, {
              tags: { operation: 'auto_save_short_delay', gameId: currentGameId || 'unknown' },
              extra: { trigger: 'short_delay_state_change', delay: short.delay },
            });
            // Don't re-throw - let app continue running
          }
        } else {
          logger.log('[useAutoSave] Short-delay skipped: disabled at fire time');
        }
      }, short.delay);
    }

    prevShortRef.current = currentSerialized;
  }, [enabled, short, currentGameId]);

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
      longTimerRef.current = setTimeout(async () => {
        // Double-check enabled at fire time to avoid saving while temporarily disabled (e.g., modal open)
        if (enabled) {
          logger.log(`[useAutoSave] Long-delay save triggered for game ${currentGameId}`);

          // Defensive try-catch: Assume saveFunction handles errors internally,
          // but catch any unexpected errors to prevent app crashes
          try {
            await saveFunctionRef.current();
          } catch (error) {
            logger.error('[useAutoSave] Unexpected error from saveFunction (long-delay):', error);
            Sentry.captureException(error, {
              tags: { operation: 'auto_save_long_delay', gameId: currentGameId || 'unknown' },
              extra: { trigger: 'long_delay_state_change', delay: long.delay },
            });
            // Don't re-throw - let app continue running
          }
        } else {
          logger.log('[useAutoSave] Long-delay skipped: disabled at fire time');
        }
      }, long.delay);
    }

    prevLongRef.current = currentSerialized;
  }, [enabled, long, currentGameId]);

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
