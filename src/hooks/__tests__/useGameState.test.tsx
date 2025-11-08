import { renderHook, waitFor } from '@testing-library/react';
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

  it('defaults available players to an empty array when initial state omits them', async () => {
    const saveStateToHistory = jest.fn();
    const stateWithoutPlayers = {
      ...initialState,
      availablePlayers: undefined as unknown as Player[],
    };

    const { result } = renderHook(() =>
      useGameState({
        initialState: stateWithoutPlayers,
        saveStateToHistory,
      })
    );

    await waitFor(() => {
      expect(result.current.availablePlayers).toEqual([]);
    });
  });

  it('syncs available players when the provided initial state changes', async () => {
    const saveStateToHistory = jest.fn();
    const newPlayer: Player = { ...basePlayer, id: 'player-2', name: 'Player Two' };

    const { result, rerender } = renderHook(
      ({ state }: { state: AppState }) =>
        useGameState({
          initialState: state,
          saveStateToHistory,
        }),
      { initialProps: { state: initialState } }
    );

    expect(result.current.availablePlayers).toEqual(initialState.availablePlayers);

    rerender({
      state: {
        ...initialState,
        availablePlayers: [newPlayer],
      },
    });

    await waitFor(() => {
      expect(result.current.availablePlayers).toEqual([newPlayer]);
    });
  });
});
