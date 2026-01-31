/**
 * Tests for useGameDataManagement hook
 * @critical - Data fetching and synchronization for game orchestrator
 *
 * This hook centralizes all React Query operations for:
 * - Master roster loading and sync
 * - Seasons and tournaments CRUD
 * - Saved games collection
 * - Teams and personnel data
 */

// ALL mocks MUST be declared BEFORE any imports to ensure proper hoisting
// Logger mock must include createLogger for dependencies like storageBootstrap.ts
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
  createLogger: jest.fn(() => ({
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  })),
}));

jest.mock('@/hooks/useGameDataQueries');
jest.mock('@/hooks/useTeamQueries');
jest.mock('@/hooks/usePersonnelManager');
jest.mock('@/utils/seasons');
jest.mock('@/utils/tournaments');

// Mock useDataStore for user-scoped storage
const TEST_USER_ID = 'test-user-123';
jest.mock('@/hooks/useDataStore', () => ({
  useDataStore: () => ({
    userId: TEST_USER_ID,
    getStore: jest.fn(),
    isUserScoped: true,
  }),
}));

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useGameDataManagement,
  type UseGameDataManagementParams,
} from '../useGameDataManagement';
import { DEFAULT_GAME_ID } from '@/config/constants';
import type { Player, Season, Tournament, SavedGamesCollection } from '@/types';

// Import mocked modules
import { useGameDataQueries } from '@/hooks/useGameDataQueries';
import { useTeamsQuery } from '@/hooks/useTeamQueries';
import { usePersonnelManager } from '@/hooks/usePersonnelManager';
import {
  addSeason as utilAddSeason,
  updateSeason as utilUpdateSeason,
  deleteSeason as utilDeleteSeason,
} from '@/utils/seasons';
import {
  addTournament as utilAddTournament,
  updateTournament as utilUpdateTournament,
  deleteTournament as utilDeleteTournament,
} from '@/utils/tournaments';

const mockedUseGameDataQueries = useGameDataQueries as jest.MockedFunction<typeof useGameDataQueries>;
const mockedUseTeamsQuery = useTeamsQuery as jest.MockedFunction<typeof useTeamsQuery>;
const mockedUsePersonnelManager = usePersonnelManager as jest.MockedFunction<typeof usePersonnelManager>;
const mockedAddSeason = utilAddSeason as jest.MockedFunction<typeof utilAddSeason>;
const mockedUpdateSeason = utilUpdateSeason as jest.MockedFunction<typeof utilUpdateSeason>;
const mockedDeleteSeason = utilDeleteSeason as jest.MockedFunction<typeof utilDeleteSeason>;
const mockedAddTournament = utilAddTournament as jest.MockedFunction<typeof utilAddTournament>;
const mockedUpdateTournament = utilUpdateTournament as jest.MockedFunction<typeof utilUpdateTournament>;
const mockedDeleteTournament = utilDeleteTournament as jest.MockedFunction<typeof utilDeleteTournament>;

