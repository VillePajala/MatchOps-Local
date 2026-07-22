/**
 * newGameHandlers Tests
 *
 * Tests for the page-safe persist half of game creation (L.3b):
 * - Successful build + persist (returns the new id/state)
 * - Premium limit enforcement (returns null, upgrade prompt shown)
 * - Planner prefill reconciliation + local stores
 *
 * The old session-apply half (reducer dispatch, modal close, field setters)
 * is retired: the caller enters the match with a FRESH mount instead.
 *
 * @critical - Core game creation functionality
 */

import type { SavedGamesCollection, Player, AppState } from '@/types';
import type { QueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';

import { buildAndPersistNewGame } from './newGameHandlers';
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

// Silence the expected save-failure error log (tests fail on console noise).
jest.mock('@/utils/logger', () => {
  const makeLogger = () => ({
    debug: jest.fn(), log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  });
  return { __esModule: true, default: makeLogger(), createLogger: makeLogger };
});
const mockSetGameSubs = jest.requireMock('@/utils/playtimePlanner/gameSubs')
  .setGameSubs as jest.Mock;

const mockPlayers: Player[] = [
  { id: 'p1', name: 'Player 1', isGoalie: false },
  { id: 'p2', name: 'Player 2', isGoalie: true },
];

const createTestDeps = (overrides?: Record<string, unknown>) => ({
  availablePlayers: mockPlayers,
  savedGames: {} as SavedGamesCollection,
  queryClient: {
    invalidateQueries: jest.fn().mockResolvedValue(undefined),
    setQueryData: jest.fn(),
  } as unknown as QueryClient,
  showToast: jest.fn(),
  t: ((_key: string, fallback?: string) => fallback ?? _key) as TFunction,
  utilSaveGame: jest.fn().mockImplementation(async (_id: string, state: AppState) => state),
  utilSaveCurrentGameIdSetting: jest.fn().mockResolvedValue(undefined),
  defaultSubIntervalMinutes: 5,
  canCreate: jest.fn().mockReturnValue(true),
  showUpgradePrompt: jest.fn(),
  ...overrides,
});

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
  it('persists the new game as current and returns its id + state', async () => {
    const deps = createTestDeps();

    const result = await buildAndPersistNewGame(deps, createBaseRequest());

    expect(result).not.toBeNull();
    expect(result!.gameId).toMatch(/^game_/);
    expect(result!.gameState.opponentName).toBe('Away Team');
    expect(deps.utilSaveGame).toHaveBeenCalledWith(result!.gameId, result!.gameState, undefined);
    expect(deps.utilSaveCurrentGameIdSetting).toHaveBeenCalledWith(result!.gameId, undefined);
    // Both shared queries refresh: the games list AND the current-game id the
    // fresh match mount boots from.
    expect((deps.queryClient as unknown as { invalidateQueries: jest.Mock }).invalidateQueries)
      .toHaveBeenCalledTimes(2);
    // AND the caches are seeded SYNCHRONOUSLY (setQueryData) so the match mount
    // finds the new game at boot and never falls back to the demo DEFAULT_GAME_ID
    // (which would wrongly show the "set up roster" first-game overlay).
    const setQueryData = (deps.queryClient as unknown as { setQueryData: jest.Mock }).setQueryData;
    expect(setQueryData).toHaveBeenCalledTimes(2);
    // The current-game-id cache is set to the new game id.
    expect(setQueryData.mock.calls.some((c: unknown[]) => c[1] === result!.gameId)).toBe(true);
  });

  it('threads the isFriendly flag onto the built game (default false, explicit true)', async () => {
    const def = await buildAndPersistNewGame(createTestDeps(), createBaseRequest());
    expect(def!.gameState.isFriendly).toBe(false);

    const friendly = await buildAndPersistNewGame(createTestDeps(), createBaseRequest({ isFriendly: true }));
    expect(friendly!.gameState.isFriendly).toBe(true);
  });

  it('falls back to the full club roster when the modal passes no selection', async () => {
    const deps = createTestDeps();

    const result = await buildAndPersistNewGame(deps, createBaseRequest({ initialSelectedPlayerIds: [] }));

    expect(result!.gameState.selectedPlayerIds).toEqual(['p1', 'p2']);
  });

  it('returns null and shows a toast when the save fails (no current-id write)', async () => {
    const deps = createTestDeps({
      utilSaveGame: jest.fn().mockRejectedValue(new Error('io')),
    });

    const result = await buildAndPersistNewGame(deps, createBaseRequest());

    expect(result).toBeNull();
    expect(deps.showToast).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(deps.utilSaveCurrentGameIdSetting).not.toHaveBeenCalled();
  });

  describe('Playing-Time Planner prefill reconciliation (Rule 3)', () => {
    it('keeps a prefilled on-field player selected even if the coach deselected them', async () => {
      let savedState: AppState | undefined;
      const deps = createTestDeps({
        utilSaveGame: jest.fn().mockImplementation(async (_id: string, state: AppState) => {
          savedState = state;
          return state;
        }),
      });

      // Prefill put p1 on the field, but the coach's final selection is only p2.
      await buildAndPersistNewGame(deps, createBaseRequest({
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
      const deps = createTestDeps({
        utilSaveGame: jest.fn().mockImplementation(async (_id: string, state: AppState) => {
          savedState = state;
          return state;
        }),
      });

      // Roster switched to only p2; prefill still references p1.
      await buildAndPersistNewGame(deps, createBaseRequest({
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
      const deps = createTestDeps();

      await buildAndPersistNewGame(deps, createBaseRequest({
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
      const deps = createTestDeps();

      const plannedSubs = [
        { id: 'sub-1', slotId: 's0', timeSeconds: 720, inPlayerId: 'p2', outPlayerId: 'p1' },
      ];
      await buildAndPersistNewGame(deps, createBaseRequest({
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
      const deps = createTestDeps();

      await buildAndPersistNewGame(deps, createBaseRequest({
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
      const deps = createTestDeps();

      await buildAndPersistNewGame(deps, createBaseRequest({
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
      const showUpgradePrompt = jest.fn();
      const canCreate = jest.fn().mockReturnValue(false); // Limit reached

      const deps = createTestDeps({
        savedGames: existingGames,
        canCreate,
        showUpgradePrompt,
      });

      const result = await buildAndPersistNewGame(deps, createBaseRequest({ seasonId: 'season-1' }));

      // Should show upgrade prompt with current game count (3 existing games)
      expect(showUpgradePrompt).toHaveBeenCalledWith('game', 3);
      // Should NOT proceed with game creation
      expect(result).toBeNull();
      expect(deps.utilSaveGame).not.toHaveBeenCalled();
    });

    it('blocks game creation when tournament game limit is reached', async () => {
      const existingGames: SavedGamesCollection = {
        game1: { tournamentId: 'tournament-1' } as AppState,
        game2: { tournamentId: 'tournament-1' } as AppState,
      };
      const showUpgradePrompt = jest.fn();
      const canCreate = jest.fn().mockReturnValue(false); // Limit reached

      const deps = createTestDeps({
        savedGames: existingGames,
        canCreate,
        showUpgradePrompt,
      });

      await buildAndPersistNewGame(deps, createBaseRequest({ tournamentId: 'tournament-1' }));

      // Should show upgrade prompt with current game count
      expect(showUpgradePrompt).toHaveBeenCalledWith('game', 2);
      // Should NOT proceed with game creation
      expect(deps.utilSaveGame).not.toHaveBeenCalled();
    });

    it('allows game creation when under limit', async () => {
      const existingGames: SavedGamesCollection = {
        game1: { seasonId: 'season-1' } as AppState,
      };
      const showUpgradePrompt = jest.fn();
      const canCreate = jest.fn().mockReturnValue(true); // Under limit

      const deps = createTestDeps({
        savedGames: existingGames,
        canCreate,
        showUpgradePrompt,
      });

      await buildAndPersistNewGame(deps, createBaseRequest({ seasonId: 'season-1' }));

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
      const canCreate = jest.fn().mockReturnValue(true);
      const deps = createTestDeps({
        savedGames: existingGames,
        canCreate,
      });

      await buildAndPersistNewGame(deps, createBaseRequest({ seasonId: 'season-1' }));

      // Should check with count of 2 (only games in season-1)
      expect(canCreate).toHaveBeenCalledWith('game', 2);
    });

    it('checks limit with correct game count for tournament', async () => {
      const existingGames: SavedGamesCollection = {
        game1: { tournamentId: 'tournament-1' } as AppState,
        game2: { seasonId: 'season-1' } as AppState, // Season game
        game3: { tournamentId: 'tournament-2' } as AppState, // Different tournament
      };
      const canCreate = jest.fn().mockReturnValue(true);
      const deps = createTestDeps({
        savedGames: existingGames,
        canCreate,
      });

      await buildAndPersistNewGame(deps, createBaseRequest({ tournamentId: 'tournament-1' }));

      // Should check with count of 1 (only games in tournament-1)
      expect(canCreate).toHaveBeenCalledWith('game', 1);
    });

    it('skips limit check for games without season or tournament', async () => {
      const canCreate = jest.fn().mockReturnValue(true);
      const deps = createTestDeps({ canCreate });

      await buildAndPersistNewGame(deps, createBaseRequest({
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
