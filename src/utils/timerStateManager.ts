/**
 * Timer State Manager
 *
 * Centralizes all timer state persistence operations.
 * Uses DataStore abstraction for backend-agnostic storage.
 *
 * Timer state is ephemeral - used for:
 * - Recovering timer position when returning to hidden tab
 * - Resuming timer after tab was hidden while running
 *
 * Schema matches existing useGameTimer.ts implementation (lines 100-104, 174-179).
 */

import { getDataStore } from '@/datastore';
import logger from './logger';

/**
 * Timer state persisted to IndexedDB.
 *
 * IMPORTANT: This schema must match exactly what useGameTimer.ts expects.
 * DO NOT CHANGE without migration logic:
 * - `timestamp`: Used to calculate elapsed time while tab was hidden
 * - `wasRunning`: Only set when saving on tab hidden, determines if timer auto-resumes
 *
 * @schema-version 1.0 (December 2025)
 * @migration-required If changing this interface, add migration in src/utils/migration.ts
 */
export interface TimerState {
  /** Game ID this timer state belongs to */
  readonly gameId: string;
  /** Elapsed time in seconds when state was saved */
  readonly timeElapsedInSeconds: number;
  /** Date.now() when state was saved - used for restore calculations */
  readonly timestamp: number;
  /** True if timer was running when tab was hidden - used to decide if timer auto-resumes */
  readonly wasRunning?: boolean;
}

/**
 * Save timer state to IndexedDB.
 *
 * Called in two scenarios:
 * 1. Debounced periodic save during active timer (without wasRunning)
 * 2. Immediate save when tab becomes hidden (with wasRunning: true)
 *
 * @param state - Timer state to persist
 */
export async function saveTimerState(state: TimerState): Promise<void> {
  try {
    const dataStore = await getDataStore();
    await dataStore.saveTimerState(state);
  } catch (error) {
    // Timer state save is not critical - log and continue
    logger.debug('[timerStateManager] Failed to save timer state (non-critical)', { error });
  }
}

/**
 * Load timer state from IndexedDB.
 *
 * Used when:
 * - Tab becomes visible to restore timer position
 * - Game loads to check for existing timer state
 *
 * @returns Timer state if exists, null otherwise
 */
export async function loadTimerState(): Promise<TimerState | null> {
  try {
    const dataStore = await getDataStore();
    return await dataStore.getTimerState();
  } catch (error) {
    logger.debug('[timerStateManager] Failed to load timer state (non-critical)', { error });
    return null;
  }
}

/**
 * Clear timer state from IndexedDB.
 *
 * Called when:
 * - Timer is reset
 * - Period or game ends
 * - Loading a different game
 *
 * Silently handles errors since timer state is not critical.
 */
export async function clearTimerState(): Promise<void> {
  try {
    const dataStore = await getDataStore();
    await dataStore.clearTimerState();
  } catch (error) {
    // Timer state clear is not critical - silent fail
    logger.debug('[timerStateManager] Failed to clear timer state (non-critical)', { error });
  }
}

/**
 * Check if timer state exists in IndexedDB.
 *
 * @returns true if timer state exists, false otherwise
 */
export async function hasTimerState(): Promise<boolean> {
  const state = await loadTimerState();
  return state !== null;
}

/**
 * Load timer state only if it matches the given game ID.
 *
 * Useful for checking if there's resumable timer state for a specific game.
 *
 * @param gameId - Game ID to match
 * @returns Timer state if exists and matches game ID, null otherwise
 */
export async function loadTimerStateForGame(gameId: string): Promise<TimerState | null> {
  const state = await loadTimerState();
  if (state && state.gameId === gameId) {
    return state;
  }
  return null;
}
