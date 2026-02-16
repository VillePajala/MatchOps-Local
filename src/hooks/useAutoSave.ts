import { useEffect, useRef } from 'react';
import logger from '@/utils/logger';
import * as Sentry from '@sentry/nextjs';
import { TRANSIENT_ERROR_PATTERNS } from '@/utils/transientErrors';

/**
 * State group configuration for auto-save
 */
interface StateGroup {
  states: Record<string, unknown>;
  delay: number; // milliseconds
}

/**
 * Check if an error is transient and worth retrying.
 * Uses shared TRANSIENT_ERROR_PATTERNS for consistency with retry modules.
 * Also checks IndexedDB-specific patterns (quota, locked, busy).
 */
const isTransientError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();
  const combined = `${name} ${message}`;

  // IndexedDB-specific: storage quota exceeded
  if (message.includes('quota') || name.includes('quota')) return true;

  // IndexedDB-specific: locked by another tab/operation
  if (message.includes('locked') || message.includes('busy')) return true;

  // Check shared transient patterns (network, timeout, abort, etc.)
  return TRANSIENT_ERROR_PATTERNS.some(pattern => combined.includes(pattern));
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
  context: string = 'auto-save',
  isCancelled?: () => boolean
): Promise<void> => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (isCancelled?.()) return; // Effect cleaned up — abort silently
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
      if (isCancelled?.()) return; // Check after delay to reduce cleanup latency
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
 * Serializes state for deep equality comparison via JSON.stringify.
 * Extracted outside the hook to avoid re-creation on every render.
 *
 * @param states - State object to serialize
 * @returns Serialized JSON string, or null if serialization fails
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

