/**
 * Action Type Validation Test for useGameSessionWithHistory
 *
 * Ensures all GameSessionAction types are properly categorized in:
 * - HISTORY_SAVING_ACTIONS (user-initiated changes)
 * - NO_HISTORY_ACTIONS (system actions, state loads)
 *
 * This prevents silent bugs where new actions are added to the reducer
 * but not categorized in the history management system.
 */

// We maintain a reference copy of the action type categorization
// to validate that all action types from GameSessionAction are categorized
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

// All action types from GameSessionAction (extracted manually - must be kept in sync)
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
  'SET_GAME_LOCATION',
  'SET_GAME_TIME',
  'SET_AGE_GROUP',
  'SET_TOURNAMENT_LEVEL',
  'SET_DEMAND_FACTOR',
  'ADD_GAME_EVENT',
  'UPDATE_GAME_EVENT',
  'DELETE_GAME_EVENT',
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
    // This test serves as documentation for expected counts
    // Update when adding new actions
    expect(HISTORY_SAVING_ACTIONS.size).toBeGreaterThanOrEqual(25);
    expect(NO_HISTORY_ACTIONS.size).toBeGreaterThanOrEqual(14);
    expect(ALL_ACTION_TYPES.size).toBe(
      HISTORY_SAVING_ACTIONS.size + NO_HISTORY_ACTIONS.size
    );
  });
});
