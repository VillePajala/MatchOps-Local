/**
 * Tests for useGameSessionReducer.ts - Core game session state management
 * @critical - Manages all game session state (timer, score, events, periods)
 *
 * Tests cover all 30+ action types with valid/invalid payloads,
 * edge cases, and state transitions.
 */

import {
  gameSessionReducer,
  GameSessionState,
  GameSessionAction,
  initialGameSessionStatePlaceholder,
} from './useGameSessionReducer';
import { GameEvent } from '@/types';

// Mock logger to prevent console output during tests
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('gameSessionReducer', () => {
  // Helper to create a base state for testing
  const createBaseState = (overrides: Partial<GameSessionState> = {}): GameSessionState => ({
    ...initialGameSessionStatePlaceholder,
    teamName: 'Test Team',
    opponentName: 'Opponent Team',
    gameDate: '2025-01-15',
    homeScore: 0,
    awayScore: 0,
    gameNotes: '',
    homeOrAway: 'home',
    numberOfPeriods: 2,
    periodDurationMinutes: 15,
    currentPeriod: 1,
    gameStatus: 'notStarted',
    selectedPlayerIds: [],
    gamePersonnel: [],
    seasonId: '',
    tournamentId: '',
    gameLocation: 'Test Stadium',
    gameTime: '15:00',
    demandFactor: 1,
    gameEvents: [],
    timeElapsedInSeconds: 0,
    startTimestamp: null,
    isTimerRunning: false,
    subIntervalMinutes: 5,
    nextSubDueTimeSeconds: 300,
    subAlertLevel: 'none',
    lastSubConfirmationTimeSeconds: 0,
    completedIntervalDurations: [],
    showPlayerNames: true,
    ...overrides,
  });

  // Helper to create a game event
  const createGameEvent = (overrides: Partial<GameEvent> = {}): GameEvent => ({
    id: `event-${Date.now()}`,
    type: 'goal',
    scorerId: 'player-1',
    time: 300,
    ...overrides,
  });

  // ============================================
  // LOAD_STATE_FROM_HISTORY / LOAD_GAME_SESSION_STATE
  // ============================================
  describe('LOAD_STATE_FROM_HISTORY', () => {
    it('should merge partial state into existing state', () => {
      const state = createBaseState();
      const action: GameSessionAction = {
        type: 'LOAD_STATE_FROM_HISTORY',
        payload: { teamName: 'New Team Name', homeScore: 3 },
      };

      const result = gameSessionReducer(state, action);

      expect(result.teamName).toBe('New Team Name');
      expect(result.homeScore).toBe(3);
      expect(result.opponentName).toBe('Opponent Team'); // Unchanged
    });

    it('should handle empty payload', () => {
      const state = createBaseState();
      const action: GameSessionAction = {
        type: 'LOAD_STATE_FROM_HISTORY',
        payload: {},
      };

      const result = gameSessionReducer(state, action);

      expect(result).toEqual(state);
    });
  });

  describe('LOAD_GAME_SESSION_STATE', () => {
    it('should merge partial state like LOAD_STATE_FROM_HISTORY', () => {
      const state = createBaseState();
      const action: GameSessionAction = {
        type: 'LOAD_GAME_SESSION_STATE',
        payload: { awayScore: 2, gameStatus: 'inProgress' },
      };

      const result = gameSessionReducer(state, action);

      expect(result.awayScore).toBe(2);
      expect(result.gameStatus).toBe('inProgress');
    });
  });

  // ============================================
  // RESET_TO_INITIAL_STATE / RESET_GAME_SESSION_STATE
  // ============================================
  describe('RESET_TO_INITIAL_STATE', () => {
    it('should completely replace state with payload', () => {
      const state = createBaseState({ homeScore: 5, awayScore: 3 });
      const newState = createBaseState({ teamName: 'Fresh Team' });
      const action: GameSessionAction = {
        type: 'RESET_TO_INITIAL_STATE',
        payload: newState,
      };

      const result = gameSessionReducer(state, action);

      expect(result).toEqual(newState);
      expect(result.homeScore).toBe(0);
      expect(result.teamName).toBe('Fresh Team');
    });
  });

  describe('RESET_GAME_SESSION_STATE', () => {
    it('should completely replace state with payload', () => {
      const state = createBaseState({ gameEvents: [createGameEvent()] });
      const newState = createBaseState();
      const action: GameSessionAction = {
        type: 'RESET_GAME_SESSION_STATE',
        payload: newState,
      };

      const result = gameSessionReducer(state, action);

      expect(result).toEqual(newState);
      expect(result.gameEvents).toHaveLength(0);
    });
  });

  // ============================================
  // Simple Setters
  // ============================================
  describe('SET_TEAM_NAME', () => {
    it('should update team name', () => {
      const state = createBaseState();
      const action: GameSessionAction = { type: 'SET_TEAM_NAME', payload: 'New Team' };

      const result = gameSessionReducer(state, action);

      expect(result.teamName).toBe('New Team');
    });

    it('should handle empty string', () => {
      const state = createBaseState({ teamName: 'Test Team' });
      const action: GameSessionAction = { type: 'SET_TEAM_NAME', payload: '' };

      const result = gameSessionReducer(state, action);

      expect(result.teamName).toBe('');
    });
  });

  describe('SET_OPPONENT_NAME', () => {
    it('should update opponent name', () => {
      const state = createBaseState();
      const action: GameSessionAction = { type: 'SET_OPPONENT_NAME', payload: 'Rival Team' };

      const result = gameSessionReducer(state, action);

      expect(result.opponentName).toBe('Rival Team');
    });
  });

  describe('SET_GAME_DATE', () => {
    it('should update game date', () => {
      const state = createBaseState();
      const action: GameSessionAction = { type: 'SET_GAME_DATE', payload: '2025-06-15' };

      const result = gameSessionReducer(state, action);

      expect(result.gameDate).toBe('2025-06-15');
    });
  });

  describe('SET_HOME_SCORE', () => {
    it('should update home score', () => {
      const state = createBaseState();
      const action: GameSessionAction = { type: 'SET_HOME_SCORE', payload: 5 };

      const result = gameSessionReducer(state, action);

      expect(result.homeScore).toBe(5);
    });

    it('should allow zero score', () => {
      const state = createBaseState({ homeScore: 3 });
      const action: GameSessionAction = { type: 'SET_HOME_SCORE', payload: 0 };

      const result = gameSessionReducer(state, action);

      expect(result.homeScore).toBe(0);
    });
  });

  describe('SET_AWAY_SCORE', () => {
    it('should update away score', () => {
      const state = createBaseState();
      const action: GameSessionAction = { type: 'SET_AWAY_SCORE', payload: 2 };

      const result = gameSessionReducer(state, action);

      expect(result.awayScore).toBe(2);
    });
  });

  describe('SET_GAME_NOTES', () => {
    it('should update game notes', () => {
      const state = createBaseState();
      const action: GameSessionAction = { type: 'SET_GAME_NOTES', payload: 'Great game!' };

      const result = gameSessionReducer(state, action);

      expect(result.gameNotes).toBe('Great game!');
    });
  });

  describe('SET_NUMBER_OF_PERIODS', () => {
    it('should set to 1 period', () => {
      const state = createBaseState({ numberOfPeriods: 2 });
      const action: GameSessionAction = { type: 'SET_NUMBER_OF_PERIODS', payload: 1 };

      const result = gameSessionReducer(state, action);

      expect(result.numberOfPeriods).toBe(1);
    });

    it('should set to 2 periods', () => {
      const state = createBaseState({ numberOfPeriods: 1 });
      const action: GameSessionAction = { type: 'SET_NUMBER_OF_PERIODS', payload: 2 };

      const result = gameSessionReducer(state, action);

      expect(result.numberOfPeriods).toBe(2);
    });
  });

  describe('SET_PERIOD_DURATION', () => {
    it('should update period duration', () => {
      const state = createBaseState();
      const action: GameSessionAction = { type: 'SET_PERIOD_DURATION', payload: 20 };

      const result = gameSessionReducer(state, action);

      expect(result.periodDurationMinutes).toBe(20);
    });
  });

  describe('SET_GAME_STATUS', () => {
    it('should update game status to inProgress', () => {
      const state = createBaseState();
      const action: GameSessionAction = { type: 'SET_GAME_STATUS', payload: 'inProgress' };

      const result = gameSessionReducer(state, action);

      expect(result.gameStatus).toBe('inProgress');
    });

    it('should update game status to gameEnd', () => {
      const state = createBaseState({ gameStatus: 'inProgress' });
      const action: GameSessionAction = { type: 'SET_GAME_STATUS', payload: 'gameEnd' };

      const result = gameSessionReducer(state, action);

      expect(result.gameStatus).toBe('gameEnd');
    });
  });

  describe('SET_SELECTED_PLAYER_IDS', () => {
    it('should update selected player IDs', () => {
      const state = createBaseState();
      const action: GameSessionAction = {
        type: 'SET_SELECTED_PLAYER_IDS',
        payload: ['player-1', 'player-2'],
      };

      const result = gameSessionReducer(state, action);

      expect(result.selectedPlayerIds).toEqual(['player-1', 'player-2']);
    });

    it('should handle empty array', () => {
      const state = createBaseState({ selectedPlayerIds: ['player-1'] });
      const action: GameSessionAction = { type: 'SET_SELECTED_PLAYER_IDS', payload: [] };

      const result = gameSessionReducer(state, action);

      expect(result.selectedPlayerIds).toEqual([]);
    });
  });

  describe('SET_GAME_PERSONNEL', () => {
    it('should update game personnel', () => {
      const state = createBaseState();
      const action: GameSessionAction = {
        type: 'SET_GAME_PERSONNEL',
        payload: ['coach-1', 'ref-1'],
      };

      const result = gameSessionReducer(state, action);

      expect(result.gamePersonnel).toEqual(['coach-1', 'ref-1']);
    });
  });

  describe('SET_GAME_LOCATION', () => {
    it('should update game location', () => {
      const state = createBaseState();
      const action: GameSessionAction = { type: 'SET_GAME_LOCATION', payload: 'Away Stadium' };

      const result = gameSessionReducer(state, action);

      expect(result.gameLocation).toBe('Away Stadium');
    });
  });

  describe('SET_GAME_TIME', () => {
    it('should update game time', () => {
      const state = createBaseState();
      const action: GameSessionAction = { type: 'SET_GAME_TIME', payload: '18:30' };

      const result = gameSessionReducer(state, action);

      expect(result.gameTime).toBe('18:30');
    });
  });

  describe('SET_AGE_GROUP', () => {
    it('should update age group', () => {
      const state = createBaseState();
      const action: GameSessionAction = { type: 'SET_AGE_GROUP', payload: 'U15' };

      const result = gameSessionReducer(state, action);

      expect(result.ageGroup).toBe('U15');
    });
  });

  describe('SET_TOURNAMENT_LEVEL', () => {
    it('should update tournament level', () => {
      const state = createBaseState();
      const action: GameSessionAction = { type: 'SET_TOURNAMENT_LEVEL', payload: 'Division 1' };

      const result = gameSessionReducer(state, action);

      expect(result.tournamentLevel).toBe('Division 1');
    });
  });

  describe('SET_DEMAND_FACTOR', () => {
    it('should update demand factor', () => {
      const state = createBaseState();
      const action: GameSessionAction = { type: 'SET_DEMAND_FACTOR', payload: 1.5 };

      const result = gameSessionReducer(state, action);

      expect(result.demandFactor).toBe(1.5);
    });
  });

  /**
   * @critical Timer is essential for game flow
   */
  describe('SET_TIMER_RUNNING', () => {
    it('should set timer running to true', () => {
      const state = createBaseState({ isTimerRunning: false });
      const action: GameSessionAction = { type: 'SET_TIMER_RUNNING', payload: true };

      const result = gameSessionReducer(state, action);

      expect(result.isTimerRunning).toBe(true);
    });

    it('should set timer running to false', () => {
      const state = createBaseState({ isTimerRunning: true });
      const action: GameSessionAction = { type: 'SET_TIMER_RUNNING', payload: false };

      const result = gameSessionReducer(state, action);

      expect(result.isTimerRunning).toBe(false);
    });
  });

  // ============================================
  // Season/Tournament Mutual Exclusivity
  // ============================================
  /**
   * @integration Tests mutual exclusivity between season and tournament
   */
  describe('SET_SEASON_ID', () => {
    it('should set season and clear tournament (mutual exclusivity)', () => {
      const state = createBaseState({ tournamentId: 'tournament-1', seasonId: '' });
      const action: GameSessionAction = { type: 'SET_SEASON_ID', payload: 'season-1' };

      const result = gameSessionReducer(state, action);

      expect(result.seasonId).toBe('season-1');
      expect(result.tournamentId).toBe(''); // Cleared
    });

    it('should not clear tournament when setting empty season', () => {
      const state = createBaseState({ tournamentId: 'tournament-1', seasonId: 'season-1' });
      const action: GameSessionAction = { type: 'SET_SEASON_ID', payload: '' };

      const result = gameSessionReducer(state, action);

      expect(result.seasonId).toBe('');
      expect(result.tournamentId).toBe('tournament-1'); // Unchanged
    });
  });

  describe('SET_TOURNAMENT_ID', () => {
    it('should set tournament and clear season (mutual exclusivity)', () => {
      const state = createBaseState({ seasonId: 'season-1', tournamentId: '' });
      const action: GameSessionAction = { type: 'SET_TOURNAMENT_ID', payload: 'tournament-1' };

      const result = gameSessionReducer(state, action);

      expect(result.tournamentId).toBe('tournament-1');
      expect(result.seasonId).toBe(''); // Cleared
    });

    it('should not clear season when setting empty tournament', () => {
      const state = createBaseState({ seasonId: 'season-1', tournamentId: 'tournament-1' });
      const action: GameSessionAction = { type: 'SET_TOURNAMENT_ID', payload: '' };

      const result = gameSessionReducer(state, action);

      expect(result.tournamentId).toBe('');
      expect(result.seasonId).toBe('season-1'); // Unchanged
    });
  });

  // ============================================
  // ADJUST_SCORE_FOR_EVENT
  // ============================================
  /**
   * @critical Core scoring logic
   */
  describe('ADJUST_SCORE_FOR_EVENT', () => {
    describe('when playing at home', () => {
      it('should increment home score for goal add', () => {
        const state = createBaseState({ homeOrAway: 'home', homeScore: 0 });
        const action: GameSessionAction = {
          type: 'ADJUST_SCORE_FOR_EVENT',
          payload: { eventType: 'goal', action: 'add' },
        };

        const result = gameSessionReducer(state, action);

        expect(result.homeScore).toBe(1);
        expect(result.awayScore).toBe(0);
      });

      it('should decrement home score for goal delete', () => {
        const state = createBaseState({ homeOrAway: 'home', homeScore: 2 });
        const action: GameSessionAction = {
          type: 'ADJUST_SCORE_FOR_EVENT',
          payload: { eventType: 'goal', action: 'delete' },
        };

        const result = gameSessionReducer(state, action);

        expect(result.homeScore).toBe(1);
      });

      it('should increment away score for opponentGoal add', () => {
        const state = createBaseState({ homeOrAway: 'home', awayScore: 0 });
        const action: GameSessionAction = {
          type: 'ADJUST_SCORE_FOR_EVENT',
          payload: { eventType: 'opponentGoal', action: 'add' },
        };

        const result = gameSessionReducer(state, action);

        expect(result.awayScore).toBe(1);
        expect(result.homeScore).toBe(0);
      });

      it('should not allow negative scores', () => {
        const state = createBaseState({ homeOrAway: 'home', homeScore: 0 });
        const action: GameSessionAction = {
          type: 'ADJUST_SCORE_FOR_EVENT',
          payload: { eventType: 'goal', action: 'delete' },
        };

        const result = gameSessionReducer(state, action);

        expect(result.homeScore).toBe(0); // Clamped at 0
      });
    });

    describe('when playing away', () => {
      it('should increment away score for goal add', () => {
        const state = createBaseState({ homeOrAway: 'away', awayScore: 0 });
        const action: GameSessionAction = {
          type: 'ADJUST_SCORE_FOR_EVENT',
          payload: { eventType: 'goal', action: 'add' },
        };

        const result = gameSessionReducer(state, action);

        expect(result.awayScore).toBe(1);
        expect(result.homeScore).toBe(0);
      });

      it('should increment home score for opponentGoal add', () => {
        const state = createBaseState({ homeOrAway: 'away', homeScore: 0 });
        const action: GameSessionAction = {
          type: 'ADJUST_SCORE_FOR_EVENT',
          payload: { eventType: 'opponentGoal', action: 'add' },
        };

        const result = gameSessionReducer(state, action);

        expect(result.homeScore).toBe(1);
      });
    });
  });

  // ============================================
  // SET_HOME_OR_AWAY (score swapping)
  // ============================================
  describe('SET_HOME_OR_AWAY', () => {
    it('should swap scores when changing from home to away', () => {
      const state = createBaseState({ homeOrAway: 'home', homeScore: 3, awayScore: 1 });
      const action: GameSessionAction = { type: 'SET_HOME_OR_AWAY', payload: 'away' };

      const result = gameSessionReducer(state, action);

      expect(result.homeOrAway).toBe('away');
      expect(result.homeScore).toBe(1); // Was awayScore
      expect(result.awayScore).toBe(3); // Was homeScore
    });

    it('should swap scores when changing from away to home', () => {
      const state = createBaseState({ homeOrAway: 'away', homeScore: 2, awayScore: 4 });
      const action: GameSessionAction = { type: 'SET_HOME_OR_AWAY', payload: 'home' };

      const result = gameSessionReducer(state, action);

      expect(result.homeOrAway).toBe('home');
      expect(result.homeScore).toBe(4);
      expect(result.awayScore).toBe(2);
    });

    it('should not change state when setting same value', () => {
      const state = createBaseState({ homeOrAway: 'home', homeScore: 3, awayScore: 1 });
      const action: GameSessionAction = { type: 'SET_HOME_OR_AWAY', payload: 'home' };

      const result = gameSessionReducer(state, action);

      expect(result).toBe(state); // Same reference
    });
  });

  // ============================================
  // START_PERIOD
  // ============================================
  describe('START_PERIOD', () => {
    it('should start first period correctly', () => {
      const state = createBaseState({ gameStatus: 'notStarted', currentPeriod: 1 });
      const action: GameSessionAction = {
        type: 'START_PERIOD',
        payload: { nextPeriod: 1, periodDurationMinutes: 15, subIntervalMinutes: 5 },
      };

      const result = gameSessionReducer(state, action);

      expect(result.currentPeriod).toBe(1);
      expect(result.gameStatus).toBe('inProgress');
      expect(result.timeElapsedInSeconds).toBe(0);
      expect(result.isTimerRunning).toBe(true);
      expect(result.lastSubConfirmationTimeSeconds).toBe(0);
      expect(result.nextSubDueTimeSeconds).toBe(300); // 5 * 60
      expect(result.subAlertLevel).toBe('none');
      expect(result.completedIntervalDurations).toEqual([]);
      expect(result.startTimestamp).not.toBeNull();
    });

    it('should start second period with correct time offset', () => {
      const state = createBaseState({
        gameStatus: 'periodEnd',
        currentPeriod: 1,
        periodDurationMinutes: 15,
        completedIntervalDurations: [{ period: 1, duration: 300, timestamp: 900 }],
      });
      const action: GameSessionAction = {
        type: 'START_PERIOD',
        payload: { nextPeriod: 2, periodDurationMinutes: 15, subIntervalMinutes: 5 },
      };

      const result = gameSessionReducer(state, action);

      expect(result.currentPeriod).toBe(2);
      expect(result.gameStatus).toBe('inProgress');
      expect(result.timeElapsedInSeconds).toBe(900); // (2-1) * 15 * 60
      expect(result.lastSubConfirmationTimeSeconds).toBe(900);
      expect(result.nextSubDueTimeSeconds).toBe(1200); // 900 + 300
      // Should preserve completed intervals from period 1
      expect(result.completedIntervalDurations).toHaveLength(1);
    });

    it('should reset completed intervals for first period', () => {
      const state = createBaseState({
        completedIntervalDurations: [{ period: 1, duration: 100, timestamp: 100 }],
      });
      const action: GameSessionAction = {
        type: 'START_PERIOD',
        payload: { nextPeriod: 1, periodDurationMinutes: 15, subIntervalMinutes: 5 },
      };

      const result = gameSessionReducer(state, action);

      expect(result.completedIntervalDurations).toEqual([]);
    });
  });

  // ============================================
  // END_PERIOD_OR_GAME
  // ============================================
  describe('END_PERIOD_OR_GAME', () => {
    it('should end period correctly', () => {
      const state = createBaseState({
        gameStatus: 'inProgress',
        isTimerRunning: true,
        timeElapsedInSeconds: 880,
        startTimestamp: Date.now() - 10000,
        nextSubDueTimeSeconds: 900,
      });
      const action: GameSessionAction = {
        type: 'END_PERIOD_OR_GAME',
        payload: { newStatus: 'periodEnd', finalTime: 900 },
      };

      const result = gameSessionReducer(state, action);

      expect(result.gameStatus).toBe('periodEnd');
      expect(result.isTimerRunning).toBe(false);
      expect(result.timeElapsedInSeconds).toBe(900);
      expect(result.startTimestamp).toBeNull();
      expect(result.subAlertLevel).toBe('due'); // Time >= nextSubDueTimeSeconds
    });

    it('should end game correctly', () => {
      const state = createBaseState({
        gameStatus: 'inProgress',
        isTimerRunning: true,
        currentPeriod: 2,
        timeElapsedInSeconds: 1750,
        startTimestamp: Date.now() - 50000,
      });
      const action: GameSessionAction = {
        type: 'END_PERIOD_OR_GAME',
        payload: { newStatus: 'gameEnd', finalTime: 1800 },
      };

      const result = gameSessionReducer(state, action);

      expect(result.gameStatus).toBe('gameEnd');
      expect(result.isTimerRunning).toBe(false);
      expect(result.timeElapsedInSeconds).toBe(1800);
    });

    it('should use current time if finalTime not provided', () => {
      const state = createBaseState({
        gameStatus: 'inProgress',
        isTimerRunning: true,
        timeElapsedInSeconds: 500,
        startTimestamp: Date.now(),
      });
      const action: GameSessionAction = {
        type: 'END_PERIOD_OR_GAME',
        payload: { newStatus: 'periodEnd' },
      };

      const result = gameSessionReducer(state, action);

      expect(result.timeElapsedInSeconds).toBe(500); // Uses state value
    });
  });

  // ============================================
  // START_TIMER / PAUSE_TIMER
  // ============================================
  describe('START_TIMER', () => {
    it('should start timer if not already running', () => {
      const state = createBaseState({ isTimerRunning: false, startTimestamp: null });
      const action: GameSessionAction = { type: 'START_TIMER' };

      const beforeTime = Date.now();
      const result = gameSessionReducer(state, action);
      const afterTime = Date.now();

      expect(result.isTimerRunning).toBe(true);
      expect(result.startTimestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(result.startTimestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should not change state if already running', () => {
      const state = createBaseState({
        isTimerRunning: true,
        startTimestamp: Date.now() - 10000,
      });
      const action: GameSessionAction = { type: 'START_TIMER' };

      const result = gameSessionReducer(state, action);

      expect(result).toBe(state); // Same reference
    });
  });

  describe('PAUSE_TIMER', () => {
    it('should pause timer and calculate elapsed time', () => {
      const startTime = Date.now() - 10000; // Started 10 seconds ago
      const state = createBaseState({
        isTimerRunning: true,
        startTimestamp: startTime,
        timeElapsedInSeconds: 100, // Had 100 seconds elapsed before this run
      });
      const action: GameSessionAction = { type: 'PAUSE_TIMER' };

      const result = gameSessionReducer(state, action);

      expect(result.isTimerRunning).toBe(false);
      expect(result.startTimestamp).toBeNull();
      // Elapsed should be roughly 100 + 10 = 110 (give or take a few ms)
      expect(result.timeElapsedInSeconds).toBeGreaterThanOrEqual(109);
      expect(result.timeElapsedInSeconds).toBeLessThanOrEqual(111);
    });

    it('should use precise time from payload if provided', () => {
      const state = createBaseState({
        isTimerRunning: true,
        startTimestamp: Date.now() - 10000,
        timeElapsedInSeconds: 100,
      });
      const action: GameSessionAction = { type: 'PAUSE_TIMER', payload: 123.456 };

      const result = gameSessionReducer(state, action);

      expect(result.timeElapsedInSeconds).toBe(123.456);
    });

    it('should not change state if timer not running', () => {
      const state = createBaseState({ isTimerRunning: false, startTimestamp: null });
      const action: GameSessionAction = { type: 'PAUSE_TIMER' };

      const result = gameSessionReducer(state, action);

      expect(result).toBe(state);
    });

    it('should not change state if no startTimestamp', () => {
      const state = createBaseState({ isTimerRunning: true, startTimestamp: null });
      const action: GameSessionAction = { type: 'PAUSE_TIMER' };

      const result = gameSessionReducer(state, action);

      expect(result).toBe(state);
    });
  });

  // ============================================
  // PAUSE_TIMER_FOR_HIDDEN / RESTORE_TIMER_STATE
  // ============================================
  describe('PAUSE_TIMER_FOR_HIDDEN', () => {
    it('should pause timer when running and game in progress', () => {
      const state = createBaseState({
        isTimerRunning: true,
        gameStatus: 'inProgress',
        startTimestamp: Date.now(),
      });
      const action: GameSessionAction = { type: 'PAUSE_TIMER_FOR_HIDDEN' };

      const result = gameSessionReducer(state, action);

      expect(result.isTimerRunning).toBe(false);
    });

    it('should not change if timer not running', () => {
      const state = createBaseState({
        isTimerRunning: false,
        gameStatus: 'inProgress',
      });
      const action: GameSessionAction = { type: 'PAUSE_TIMER_FOR_HIDDEN' };

      const result = gameSessionReducer(state, action);

      expect(result).toBe(state);
    });

    it('should not change if game not in progress', () => {
      const state = createBaseState({
        isTimerRunning: true,
        gameStatus: 'notStarted',
      });
      const action: GameSessionAction = { type: 'PAUSE_TIMER_FOR_HIDDEN' };

      const result = gameSessionReducer(state, action);

      expect(result).toBe(state);
    });
  });

  describe('RESTORE_TIMER_STATE', () => {
    it('should restore timer when game in progress', () => {
      const state = createBaseState({
        gameStatus: 'inProgress',
        isTimerRunning: false,
        timeElapsedInSeconds: 100,
      });
      const action: GameSessionAction = {
        type: 'RESTORE_TIMER_STATE',
        payload: { savedTime: 150.5, timestamp: Date.now() },
      };

      const result = gameSessionReducer(state, action);

      expect(result.isTimerRunning).toBe(true);
      expect(result.timeElapsedInSeconds).toBe(151); // Rounded
    });

    it('should not restore if game not in progress', () => {
      const state = createBaseState({
        gameStatus: 'notStarted',
        isTimerRunning: false,
      });
      const action: GameSessionAction = {
        type: 'RESTORE_TIMER_STATE',
        payload: { savedTime: 150, timestamp: Date.now() },
      };

      const result = gameSessionReducer(state, action);

      expect(result).toBe(state);
    });
  });

  // ============================================
  // SET_TIMER_ELAPSED
  // ============================================
  describe('SET_TIMER_ELAPSED', () => {
    it('should update elapsed time and calculate alert level', () => {
      const state = createBaseState({
        isTimerRunning: true,
        timeElapsedInSeconds: 200,
        nextSubDueTimeSeconds: 300,
        subAlertLevel: 'none',
      });
      const action: GameSessionAction = { type: 'SET_TIMER_ELAPSED', payload: 250 };

      const result = gameSessionReducer(state, action);

      expect(result.timeElapsedInSeconds).toBe(250);
      expect(result.subAlertLevel).toBe('warning'); // Within 60 seconds of due time
    });

    it('should set alert to due when past due time', () => {
      const state = createBaseState({
        isTimerRunning: true,
        nextSubDueTimeSeconds: 300,
      });
      const action: GameSessionAction = { type: 'SET_TIMER_ELAPSED', payload: 310 };

      const result = gameSessionReducer(state, action);

      expect(result.subAlertLevel).toBe('due');
    });

    it('should keep alert as none when not near due time', () => {
      const state = createBaseState({
        isTimerRunning: true,
        nextSubDueTimeSeconds: 300,
      });
      const action: GameSessionAction = { type: 'SET_TIMER_ELAPSED', payload: 100 };

      const result = gameSessionReducer(state, action);

      expect(result.subAlertLevel).toBe('none');
    });

    it('should ignore update if timer not running', () => {
      const state = createBaseState({
        isTimerRunning: false,
        timeElapsedInSeconds: 100,
      });
      const action: GameSessionAction = { type: 'SET_TIMER_ELAPSED', payload: 200 };

      const result = gameSessionReducer(state, action);

      expect(result).toBe(state);
    });
  });

  // ============================================
  // SET_SUB_INTERVAL
  // ============================================
  describe('SET_SUB_INTERVAL', () => {
    it('should update interval and recalculate due time', () => {
      const state = createBaseState({
        subIntervalMinutes: 5,
        timeElapsedInSeconds: 100,
        nextSubDueTimeSeconds: 300,
      });
      const action: GameSessionAction = { type: 'SET_SUB_INTERVAL', payload: 3 };

      const result = gameSessionReducer(state, action);

      expect(result.subIntervalMinutes).toBe(3);
      expect(result.nextSubDueTimeSeconds).toBe(180); // Ceil(101/180) * 180 = 180
    });

    it('should enforce minimum of 1 minute', () => {
      const state = createBaseState({ subIntervalMinutes: 5 });
      const action: GameSessionAction = { type: 'SET_SUB_INTERVAL', payload: 0 };

      const result = gameSessionReducer(state, action);

      expect(result.subIntervalMinutes).toBe(1);
    });

    it('should set warning alert when within 60 seconds of due', () => {
      const state = createBaseState({
        timeElapsedInSeconds: 250, // Within 60 seconds of 300
      });
      const action: GameSessionAction = { type: 'SET_SUB_INTERVAL', payload: 5 };

      const result = gameSessionReducer(state, action);

      expect(result.subAlertLevel).toBe('warning');
    });
  });

  // ============================================
  // CONFIRM_SUBSTITUTION
  // ============================================
  describe('CONFIRM_SUBSTITUTION', () => {
    it('should record interval and update sub tracking', () => {
      const state = createBaseState({
        timeElapsedInSeconds: 350,
        lastSubConfirmationTimeSeconds: 100,
        subIntervalMinutes: 5,
        nextSubDueTimeSeconds: 300,
        completedIntervalDurations: [],
        currentPeriod: 1,
      });
      const action: GameSessionAction = { type: 'CONFIRM_SUBSTITUTION' };

      const result = gameSessionReducer(state, action);

      expect(result.completedIntervalDurations).toHaveLength(1);
      expect(result.completedIntervalDurations![0]).toEqual({
        period: 1,
        duration: 250, // 350 - 100
        timestamp: 350,
      });
      expect(result.lastSubConfirmationTimeSeconds).toBe(350);
      expect(result.nextSubDueTimeSeconds).toBe(650); // 350 + 300
      expect(result.subAlertLevel).toBe('none');
    });

    it('should prepend new interval to existing intervals', () => {
      const existingInterval = { period: 1, duration: 100, timestamp: 100 };
      const state = createBaseState({
        timeElapsedInSeconds: 350,
        lastSubConfirmationTimeSeconds: 200,
        subIntervalMinutes: 5,
        completedIntervalDurations: [existingInterval],
        currentPeriod: 1,
      });
      const action: GameSessionAction = { type: 'CONFIRM_SUBSTITUTION' };

      const result = gameSessionReducer(state, action);

      expect(result.completedIntervalDurations).toHaveLength(2);
      expect(result.completedIntervalDurations![0].duration).toBe(150); // New one first
      expect(result.completedIntervalDurations![1]).toEqual(existingInterval);
    });
  });

  // ============================================
  // Game Events (ADD, UPDATE, DELETE)
  // ============================================
  /**
   * @critical Game events are core data (goals, cards, substitutions)
   */
  describe('ADD_GAME_EVENT', () => {
    it('should add event to gameEvents array', () => {
      const state = createBaseState({ gameEvents: [] });
      const event = createGameEvent({ id: 'event-1', type: 'goal' });
      const action: GameSessionAction = { type: 'ADD_GAME_EVENT', payload: event };

      const result = gameSessionReducer(state, action);

      expect(result.gameEvents).toHaveLength(1);
      expect(result.gameEvents[0]).toEqual(event);
    });

    it('should append to existing events', () => {
      const existingEvent = createGameEvent({ id: 'existing' });
      const state = createBaseState({ gameEvents: [existingEvent] });
      const newEvent = createGameEvent({ id: 'new' });
      const action: GameSessionAction = { type: 'ADD_GAME_EVENT', payload: newEvent };

      const result = gameSessionReducer(state, action);

      expect(result.gameEvents).toHaveLength(2);
      expect(result.gameEvents[1].id).toBe('new');
    });
  });

  describe('UPDATE_GAME_EVENT', () => {
    it('should update existing event', () => {
      const event = createGameEvent({ id: 'event-1', type: 'goal', time: 100 });
      const state = createBaseState({ gameEvents: [event] });
      const updatedEvent = { ...event, time: 150 };
      const action: GameSessionAction = { type: 'UPDATE_GAME_EVENT', payload: updatedEvent };

      const result = gameSessionReducer(state, action);

      expect(result.gameEvents[0].time).toBe(150);
    });

    it('should not change state if event not found', () => {
      const event = createGameEvent({ id: 'event-1' });
      const state = createBaseState({ gameEvents: [event] });
      const nonExistentEvent = createGameEvent({ id: 'non-existent' });
      const action: GameSessionAction = { type: 'UPDATE_GAME_EVENT', payload: nonExistentEvent };

      const result = gameSessionReducer(state, action);

      expect(result).toBe(state);
    });
  });

  describe('DELETE_GAME_EVENT', () => {
    it('should remove event by ID', () => {
      const event1 = createGameEvent({ id: 'event-1' });
      const event2 = createGameEvent({ id: 'event-2' });
      const state = createBaseState({ gameEvents: [event1, event2] });
      const action: GameSessionAction = { type: 'DELETE_GAME_EVENT', payload: 'event-1' };

      const result = gameSessionReducer(state, action);

      expect(result.gameEvents).toHaveLength(1);
      expect(result.gameEvents[0].id).toBe('event-2');
    });

    it('should handle deletion of non-existent event', () => {
      const event = createGameEvent({ id: 'event-1' });
      const state = createBaseState({ gameEvents: [event] });
      const action: GameSessionAction = { type: 'DELETE_GAME_EVENT', payload: 'non-existent' };

      const result = gameSessionReducer(state, action);

      expect(result.gameEvents).toHaveLength(1);
    });
  });

  describe('DELETE_GAME_EVENT_WITH_SCORE', () => {
    it('should delete goal event and decrement home score (playing at home)', () => {
      const goalEvent = createGameEvent({ id: 'goal-1', type: 'goal' });
      const state = createBaseState({
        homeOrAway: 'home',
        homeScore: 2,
        awayScore: 1,
        gameEvents: [goalEvent],
      });
      const action: GameSessionAction = {
        type: 'DELETE_GAME_EVENT_WITH_SCORE',
        payload: goalEvent,
      };

      const result = gameSessionReducer(state, action);

      expect(result.gameEvents).toHaveLength(0);
      expect(result.homeScore).toBe(1);
      expect(result.awayScore).toBe(1);
    });

    it('should delete goal event and decrement away score (playing away)', () => {
      const goalEvent = createGameEvent({ id: 'goal-1', type: 'goal' });
      const state = createBaseState({
        homeOrAway: 'away',
        homeScore: 1,
        awayScore: 2,
        gameEvents: [goalEvent],
      });
      const action: GameSessionAction = {
        type: 'DELETE_GAME_EVENT_WITH_SCORE',
        payload: goalEvent,
      };

      const result = gameSessionReducer(state, action);

      expect(result.awayScore).toBe(1);
      expect(result.homeScore).toBe(1);
    });

    it('should delete opponentGoal event and decrement away score (playing at home)', () => {
      const opponentGoalEvent = createGameEvent({ id: 'og-1', type: 'opponentGoal' });
      const state = createBaseState({
        homeOrAway: 'home',
        homeScore: 1,
        awayScore: 2,
        gameEvents: [opponentGoalEvent],
      });
      const action: GameSessionAction = {
        type: 'DELETE_GAME_EVENT_WITH_SCORE',
        payload: opponentGoalEvent,
      };

      const result = gameSessionReducer(state, action);

      expect(result.awayScore).toBe(1);
    });

    it('should delete opponentGoal event and decrement home score (playing away)', () => {
      const opponentGoalEvent = createGameEvent({ id: 'og-1', type: 'opponentGoal' });
      const state = createBaseState({
        homeOrAway: 'away',
        homeScore: 2,
        awayScore: 1,
        gameEvents: [opponentGoalEvent],
      });
      const action: GameSessionAction = {
        type: 'DELETE_GAME_EVENT_WITH_SCORE',
        payload: opponentGoalEvent,
      };

      const result = gameSessionReducer(state, action);

      expect(result.homeScore).toBe(1);
    });

    it('should not adjust score for non-goal events', () => {
      const substitutionEvent = createGameEvent({ id: 'sub-1', type: 'substitution' as GameEvent['type'] });
      const state = createBaseState({
        homeScore: 2,
        awayScore: 1,
        gameEvents: [substitutionEvent],
      });
      const action: GameSessionAction = {
        type: 'DELETE_GAME_EVENT_WITH_SCORE',
        payload: substitutionEvent,
      };

      const result = gameSessionReducer(state, action);

      expect(result.homeScore).toBe(2);
      expect(result.awayScore).toBe(1);
      expect(result.gameEvents).toHaveLength(0);
    });

    it('should not allow negative scores', () => {
      const goalEvent = createGameEvent({ id: 'goal-1', type: 'goal' });
      const state = createBaseState({
        homeOrAway: 'home',
        homeScore: 0,
        gameEvents: [goalEvent],
      });
      const action: GameSessionAction = {
        type: 'DELETE_GAME_EVENT_WITH_SCORE',
        payload: goalEvent,
      };

      const result = gameSessionReducer(state, action);

      expect(result.homeScore).toBe(0); // Clamped at 0
    });
  });

  // ============================================
  // RESET_TIMER_ONLY
  // ============================================
  describe('RESET_TIMER_ONLY', () => {
    it('should reset timer to beginning of game', () => {
      const state = createBaseState({
        timeElapsedInSeconds: 500,
        isTimerRunning: true,
        currentPeriod: 2,
        gameStatus: 'inProgress',
        subIntervalMinutes: 5,
        nextSubDueTimeSeconds: 600,
        subAlertLevel: 'warning',
        lastSubConfirmationTimeSeconds: 300,
      });
      const action: GameSessionAction = { type: 'RESET_TIMER_ONLY' };

      const result = gameSessionReducer(state, action);

      expect(result.timeElapsedInSeconds).toBe(0);
      expect(result.isTimerRunning).toBe(false);
      expect(result.currentPeriod).toBe(1);
      expect(result.gameStatus).toBe('notStarted');
      expect(result.nextSubDueTimeSeconds).toBe(300); // 5 * 60
      expect(result.subAlertLevel).toBe('none');
      expect(result.lastSubConfirmationTimeSeconds).toBe(0);
    });
  });

  // ============================================
  // RESET_TIMER_AND_GAME_PROGRESS
  // ============================================
  describe('RESET_TIMER_AND_GAME_PROGRESS', () => {
    it('should reset all game progress', () => {
      const event = createGameEvent();
      const state = createBaseState({
        timeElapsedInSeconds: 1000,
        isTimerRunning: true,
        currentPeriod: 2,
        gameStatus: 'inProgress',
        gameEvents: [event],
        homeScore: 3,
        awayScore: 2,
        completedIntervalDurations: [{ period: 1, duration: 300, timestamp: 300 }],
      });
      const action: GameSessionAction = { type: 'RESET_TIMER_AND_GAME_PROGRESS' };

      const result = gameSessionReducer(state, action);

      expect(result.timeElapsedInSeconds).toBe(0);
      expect(result.isTimerRunning).toBe(false);
      expect(result.currentPeriod).toBe(1);
      expect(result.gameStatus).toBe('notStarted');
      expect(result.gameEvents).toEqual([]);
      expect(result.homeScore).toBe(0);
      expect(result.awayScore).toBe(0);
      expect(result.completedIntervalDurations).toEqual([]);
    });

    it('should allow partial override via payload', () => {
      const state = createBaseState({
        subIntervalMinutes: 5,
        homeScore: 3,
      });
      const action: GameSessionAction = {
        type: 'RESET_TIMER_AND_GAME_PROGRESS',
        payload: { subIntervalMinutes: 10 },
      };

      const result = gameSessionReducer(state, action);

      expect(result.subIntervalMinutes).toBe(10);
      expect(result.nextSubDueTimeSeconds).toBe(600); // 10 * 60
      expect(result.homeScore).toBe(0); // Still reset
    });
  });

  // ============================================
  // LOAD_PERSISTED_GAME_DATA
  // ============================================
  describe('LOAD_PERSISTED_GAME_DATA', () => {
    it('should load game data with defaults for missing fields', () => {
      const state = createBaseState();
      const action: GameSessionAction = {
        type: 'LOAD_PERSISTED_GAME_DATA',
        payload: {
          teamName: 'Loaded Team',
          homeScore: 2,
          awayScore: 1,
        },
      };

      const result = gameSessionReducer(state, action);

      expect(result.teamName).toBe('Loaded Team');
      expect(result.homeScore).toBe(2);
      expect(result.awayScore).toBe(1);
      expect(result.isTimerRunning).toBe(false);
      expect(result.startTimestamp).toBeNull();
    });

    it('should not restore inProgress status (safety feature)', () => {
      const state = createBaseState();
      const action: GameSessionAction = {
        type: 'LOAD_PERSISTED_GAME_DATA',
        payload: {
          gameStatus: 'inProgress',
          isTimerRunning: true,
        },
      };

      const result = gameSessionReducer(state, action);

      expect(result.gameStatus).toBe('notStarted'); // Converted to safe status
      expect(result.isTimerRunning).toBe(false);
    });

    it('should restore periodEnd status', () => {
      const state = createBaseState();
      const action: GameSessionAction = {
        type: 'LOAD_PERSISTED_GAME_DATA',
        payload: { gameStatus: 'periodEnd' },
      };

      const result = gameSessionReducer(state, action);

      expect(result.gameStatus).toBe('periodEnd');
    });

    it('should restore gameEnd status', () => {
      const state = createBaseState();
      const action: GameSessionAction = {
        type: 'LOAD_PERSISTED_GAME_DATA',
        payload: { gameStatus: 'gameEnd' },
      };

      const result = gameSessionReducer(state, action);

      expect(result.gameStatus).toBe('gameEnd');
    });

    it('should calculate fallback time for periodEnd status', () => {
      const state = createBaseState();
      const action: GameSessionAction = {
        type: 'LOAD_PERSISTED_GAME_DATA',
        payload: {
          gameStatus: 'periodEnd',
          currentPeriod: 1,
          periodDurationMinutes: 15,
          // No timeElapsedInSeconds provided
        },
      };

      const result = gameSessionReducer(state, action);

      expect(result.timeElapsedInSeconds).toBe(900); // 1 * 15 * 60
    });

    it('should use saved time if provided', () => {
      const state = createBaseState();
      const action: GameSessionAction = {
        type: 'LOAD_PERSISTED_GAME_DATA',
        payload: {
          timeElapsedInSeconds: 500,
          currentPeriod: 1,
          periodDurationMinutes: 15,
        },
      };

      const result = gameSessionReducer(state, action);

      expect(result.timeElapsedInSeconds).toBe(500);
    });

    it('should set nextSubDueTimeSeconds based on loaded time', () => {
      const state = createBaseState();
      const action: GameSessionAction = {
        type: 'LOAD_PERSISTED_GAME_DATA',
        payload: {
          timeElapsedInSeconds: 400,
          subIntervalMinutes: 5,
        },
      };

      const result = gameSessionReducer(state, action);

      expect(result.nextSubDueTimeSeconds).toBe(700); // 400 + 300
      expect(result.lastSubConfirmationTimeSeconds).toBe(400);
    });

    it('should restore persisted lastSubConfirmationTimeSeconds and calculate nextSubDueTimeSeconds from it', () => {
      // Scenario: Game at 12:00, user had confirmed subs at 10:00 (600s), 5-min intervals
      // On reload, nextSubDueTimeSeconds should be 15:00 (900s), not 17:00 (1020s)
      const state = createBaseState();
      const action: GameSessionAction = {
        type: 'LOAD_PERSISTED_GAME_DATA',
        payload: {
          timeElapsedInSeconds: 720, // 12 minutes
          lastSubConfirmationTimeSeconds: 600, // 10 minutes (last sub confirmed)
          subIntervalMinutes: 5,
        },
      };

      const result = gameSessionReducer(state, action);

      // nextSubDueTimeSeconds should be calculated from lastSubConfirmationTimeSeconds, not timeElapsedInSeconds
      expect(result.lastSubConfirmationTimeSeconds).toBe(600); // Restored from persisted data
      expect(result.nextSubDueTimeSeconds).toBe(900); // 600 + 300 (5 min interval)
      expect(result.timeElapsedInSeconds).toBe(720); // Current time preserved
    });

    it('should recalculate subAlertLevel to "due" when loaded time exceeds nextSubDueTime', () => {
      // Scenario: Game at 16:00 (960s), subs confirmed at 10:00 (600s), 5-min intervals
      // nextSubDueTime = 600 + 300 = 900s. Current time (960s) > 900s → alert should be 'due'
      const state = createBaseState();
      const action: GameSessionAction = {
        type: 'LOAD_PERSISTED_GAME_DATA',
        payload: {
          timeElapsedInSeconds: 960, // 16 minutes - past due time
          lastSubConfirmationTimeSeconds: 600, // 10 minutes
          subIntervalMinutes: 5,
        },
      };

      const result = gameSessionReducer(state, action);

      expect(result.timeElapsedInSeconds).toBe(960);
      expect(result.nextSubDueTimeSeconds).toBe(900); // 600 + 300
      expect(result.subAlertLevel).toBe('due'); // 960 >= 900
    });

    it('should recalculate subAlertLevel to "warning" when loaded time is within warning window', () => {
      // Scenario: Game at 14:30 (870s), subs confirmed at 10:00 (600s), 5-min intervals
      // nextSubDueTime = 900s, warningTime = 900 - 60 = 840s
      // Current time (870s) is between 840s and 900s → alert should be 'warning'
      const state = createBaseState();
      const action: GameSessionAction = {
        type: 'LOAD_PERSISTED_GAME_DATA',
        payload: {
          timeElapsedInSeconds: 870, // 14:30 - in warning window
          lastSubConfirmationTimeSeconds: 600, // 10:00
          subIntervalMinutes: 5,
        },
      };

      const result = gameSessionReducer(state, action);

      expect(result.timeElapsedInSeconds).toBe(870);
      expect(result.nextSubDueTimeSeconds).toBe(900);
      expect(result.subAlertLevel).toBe('warning'); // 870 >= 840 (warning) but < 900 (due)
    });

    it('should keep subAlertLevel as "none" when loaded time is before warning window', () => {
      // Scenario: Game at 12:00 (720s), subs confirmed at 10:00 (600s), 5-min intervals
      // nextSubDueTime = 900s, warningTime = 840s
      // Current time (720s) < 840s → alert should be 'none'
      const state = createBaseState();
      const action: GameSessionAction = {
        type: 'LOAD_PERSISTED_GAME_DATA',
        payload: {
          timeElapsedInSeconds: 720, // 12:00 - before warning window
          lastSubConfirmationTimeSeconds: 600, // 10:00
          subIntervalMinutes: 5,
        },
      };

      const result = gameSessionReducer(state, action);

      expect(result.timeElapsedInSeconds).toBe(720);
      expect(result.nextSubDueTimeSeconds).toBe(900);
      expect(result.subAlertLevel).toBe('none'); // 720 < 840 (warning)
    });

    /**
     * @edge-case Period boundary handling
     */
    it('should handle period boundary: loading game at start of second period', () => {
      // Scenario: Second period just started, timer at 15:00 (900s) for a 15-min first period
      // User hasn't confirmed subs yet in this period
      const state = createBaseState();
      const action: GameSessionAction = {
        type: 'LOAD_PERSISTED_GAME_DATA',
        payload: {
          timeElapsedInSeconds: 900, // Start of second period (15:00)
          currentPeriod: 2,
          periodDurationMinutes: 15,
          gameStatus: 'periodEnd',
          subIntervalMinutes: 5,
          // No lastSubConfirmationTimeSeconds - should default to timeElapsedAtLoad
        },
      };

      const result = gameSessionReducer(state, action);

      expect(result.timeElapsedInSeconds).toBe(900);
      expect(result.currentPeriod).toBe(2);
      expect(result.lastSubConfirmationTimeSeconds).toBe(900); // Defaults to timeElapsedAtLoad
      expect(result.nextSubDueTimeSeconds).toBe(1200); // 900 + 300 (5 min)
      expect(result.subAlertLevel).toBe('none'); // Fresh start of period
    });

    it('should load all supported optional fields', () => {
      const state = createBaseState();
      const events = [createGameEvent()];
      const intervals = [{ period: 1, duration: 100, timestamp: 100 }];
      const action: GameSessionAction = {
        type: 'LOAD_PERSISTED_GAME_DATA',
        payload: {
          teamId: 'team-123',
          gameLocation: 'Test Field',
          gameTime: '18:00',
          gameEvents: events,
          completedIntervalDurations: intervals,
          gamePersonnel: ['coach-1'],
          showPlayerNames: false,
        },
      };

      const result = gameSessionReducer(state, action);

      expect(result.teamId).toBe('team-123');
      expect(result.gameLocation).toBe('Test Field');
      expect(result.gameTime).toBe('18:00');
      expect(result.gameEvents).toEqual(events);
      expect(result.completedIntervalDurations).toEqual(intervals);
      expect(result.gamePersonnel).toEqual(['coach-1']);
      expect(result.showPlayerNames).toBe(false);
      // Note: ageGroup and tournamentLevel are not currently persisted by LOAD_PERSISTED_GAME_DATA
      // They need to be set via their specific actions (SET_AGE_GROUP, SET_TOURNAMENT_LEVEL)
    });
  });

  // ============================================
  // Default case
  // ============================================
  /**
   * @edge-case Unknown action types should not crash
   */
  describe('default case', () => {
    it('should return unchanged state for unknown action type', () => {
      const state = createBaseState();
      const action = { type: 'UNKNOWN_ACTION', payload: 'test' } as unknown as GameSessionAction;

      const result = gameSessionReducer(state, action);

      expect(result).toBe(state);
    });
  });

  // ============================================
  // Immutability tests
  // ============================================
  describe('immutability', () => {
    it('should not mutate original state', () => {
      const state = createBaseState({ homeScore: 0 });
      const originalState = { ...state };
      const action: GameSessionAction = { type: 'SET_HOME_SCORE', payload: 5 };

      gameSessionReducer(state, action);

      expect(state).toEqual(originalState);
    });

    it('should create new object reference on state change', () => {
      const state = createBaseState();
      const action: GameSessionAction = { type: 'SET_TEAM_NAME', payload: 'New Name' };

      const result = gameSessionReducer(state, action);

      expect(result).not.toBe(state);
    });

    it('should create new array reference for gameEvents', () => {
      const state = createBaseState({ gameEvents: [] });
      const event = createGameEvent();
      const action: GameSessionAction = { type: 'ADD_GAME_EVENT', payload: event };

      const result = gameSessionReducer(state, action);

      expect(result.gameEvents).not.toBe(state.gameEvents);
    });
  });
});
