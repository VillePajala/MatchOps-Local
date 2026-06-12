import { gameSessionReducer, GameSessionState } from '../useGameSessionReducer';

const baseState: GameSessionState = {
  teamName: '',
  opponentName: '',
  gameDate: '',
  homeScore: 0,
  awayScore: 0,
  gameNotes: '',
  homeOrAway: 'home',
  numberOfPeriods: 2,
  periodDurationMinutes: 10,
  currentPeriod: 1,
  gameStatus: 'notStarted',
  selectedPlayerIds: [],
  gamePersonnel: [],
  seasonId: '',
  tournamentId: '',
  gameLocation: '',
  gameTime: '',
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
};

describe('gameSessionReducer', () => {
  test('adjust score for goal event does not go negative', () => {
    let state: GameSessionState = { ...baseState, homeScore: 1, awayScore: 0, homeOrAway: 'home' };
    state = gameSessionReducer(state, { type: 'ADJUST_SCORE_FOR_EVENT', payload: { eventType: 'goal', action: 'delete' } });
    expect(state.homeScore).toBe(0);
    state = gameSessionReducer(state, { type: 'ADJUST_SCORE_FOR_EVENT', payload: { eventType: 'goal', action: 'delete' } });
    expect(state.homeScore).toBe(0);
  });

  test('reset timer resets to beginning (0:00, period 1)', () => {
    const state = gameSessionReducer(
      { ...baseState, currentPeriod: 2, timeElapsedInSeconds: 650, subIntervalMinutes: 5, gameStatus: 'inProgress' },
      { type: 'RESET_TIMER_ONLY' }
    );
    // New behavior: Reset to 0:00 of first period
    expect(state.timeElapsedInSeconds).toBe(0);
    expect(state.currentPeriod).toBe(1);
    expect(state.gameStatus).toBe('notStarted');
    expect(state.isTimerRunning).toBe(false);
    expect(state.nextSubDueTimeSeconds).toBe(5 * 60); // First substitution at 5 minutes
    expect(state.lastSubConfirmationTimeSeconds).toBe(0);
    expect(state.subAlertLevel).toBe('none');
  });

  test('reset timer and game progress resets scores and period', () => {
    const state = gameSessionReducer(
      { ...baseState, homeScore: 2, awayScore: 1, currentPeriod: 2, timeElapsedInSeconds: 500 },
      { type: 'RESET_TIMER_AND_GAME_PROGRESS', payload: { subIntervalMinutes: 4 } }
    );
    expect(state.homeScore).toBe(0);
    expect(state.awayScore).toBe(0);
    expect(state.currentPeriod).toBe(1);
    expect(state.timeElapsedInSeconds).toBe(0);
    expect(state.subIntervalMinutes).toBe(4);
    expect(state.nextSubDueTimeSeconds).toBe(4 * 60);
  });

  /**
   * CR-C1: resuming a reloaded in-progress game must continue at the saved
   * clock/period, never reset to period 1 / 0:00.
   * @critical
   */
  describe('RESUME_GAME', () => {
    const intervalHistory = [{ period: 1, duration: 300, timestamp: 1000 }];
    const loadedMidGame: GameSessionState = {
      ...baseState,
      gameStatus: 'notStarted', // what LOAD_PERSISTED_GAME_DATA produces for an in-progress game
      currentPeriod: 2,
      timeElapsedInSeconds: 1600, // 26:40 into a 2x15 game... using base 2x10: 16:40 into period 2
      periodDurationMinutes: 15,
      lastSubConfirmationTimeSeconds: 1500,
      nextSubDueTimeSeconds: 1800,
      completedIntervalDurations: intervalHistory,
    };

    test('resumes at the saved clock and period without wiping interval history', () => {
      const state = gameSessionReducer(loadedMidGame, { type: 'RESUME_GAME' });

      expect(state.gameStatus).toBe('inProgress');
      expect(state.isTimerRunning).toBe(true);
      expect(state.startTimestamp).not.toBeNull();
      // Everything the old START_PERIOD(1) path destroyed must survive:
      expect(state.timeElapsedInSeconds).toBe(1600);
      expect(state.currentPeriod).toBe(2);
      expect(state.completedIntervalDurations).toEqual(intervalHistory);
      expect(state.lastSubConfirmationTimeSeconds).toBe(1500);
      expect(state.nextSubDueTimeSeconds).toBe(1800);
    });

    test('is a no-op while the timer is already running', () => {
      const running = { ...loadedMidGame, gameStatus: 'inProgress' as const, isTimerRunning: true };
      expect(gameSessionReducer(running, { type: 'RESUME_GAME' })).toBe(running);
    });

    test('full reload scenario: LOAD_PERSISTED_GAME_DATA then RESUME_GAME restores the match', () => {
      // An in-progress game as persisted by auto-save mid-period-2
      const persisted = {
        gameStatus: 'inProgress' as const,
        currentPeriod: 2,
        numberOfPeriods: 2 as const,
        periodDurationMinutes: 15,
        timeElapsedInSeconds: 1600,
        lastSubConfirmationTimeSeconds: 1500,
        subIntervalMinutes: 5,
        completedIntervalDurations: intervalHistory,
        teamName: 'My Team',
        opponentName: 'Rivals',
      };

      const loaded = gameSessionReducer(baseState, { type: 'LOAD_PERSISTED_GAME_DATA', payload: persisted });
      // Load coerces to notStarted (never auto-start) but preserves the clock
      expect(loaded.gameStatus).toBe('notStarted');
      expect(loaded.timeElapsedInSeconds).toBe(1600);
      expect(loaded.currentPeriod).toBe(2);
      expect(loaded.isTimerRunning).toBe(false);

      const resumed = gameSessionReducer(loaded, { type: 'RESUME_GAME' });
      expect(resumed.gameStatus).toBe('inProgress');
      expect(resumed.isTimerRunning).toBe(true);
      expect(resumed.timeElapsedInSeconds).toBe(1600);
      expect(resumed.currentPeriod).toBe(2);
      expect(resumed.completedIntervalDurations).toEqual(intervalHistory);
      // Sub due time computed from last confirmation, not reset to interval start
      expect(resumed.nextSubDueTimeSeconds).toBe(1500 + 5 * 60);
    });
  });

  test('LOAD_STATE_FROM_HISTORY restores complete session details', () => {
    const historySnapshot = {
      currentPeriod: 3 as const,
      gameStatus: 'inProgress' as const,
      completedIntervalDurations: [
        { period: 1, duration: 300, timestamp: Date.now() - 620000 },
        { period: 2, duration: 320, timestamp: Date.now() - 320000 },
      ],
      lastSubConfirmationTimeSeconds: 180,
      showPlayerNames: false,
      gameEvents: [{ id: 'goal-1', type: 'goal' as const, time: 95, scorerId: 'player1' }],
      selectedPlayerIds: ['player1', 'player2'],
      seasonId: 'season-42',
      tournamentId: 'tournament-7',
      gameLocation: 'Stadium One',
      gameTime: '19:45',
      ageGroup: 'U13',
      tournamentLevel: 'elite',
      teamId: 'team-99',
      gamePersonnel: ['coach-5'],
      demandFactor: 1.4,
      subIntervalMinutes: 7,
      homeOrAway: 'away' as const,
    };

    const state = gameSessionReducer(baseState, {
      type: 'LOAD_STATE_FROM_HISTORY',
      payload: historySnapshot,
    });

    expect(state).toMatchObject({
      currentPeriod: 3,
      gameStatus: 'inProgress',
      completedIntervalDurations: historySnapshot.completedIntervalDurations,
      lastSubConfirmationTimeSeconds: 180,
      showPlayerNames: false,
      gameEvents: historySnapshot.gameEvents,
      selectedPlayerIds: ['player1', 'player2'],
      seasonId: 'season-42',
      tournamentId: 'tournament-7',
      gameLocation: 'Stadium One',
      gameTime: '19:45',
      ageGroup: 'U13',
      tournamentLevel: 'elite',
      teamId: 'team-99',
      gamePersonnel: ['coach-5'],
      demandFactor: 1.4,
      subIntervalMinutes: 7,
      homeOrAway: 'away',
    });
  });

  /**
   * CRITICAL REGRESSION TEST: Validates teamId persists through save/load cycle
   *
   * Bug History:
   * - Issue: teamId was being lost during LOAD_PERSISTED_GAME_DATA action
   * - Impact: Games would lose team association after save/load, breaking placement tracking
   * - Fix: Ensure teamId is properly extracted and included in state after load
   * - PR: feat/team-tournament-placements
   *
   * This test prevents reintroduction of the bug by validating that:
   * 1. teamId is preserved in the loaded state
   * 2. LOAD_PERSISTED_GAME_DATA action includes teamId in result
   * 3. Game data with teamId can be round-tripped through save/load
   *
   * @critical - Prevents data loss bug from reoccurring
   */
  describe('LOAD_PERSISTED_GAME_DATA - teamId regression tests', () => {
    test('should preserve teamId when loading persisted game data', () => {
      const gameDataWithTeam = {
        teamName: 'Test Team',
        opponentName: 'Opponent Team',
        gameDate: '2025-01-01',
        homeScore: 2,
        awayScore: 1,
        gameNotes: 'Test game',
        homeOrAway: 'home' as const,
        numberOfPeriods: 2 as const,
        periodDurationMinutes: 10,
        currentPeriod: 2,
        gameStatus: 'periodEnd' as const,
        selectedPlayerIds: ['player1', 'player2'],
        gamePersonnel: [],
        seasonId: 'season_123',
        tournamentId: '',
        teamId: 'team_456',  // CRITICAL: This must be preserved
        gameLocation: 'Home Field',
        gameTime: '14:00',
        demandFactor: 1,
        gameEvents: [],
        subIntervalMinutes: 5,
        showPlayerNames: true,
        completedIntervalDurations: [],
      };

      const state = gameSessionReducer(
        baseState,
        { type: 'LOAD_PERSISTED_GAME_DATA', payload: gameDataWithTeam }
      );

      // CRITICAL ASSERTION: teamId must be preserved
      expect(state.teamId).toBe('team_456');

      // Verify other critical fields are also preserved
      expect(state.teamName).toBe('Test Team');
      expect(state.seasonId).toBe('season_123');
      expect(state.homeScore).toBe(2);
      expect(state.awayScore).toBe(1);
    });

    test('should handle loading game data without teamId (backward compatibility)', () => {
      const gameDataWithoutTeam = {
        teamName: 'Legacy Team',
        opponentName: 'Opponent',
        gameDate: '2025-01-01',
        homeScore: 0,
        awayScore: 0,
        gameNotes: '',
        homeOrAway: 'home' as const,
        numberOfPeriods: 2 as const,
        periodDurationMinutes: 10,
        currentPeriod: 1,
        gameStatus: 'notStarted' as const,
        selectedPlayerIds: [],
        gamePersonnel: [],
        seasonId: '',
        tournamentId: '',
        // teamId intentionally omitted - should be undefined, not cause error
        gameLocation: '',
        gameTime: '',
        demandFactor: 1,
        gameEvents: [],
        subIntervalMinutes: 5,
        showPlayerNames: true,
        completedIntervalDurations: [],
      };

      const state = gameSessionReducer(
        baseState,
        { type: 'LOAD_PERSISTED_GAME_DATA', payload: gameDataWithoutTeam }
      );

      // Should not crash, teamId should be undefined
      expect(state.teamId).toBeUndefined();
      expect(state.teamName).toBe('Legacy Team');
    });

    test('should handle explicit undefined teamId in game data', () => {
      const gameDataWithUndefinedTeam = {
        teamName: 'Test Team',
        opponentName: 'Opponent',
        gameDate: '2025-01-01',
        homeScore: 0,
        awayScore: 0,
        gameNotes: '',
        homeOrAway: 'home' as const,
        numberOfPeriods: 2 as const,
        periodDurationMinutes: 10,
        currentPeriod: 1,
        gameStatus: 'notStarted' as const,
        selectedPlayerIds: [],
        gamePersonnel: [],
        seasonId: '',
        tournamentId: '',
        teamId: undefined,  // Explicitly set to undefined
        gameLocation: '',
        gameTime: '',
        demandFactor: 1,
        gameEvents: [],
        subIntervalMinutes: 5,
        showPlayerNames: true,
        completedIntervalDurations: [],
      };

      const state = gameSessionReducer(
        baseState,
        { type: 'LOAD_PERSISTED_GAME_DATA', payload: gameDataWithUndefinedTeam }
      );

      expect(state.teamId).toBeUndefined();
    });

    test('should preserve teamId with empty string value', () => {
      const gameDataWithEmptyTeam = {
        teamName: 'Test Team',
        opponentName: 'Opponent',
        gameDate: '2025-01-01',
        homeScore: 0,
        awayScore: 0,
        gameNotes: '',
        homeOrAway: 'home' as const,
        numberOfPeriods: 2 as const,
        periodDurationMinutes: 10,
        currentPeriod: 1,
        gameStatus: 'notStarted' as const,
        selectedPlayerIds: [],
        gamePersonnel: [],
        seasonId: '',
        tournamentId: '',
        teamId: '',  // Empty string - should be preserved as-is
        gameLocation: '',
        gameTime: '',
        demandFactor: 1,
        gameEvents: [],
        subIntervalMinutes: 5,
        showPlayerNames: true,
        completedIntervalDurations: [],
      };

      const state = gameSessionReducer(
        baseState,
        { type: 'LOAD_PERSISTED_GAME_DATA', payload: gameDataWithEmptyTeam }
      );

      // Empty string is valid - might indicate "no team selected"
      expect(state.teamId).toBe('');
    });

    test('should handle teamId alongside tournamentId (mutual exclusivity check)', () => {
      // Note: In practice, a game should have EITHER teamId+seasonId OR tournamentId,
      // but not both. However, if both are present, teamId should still be preserved.
      const gameDataWithBoth = {
        teamName: 'Test Team',
        opponentName: 'Opponent',
        gameDate: '2025-01-01',
        homeScore: 0,
        awayScore: 0,
        gameNotes: '',
        homeOrAway: 'home' as const,
        numberOfPeriods: 2 as const,
        periodDurationMinutes: 10,
        currentPeriod: 1,
        gameStatus: 'notStarted' as const,
        selectedPlayerIds: [],
        gamePersonnel: [],
        seasonId: 'season_789',
        tournamentId: 'tournament_999',  // Unusual but possible
        teamId: 'team_456',
        gameLocation: '',
        gameTime: '',
        demandFactor: 1,
        gameEvents: [],
        subIntervalMinutes: 5,
        showPlayerNames: true,
        completedIntervalDurations: [],
      };

      const state = gameSessionReducer(
        baseState,
        { type: 'LOAD_PERSISTED_GAME_DATA', payload: gameDataWithBoth }
      );

      // All should be preserved as-is
      expect(state.teamId).toBe('team_456');
      expect(state.seasonId).toBe('season_789');
      expect(state.tournamentId).toBe('tournament_999');
    });
  });

  describe('League management actions', () => {
    it('should set league ID', () => {
      const state = { ...baseState, leagueId: undefined };
      const result = gameSessionReducer(state, { type: 'SET_LEAGUE_ID', payload: 'sm-sarja' });
      expect(result.leagueId).toBe('sm-sarja');
    });

    it('should clear league ID when empty string provided', () => {
      const state = { ...baseState, leagueId: 'sm-sarja' };
      const result = gameSessionReducer(state, { type: 'SET_LEAGUE_ID', payload: '' });
      expect(result.leagueId).toBeUndefined();
    });

    it('should set custom league name', () => {
      const state = { ...baseState, customLeagueName: undefined };
      const result = gameSessionReducer(state, { type: 'SET_CUSTOM_LEAGUE_NAME', payload: 'My League' });
      expect(result.customLeagueName).toBe('My League');
    });

    it('should clear custom league name when empty string provided', () => {
      const state = { ...baseState, customLeagueName: 'My League' };
      const result = gameSessionReducer(state, { type: 'SET_CUSTOM_LEAGUE_NAME', payload: '' });
      expect(result.customLeagueName).toBeUndefined();
    });
  });
});
