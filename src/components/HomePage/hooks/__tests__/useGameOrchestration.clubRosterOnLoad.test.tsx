/**
 * Tests for useGameOrchestration - a saved game opens with the CURRENT club roster.
 *
 * Owner bug (Sanni Lahti): a player added to the club roster after a game was created
 * could not be picked for it, because loading the game replaced its player list with the
 * saved copy. The coach then typed her name and created a duplicate club player.
 *
 * @integration
 * @critical
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGameOrchestration } from '../useGameOrchestration';
import type { AppState, Player } from '@/types';

/** Time needed for React Query initialization and hook bootstrapping */
const BOOTSTRAPPING_TIMEOUT_MS = 5000;

// Mock savedGames utilities
const mockSaveGame = jest.fn().mockResolvedValue({});
const mockGetSavedGames = jest.fn();
const mockGetLatestGameId = jest.fn().mockResolvedValue(null);

jest.mock('@/utils/savedGames', () => ({
  saveGame: (...args: unknown[]) => mockSaveGame(...args),
  getSavedGames: () => mockGetSavedGames(),
  getLatestGameId: () => mockGetLatestGameId(),
  deleteGame: jest.fn().mockResolvedValue(true),
  createGame: jest.fn().mockResolvedValue({ gameId: 'new-game', gameData: {} }),
  removeGameEvent: jest.fn().mockResolvedValue({}),
  updateGameDetails: jest.fn().mockResolvedValue({}),
}));

// Mock appSettings utilities
jest.mock('@/utils/appSettings', () => ({
  saveCurrentGameIdSetting: jest.fn().mockResolvedValue(undefined),
  resetAppSettings: jest.fn().mockResolvedValue(undefined),
  saveHasSeenAppGuide: jest.fn().mockResolvedValue(undefined),
  getLastHomeTeamName: jest.fn().mockResolvedValue('Test Team'),
  updateAppSettings: jest.fn().mockResolvedValue(undefined),
  getDrawingModeEnabled: jest.fn().mockResolvedValue(false),
  saveDrawingModeEnabled: jest.fn().mockResolvedValue(undefined),
  getAppSettings: jest.fn().mockResolvedValue({}),
  saveAppSettings: jest.fn().mockResolvedValue(undefined),
}));

// Mock storage utilities
jest.mock('@/utils/storage', () => ({
  getStorageItem: jest.fn().mockResolvedValue(null),
  setStorageItem: jest.fn().mockResolvedValue(undefined),
  removeStorageItem: jest.fn().mockResolvedValue(undefined),
}));

// Mock timerStateManager (controllable per test)
const mockLoadTimerStateForGame = jest.fn().mockResolvedValue(null);
const mockClearTimerState = jest.fn().mockResolvedValue(undefined);
jest.mock('@/utils/timerStateManager', () => ({
  loadTimerStateForGame: (...args: unknown[]) => mockLoadTimerStateForGame(...args),
  clearTimerState: (...args: unknown[]) => mockClearTimerState(...args),
  saveTimerState: jest.fn().mockResolvedValue(undefined),
}));

// Mock masterRoster
jest.mock('@/utils/masterRoster', () => ({
}));

// Mock teams utilities
jest.mock('@/utils/teams', () => ({
  getTeams: jest.fn().mockResolvedValue([]),
  getTeam: jest.fn().mockResolvedValue(null),
}));

// Mock export utilities
jest.mock('@/utils/fullBackup', () => ({
  exportFullBackup: jest.fn(),
}));

jest.mock('@/utils/exportGames', () => ({
  exportJson: jest.fn(),
}));

jest.mock('@/utils/exportExcel', () => ({
  exportCurrentGameExcel: jest.fn(),
  exportAggregateExcel: jest.fn(),
  exportPlayerExcel: jest.fn(),
}));

// Mock i18n
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue || key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { language: 'en', changeLanguage: jest.fn() },
}));

// Mock contexts
jest.mock('@/contexts/ToastProvider', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock('@/contexts/ModalProvider', () => ({
  useModalContext: () => ({
    openGameSettings: jest.fn(),
    closeGameSettings: jest.fn(),
    isGameSettingsOpen: false,
    // L.3c: the match registers its planner live-game hooks on mount.
    setPlannerLiveGameHooks: jest.fn(),
  }),
}));

// Mock premium hook
jest.mock('@/hooks/usePremium', () => ({
  usePremium: () => ({
    canCreate: jest.fn().mockReturnValue(true),
    showUpgradePrompt: jest.fn(),
    isPremium: true,
  }),
}));

// Mock AuthProvider context
jest.mock('@/contexts/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: null,
    session: null,
    isLoading: false,
    isAuthenticated: false,
    signIn: jest.fn(),
    signOut: jest.fn(),
    signUp: jest.fn(),
  }),
}));

// Mock useGameDataQueries with the real flat shape consumed by
// useGameDataManagement (controllable per test)
const mockUseGameDataQueries = jest.fn();
jest.mock('@/hooks/useGameDataQueries', () => ({
  useGameDataQueries: () => mockUseGameDataQueries(),
}));

// Mock datastore
jest.mock('@/datastore', () => ({
  getDataStore: jest.fn().mockResolvedValue({
    getGames: jest.fn().mockResolvedValue({}),
    saveGame: jest.fn().mockResolvedValue({}),
  }),
}));

