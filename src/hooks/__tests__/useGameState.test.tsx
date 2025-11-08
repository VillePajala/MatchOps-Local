import { renderHook } from '@testing-library/react';
import { useGameState } from '../useGameState';
import type { AppState, Player } from '@/types';

describe('useGameState', () => {
  const basePlayer: Player = {
    id: 'player-1',
    name: 'Player One',
    isGoalie: false,
    receivedFairPlayCard: false,
  };

  const initialState: AppState = {
    playersOnField: [],
    opponents: [],
    drawings: [],
    availablePlayers: [basePlayer],
    showPlayerNames: true,
    teamName: 'My Team',
    gameEvents: [],
    opponentName: 'Opponent',
    gameDate: '2024-01-01',
    homeScore: 0,
    awayScore: 0,
    gameNotes: '',
    homeOrAway: 'home',
    numberOfPeriods: 2,
    periodDurationMinutes: 10,
    currentPeriod: 1,
    gameStatus: 'notStarted',
    selectedPlayerIds: [],
    seasonId: '',
    tournamentId: '',
    demandFactor: 1,
    gamePersonnel: [],
    tacticalDiscs: [],
    tacticalDrawings: [],
    tacticalBallPosition: { relX: 0.5, relY: 0.5 },
    subIntervalMinutes: 5,
    completedIntervalDurations: [],
    lastSubConfirmationTimeSeconds: 0,
    ageGroup: '',
    tournamentLevel: '',
    gameLocation: '',
    gameTime: '',
  };

  /**
   * Tests that availablePlayers initializes from provided initial state
   * Prevents regression where players disappeared after backup restore
   *
   * @critical
   */
  it('initializes available players from the provided initial state', () => {
    const saveStateToHistory = jest.fn();

    const { result } = renderHook(() =>
      useGameState({
        initialState,
        saveStateToHistory,
      })
    );

    expect(result.current.availablePlayers).toEqual(initialState.availablePlayers);
  });
});
