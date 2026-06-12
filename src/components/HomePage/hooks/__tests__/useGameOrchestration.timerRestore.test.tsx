/**
 * Tests for useGameOrchestration - hidden-session timer restore at boot
 *
 * After a force-reload (app backgrounded >5 min with the timer running),
 * the persisted timer record must be consumed: the background duration is
 * folded into the loaded clock (capped at the period boundary) and the
 * record is cleared so it can never be replayed.
 *
 * @integration @critical - The force-reload mid-game recovery path
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGameOrchestration } from '../useGameOrchestration';
import type { AppState } from '@/types';

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
  setPlayerFairPlayCardStatus: jest.fn().mockResolvedValue({}),
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

const gameDataQueriesResult = (savedGames: Record<string, AppState>, currentGameId: string | null) => ({
  masterRoster: [],
  seasons: [],
  tournaments: [],
  savedGames,
  currentGameId,
  loading: false,
  error: null,
});

describe('useGameOrchestration - hidden-session timer restore', () => {
  let queryClient: QueryClient;
  const GAME_ID = 'game-1';
  const BACKGROUND_MS = 8 * 60 * 1000; // 8 minutes locked phone

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

    const game = createInProgressGame();
    mockGetSavedGames.mockResolvedValue({ [GAME_ID]: game });
    mockUseGameDataQueries.mockReturnValue(
      gameDataQueriesResult({ [GAME_ID]: game }, GAME_ID)
    );
  });

  afterEach(() => {
    queryClient.clear();
  });

  const createWrapper = () => {
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    Wrapper.displayName = 'TestQueryClientWrapper';
    return Wrapper;
  };

  const renderOrchestration = async () => {
    const { result } = renderHook(
      () => useGameOrchestration({ skipInitialSetup: true }),
      { wrapper: createWrapper() }
    );
    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    }, { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    return result;
  };

  /**
   * @critical - A wasRunning record means the real match continued while the
   * app was backgrounded; the background duration must be folded into the
   * loaded clock, paused, and the record cleared.
   */
  it('applies the background duration to the loaded clock and clears the record', async () => {
    const recordTimestamp = Date.now() - BACKGROUND_MS;
    mockLoadTimerStateForGame.mockResolvedValue({
      gameId: GAME_ID,
      timeElapsedInSeconds: 900,
      timestamp: recordTimestamp,
      wasRunning: true,
    });

    const result = await renderOrchestration();

    await waitFor(() => {
      expect(result.current.modalManagerProps.data.gameSessionState.timeElapsedInSeconds).toBeGreaterThanOrEqual(900 + BACKGROUND_MS / 1000);
    }, { timeout: BOOTSTRAPPING_TIMEOUT_MS });

    // Upper bound derived from the actual wall clock at assertion time, so the
    // test cannot flake on slow runners: correction <= 900 + full age of record.
    const maxCorrected = 900 + Math.ceil((Date.now() - recordTimestamp) / 1000);
    expect(result.current.modalManagerProps.data.gameSessionState.timeElapsedInSeconds).toBeLessThanOrEqual(maxCorrected);
    // Loaded paused, never auto-started
    expect(result.current.modalManagerProps.data.gameSessionState.gameStatus).toBe('notStarted');
    expect(result.current.modalManagerProps.data.gameSessionState.isTimerRunning).toBe(false);
    // Record consumed and cleared - can never be replayed
    expect(mockClearTimerState).toHaveBeenCalled();
  });

  /**
   * @edge-case - Correction is capped at the current period boundary so a
   * phone locked for hours shows the period end, not a runaway clock.
   */
  it('caps the corrected clock at the current period boundary', async () => {
    mockLoadTimerStateForGame.mockResolvedValue({
      gameId: GAME_ID,
      timeElapsedInSeconds: 900,
      timestamp: Date.now() - 3 * 60 * 60 * 1000, // locked for 3 hours
      wasRunning: true,
    });

    const result = await renderOrchestration();

    await waitFor(() => {
      // Period 2 of a 2x15 game: boundary = 2 * 15 * 60 = 1800
      expect(result.current.modalManagerProps.data.gameSessionState.timeElapsedInSeconds).toBe(1800);
    }, { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    expect(result.current.modalManagerProps.data.gameSessionState.gameStatus).toBe('notStarted');
  });

  /**
   * @edge-case - A record saved while paused (no wasRunning) means the match
   * clock was intentionally stopped; no background time is added.
   */
  it('does not add background time when the timer was paused at hide', async () => {
    mockLoadTimerStateForGame.mockResolvedValue({
      gameId: GAME_ID,
      timeElapsedInSeconds: 900,
      timestamp: Date.now() - BACKGROUND_MS,
      // wasRunning absent: debounced tick save, timer not running at hide
    });

    const result = await renderOrchestration();

    await waitFor(() => {
      expect(result.current.modalManagerProps.data.gameSessionState.timeElapsedInSeconds).toBe(900);
    }, { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    expect(mockClearTimerState).toHaveBeenCalled();
  });

  /**
   * @edge-case - No record at all: clock loads exactly as persisted.
   */
  it('loads the stored clock unchanged when no timer record exists', async () => {
    mockLoadTimerStateForGame.mockResolvedValue(null);

    const result = await renderOrchestration();

    await waitFor(() => {
      expect(result.current.modalManagerProps.data.gameSessionState.timeElapsedInSeconds).toBe(900);
    }, { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    expect(mockClearTimerState).toHaveBeenCalled();
  });
});
