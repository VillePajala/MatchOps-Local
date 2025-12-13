/**
 * newGameHandlers Tests
 *
 * Tests for new game creation handlers:
 * - Successful game creation flow
 * - Cancellation flow
 * - Premium limit enforcement
 *
 * @critical - Core game creation functionality
 */

import type { SavedGamesCollection, Player, AppState } from '@/types';
import type { GameSessionAction } from '@/hooks/useGameSessionReducer';
import type { QueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';

import { startNewGameWithSetup, cancelNewGameSetup } from './newGameHandlers';

const createSetStateMock = <T,>(initial: T) => {
  let state = initial;
  const setter = jest.fn((updater: T | ((prev: T) => T)) => {
    state = typeof updater === 'function' ? (updater as (prev: T) => T)(state) : updater;
  });
  return {
    getState: () => state,
    setter,
  };
};

const mockPlayers: Player[] = [
  { id: 'p1', name: 'Player 1', isGoalie: false },
  { id: 'p2', name: 'Player 2', isGoalie: true },
];

// Helper to create base dependencies for tests
const createBaseDeps = (overrides?: Partial<ReturnType<typeof createTestDeps>>) => {
  return createTestDeps(overrides);
};

const createTestDeps = (overrides?: Record<string, unknown>) => {
  const savedGamesState = createSetStateMock<SavedGamesCollection>({});
  return {
    availablePlayers: mockPlayers,
    savedGames: savedGamesState.getState(),
    setSavedGames: savedGamesState.setter,
    resetHistory: jest.fn(),
    dispatchGameSession: jest.fn() as unknown as (action: GameSessionAction) => void,
    setCurrentGameId: jest.fn(),
    closeNewGameSetupModal: jest.fn(),
    setNewGameDemandFactor: jest.fn(),
    setPlayerIdsForNewGame: jest.fn(),
    setHighlightRosterButton: jest.fn(),
    setIsPlayed: jest.fn(),
    queryClient: {
      invalidateQueries: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryClient,
    showToast: jest.fn(),
    t: ((_key: string, fallback?: string) => fallback ?? _key) as TFunction,
    utilSaveGame: jest.fn().mockImplementation(async (_id: string, state: AppState) => state),
    utilSaveCurrentGameIdSetting: jest.fn().mockResolvedValue(undefined),
    defaultSubIntervalMinutes: 5,
    canCreate: jest.fn().mockReturnValue(true),
    showUpgradePrompt: jest.fn(),
    ...overrides,
  };
};

const createBaseRequest = (overrides?: Record<string, unknown>) => ({
  initialSelectedPlayerIds: [],
  homeTeamName: 'Home Team',
  opponentName: 'Away Team',
  gameDate: '2024-10-01',
  gameLocation: 'Main Arena',
  gameTime: '15:00',
  seasonId: null,
  tournamentId: null,
  numPeriods: 2 as const,
  periodDuration: 25,
  homeOrAway: 'home' as const,
  demandFactor: 1,
  ageGroup: 'U12',
  tournamentLevel: 'regular',
  tournamentSeriesId: null,
  isPlayed: true,
  teamId: null,
  availablePlayersForGame: mockPlayers,
  selectedPersonnelIds: [],
  leagueId: '',
  customLeagueName: '',
  gameType: 'soccer' as const,
  gender: undefined,
  ...overrides,
});

describe('newGameHandlers', () => {
  it('clears playerIdsForNewGame after successful start', async () => {
    const savedGamesState = createSetStateMock<SavedGamesCollection>({});
    const setPlayerIdsForNewGame = jest.fn();
    const dispatchGameSession = jest.fn();
    const setCurrentGameId = jest.fn();
    const closeNewGameSetupModal = jest.fn();
    const setNewGameDemandFactor = jest.fn();
    const setHighlightRosterButton = jest.fn();
    const setIsPlayed = jest.fn();
    const resetHistory = jest.fn();
    const queryClient = {
      invalidateQueries: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryClient;
    const showToast = jest.fn();
    const deps = {
      availablePlayers: mockPlayers,
      savedGames: savedGamesState.getState(),
      setSavedGames: savedGamesState.setter,
      resetHistory,
      dispatchGameSession: dispatchGameSession as unknown as (action: GameSessionAction) => void,
      setCurrentGameId,
      closeNewGameSetupModal,
      setNewGameDemandFactor,
      setPlayerIdsForNewGame,
      setHighlightRosterButton,
      setIsPlayed,
      queryClient,
      showToast,
      t: ((_key: string, fallback?: string) => fallback ?? _key) as TFunction,
      utilSaveGame: jest.fn().mockImplementation(async (_id: string, state: AppState) => state),
      utilSaveCurrentGameIdSetting: jest.fn().mockResolvedValue(undefined),
      defaultSubIntervalMinutes: 5,
      canCreate: jest.fn().mockReturnValue(true),
      showUpgradePrompt: jest.fn(),
    };

    await startNewGameWithSetup(deps, {
      initialSelectedPlayerIds: [],
      homeTeamName: 'Home Team',
      opponentName: 'Away Team',
      gameDate: '2024-10-01',
      gameLocation: 'Main Arena',
      gameTime: '15:00',
      seasonId: null,
      tournamentId: null,
      numPeriods: 2,
      periodDuration: 25,
      homeOrAway: 'home',
      demandFactor: 1,
      ageGroup: 'U12',
      tournamentLevel: 'regular',
      tournamentSeriesId: null,
      isPlayed: true,
      teamId: null,
      availablePlayersForGame: mockPlayers,
      selectedPersonnelIds: [],
      leagueId: '',
      customLeagueName: '',
      gameType: 'soccer',
      gender: undefined,
    });

    expect(setPlayerIdsForNewGame).toHaveBeenCalledWith(null);
    expect(closeNewGameSetupModal).toHaveBeenCalledTimes(1);
    expect(setHighlightRosterButton).toHaveBeenCalledWith(true);
  });

  it('clears playerIdsForNewGame when setup is cancelled', () => {
    const setPlayerIdsForNewGame = jest.fn();
    const closeNewGameSetupModal = jest.fn();

    cancelNewGameSetup({
      setHasSkippedInitialSetup: jest.fn(),
      closeNewGameSetupModal,
      setNewGameDemandFactor: jest.fn(),
      setPlayerIdsForNewGame,
    });

    expect(setPlayerIdsForNewGame).toHaveBeenCalledWith(null);
    expect(closeNewGameSetupModal).toHaveBeenCalledTimes(1);
  });

  describe('premium limit enforcement', () => {
    it('blocks game creation when season game limit is reached', async () => {
      const existingGames: SavedGamesCollection = {
        game1: { seasonId: 'season-1' } as AppState,
        game2: { seasonId: 'season-1' } as AppState,
        game3: { seasonId: 'season-1' } as AppState,
      };
      const savedGamesState = createSetStateMock(existingGames);

      const showUpgradePrompt = jest.fn();
      const canCreate = jest.fn().mockReturnValue(false); // Limit reached

      const deps = createTestDeps({
        savedGames: existingGames,
        setSavedGames: savedGamesState.setter,
        canCreate,
        showUpgradePrompt,
      });

      await startNewGameWithSetup(deps, createBaseRequest({ seasonId: 'season-1' }));

      // Should show upgrade prompt
      expect(showUpgradePrompt).toHaveBeenCalledWith('game');
      // Should NOT proceed with game creation
      expect(deps.utilSaveGame).not.toHaveBeenCalled();
      expect(deps.closeNewGameSetupModal).not.toHaveBeenCalled();
    });

    it('blocks game creation when tournament game limit is reached', async () => {
      const existingGames: SavedGamesCollection = {
        game1: { tournamentId: 'tournament-1' } as AppState,
        game2: { tournamentId: 'tournament-1' } as AppState,
      };
      const savedGamesState = createSetStateMock(existingGames);

      const showUpgradePrompt = jest.fn();
      const canCreate = jest.fn().mockReturnValue(false); // Limit reached

      const deps = createTestDeps({
        savedGames: existingGames,
        setSavedGames: savedGamesState.setter,
        canCreate,
        showUpgradePrompt,
      });

      await startNewGameWithSetup(deps, createBaseRequest({ tournamentId: 'tournament-1' }));

      // Should show upgrade prompt
      expect(showUpgradePrompt).toHaveBeenCalledWith('game');
      // Should NOT proceed with game creation
      expect(deps.utilSaveGame).not.toHaveBeenCalled();
    });

    it('allows game creation when under limit', async () => {
      const existingGames: SavedGamesCollection = {
        game1: { seasonId: 'season-1' } as AppState,
      };
      const savedGamesState = createSetStateMock(existingGames);

      const showUpgradePrompt = jest.fn();
      const canCreate = jest.fn().mockReturnValue(true); // Under limit

      const deps = createTestDeps({
        savedGames: existingGames,
        setSavedGames: savedGamesState.setter,
        canCreate,
        showUpgradePrompt,
      });

      await startNewGameWithSetup(deps, createBaseRequest({ seasonId: 'season-1' }));

      // Should NOT show upgrade prompt
      expect(showUpgradePrompt).not.toHaveBeenCalled();
      // Should proceed with game creation
      expect(deps.utilSaveGame).toHaveBeenCalled();
    });

    it('checks limit with correct game count for season', async () => {
      const existingGames: SavedGamesCollection = {
        game1: { seasonId: 'season-1' } as AppState,
        game2: { seasonId: 'season-1' } as AppState,
        game3: { seasonId: 'season-2' } as AppState, // Different season
        game4: { tournamentId: 'tournament-1' } as AppState, // Tournament game
      };
      const savedGamesState = createSetStateMock(existingGames);

      const canCreate = jest.fn().mockReturnValue(true);
      const deps = createTestDeps({
        savedGames: existingGames,
        setSavedGames: savedGamesState.setter,
        canCreate,
      });

      await startNewGameWithSetup(deps, createBaseRequest({ seasonId: 'season-1' }));

      // Should check with count of 2 (only games in season-1)
      expect(canCreate).toHaveBeenCalledWith('game', 2);
    });

    it('checks limit with correct game count for tournament', async () => {
      const existingGames: SavedGamesCollection = {
        game1: { tournamentId: 'tournament-1' } as AppState,
        game2: { seasonId: 'season-1' } as AppState, // Season game
        game3: { tournamentId: 'tournament-2' } as AppState, // Different tournament
      };
      const savedGamesState = createSetStateMock(existingGames);

      const canCreate = jest.fn().mockReturnValue(true);
      const deps = createTestDeps({
        savedGames: existingGames,
        setSavedGames: savedGamesState.setter,
        canCreate,
      });

      await startNewGameWithSetup(deps, createBaseRequest({ tournamentId: 'tournament-1' }));

      // Should check with count of 1 (only games in tournament-1)
      expect(canCreate).toHaveBeenCalledWith('game', 1);
    });

    it('skips limit check for games without season or tournament', async () => {
      const canCreate = jest.fn().mockReturnValue(true);
      const deps = createTestDeps({ canCreate });

      await startNewGameWithSetup(deps, createBaseRequest({
        seasonId: null,
        tournamentId: null,
      }));

      // Should NOT call canCreate since there's no competition
      expect(canCreate).not.toHaveBeenCalled();
      // Should proceed with game creation
      expect(deps.utilSaveGame).toHaveBeenCalled();
    });
  });
});