// Mock masterRosterManager
jest.mock('@/utils/masterRosterManager', () => ({
  getAllPlayers: jest.fn().mockResolvedValue([]),
  addPlayer: jest.fn().mockResolvedValue(null),
  updatePlayer: jest.fn().mockResolvedValue(null),
  removePlayer: jest.fn().mockResolvedValue(true),
}));

// Mock seasons
jest.mock('@/utils/seasons', () => ({
  getSeasons: jest.fn().mockResolvedValue([]),
}));

// Mock tournaments
jest.mock('@/utils/tournaments', () => ({
  getTournaments: jest.fn().mockResolvedValue([]),
}));

// Mock player assessments hook
jest.mock('@/hooks/usePlayerAssessments', () => ({
  __esModule: true,
  default: () => ({
    assessments: {},
    updateAssessment: jest.fn(),
    clearAssessments: jest.fn(),
  }),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock debug utility
jest.mock('@/utils/debug', () => ({
  debug: {
    log: jest.fn(),
    enabled: jest.fn().mockReturnValue(false),
  },
}));

// Test fixtures
const createInProgressGame = (overrides?: Partial<AppState>): AppState => ({
  playersOnField: [],
  opponents: [],
  drawings: [],
  availablePlayers: [],
  showPlayerNames: true,
  teamName: 'Test Team',
  gameEvents: [],
  opponentName: 'Opponent',
  gameDate: '2024-01-01',
  homeScore: 1,
  awayScore: 0,
  gameNotes: '',
  homeOrAway: 'home',
  numberOfPeriods: 2,
  periodDurationMinutes: 15,
  currentPeriod: 2,
  gameStatus: 'inProgress',
  demandFactor: 1,
  selectedPlayerIds: [],
  gamePersonnel: [],
  seasonId: '',
  tournamentId: '',
  subIntervalMinutes: 5,
  completedIntervalDurations: [],
  lastSubConfirmationTimeSeconds: 0,
  timeElapsedInSeconds: 900,
  tacticalDiscs: [],
  tacticalDrawings: [],
  tacticalBallPosition: { relX: 0.5, relY: 0.5 },
  ...overrides,
});

const gameDataQueriesResult = (savedGames: Record<string, AppState>, currentGameId: string | null, masterRoster: Player[] = []) => ({
  masterRoster,
  seasons: [],
  tournaments: [],
  savedGames,
  currentGameId,
  loading: false,
  error: null,
});


describe('useGameOrchestration - opening a game brings in new club players', () => {
  let queryClient: QueryClient;
  const GAME_ID = 'game-1';
  const aino: Player = { id: 'a', name: 'Aino', isGoalie: true, receivedFairPlayCard: false };
  const eetu: Player = { id: 'b', name: 'Eetu', isGoalie: false, receivedFairPlayCard: false };
  const sanni: Player = { id: 's', name: 'Sanni Lahti', isGoalie: false, receivedFairPlayCard: false };

  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  });
  afterEach(() => queryClient.clear());

  const renderOrchestration = async () => {
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    Wrapper.displayName = 'TestQueryClientWrapper';
    const { result } = renderHook(() => useGameOrchestration({ skipInitialSetup: true }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isBootstrapping).toBe(false), { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    return result;
  };

  it('lists a club player who joined after the game was created, unselected; keeps the selection', async () => {
    // Saved game: Aino (the game's goalie) and Eetu, both selected. Sanni joined the club later.
    const game = createInProgressGame({
      availablePlayers: [aino, eetu],
      selectedPlayerIds: ['a', 'b'],
    });
    mockGetSavedGames.mockResolvedValue({ [GAME_ID]: game });
    mockUseGameDataQueries.mockReturnValue(
      gameDataQueriesResult({ [GAME_ID]: game }, GAME_ID, [{ ...aino, isGoalie: false }, eetu, sanni]),
    );

    const result = await renderOrchestration();

    await waitFor(() =>
      expect(result.current.modalManagerProps.data.availablePlayers.map((p: Player) => p.id)).toEqual(['a', 'b', 's']),
    );
    const players = result.current.modalManagerProps.data.availablePlayers as Player[];
    // Per-game state survives: Aino stays this game's goalie although the club flag is off.
    expect(players.find((p) => p.id === 'a')?.isGoalie).toBe(true);
    // Sanni is offered, not selected.
    expect(result.current.modalManagerProps.data.gameSessionState.selectedPlayerIds).toEqual(['a', 'b']);
  });

  /**
   * Owner case: a duplicate Sanni was deleted from the club roster but stayed in the
   * game's list, identical to the real one. An unpicked removed player with nothing
   * recorded is dropped when the game opens; one that is still picked stays.
   */
  it('drops a removed player the game never used; keeps one that is still selected', async () => {
    const dupe: Player = { id: 's2', name: 'Sanni Lahti', isGoalie: false, receivedFairPlayCard: false };
    const old: Player = { id: 'o', name: 'Old Selected', isGoalie: false, receivedFairPlayCard: false };
    const game = createInProgressGame({
      availablePlayers: [aino, sanni, dupe, old],
      selectedPlayerIds: ['a', 'o'],
    });
    mockGetSavedGames.mockResolvedValue({ [GAME_ID]: game });
    mockUseGameDataQueries.mockReturnValue(gameDataQueriesResult({ [GAME_ID]: game }, GAME_ID, [aino, sanni]));

    const result = await renderOrchestration();

    await waitFor(() =>
      expect(result.current.modalManagerProps.data.availablePlayers.map((p: Player) => p.id)).toEqual(['a', 's', 'o']),
    );
  });
});