/**
 * Smart auto-save hook with tiered debouncing
 *
 * Different state changes trigger saves with different delays:
 * - immediate: Critical data (goals, scores) - saves instantly
 * - short: User-visible metadata (names, notes) - 500ms delay
 * - long: Tactical data (positions, drawings) - 2000ms delay
 *
 * IMPORTANT: Change detection uses serialized content (string comparison),
 * NOT object reference identity. This ensures debounce timers survive
 * unrelated re-renders (e.g., timer ticks that update gameSessionState
 * every second don't cancel the 2000ms position-save debounce).
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
  // Track previous serialized values for content-based change detection
  const prevImmediateRef = useRef<string | null>(null);
  const prevShortRef = useRef<string | null>(null);
  const prevLongRef = useRef<string | null>(null);

  // Debounce timers for short and long tiers
  const shortTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Always-current refs to prevent stale closures in timer callbacks
  const saveFunctionRef = useRef(saveFunction);
  const enabledRef = useRef(enabled);

  // Update refs when values change (doesn't trigger effect re-runs)
  useEffect(() => {
    saveFunctionRef.current = saveFunction;
  }, [saveFunction]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // --- Serialize state groups during render ---
  // These produce STABLE PRIMITIVE STRINGS that only change when content changes,
  // unlike the inline state group objects which are new references on every render.
  // Using these as effect dependencies ensures debounce timers are NOT cancelled
  // by unrelated re-renders (e.g., timer ticks updating gameSessionState).
  //
  // Typical sizes: ~5KB immediate, ~10KB short, ~5KB long = ~0.5ms total
  const immediateSerialized = serializeStates(immediate?.states);
  const shortSerialized = serializeStates(short?.states);
  const longSerialized = serializeStates(long?.states);

  // Extract delays as primitives for stable effect dependencies
  const shortDelay = short?.delay ?? 500;
  const longDelay = long?.delay ?? 2000;

  // --- Reset change detection on game switch ---
  // Must be declared BEFORE tier effects so it runs first in the effect queue.
  // This prevents false change detection when loading a new game (old prev vs new content).
  useEffect(() => {
    prevImmediateRef.current = null;
    prevShortRef.current = null;
    prevLongRef.current = null;
    if (shortTimerRef.current) { clearTimeout(shortTimerRef.current); shortTimerRef.current = null; }
    if (longTimerRef.current) { clearTimeout(longTimerRef.current); longTimerRef.current = null; }
  }, [currentGameId]);

  // --- Cancel pending saves when disabled ---
  useEffect(() => {
    if (!enabled) {
      if (shortTimerRef.current) { clearTimeout(shortTimerRef.current); shortTimerRef.current = null; }
      if (longTimerRef.current) { clearTimeout(longTimerRef.current); longTimerRef.current = null; }
    }
  }, [enabled]);

  // --- Immediate Save (0ms delay) ---
  // Depends on immediateSerialized (string), not the immediate object.
  // Effect only re-runs when the serialized CONTENT changes, not on every re-render.
  useEffect(() => {
    if (!enabled || immediateSerialized === null) return;

    let cancelled = false;

    // Detect content change (skip first render — prevRef is null)
    if (prevImmediateRef.current !== null && prevImmediateRef.current !== immediateSerialized) {
      logger.debug(`[useAutoSave] Immediate save triggered for game ${currentGameId}`);

      (async () => {
        try {
          await saveWithRetry(saveFunctionRef.current, 3, 'immediate', () => cancelled);
        } catch (error) {
          if (cancelled) return;
          logger.error('[useAutoSave] Save failed after retries (immediate):', error);
          try {
            Sentry.captureException(error, {
              tags: { operation: 'auto_save_immediate', gameId: currentGameId || 'unknown' },
              extra: { trigger: 'immediate_state_change', retriesFailed: true },
            });
          } catch {
            // Sentry failure must not affect auto-save error handling
          }
        }
      })();
    }

    prevImmediateRef.current = immediateSerialized;
    return () => { cancelled = true; };
  }, [enabled, immediateSerialized, currentGameId]);

  // --- Short Delay Save (500ms) ---
  // Depends on shortSerialized (string), not the short object.
  // The debounce timer survives unrelated re-renders because shortSerialized
  // only changes when the short-tier content actually changes.
  useEffect(() => {
    if (!enabled || shortSerialized === null) return;

    let cancelled = false;

    // Detect content change
    if (prevShortRef.current !== null && prevShortRef.current !== shortSerialized) {
      // Content changed — restart debounce
      if (shortTimerRef.current) {
        clearTimeout(shortTimerRef.current);
      }

      shortTimerRef.current = setTimeout(async () => {
        if (enabledRef.current && !cancelled) {
          logger.debug(`[useAutoSave] Short-delay save triggered for game ${currentGameId}`);

          try {
            await saveWithRetry(saveFunctionRef.current, 3, 'short-delay', () => cancelled);
          } catch (error) {
            if (cancelled) return;
            logger.error('[useAutoSave] Save failed after retries (short-delay):', error);
            try {
              Sentry.captureException(error, {
                tags: { operation: 'auto_save_short_delay', gameId: currentGameId || 'unknown' },
                extra: { trigger: 'short_delay_state_change', delay: shortDelay, retriesFailed: true },
              });
            } catch {
              // Sentry failure must not affect auto-save error handling
            }
          }
        } else {
          logger.debug('[useAutoSave] Short-delay skipped: disabled or cancelled at fire time');
        }
      }, shortDelay);
    }

    prevShortRef.current = shortSerialized;

    return () => {
      cancelled = true;
      // Cancel timer on content change (effect re-runs with new content).
      // Timer is NOT cancelled by unrelated re-renders because this effect
      // only re-runs when shortSerialized actually changes.
      if (shortTimerRef.current) {
        clearTimeout(shortTimerRef.current);
      }
    };
  }, [enabled, shortSerialized, shortDelay, currentGameId]);

  // --- Long Delay Save (2000ms) ---
  // Depends on longSerialized (string), not the long object.
  // This is the critical fix for player position persistence: the 2000ms debounce
  // timer now survives the every-second re-renders caused by SET_TIMER_ELAPSED,
  // because longSerialized doesn't change when only timer-related state changes.
  useEffect(() => {
    if (!enabled || longSerialized === null) return;

    let cancelled = false;

    // Detect content change
    if (prevLongRef.current !== null && prevLongRef.current !== longSerialized) {
      // Content changed — restart debounce
      if (longTimerRef.current) {
        clearTimeout(longTimerRef.current);
      }

      longTimerRef.current = setTimeout(async () => {
        if (enabledRef.current && !cancelled) {
          logger.debug(`[useAutoSave] Long-delay save triggered for game ${currentGameId}`);

          try {
            await saveWithRetry(saveFunctionRef.current, 3, 'long-delay', () => cancelled);
          } catch (error) {
            if (cancelled) return;
            logger.error('[useAutoSave] Save failed after retries (long-delay):', error);
            try {
              Sentry.captureException(error, {
                tags: { operation: 'auto_save_long_delay', gameId: currentGameId || 'unknown' },
                extra: { trigger: 'long_delay_state_change', delay: longDelay, retriesFailed: true },
              });
            } catch {
              // Sentry failure must not affect auto-save error handling
            }
          }
        } else {
          logger.debug('[useAutoSave] Long-delay skipped: disabled or cancelled at fire time');
        }
      }, longDelay);
    }

    prevLongRef.current = longSerialized;

    return () => {
      cancelled = true;
      if (longTimerRef.current) {
        clearTimeout(longTimerRef.current);
      }
    };
  }, [enabled, longSerialized, longDelay, currentGameId]);

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
};
