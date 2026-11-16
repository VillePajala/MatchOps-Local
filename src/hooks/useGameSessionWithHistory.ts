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
import { debug } from '@/utils/debug';
import {
  gameSessionReducer,
  GameSessionState,
  GameSessionAction,
} from './useGameSessionReducer';
import type { AppState } from '@/types';

type ActionType = GameSessionAction['type'];

// Actions that should trigger history saves (user-initiated changes)
const HISTORY_SAVING_ACTION_TYPES = [
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
  'SET_FIELD_NUMBER',
  'SET_LOCATION_COORDS',
  'SET_GAME_TIME',
  'SET_AGE_GROUP',
  'SET_TOURNAMENT_LEVEL',
  'SET_TOURNAMENT_SERIES_ID',
  'SET_TEAM_ID',
  'SET_LEAGUE_ID',
  'SET_CUSTOM_LEAGUE_NAME',
  'SET_GAME_TYPE',
  'SET_GENDER',
  'SET_WENT_TO_OVERTIME',
  'SET_WENT_TO_PENALTIES',
  'SET_SHOW_POSITION_LABELS',
  // Re-editing a recorded shootout, positions played (Game stats), and applying or
  // reverting an AI report draft are coach edits too (review 4.2): without an entry,
  // the next Undo reverted them along with the previous action.
  'SET_SHOOTOUT_KICKS',
  'SET_PLAYER_POSITIONS',
  'APPLY_REPORT_DRAFT',
  // Players and personnel
  'SET_SELECTED_PLAYER_IDS',
  'SET_GAME_PERSONNEL',
  // Events
  'ADD_GAME_EVENT',
  'UPDATE_GAME_EVENT',
  'DELETE_GAME_EVENT',
  'DELETE_GAME_EVENT_WITH_SCORE',
  // Game flow (user-initiated)
  'CONFIRM_SUBSTITUTION',
] as const satisfies readonly ActionType[];
export const HISTORY_SAVING_ACTIONS: ReadonlySet<string> = new Set<ActionType>(HISTORY_SAVING_ACTION_TYPES);

// Actions that should NOT trigger history saves (state loads, system actions, timer)
const NO_HISTORY_ACTION_TYPES = [
  // State restoration (undo/redo, load game)
  'LOAD_STATE_FROM_HISTORY',
  'LOAD_GAME_SESSION_STATE',
  'LOAD_PERSISTED_GAME_DATA',
  'RESET_TO_INITIAL_STATE',
  'RESET_GAME_SESSION_STATE',
  // Timer system actions (automatic, not user-initiated)
  'START_TIMER',
  'SET_TIMER_ELAPSED',
  'SET_TIMER_RUNNING',
  // Resuming a loaded in-progress game (manual Start tap or boot auto-resume).
  // Continues the loaded clock/period; the undo baseline is set by resetHistory
  // after the load, so resume itself must not push a separate history entry.
  'RESUME_GAME',
  // Resets (covered by other mechanisms)
  'RESET_TIMER_AND_GAME_PROGRESS',
  'RESET_TIMER_ONLY',
  // Game status (system-managed)
  'SET_GAME_STATUS',
  // Clock and period transitions (review 4.27): undo never moves match time, so these
  // are not undo steps - they used to be invisible ones (the "Goal logged - Undo" toast
  // tapped just after the whistle undid the whistle, not the goal).
  'START_PERIOD',
  'CONTINUE_CLOCK',
  'END_PERIOD_OR_GAME',
  'PAUSE_TIMER',
] as const satisfies readonly ActionType[];
export const NO_HISTORY_ACTIONS: ReadonlySet<string> = new Set<ActionType>(NO_HISTORY_ACTION_TYPES);

/**
 * Compile-time guarantee that EVERY reducer action is categorised (review 4.2): an
 * action added to GameSessionAction but to neither list fails the type check here,
 * instead of silently skipping history in production (and crashing in dev).
 */
type UncategorizedActions = Exclude<
  ActionType,
  (typeof HISTORY_SAVING_ACTION_TYPES)[number] | (typeof NO_HISTORY_ACTION_TYPES)[number]
>;
export const ALL_ACTIONS_CATEGORIZED: [UncategorizedActions] extends [never] ? true : UncategorizedActions = true;

export type GameSessionDispatch = (action: GameSessionAction) => void;

export interface UseGameSessionWithHistoryOptions {
  buildHistorySlice: (state: GameSessionState) => Partial<AppState>;
  saveToHistory: (slice: Partial<AppState>) => void;
  /** Update the current history entry in place (no undo step), see PHASE_ACTIONS. */
  patchCurrentHistory?: (slice: Partial<AppState>) => void;
}

/**
 * Clock and period transitions are not undo steps (review 4.27), but the CURRENT
 * history entry must follow the match phase they set: undo compares an entry's
 * period/status with the live one to decide whether its sub tracking belongs to
 * this half, and field entries inherit the current entry's session fields. Without
 * this, undoing the first sub after kick-off landed on a "not started" entry and kept
 * the mistaken confirmation; after a Reset, an older entry's sub times came back.
 */
