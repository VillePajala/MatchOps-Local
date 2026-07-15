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
    // The durable timer anchor lives in localStorage; isolate it per test.
    window.localStorage.clear();
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
   * app was backgrounded; the background duration is folded into the loaded
   * clock and, because the period has NOT ended, the timer auto-resumes so the
   * match clock never silently pauses awaiting a tap. The record is cleared.
   */
  it('folds in the background duration and auto-resumes the clock (still mid-period)', async () => {
    const recordTimestamp = Date.now() - BACKGROUND_MS;
    mockLoadTimerStateForGame.mockResolvedValue({
      gameId: GAME_ID,
      timeElapsedInSeconds: 900,
      timestamp: recordTimestamp,
      wasRunning: true,
    });

    const result = await renderOrchestration();

    // Clock floor = stored + background (8 min); period boundary is 1800 (period
    // 2 of 2x15), so the corrected clock (~1380) is still mid-period.
    await waitFor(() => {
      expect(result.current.modalManagerProps.data.gameSessionState.timeElapsedInSeconds).toBeGreaterThanOrEqual(900 + BACKGROUND_MS / 1000);
    }, { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    // Still below the period boundary (the running timer ticks up but won't reach
    // 1800 within the test window).
    expect(result.current.modalManagerProps.data.gameSessionState.timeElapsedInSeconds).toBeLessThan(1800);
    // Auto-resumed: continues running, no tap needed
    await waitFor(() => {
      expect(result.current.modalManagerProps.data.gameSessionState.gameStatus).toBe('inProgress');
      expect(result.current.modalManagerProps.data.gameSessionState.isTimerRunning).toBe(true);
    }, { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    // Record consumed and cleared - can never be replayed
    expect(mockClearTimerState).toHaveBeenCalled();
  });

  /**
   * @edge-case - Correction is capped at the current period boundary so a
   * phone locked for hours shows the period end, not a runaway clock. Because
   * the period ended during the gap, we do NOT auto-resume: it stays paused so
   * the user taps to acknowledge the period end (never silently auto-advance).
   */
  it('caps at the period boundary and stays paused (does not auto-resume past period end)', async () => {
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
    expect(result.current.modalManagerProps.data.gameSessionState.isTimerRunning).toBe(false);
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
    // No wasRunning marker → not auto-resumed (the timer was intentionally paused)
    expect(result.current.modalManagerProps.data.gameSessionState.gameStatus).toBe('notStarted');
    expect(result.current.modalManagerProps.data.gameSessionState.isTimerRunning).toBe(false);
    expect(mockClearTimerState).toHaveBeenCalled();
  });

  /**
   * @critical - The durable localStorage anchor is the primary recovery path
   * after an Android WebView freeze/kill (the async IndexedDB record does not
   * survive). With only an anchor present (no IndexedDB record), boot must fold
   * the wall-clock gap into the loaded clock and auto-resume the running timer.
   */
  it('recovers from the localStorage anchor when no IndexedDB record survived', async () => {
    mockLoadTimerStateForGame.mockResolvedValue(null); // async record lost on freeze
    // Anchor written synchronously at lock: 900s elapsed, 60s of real time ago.
    window.localStorage.setItem(
      'matchops_timer_anchor',
      JSON.stringify({ gameId: GAME_ID, elapsedSeconds: 900, wallClockMs: Date.now() - 60_000 })
    );

    const result = await renderOrchestration();

    // 900 + 60 = 960, still below the 1800 period boundary → auto-resume running.
    await waitFor(() => {
      expect(result.current.modalManagerProps.data.gameSessionState.timeElapsedInSeconds).toBeGreaterThanOrEqual(960);
    }, { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    expect(result.current.modalManagerProps.data.gameSessionState.timeElapsedInSeconds).toBeLessThan(1800);
    await waitFor(() => {
      expect(result.current.modalManagerProps.data.gameSessionState.gameStatus).toBe('inProgress');
      expect(result.current.modalManagerProps.data.gameSessionState.isTimerRunning).toBe(true);
    }, { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    // Anchor consumed so it can't be replayed.
    expect(window.localStorage.getItem('matchops_timer_anchor')).toBeNull();
  });

  /**
   * @edge-case - The anchor takes precedence over the IndexedDB record (it's the
   * more reliable source). With both present, the anchor's value wins.
   */
  it('prefers the anchor over the IndexedDB record when both exist', async () => {
    // IDB record says 1000s; anchor says 900s + 30s gap = 930s. Anchor should win.
    mockLoadTimerStateForGame.mockResolvedValue({
      gameId: GAME_ID,
      timeElapsedInSeconds: 1000,
      timestamp: Date.now(),
      wasRunning: true,
    });
    window.localStorage.setItem(
      'matchops_timer_anchor',
      JSON.stringify({ gameId: GAME_ID, elapsedSeconds: 900, wallClockMs: Date.now() - 30_000 })
    );

    const result = await renderOrchestration();

    await waitFor(() => {
      const t = result.current.modalManagerProps.data.gameSessionState.timeElapsedInSeconds;
      expect(t).toBeGreaterThanOrEqual(930);
      expect(t).toBeLessThan(960); // anchor (~930), not the IDB 1000
    }, { timeout: BOOTSTRAPPING_TIMEOUT_MS });
  });

  /**
   * @edge-case - A stale anchor left by a DIFFERENT game must not correct/resume
   * the loaded game; it is ignored (and cleared).
   */
  it('ignores an anchor whose gameId does not match the loaded game', async () => {
    mockLoadTimerStateForGame.mockResolvedValue(null);
    window.localStorage.setItem(
      'matchops_timer_anchor',
      JSON.stringify({ gameId: 'some-other-game', elapsedSeconds: 5000, wallClockMs: Date.now() })
    );

    const result = await renderOrchestration();

    await waitFor(() => {
      // Loads at the stored 900, NOT the foreign anchor's 5000, and stays paused.
      expect(result.current.modalManagerProps.data.gameSessionState.timeElapsedInSeconds).toBe(900);
    }, { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    expect(result.current.modalManagerProps.data.gameSessionState.isTimerRunning).toBe(false);
    // Stale foreign anchor consumed so it can't linger.
    expect(window.localStorage.getItem('matchops_timer_anchor')).toBeNull();
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
