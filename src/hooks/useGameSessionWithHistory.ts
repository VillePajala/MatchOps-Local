/**
 * useGameSessionWithHistory Hook
 *
 * Wraps useGameSessionReducer with automatic history management.
 * Saves history after user actions, but NOT during undo/redo or state loads.
 *
 * This eliminates the need for isApplyingHistoryRef flag and effect-based history saving.
 *
 * Key improvements over the flag-based approach:
 * - Explicitly tracks which actions should/shouldn't save history
 * - No race conditions with effects
 * - Clear, predictable behavior
 * - Easier to debug and maintain
 *
 * @param initialState - Initial game session state
 * @param buildHistorySlice - Function to build history slice from current state
 * @param saveToHistory - Function to save state to history
 * @returns [state, enhancedDispatch] - Same API as useReducer
 */

import { useReducer, useCallback, useEffect, useRef } from 'react';
import {
  gameSessionReducer,
  GameSessionState,
  GameSessionAction,
} from './useGameSessionReducer';
import type { AppState } from '@/types';

// Actions that should trigger history saves (user-initiated changes)
const HISTORY_SAVING_ACTIONS = new Set([
  // Team and game info
  'SET_TEAM_NAME',
  'SET_OPPONENT_NAME',
  'SET_GAME_DATE',
  'SET_GAME_NOTES',
  'SET_HOME_OR_AWAY',
  // Scores
  'SET_HOME_SCORE',
  'SET_AWAY_SCORE',
  'ADJUST_SCORE_FOR_EVENT',
  // Game structure
  'SET_NUMBER_OF_PERIODS',
  'SET_PERIOD_DURATION',
  'SET_SUB_INTERVAL',
  'SET_DEMAND_FACTOR',
  // Game metadata
  'SET_SEASON_ID',
  'SET_TOURNAMENT_ID',
  'SET_GAME_LOCATION',
  'SET_GAME_TIME',
  'SET_AGE_GROUP',
  'SET_TOURNAMENT_LEVEL',
  // Players and personnel
  'SET_SELECTED_PLAYER_IDS',
  'SET_GAME_PERSONNEL',
  // Events
  'ADD_GAME_EVENT',
  'UPDATE_GAME_EVENT',
  'DELETE_GAME_EVENT',
  // Game flow (user-initiated)
  'START_PERIOD',
  'END_PERIOD_OR_GAME',
  'CONFIRM_SUBSTITUTION',
]);

// Actions that should NOT trigger history saves (state loads, system actions, timer)
const NO_HISTORY_ACTIONS = new Set([
  // State restoration (undo/redo, load game)
  'LOAD_STATE_FROM_HISTORY',
  'LOAD_GAME_SESSION_STATE',
  'LOAD_PERSISTED_GAME_DATA',
  'RESET_TO_INITIAL_STATE',
  'RESET_GAME_SESSION_STATE',
  // Timer system actions (automatic, not user-initiated)
  'START_TIMER',
  'PAUSE_TIMER',
  'SET_TIMER_ELAPSED',
  'SET_TIMER_RUNNING',
  'PAUSE_TIMER_FOR_HIDDEN',
  'RESTORE_TIMER_STATE',
  // Resets (covered by other mechanisms)
  'RESET_TIMER_AND_GAME_PROGRESS',
  'RESET_TIMER_ONLY',
  // Game status (system-managed)
  'SET_GAME_STATUS',
]);

export type GameSessionDispatch = (action: GameSessionAction) => void;

export interface UseGameSessionWithHistoryOptions {
  buildHistorySlice: (state: GameSessionState) => Partial<AppState>;
  saveToHistory: (slice: Partial<AppState>) => void;
}

/**
 * Enhanced game session reducer with automatic history management
 */
export function useGameSessionWithHistory(
  initialState: GameSessionState,
  options: UseGameSessionWithHistoryOptions
): [GameSessionState, GameSessionDispatch] {
  const { buildHistorySlice, saveToHistory } = options;
  const [state, dispatch] = useReducer(gameSessionReducer, initialState);

  // Track the last action type to determine if we should save history
  const lastActionTypeRef = useRef<string | null>(null);

  // Enhanced dispatch that tracks action types
  const enhancedDispatch: GameSessionDispatch = useCallback((action: GameSessionAction) => {
    lastActionTypeRef.current = action.type;
    dispatch(action);
  }, [dispatch]);

  // Keep latest function refs stable to avoid effect churn when identities change upstream
  const buildHistorySliceRef = useRef(buildHistorySlice);
  const saveToHistoryRef = useRef(saveToHistory);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && !process.env.JEST_WORKER_ID) {
      // Encourage memoization for performance
      // eslint-disable-next-line no-console
      console.warn('[useGameSessionWithHistory] buildHistorySlice identity changed; ensure it is memoized with useCallback');
    }
    buildHistorySliceRef.current = buildHistorySlice;
  }, [buildHistorySlice]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && !process.env.JEST_WORKER_ID) {
      // eslint-disable-next-line no-console
      console.warn('[useGameSessionWithHistory] saveToHistory identity changed; ensure it is memoized with useCallback');
    }
    saveToHistoryRef.current = saveToHistory;
  }, [saveToHistory]);

  // Effect to save history after state changes (only for user actions)
  // Note: buildHistorySliceRef/saveToHistoryRef are refs (stable),
  // kept fresh by the effects above, so they are not included in deps.
  useEffect(() => {
    const lastAction = lastActionTypeRef.current;

    // Skip if no action yet
    if (!lastAction) {
      return;
    }

    // Skip if it's a non-history action
    if (NO_HISTORY_ACTIONS.has(lastAction)) {
      return;
    }

    // Warn about uncategorized actions in development
    if (process.env.NODE_ENV !== 'production' && !process.env.JEST_WORKER_ID) {
      if (!HISTORY_SAVING_ACTIONS.has(lastAction)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[useGameSessionWithHistory] Uncategorized action: "${lastAction}". ` +
          `Add to HISTORY_SAVING_ACTIONS or NO_HISTORY_ACTIONS in useGameSessionWithHistory.ts`
        );
      }
    }

    // Only save for history-saving actions
    if (HISTORY_SAVING_ACTIONS.has(lastAction)) {
      const historySlice = buildHistorySliceRef.current(state);
      saveToHistoryRef.current(historySlice);
    }

    // Don't clear the action type - it naturally gets overwritten by the next dispatch.
    // Clearing it could cause race conditions with rapid successive actions where the
    // ref gets cleared before the next effect runs, potentially missing history saves.
  }, [state]);

  return [state, enhancedDispatch];
}
