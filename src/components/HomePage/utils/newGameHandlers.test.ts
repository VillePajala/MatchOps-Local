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
import { setPlanLink } from '@/utils/playtimePlanner/planLinks';

// The plan link is written to a local-only store (not the game blob - autosave and
// cloud pulls rebuild the blob and would drop it). Mock the store to observe writes.
jest.mock('@/utils/playtimePlanner/planLinks', () => ({
  setPlanLink: jest.fn(async () => true),
}));
const mockSetPlanLink = setPlanLink as jest.MockedFunction<typeof setPlanLink>;

// Same treatment for the planned-sub schedule store (keyed by game id).
jest.mock('@/utils/playtimePlanner/gameSubs', () => ({
  setGameSubs: jest.fn(async () => true),
}));
const mockSetGameSubs = jest.requireMock('@/utils/playtimePlanner/gameSubs')
  .setGameSubs as jest.Mock;

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

  describe('Playing-Time Planner prefill reconciliation (Rule 3)', () => {
    it('keeps a prefilled on-field player selected even if the coach deselected them', async () => {
      let savedState: AppState | undefined;
      const savedGamesState = createSetStateMock<SavedGamesCollection>({});
      const deps = createTestDeps({
        savedGames: savedGamesState.getState(),
        setSavedGames: savedGamesState.setter,
        utilSaveGame: jest.fn().mockImplementation(async (_id: string, state: AppState) => {
          savedState = state;
          return state;
        }),
      });

      // Prefill put p1 on the field, but the coach's final selection is only p2.
      await startNewGameWithSetup(deps, createBaseRequest({
        initialSelectedPlayerIds: ['p2'],
        availablePlayersForGame: mockPlayers, // p1, p2
        prefill: {
          playersOnField: [{ id: 'p1', name: 'Player 1', isGoalie: false, relX: 0.5, relY: 0.5 }],
          plannedSubs: [],
          formationSnapPoints: [],
        },
      }));

      const onFieldIds = savedState!.playersOnField.map((p) => p.id);
      expect(onFieldIds).toContain('p1');
      // Rule 3: playersOnField ⊆ selectedPlayerIds.
      expect(savedState!.selectedPlayerIds).toEqual(expect.arrayContaining(onFieldIds));
    });

    it('drops a prefilled on-field player no longer in the roster (team switch)', async () => {
      let savedState: AppState | undefined;
      const savedGamesState = createSetStateMock<SavedGamesCollection>({});
      const deps = createTestDeps({
        savedGames: savedGamesState.getState(),
        setSavedGames: savedGamesState.setter,
        utilSaveGame: jest.fn().mockImplementation(async (_id: string, state: AppState) => {
          savedState = state;
          return state;
        }),
      });

      // Roster switched to only p2; prefill still references p1.
      await startNewGameWithSetup(deps, createBaseRequest({
        initialSelectedPlayerIds: ['p2'],
        availablePlayersForGame: [mockPlayers[1]], // only p2
        prefill: {
          playersOnField: [{ id: 'p1', name: 'Player 1', isGoalie: false, relX: 0.5, relY: 0.5 }],
          plannedSubs: [],
          formationSnapPoints: [],
        },
      }));

      const onFieldIds = savedState!.playersOnField.map((p) => p.id);
      const availableIds = savedState!.availablePlayers.map((p) => p.id);
      expect(onFieldIds).not.toContain('p1'); // dropped - not in the roster
      // Rule 3: playersOnField ⊆ selectedPlayerIds ⊆ availablePlayers.
      for (const id of onFieldIds) {
        expect(savedState!.selectedPlayerIds).toContain(id);
        expect(availableIds).toContain(id);
      }
    });

    it('stores the plan link in the local link store for a game created from a plan (Phase 3)', async () => {
      mockSetPlanLink.mockClear();
      const savedGamesState = createSetStateMock<SavedGamesCollection>({});
      const deps = createTestDeps({
        savedGames: savedGamesState.getState(),
        setSavedGames: savedGamesState.setter,
      });

      await startNewGameWithSetup(deps, createBaseRequest({
        initialSelectedPlayerIds: ['p1', 'p2'],
        availablePlayersForGame: mockPlayers,
        prefill: {
          playersOnField: [{ id: 'p1', name: 'Player 1', isGoalie: false, relX: 0.5, relY: 0.5 }],
          plannedSubs: [],
          formationSnapPoints: [],
          sourcePlanId: 'plan-123',
          sourcePlanGameId: 'plangame-456',
        },
      }));

      // The link (in the local-only store, NOT the game blob) lets an edited plan
      // be re-applied to this game later.
      expect(mockSetPlanLink).toHaveBeenCalledTimes(1);
      expect(mockSetPlanLink).toHaveBeenCalledWith(expect.stringMatching(/^game_/), {
        planId: 'plan-123',
        planGameId: 'plangame-456',
      });
    });

    it('stores a non-empty planned-sub schedule under the new game id', async () => {
      mockSetGameSubs.mockClear();
      const savedGamesState = createSetStateMock<SavedGamesCollection>({});
      const deps = createTestDeps({
        savedGames: savedGamesState.getState(),
        setSavedGames: savedGamesState.setter,
      });

      const plannedSubs = [
        { id: 'sub-1', slotId: 's0', timeSeconds: 720, inPlayerId: 'p2', outPlayerId: 'p1' },
      ];
      await startNewGameWithSetup(deps, createBaseRequest({
        initialSelectedPlayerIds: ['p1', 'p2'],
        availablePlayersForGame: mockPlayers,
        prefill: {
          playersOnField: [{ id: 'p1', name: 'Player 1', isGoalie: false, relX: 0.5, relY: 0.5 }],
          plannedSubs,
          formationSnapPoints: [],
        },
      }));

      expect(mockSetGameSubs).toHaveBeenCalledTimes(1);
      expect(mockSetGameSubs).toHaveBeenCalledWith(expect.stringMatching(/^game_/), plannedSubs);
    });

    it('stores no sub schedule when the prefill has none (empty array is not written)', async () => {
      mockSetGameSubs.mockClear();
      const savedGamesState = createSetStateMock<SavedGamesCollection>({});
      const deps = createTestDeps({
        savedGames: savedGamesState.getState(),
        setSavedGames: savedGamesState.setter,
      });

      await startNewGameWithSetup(deps, createBaseRequest({
        initialSelectedPlayerIds: ['p1', 'p2'],
        availablePlayersForGame: mockPlayers,
        prefill: {
          playersOnField: [{ id: 'p1', name: 'Player 1', isGoalie: false, relX: 0.5, relY: 0.5 }],
          plannedSubs: [],
          formationSnapPoints: [],
        },
      }));

      expect(mockSetGameSubs).not.toHaveBeenCalled();
    });

    it('writes no plan link for a normal (non-plan) game', async () => {
      mockSetPlanLink.mockClear();
      const savedGamesState = createSetStateMock<SavedGamesCollection>({});
      const deps = createTestDeps({
        savedGames: savedGamesState.getState(),
        setSavedGames: savedGamesState.setter,
      });

      await startNewGameWithSetup(deps, createBaseRequest({
        initialSelectedPlayerIds: ['p1', 'p2'],
        availablePlayersForGame: mockPlayers,
      }));

      expect(mockSetPlanLink).not.toHaveBeenCalled();
    });
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

      // Should show upgrade prompt with current game count (3 existing games)
      expect(showUpgradePrompt).toHaveBeenCalledWith('game', 3);
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

      // Should show upgrade prompt with current game count
      expect(showUpgradePrompt).toHaveBeenCalledWith('game', 2);
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