// Test data factories
const createPlayer = (overrides: Partial<Player> = {}): Player => ({
  id: `player-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: 'Test Player',
  jerseyNumber: '10',
  isGoalie: false,
  ...overrides,
});

const createSeason = (overrides: Partial<Season> = {}): Season => ({
  id: `season-${Date.now()}`,
  name: 'Test Season',
  startDate: '2025-01-01',
  endDate: '2025-12-31',
  ...overrides,
});

const createTournament = (overrides: Partial<Tournament> = {}): Tournament => ({
  id: `tournament-${Date.now()}`,
  name: 'Test Tournament',
  startDate: '2025-06-01',
  endDate: '2025-06-30',
  ...overrides,
});

describe('useGameDataManagement', () => {
  let queryClient: QueryClient;
  let defaultParams: UseGameDataManagementParams;

  // Create wrapper with QueryClientProvider
  const createWrapper = () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    Wrapper.displayName = 'TestQueryClientWrapper';
    return Wrapper;
  };

  // Default mock implementations
  const setupDefaultMocks = () => {
    mockedUseGameDataQueries.mockReturnValue({
      masterRoster: [],
      seasons: [],
      tournaments: [],
      savedGames: null,
      currentGameId: null,
      loading: false,
      error: null,
    });

    mockedUseTeamsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isError: false,
      isSuccess: true,
      status: 'success',
    } as unknown as ReturnType<typeof useTeamsQuery>);

    mockedUsePersonnelManager.mockReturnValue({
      personnel: [],
      isLoading: false,
      error: null,
      addPersonnel: jest.fn(),
      updatePersonnel: jest.fn(),
      deletePersonnel: jest.fn(),
      refreshPersonnel: jest.fn(),
    } as unknown as ReturnType<typeof usePersonnelManager>);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
    defaultParams = {
      currentGameId: DEFAULT_GAME_ID,
      setAvailablePlayers: jest.fn(),
      setSeasons: jest.fn(),
      setTournaments: jest.fn(),
    };
  });

  // ============================================
  // Initial Data Loading
  // ============================================
  describe('initial data loading', () => {
    it('should return empty arrays when no data is loaded', () => {
      const { result } = renderHook(
        () => useGameDataManagement(defaultParams),
        { wrapper: createWrapper() }
      );

      expect(result.current.masterRoster).toEqual([]);
      expect(result.current.seasons).toEqual([]);
      expect(result.current.tournaments).toEqual([]);
      expect(result.current.savedGames).toBeNull();
      expect(result.current.teams).toEqual([]);
      expect(result.current.personnel).toEqual([]);
    });

    it('should return data from queries when loaded', () => {
      const players = [createPlayer({ name: 'Player 1' }), createPlayer({ name: 'Player 2' })];
      const seasons = [createSeason({ name: 'Season 2025' })];
      const tournaments = [createTournament({ name: 'Cup 2025' })];
      const savedGames: SavedGamesCollection = {
        'game-1': {
          playersOnField: [],
          opponents: [],
          drawings: [],
          availablePlayers: [],
          showPlayerNames: true,
          teamName: 'Team A',
          gameEvents: [],
          opponentName: 'Team B',
          gameDate: '2025-01-15',
          homeScore: 2,
          awayScore: 1,
          gameNotes: '',
          homeOrAway: 'home',
          numberOfPeriods: 2,
          periodDurationMinutes: 15,
          currentPeriod: 2,
          gameStatus: 'gameEnd',
          selectedPlayerIds: [],
          assessments: {},
          seasonId: '',
          tournamentId: '',
          gameLocation: '',
          gameTime: '15:00',
          subIntervalMinutes: 5,
          completedIntervalDurations: [],
          lastSubConfirmationTimeSeconds: 0,
          tacticalDiscs: [],
          tacticalDrawings: [],
          tacticalBallPosition: { relX: 0.5, relY: 0.5 },
        },
      };

      mockedUseGameDataQueries.mockReturnValue({
        masterRoster: players,
        seasons,
        tournaments,
        savedGames,
        currentGameId: 'game-1',
        loading: false,
        error: null,
      });

      const { result } = renderHook(
        () => useGameDataManagement(defaultParams),
        { wrapper: createWrapper() }
      );

      expect(result.current.masterRoster).toEqual(players);
      expect(result.current.seasons).toEqual(seasons);
      expect(result.current.tournaments).toEqual(tournaments);
      expect(result.current.savedGames).toEqual(savedGames);
      expect(result.current.currentGameIdSetting).toBe('game-1');
    });

    it('should expose loading state', () => {
      mockedUseGameDataQueries.mockReturnValue({
        masterRoster: [],
        seasons: [],
        tournaments: [],
        savedGames: null,
        currentGameId: null,
        loading: true,
        error: null,
      });

      const { result } = renderHook(
        () => useGameDataManagement(defaultParams),
        { wrapper: createWrapper() }
      );

      expect(result.current.isLoading).toBe(true);
    });

    it('should expose error state', () => {
      const testError = new Error('Failed to load data');
      mockedUseGameDataQueries.mockReturnValue({
        masterRoster: [],
        seasons: [],
        tournaments: [],
        savedGames: null,
        currentGameId: null,
        loading: false,
        error: testError,
      });

      const { result } = renderHook(
        () => useGameDataManagement(defaultParams),
        { wrapper: createWrapper() }
      );

      expect(result.current.error).toBe(testError);
    });
  });

  // ============================================
  // Master Roster Sync
  // ============================================
  describe('master roster synchronization', () => {
    it('should sync master roster to availablePlayers on default game', async () => {
      const players = [createPlayer({ name: 'Player 1' }), createPlayer({ name: 'Player 2' })];
      mockedUseGameDataQueries.mockReturnValue({
        masterRoster: players,
        seasons: [],
        tournaments: [],
        savedGames: null,
        currentGameId: null,
        loading: false,
        error: null,
      });

      const setAvailablePlayers = jest.fn();
      const params = { ...defaultParams, setAvailablePlayers };

      renderHook(() => useGameDataManagement(params), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(setAvailablePlayers).toHaveBeenCalledWith(players);
      });
    });

    it('should merge master roster while preserving per-game goalie status for active games', async () => {
      const masterRoster = [
        createPlayer({ id: 'p1', name: 'Player 1 Updated', isGoalie: false }),
        createPlayer({ id: 'p2', name: 'Player 2', isGoalie: true }),
      ];
      mockedUseGameDataQueries.mockReturnValue({
        masterRoster,
        seasons: [],
        tournaments: [],
        savedGames: null,
        currentGameId: null,
        loading: false,
        error: null,
      });

      const setAvailablePlayers = jest.fn();
      const params = {
        ...defaultParams,
        currentGameId: 'game-123', // Active game, not default
        setAvailablePlayers,
      };

      renderHook(() => useGameDataManagement(params), { wrapper: createWrapper() });

      await waitFor(() => {
        // Should be called with a merge function for active games
        expect(setAvailablePlayers).toHaveBeenCalled();
      });

      // Verify the merge function preserves per-game goalie status
      const mergeFunction = setAvailablePlayers.mock.calls[0][0];
      expect(typeof mergeFunction).toBe('function');

      // Simulate current game players with different goalie status
      const currentGamePlayers = [
        createPlayer({ id: 'p1', name: 'Player 1 Old', isGoalie: true }), // Goalie in this game
        createPlayer({ id: 'p2', name: 'Player 2', isGoalie: false }), // Not goalie in this game
      ];

      const mergedResult = mergeFunction(currentGamePlayers);

      // Should have updated names from master roster but preserved per-game goalie status
      expect(mergedResult[0].name).toBe('Player 1 Updated');
      expect(mergedResult[0].isGoalie).toBe(true); // Preserved from game
      expect(mergedResult[1].isGoalie).toBe(false); // Preserved from game
    });

    it('should set empty array on roster load error', async () => {
      mockedUseGameDataQueries.mockReturnValue({
        masterRoster: [],
        seasons: [],
        tournaments: [],
        savedGames: null,
        currentGameId: null,
        loading: false,
        error: new Error('Roster load failed'),
      });

      const setAvailablePlayers = jest.fn();
      const params = { ...defaultParams, setAvailablePlayers };

      renderHook(() => useGameDataManagement(params), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(setAvailablePlayers).toHaveBeenCalledWith([]);
      });
    });
  });

  // ============================================
  // Seasons Sync
  // ============================================
  describe('seasons synchronization', () => {
    it('should sync seasons to local state', async () => {
      const seasons = [createSeason({ name: 'Spring 2025' }), createSeason({ name: 'Fall 2025' })];
      mockedUseGameDataQueries.mockReturnValue({
        masterRoster: [],
        seasons,
        tournaments: [],
        savedGames: null,
        currentGameId: null,
        loading: false,
        error: null,
      });

      const setSeasons = jest.fn();
      const params = { ...defaultParams, setSeasons };

      renderHook(() => useGameDataManagement(params), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(setSeasons).toHaveBeenCalledWith(seasons);
      });
    });

    it('should set empty array on seasons error', async () => {
      mockedUseGameDataQueries.mockReturnValue({
        masterRoster: [],
        seasons: [],
        tournaments: [],
        savedGames: null,
        currentGameId: null,
        loading: false,
        error: new Error('Seasons load failed'),
      });

      const setSeasons = jest.fn();
      const params = { ...defaultParams, setSeasons };

      renderHook(() => useGameDataManagement(params), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(setSeasons).toHaveBeenCalledWith([]);
      });
    });
  });

  // ============================================
  // Tournaments Sync
  // ============================================
  describe('tournaments synchronization', () => {
    it('should sync tournaments to local state', async () => {
      const tournaments = [createTournament({ name: 'Summer Cup' })];
      mockedUseGameDataQueries.mockReturnValue({
        masterRoster: [],
        seasons: [],
        tournaments,
        savedGames: null,
        currentGameId: null,
        loading: false,
        error: null,
      });

      const setTournaments = jest.fn();
      const params = { ...defaultParams, setTournaments };

      renderHook(() => useGameDataManagement(params), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(setTournaments).toHaveBeenCalledWith(tournaments);
      });
    });

    it('should set empty array on tournaments error', async () => {
      mockedUseGameDataQueries.mockReturnValue({
        masterRoster: [],
        seasons: [],
        tournaments: [],
        savedGames: null,
        currentGameId: null,
        loading: false,
        error: new Error('Tournaments load failed'),
      });

      const setTournaments = jest.fn();
      const params = { ...defaultParams, setTournaments };

      renderHook(() => useGameDataManagement(params), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(setTournaments).toHaveBeenCalledWith([]);
      });
    });
  });

  // ============================================
  // Season Mutations
  // ============================================
  describe('season mutations', () => {
    it('should expose addSeason mutation', async () => {
      const newSeason = createSeason({ id: 'new-season', name: 'New Season' });
      mockedAddSeason.mockResolvedValue(newSeason);

      const { result } = renderHook(
        () => useGameDataManagement(defaultParams),
        { wrapper: createWrapper() }
      );

      expect(result.current.mutationResults.addSeason).toBeDefined();
      expect(typeof result.current.mutationResults.addSeason.mutateAsync).toBe('function');

      await act(async () => {
        const addedSeason = await result.current.mutationResults.addSeason.mutateAsync({
          name: 'New Season',
        });
        expect(addedSeason).toEqual(newSeason);
      });

      expect(mockedAddSeason).toHaveBeenCalledWith('New Season', {}, TEST_USER_ID);
    });

    it('should expose updateSeason mutation', async () => {
      const season = createSeason({ id: 'season-1', name: 'Updated Season' });
      mockedUpdateSeason.mockResolvedValue(season);

      const { result } = renderHook(
        () => useGameDataManagement(defaultParams),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        await result.current.mutationResults.updateSeason.mutateAsync(season);
      });

      expect(mockedUpdateSeason).toHaveBeenCalledWith(season, TEST_USER_ID);
    });

    it('should expose deleteSeason mutation', async () => {
      mockedDeleteSeason.mockResolvedValue(true);

      const { result } = renderHook(
        () => useGameDataManagement(defaultParams),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        const deleted = await result.current.mutationResults.deleteSeason.mutateAsync('season-1');
        expect(deleted).toBe(true);
      });

      expect(mockedDeleteSeason).toHaveBeenCalledWith('season-1', TEST_USER_ID);
    });

    it('should handle addSeason returning null', async () => {
      mockedAddSeason.mockResolvedValue(null);

      const { result } = renderHook(
        () => useGameDataManagement(defaultParams),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        const addedSeason = await result.current.mutationResults.addSeason.mutateAsync({
          name: 'Failed Season',
        });
        expect(addedSeason).toBeNull();
      });
    });
  });

  // ============================================
  // Tournament Mutations
  // ============================================
  describe('tournament mutations', () => {
    it('should expose addTournament mutation', async () => {
      const newTournament = createTournament({ id: 'new-tournament', name: 'New Cup' });
      mockedAddTournament.mockResolvedValue(newTournament);

      const { result } = renderHook(
        () => useGameDataManagement(defaultParams),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        const addedTournament = await result.current.mutationResults.addTournament.mutateAsync({
          name: 'New Cup',
        });
        expect(addedTournament).toEqual(newTournament);
      });

      expect(mockedAddTournament).toHaveBeenCalledWith('New Cup', {}, TEST_USER_ID);
    });

    it('should expose updateTournament mutation', async () => {
      const tournament = createTournament({ id: 'tournament-1', name: 'Updated Cup' });
      mockedUpdateTournament.mockResolvedValue(tournament);

      const { result } = renderHook(
        () => useGameDataManagement(defaultParams),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        await result.current.mutationResults.updateTournament.mutateAsync(tournament);
      });

      expect(mockedUpdateTournament).toHaveBeenCalledWith(tournament, TEST_USER_ID);
    });

    it('should expose deleteTournament mutation', async () => {
      mockedDeleteTournament.mockResolvedValue(true);

      const { result } = renderHook(
        () => useGameDataManagement(defaultParams),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        const deleted = await result.current.mutationResults.deleteTournament.mutateAsync('tournament-1');
        expect(deleted).toBe(true);
      });

      expect(mockedDeleteTournament).toHaveBeenCalledWith('tournament-1', TEST_USER_ID);
    });

    it('should handle addTournament returning null', async () => {
      mockedAddTournament.mockResolvedValue(null);

      const { result } = renderHook(
        () => useGameDataManagement(defaultParams),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        const addedTournament = await result.current.mutationResults.addTournament.mutateAsync({
          name: 'Failed Tournament',
        });
        expect(addedTournament).toBeNull();
      });
    });
  });

  // ============================================
  // Teams and Personnel
  // ============================================
  describe('teams and personnel', () => {
    it('should expose teams data', () => {
      const teams = [
        { id: 'team-1', name: 'Team A', players: [] },
        { id: 'team-2', name: 'Team B', players: [] },
      ];
      mockedUseTeamsQuery.mockReturnValue({
        data: teams,
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useTeamsQuery>);

      const { result } = renderHook(
        () => useGameDataManagement(defaultParams),
        { wrapper: createWrapper() }
      );

      expect(result.current.teams).toEqual(teams);
    });

    it('should expose personnel data', () => {
      const personnel = [
        { id: 'person-1', name: 'Coach Smith', role: 'coach' as const },
        { id: 'person-2', name: 'Assistant Jones', role: 'assistant' as const },
      ];
      mockedUsePersonnelManager.mockReturnValue({
        personnel,
        isLoading: false,
        error: null,
        addPersonnel: jest.fn(),
        updatePersonnel: jest.fn(),
        deletePersonnel: jest.fn(),
        refreshPersonnel: jest.fn(),
      } as unknown as ReturnType<typeof usePersonnelManager>);

      const { result } = renderHook(
        () => useGameDataManagement(defaultParams),
        { wrapper: createWrapper() }
      );

      expect(result.current.personnel).toEqual(personnel);
    });

    it('should expose personnelManager', () => {
      const addPersonnel = jest.fn();
      mockedUsePersonnelManager.mockReturnValue({
        personnel: [],
        isLoading: false,
        error: null,
        addPersonnel,
        updatePersonnel: jest.fn(),
        deletePersonnel: jest.fn(),
        refreshPersonnel: jest.fn(),
      } as unknown as ReturnType<typeof usePersonnelManager>);

      const { result } = renderHook(
        () => useGameDataManagement(defaultParams),
        { wrapper: createWrapper() }
      );

      expect(result.current.personnelManager).toBeDefined();
      expect(result.current.personnelManager.addPersonnel).toBe(addPersonnel);
    });
  });

  // ============================================
  // Combined Loading State
  // ============================================
  describe('combined loading state', () => {
    it('should show loading when game data is loading', () => {
      mockedUseGameDataQueries.mockReturnValue({
        masterRoster: [],
        seasons: [],
        tournaments: [],
        savedGames: null,
        currentGameId: null,
        loading: true,
        error: null,
      });

      mockedUsePersonnelManager.mockReturnValue({
        personnel: [],
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof usePersonnelManager>);

      const { result } = renderHook(
        () => useGameDataManagement(defaultParams),
        { wrapper: createWrapper() }
      );

      expect(result.current.isLoading).toBe(true);
    });

    it('should show loading when personnel is loading', () => {
      mockedUseGameDataQueries.mockReturnValue({
        masterRoster: [],
        seasons: [],
        tournaments: [],
        savedGames: null,
        currentGameId: null,
        loading: false,
        error: null,
      });

      mockedUsePersonnelManager.mockReturnValue({
        personnel: [],
        isLoading: true,
        error: null,
      } as unknown as ReturnType<typeof usePersonnelManager>);

      const { result } = renderHook(
        () => useGameDataManagement(defaultParams),
        { wrapper: createWrapper() }
      );

      expect(result.current.isLoading).toBe(true);
    });

    it('should not show loading when both are loaded', () => {
      mockedUseGameDataQueries.mockReturnValue({
        masterRoster: [],
        seasons: [],
        tournaments: [],
        savedGames: null,
        currentGameId: null,
        loading: false,
        error: null,
      });

      mockedUsePersonnelManager.mockReturnValue({
        personnel: [],
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof usePersonnelManager>);

      const { result } = renderHook(
        () => useGameDataManagement(defaultParams),
        { wrapper: createWrapper() }
      );

      expect(result.current.isLoading).toBe(false);
    });
  });

  // ============================================
  // Loading States - No Sync During Load
  // ============================================
  describe('loading states - no sync during load', () => {
    it('should not call setAvailablePlayers while loading', async () => {
      mockedUseGameDataQueries.mockReturnValue({
        masterRoster: [createPlayer()],
        seasons: [],
        tournaments: [],
        savedGames: null,
        currentGameId: null,
        loading: true, // Still loading
        error: null,
      });

      const setAvailablePlayers = jest.fn();
      const params = { ...defaultParams, setAvailablePlayers };

      renderHook(() => useGameDataManagement(params), { wrapper: createWrapper() });

      // Wait a tick to ensure useEffect runs
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(setAvailablePlayers).not.toHaveBeenCalled();
    });

    it('should not call setSeasons while loading', async () => {
      mockedUseGameDataQueries.mockReturnValue({
        masterRoster: [],
        seasons: [createSeason()],
        tournaments: [],
        savedGames: null,
        currentGameId: null,
        loading: true, // Still loading
        error: null,
      });

      const setSeasons = jest.fn();
      const params = { ...defaultParams, setSeasons };

      renderHook(() => useGameDataManagement(params), { wrapper: createWrapper() });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(setSeasons).not.toHaveBeenCalled();
    });

    it('should not call setTournaments while loading', async () => {
      mockedUseGameDataQueries.mockReturnValue({
        masterRoster: [],
        seasons: [],
        tournaments: [createTournament()],
        savedGames: null,
        currentGameId: null,
        loading: true, // Still loading
        error: null,
      });

      const setTournaments = jest.fn();
      const params = { ...defaultParams, setTournaments };

      renderHook(() => useGameDataManagement(params), { wrapper: createWrapper() });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(setTournaments).not.toHaveBeenCalled();
    });
  });
});
