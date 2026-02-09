/**
 * Action Type Validation Test for useGameSessionWithHistory
 *
 * Ensures all GameSessionAction types are properly categorized in:
 * - HISTORY_SAVING_ACTIONS (user-initiated changes)
 * - NO_HISTORY_ACTIONS (system actions, state loads)
 *
 * Imports the actual sets from the source module to prevent drift.
 * ALL_ACTION_TYPES is maintained here as a reference copy of the reducer's
 * GameSessionAction union — if an action is added to the reducer but not here,
 * the "all action types are categorized" test will catch it (because the source
 * sets will include the new action, but ALL_ACTION_TYPES won't match).
 */

import {
  HISTORY_SAVING_ACTIONS,
  NO_HISTORY_ACTIONS,
} from '../useGameSessionWithHistory';

// All action types from GameSessionAction (extracted from useGameSessionReducer.ts)
// This must be kept in sync with the reducer's union type.
// If a new action is added to the reducer AND to HISTORY/NO_HISTORY sets but NOT here,
// the "documents expected categorization counts" test will fail.
const ALL_ACTION_TYPES = new Set([
  'LOAD_STATE_FROM_HISTORY',
  'RESET_TO_INITIAL_STATE',
  'SET_TEAM_NAME',
  'SET_OPPONENT_NAME',
  'SET_GAME_DATE',
  'SET_HOME_SCORE',
  'SET_AWAY_SCORE',
  'ADJUST_SCORE_FOR_EVENT',
  'SET_GAME_NOTES',
  'SET_HOME_OR_AWAY',
  'SET_NUMBER_OF_PERIODS',
  'SET_PERIOD_DURATION',
  'SET_GAME_STATUS',
  'START_PERIOD',
  'END_PERIOD_OR_GAME',
  'START_TIMER',
  'PAUSE_TIMER',
  'SET_SELECTED_PLAYER_IDS',
  'SET_GAME_PERSONNEL',
  'SET_SEASON_ID',
  'SET_TOURNAMENT_ID',
  'SET_LEAGUE_ID',
  'SET_CUSTOM_LEAGUE_NAME',
  'SET_GAME_TYPE',
  'SET_GENDER',
  'SET_WENT_TO_OVERTIME',
  'SET_WENT_TO_PENALTIES',
  'SET_SHOW_POSITION_LABELS',
  'SET_GAME_LOCATION',
  'SET_GAME_TIME',
  'SET_AGE_GROUP',
  'SET_TOURNAMENT_LEVEL',
  'SET_TOURNAMENT_SERIES_ID',
  'SET_TEAM_ID',
  'SET_DEMAND_FACTOR',
  'ADD_GAME_EVENT',
  'UPDATE_GAME_EVENT',
  'DELETE_GAME_EVENT',
  'DELETE_GAME_EVENT_WITH_SCORE',
  'SET_TIMER_ELAPSED',
  'SET_TIMER_RUNNING',
  'SET_SUB_INTERVAL',
  'CONFIRM_SUBSTITUTION',
  'RESET_TIMER_AND_GAME_PROGRESS',
  'RESET_TIMER_ONLY',
  'LOAD_GAME_SESSION_STATE',
  'RESET_GAME_SESSION_STATE',
  'LOAD_PERSISTED_GAME_DATA',
  'PAUSE_TIMER_FOR_HIDDEN',
  'RESTORE_TIMER_STATE',
]);

describe('useGameSessionWithHistory action type validation', () => {
  it('all action types are categorized', () => {
    const categorized = new Set([...HISTORY_SAVING_ACTIONS, ...NO_HISTORY_ACTIONS]);
    const uncategorized = [...ALL_ACTION_TYPES].filter((action) => !categorized.has(action));

    expect(uncategorized).toEqual([]);
  });

  it('no action type is in both categories', () => {
    const overlap = [...HISTORY_SAVING_ACTIONS].filter((action) => NO_HISTORY_ACTIONS.has(action));

    expect(overlap).toEqual([]);
  });

  it('all categorized actions exist in action type union', () => {
    const allCategorized = new Set([...HISTORY_SAVING_ACTIONS, ...NO_HISTORY_ACTIONS]);
    const nonExistent = [...allCategorized].filter((action) => !ALL_ACTION_TYPES.has(action));

    if (nonExistent.length > 0) {
      throw new Error(
        `These actions are categorized but don't exist in GameSessionAction: ${nonExistent.join(', ')}`
      );
    }

    expect(nonExistent).toEqual([]);
  });

  it('documents expected categorization counts', () => {
    // Total actions = HISTORY + NO_HISTORY, no gaps allowed
    expect(ALL_ACTION_TYPES.size).toBe(
      HISTORY_SAVING_ACTIONS.size + NO_HISTORY_ACTIONS.size
    );
  });
});
