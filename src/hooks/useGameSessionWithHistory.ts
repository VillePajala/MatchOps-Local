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

// Actions that should trigger history saves (user actions)
const HISTORY_SAVING_ACTIONS = new Set([
  'SET_TEAM_NAME',
  'SET_HOME_SCORE',
  'SET_AWAY_SCORE',
  'SET_OPPONENT_NAME',
  'INCREMENT_HOME_SCORE',
  'DECREMENT_HOME_SCORE',
  'INCREMENT_AWAY_SCORE',
  'DECREMENT_AWAY_SCORE',
  'ADD_GAME_EVENT',
  'REMOVE_GAME_EVENT',
  'START_GAME',
  'PAUSE_GAME',
  'RESUME_GAME',
  'END_GAME',
  'INCREMENT_PERIOD',
  'SET_GAME_DATE',
  'SET_GAME_NOTES',
  'SET_NUMBER_OF_PERIODS',
  'SET_PERIOD_DURATION',
  'SELECT_PLAYERS',
  'DESELECT_PLAYERS',
  'TOGGLE_PLAYER_GOALIE',
]);

// Actions that should NOT trigger history saves (state loads, system actions)
const NO_HISTORY_ACTIONS = new Set([
  'LOAD_STATE_FROM_HISTORY', // Used by undo/redo
  'LOAD_GAME', // Used when loading saved games
  'RESET_STATE', // Used when starting new game
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

    // Skip if no action yet or if it's a non-history action
    if (!lastAction || NO_HISTORY_ACTIONS.has(lastAction)) {
      return;
    }

    // Only save for history-saving actions
    if (HISTORY_SAVING_ACTIONS.has(lastAction)) {
      const historySlice = buildHistorySliceRef.current(state);
      saveToHistoryRef.current(historySlice);
    }

    // Clear the action type after processing
    lastActionTypeRef.current = null;
  }, [state]);

  return [state, enhancedDispatch];
}
