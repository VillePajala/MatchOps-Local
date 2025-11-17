import { renderHook, waitFor, act } from '@testing-library/react';
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

  /**
   * Validates roster deletions drop field players to avoid ghost entries.
   * @critical
   * @edge-case
   */
  it('removes playersOnField entries when corresponding roster players disappear', async () => {
    const saveStateToHistory = jest.fn();
    const initial = {
      ...initialState,
      playersOnField: [{ ...basePlayer, relX: 0.25, relY: 0.4 }],
    };

    const { result } = renderHook(() =>
      useGameState({
        initialState: initial,
        saveStateToHistory,
      })
    );

    saveStateToHistory.mockClear();

    act(() => {
      result.current.setAvailablePlayers([]); // simulate roster wipe
    });

    await waitFor(() => {
      expect(result.current.playersOnField).toEqual([]);
    });

    await waitFor(() => {
      expect(saveStateToHistory).toHaveBeenLastCalledWith({ playersOnField: [] });
    });
  });

  /**
   * Ensures initial field render waits for roster data before mutating state.
   * @critical
   * @edge-case
   */
  it('does not drop players on mount when roster data has not arrived yet', async () => {
    const saveStateToHistory = jest.fn();
    const fieldPlayer = { ...basePlayer, relX: 0.2, relY: 0.3 };
    const initial = {
      ...initialState,
      availablePlayers: [],
      playersOnField: [fieldPlayer],
    };
    // Scenario: game state rehydrates before roster query resolves; ensure field players stay put.

    const { result } = renderHook(() =>
      useGameState({
        initialState: initial,
        saveStateToHistory,
      })
    );

    await waitFor(() => {
      expect(result.current.playersOnField).toEqual([fieldPlayer]);
    });

    expect(saveStateToHistory).not.toHaveBeenCalledWith({ playersOnField: [] });
  });

  /**
   * Covers combined roster removals + metadata updates in one payload.
   * @critical
   * @edge-case
   */
  it('handles mixed roster removals and metadata updates in a single sync', async () => {
    const saveStateToHistory = jest.fn();
    const player1 = { ...basePlayer, id: 'p1', name: 'Player 1' };
    const player2 = { ...basePlayer, id: 'p2', name: 'Player 2' };
    const player3 = { ...basePlayer, id: 'p3', name: 'Player 3' };
    const initial = {
      ...initialState,
      availablePlayers: [player1, player2, player3],
      playersOnField: [
        { ...player1, relX: 0.1, relY: 0.2 },
        { ...player2, relX: 0.4, relY: 0.5 },
        { ...player3, relX: 0.7, relY: 0.8 },
      ],
    };

    const { result } = renderHook(() =>
      useGameState({
        initialState: initial,
        saveStateToHistory,
      })
    );

    saveStateToHistory.mockClear();

    const updatedRoster = [
      { ...player1, name: 'Updated Player 1', jerseyNumber: '11' },
      player3,
    ];

    act(() => {
      result.current.setAvailablePlayers(updatedRoster);
    });

    await waitFor(() => {
      expect(result.current.playersOnField).toHaveLength(2);
      expect(result.current.playersOnField).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'p1', name: 'Updated Player 1', jerseyNumber: '11' }),
          expect.objectContaining({ id: 'p3', name: 'Player 3' }),
        ])
      );
    });

    expect(result.current.playersOnField.find(p => p.id === 'p2')).toBeUndefined();
    await waitFor(() => {
      expect(saveStateToHistory).toHaveBeenLastCalledWith({
        playersOnField: expect.arrayContaining([
          expect.objectContaining({ id: 'p1', name: 'Updated Player 1', jerseyNumber: '11' }),
          expect.objectContaining({ id: 'p3', name: 'Player 3' }),
        ]),
      });
    });
  });

  /**
   * Guards against position regressions during roster metadata merges.
   * @critical
   * @edge-case
   */
  it('keeps player positions while syncing metadata from updated roster entries', async () => {
    const saveStateToHistory = jest.fn();
    const fieldPlayer = { ...basePlayer, name: 'Old Name', relX: 0.5, relY: 0.2 };
    const initial = {
      ...initialState,
      availablePlayers: [basePlayer],
      playersOnField: [fieldPlayer],
    };

    const { result } = renderHook(() =>
      useGameState({
        initialState: initial,
        saveStateToHistory,
      })
    );

    saveStateToHistory.mockClear();

    const updatedRoster = [{ ...basePlayer, name: 'Updated Name', jerseyNumber: '10', nickname: 'Ace' }];

    act(() => {
      result.current.setAvailablePlayers(updatedRoster);
    });

    await waitFor(() => {
      expect(result.current.playersOnField).toHaveLength(1);
      expect(result.current.playersOnField).toEqual([
        expect.objectContaining({
          id: basePlayer.id,
          name: 'Updated Name',
          jerseyNumber: '10',
          nickname: 'Ace',
          relX: 0.5,
          relY: 0.2,
        }),
      ]);
    });

    await waitFor(() => {
      expect(saveStateToHistory).toHaveBeenLastCalledWith({
        playersOnField: [
          expect.objectContaining({
            id: basePlayer.id,
            name: 'Updated Name',
            jerseyNumber: '10',
            nickname: 'Ace',
            relX: 0.5,
            relY: 0.2,
          }),
        ],
      });
    });
  });
});
