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
 * Check if an error is transient and worth retrying.
 * Transient errors are temporary failures that may succeed on retry.
 */
const isTransientError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Storage quota temporarily exceeded
  if (message.includes('quota') || name.includes('quota')) return true;

  // IndexedDB locked by another tab/operation
  if (message.includes('locked') || message.includes('busy')) return true;

  // Temporary unavailable
  if (message.includes('temporarily unavailable')) return true;

  // Network errors (if syncing in future)
  if (message.includes('network') || message.includes('timeout')) return true;

  // AbortError (operation was aborted, may work on retry)
  if (name === 'aborterror') return true;

  return false;
};

/**
 * Retry a save operation with exponential backoff.
 * Only retries transient errors; permanent errors are thrown immediately.
 *
 * @param saveFn - The save function to execute
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param context - Context for logging (e.g., 'immediate', 'short-delay')
 * @returns Promise that resolves when save succeeds
 * @throws Error if all retries fail or error is not transient
 */
const saveWithRetry = async (
  saveFn: () => void | Promise<void>,
  maxRetries: number = 3,
  context: string = 'auto-save'
): Promise<void> => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await saveFn();
      return; // Success
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;
      const isTransient = isTransientError(error);

      if (!isTransient || isLastAttempt) {
        // Not transient or final attempt - give up
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      logger.debug(`[useAutoSave] ${context} retry ${attempt + 1}/${maxRetries} in ${delay}ms`);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

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

  // Ref for enabled state — checked at fire time to avoid saving while disabled
  const enabledRef = useRef(enabled);

  // Update refs when values change (doesn't trigger effect re-runs)
  useEffect(() => {
    saveFunctionRef.current = saveFunction;
  }, [saveFunction]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

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
      logger.debug(`[useAutoSave] Immediate save triggered for game ${currentGameId}`);

      // Use async IIFE since useEffect callbacks can't be async
      // Retry transient errors with exponential backoff
      (async () => {
        try {
          await saveWithRetry(saveFunctionRef.current, 3, 'immediate');
        } catch (error) {
          // All retries failed or error was not transient
          logger.error('[useAutoSave] Save failed after retries (immediate):', error);
          try {
            Sentry.captureException(error, {
              tags: { operation: 'auto_save_immediate', gameId: currentGameId || 'unknown' },
              extra: { trigger: 'immediate_state_change', retriesFailed: true },
            });
          } catch {
            // Sentry failure must not affect auto-save error handling
          }
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
        // Check enabledRef (not closure) at fire time to avoid saving while temporarily disabled
        if (enabledRef.current) {
          logger.debug(`[useAutoSave] Short-delay save triggered for game ${currentGameId}`);

          // Retry transient errors with exponential backoff
          try {
            await saveWithRetry(saveFunctionRef.current, 3, 'short-delay');
          } catch (error) {
            // All retries failed or error was not transient
            logger.error('[useAutoSave] Save failed after retries (short-delay):', error);
            try {
              Sentry.captureException(error, {
                tags: { operation: 'auto_save_short_delay', gameId: currentGameId || 'unknown' },
                extra: { trigger: 'short_delay_state_change', delay: short.delay, retriesFailed: true },
              });
            } catch {
              // Sentry failure must not affect auto-save error handling
            }
            // Don't re-throw - let app continue running
          }
        } else {
          logger.debug('[useAutoSave] Short-delay skipped: disabled at fire time');
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
        // Check enabledRef (not closure) at fire time to avoid saving while temporarily disabled
        if (enabledRef.current) {
          logger.debug(`[useAutoSave] Long-delay save triggered for game ${currentGameId}`);

          // Retry transient errors with exponential backoff
          try {
            await saveWithRetry(saveFunctionRef.current, 3, 'long-delay');
          } catch (error) {
            // All retries failed or error was not transient
            logger.error('[useAutoSave] Save failed after retries (long-delay):', error);
            try {
              Sentry.captureException(error, {
                tags: { operation: 'auto_save_long_delay', gameId: currentGameId || 'unknown' },
                extra: { trigger: 'long_delay_state_change', delay: long.delay, retriesFailed: true },
              });
            } catch {
              // Sentry failure must not affect auto-save error handling
            }
            // Don't re-throw - let app continue running
          }
        } else {
          logger.debug('[useAutoSave] Long-delay skipped: disabled at fire time');
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
