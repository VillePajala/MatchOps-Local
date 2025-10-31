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
});