/** Actions that replace the session wholesale: an entry still pending from before is
 *  dropped, never saved over the loaded state. */
const STATE_REPLACING_ACTIONS: ReadonlySet<string> = new Set([
  'LOAD_STATE_FROM_HISTORY', 'LOAD_GAME_SESSION_STATE', 'LOAD_PERSISTED_GAME_DATA',
  'RESET_TO_INITIAL_STATE', 'RESET_GAME_SESSION_STATE',
]);

const PHASE_ACTIONS: ReadonlySet<string> = new Set([
  'START_PERIOD', 'END_PERIOD_OR_GAME', 'CONTINUE_CLOCK', 'PAUSE_TIMER', 'RESUME_GAME', 'RESET_TIMER_ONLY',
]);

/**
 * Enhanced game session reducer with automatic history management
 */
export function useGameSessionWithHistory(
  initialState: GameSessionState,
  options: UseGameSessionWithHistoryOptions
): [GameSessionState, GameSessionDispatch] {
  const { buildHistorySlice, saveToHistory, patchCurrentHistory } = options;
  // A coach action whose history entry is still to be saved (review 4.33). Looking at
  // the LAST action type alone skipped the entry when an async action (dispatched after
  // an await, e.g. deleting a goal) was followed by a clock tick before the effect ran:
  // the tick became the last action. A later undo then restored the deleted goal.
  // Set only when the action CHANGES the state (checked in dispatch with the pure
  // reducer against the last committed state): a no-op (e.g. choosing the side already
  // chosen) runs no effect, and a flag left set would turn the next tick into an undo
  // step that reverts nothing.
  const pendingHistoryRef = useRef(false);
  const [state, dispatch] = useReducer(gameSessionReducer, initialState);
  const committedStateRef = useRef(state);
  useEffect(() => { committedStateRef.current = state; }, [state]);

  // Track the last action type to determine if we should save history
  const lastActionTypeRef = useRef<string | null>(null);

  // Enhanced dispatch that tracks action types
  const enhancedDispatch: GameSessionDispatch = useCallback((action: GameSessionAction) => {
    lastActionTypeRef.current = action.type;
    if (HISTORY_SAVING_ACTIONS.has(action.type)) {
      const base = committedStateRef.current;
      if (gameSessionReducer(base, action) !== base) pendingHistoryRef.current = true;
    } else if (STATE_REPLACING_ACTIONS.has(action.type)) {
      pendingHistoryRef.current = false;
    }
    dispatch(action);
  }, [dispatch]);

  // Keep latest function refs stable to avoid effect churn when identities change upstream
  const buildHistorySliceRef = useRef(buildHistorySlice);
  const saveToHistoryRef = useRef(saveToHistory);
  const patchCurrentHistoryRef = useRef(patchCurrentHistory);
  useEffect(() => { patchCurrentHistoryRef.current = patchCurrentHistory; }, [patchCurrentHistory]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && !process.env.JEST_WORKER_ID && debug.enabled('history')) {
      // eslint-disable-next-line no-console
      console.warn('[useGameSessionWithHistory] buildHistorySlice identity changed; ensure it is memoized with useCallback');
    }
    buildHistorySliceRef.current = buildHistorySlice;
  }, [buildHistorySlice]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && !process.env.JEST_WORKER_ID && debug.enabled('history')) {
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

    // A coach action still owes its history entry - save it even if a system action
    // (a clock tick) has become the last action since.
    if (pendingHistoryRef.current) {
      pendingHistoryRef.current = false;
      saveToHistoryRef.current(buildHistorySliceRef.current(state));
      return;
    }

    // Skip if it's a non-history action - but a clock/period transition updates the
    // current entry's phase in place (see PHASE_ACTIONS).
    if (NO_HISTORY_ACTIONS.has(lastAction)) {
      if (PHASE_ACTIONS.has(lastAction)) {
        patchCurrentHistoryRef.current?.({
          currentPeriod: state.currentPeriod,
          gameStatus: state.gameStatus,
          timeElapsedInSeconds: state.timeElapsedInSeconds,
          lastSubConfirmationTimeSeconds: state.lastSubConfirmationTimeSeconds,
          completedIntervalDurations: state.completedIntervalDurations,
        });
      }
      return;
    }

    // Enforce categorization for all non-production environments (dev + tests).
    // NO_HISTORY_ACTIONS was already checked above (early return), so we only
    // need to verify the action is in HISTORY_SAVING_ACTIONS.
    if (process.env.NODE_ENV !== 'production' && !HISTORY_SAVING_ACTIONS.has(lastAction)) {
      throw new Error(
        `[useGameSessionWithHistory] Uncategorized action: "${lastAction}". ` +
          `Add to HISTORY_SAVING_ACTIONS or NO_HISTORY_ACTIONS in useGameSessionWithHistory.ts`
      );
    }


    // Don't clear the action type - it naturally gets overwritten by the next dispatch.
    // Clearing it could cause race conditions with rapid successive actions where the
    // ref gets cleared before the next effect runs, potentially missing history saves.
  }, [state]);

  return [state, enhancedDispatch];
}
