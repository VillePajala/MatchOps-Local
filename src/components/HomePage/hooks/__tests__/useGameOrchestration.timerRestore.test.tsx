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
import { renderHook, waitFor, act } from '@testing-library/react';
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

// Voice clips (review 5.12): controllable per test.
const mockCountClips = jest.fn().mockResolvedValue(0);
const clipListeners: Array<() => void> = [];
jest.mock('@/utils/audioClipStore', () => ({
  ...jest.requireActual('@/utils/audioClipStore'),
  countClips: (...args: unknown[]) => mockCountClips(...args),
  onClipsChanged: (listener: () => void) => { clipListeners.push(listener); return () => undefined; },
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
  default: { language: 'en', on: jest.fn(), off: jest.fn(), changeLanguage: jest.fn() },
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
    // Last period: the match reached full time while away (review 4.26) - shown as
    // full time, not as a Start at the boundary that would run 1 s and stop.
    expect(result.current.modalManagerProps.data.gameSessionState.gameStatus).toBe('gameEnd');
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
    // Kept while the clock runs (review 4.22): a second remount before the next
    // tick must be able to recover it too.
    expect(window.localStorage.getItem('matchops_timer_anchor')).toContain(GAME_ID);
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
   * @edge-case - An anchor of a DIFFERENT game must not correct/resume the loaded
   * game; it is ignored and kept for its own game.
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
    // Another game's anchor is that game's running clock (review 4.22): left alone,
    // and never applied to this one.
    expect(window.localStorage.getItem('matchops_timer_anchor')).toContain('some-other-game');
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

/**
 * Lifecycle scenario bench (review 4.21). Each scenario is a coach-level story
 * of the phone locking, the app being killed or the match view remounting.
 * `it.failing` marks a scenario that is broken today; the fix that repairs it
 * (item named in the title) turns it into a plain `it`.
 * @critical @integration
 */
describe('timer lifecycle scenarios (review 4.21 bench)', () => {
  let queryClient: QueryClient;
  const GAME_A = 'game-a';
  const GAME_B = 'game-b';

  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockLoadTimerStateForGame.mockResolvedValue(null);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  const seed = (games: Record<string, AppState>, currentGameId: string) => {
    mockGetSavedGames.mockResolvedValue(games);
    mockUseGameDataQueries.mockReturnValue(gameDataQueriesResult(games, currentGameId));
  };
  const seedAnchor = (gameId: string, elapsedSeconds: number, agoMs: number) => {
    window.localStorage.setItem(
      'matchops_timer_anchor',
      JSON.stringify({ gameId, elapsedSeconds, wallClockMs: Date.now() - agoMs })
    );
  };
  const mount = async () => {
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const view = renderHook(() => useGameOrchestration({ skipInitialSetup: true }), { wrapper: Wrapper });
    await waitFor(() => expect(view.result.current.isBootstrapping).toBe(false), { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    return view;
  };
  const session = (view: { result: { current: ReturnType<typeof useGameOrchestration> } }) =>
    view.result.current.modalManagerProps.data.gameSessionState;

  /**
   * Phone locked at 10:00 of a 2x15 first half, WebView killed, reopened after the
   * half ended. Must come back as a real half-time at 15:00, so one tap on "Start
   * Period 2" starts the second half - not a "Start" at 15:00 that runs 1 s and stops.
   */
  it('4.26 - killed through the end of a half, reopens as half-time at the boundary', async () => {
    seed({ [GAME_A]: createInProgressGame({ currentPeriod: 1, timeElapsedInSeconds: 600 }) }, GAME_A);
    seedAnchor(GAME_A, 600, 20 * 60 * 1000);
    const view = await mount();
    await waitFor(() => expect(session(view).timeElapsedInSeconds).toBe(900), { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    expect(session(view).isTimerRunning).toBe(false);
    expect(session(view).gameStatus).toBe('periodEnd');
    // Saved straight away (a second reload must not fall back to 10:00), then the
    // stopped clock's anchor is cleared.
    await waitFor(() => expect(mockSaveGame).toHaveBeenCalledWith(
      GAME_A, expect.objectContaining({ gameStatus: 'periodEnd', timeElapsedInSeconds: 900 }), undefined,
    ), { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    await waitFor(() => expect(window.localStorage.getItem('matchops_timer_anchor')).toBeNull());
    view.unmount();
  });

  it('4.26 - if saving the half-time fails, a record at the period end is left for the next load', async () => {
    seed({ [GAME_A]: createInProgressGame({ currentPeriod: 1, timeElapsedInSeconds: 600 }) }, GAME_A);
    seedAnchor(GAME_A, 600, 20 * 60 * 1000);
    mockSaveGame.mockRejectedValueOnce(new Error('transient IndexedDB failure'));
    const view = await mount();
    await waitFor(() => expect(session(view).gameStatus).toBe('periodEnd'), { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    await waitFor(() => {
      const raw = JSON.parse(window.localStorage.getItem('matchops_timer_anchor') ?? '{}');
      expect(raw[GAME_A]?.elapsedSeconds).toBe(900);
    });
    view.unmount();
  });

  it('4.26 - killed through the end of the LAST period, reopens at full time', async () => {
    seed({ [GAME_A]: createInProgressGame({ currentPeriod: 2, timeElapsedInSeconds: 1500 }) }, GAME_A);
    seedAnchor(GAME_A, 1500, 20 * 60 * 1000);
    const view = await mount();
    await waitFor(() => expect(session(view).gameStatus).toBe('gameEnd'), { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    expect(session(view).timeElapsedInSeconds).toBe(1800);
    view.unmount();
  });

  /**
   * Phone locked mid-period; on return the match view remounts twice in quick
   * succession (a resume refresh and a sync remount). The second mount must still
   * recover the running clock - the recovery record must not be spent on the first.
   */
  it('4.22 - two remounts in a row both recover the running clock', async () => {
    seed({ [GAME_A]: createInProgressGame({ currentPeriod: 1, timeElapsedInSeconds: 300 }) }, GAME_A);
    seedAnchor(GAME_A, 300, 60_000);
    const first = await mount();
    await waitFor(() => expect(session(first).isTimerRunning).toBe(true), { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    first.unmount(); // before the first tick rewrites the record
    const second = await mount();
    await waitFor(() => {
      expect(session(second).timeElapsedInSeconds).toBeGreaterThanOrEqual(360);
      expect(session(second).isTimerRunning).toBe(true);
    }, { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    second.unmount();
  });

  /**
   * Match A is running; the coach goes Home and opens game B to check its line-up.
   * Opening B must not destroy A's running-clock record, or A comes back at its last
   * saved time (often 00:00) when the coach returns to it.
   */
  it('4.22/4.29 - opening another game keeps the running game\'s clock record', async () => {
    const games = {
      [GAME_A]: createInProgressGame({ currentPeriod: 1, timeElapsedInSeconds: 0 }),
      [GAME_B]: createInProgressGame({ currentPeriod: 1, timeElapsedInSeconds: 0, gameStatus: 'notStarted' }),
    };
    seed(games, GAME_B);
    seedAnchor(GAME_A, 1200 - 900, 0); // A running at 05:00 right now
    const view = await mount();
    await waitFor(() => expect(session(view).gameStatus).toBe('notStarted'), { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    expect(session(view).isTimerRunning).toBe(false); // never applied to B
    expect(window.localStorage.getItem('matchops_timer_anchor')).toContain(GAME_A);
    view.unmount();
  });

  /**
   * The intended other half of the previous scenario: A was running while the coach
   * looked at B for 3 minutes - the real match kept going - so returning to A counts
   * those minutes and the clock carries on running (capped at the period end).
   */
  it('4.29 - returning to the running game after 3 min away counts the time and keeps running', async () => {
    seed({ [GAME_A]: createInProgressGame({ currentPeriod: 1, timeElapsedInSeconds: 120 }) }, GAME_A);
    seedAnchor(GAME_A, 300, 3 * 60 * 1000); // A at 05:00 when the coach left, 3 min ago
    const view = await mount();
    await waitFor(() => {
      expect(session(view).timeElapsedInSeconds).toBeGreaterThanOrEqual(480);
      expect(session(view).isTimerRunning).toBe(true);
    }, { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    expect(session(view).timeElapsedInSeconds).toBeLessThan(900);
    view.unmount();
  });

  /**
   * A game abandoned mid-period (phone died, another game opened and never returned
   * to) and opened again the next day: its old anchor must not jump the clock to the
   * period end - the game opens at its last saved time, paused.
   */
  it('4.22 review - an anchor older than any real match is ignored', async () => {
    seed({ [GAME_A]: createInProgressGame({ currentPeriod: 1, timeElapsedInSeconds: 300 }) }, GAME_A);
    seedAnchor(GAME_A, 300, 26 * 60 * 60 * 1000);
    const view = await mount();
    await waitFor(() => expect(session(view).timeElapsedInSeconds).toBe(300), { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    expect(session(view).isTimerRunning).toBe(false);
    view.unmount();
  });

  /**
   * Review 4.32: the persisted game is not in a stale snapshot yet and a refetch is in
   * flight. Boot must WAIT and then open that game - it used to mark the initial load
   * complete while waiting, never decide again, and open the default game instead.
   * @critical
   */
  it('4.32 - boot with an unsettled snapshot waits for the refetch and opens the persisted game', async () => {
    const gameA = createInProgressGame({ currentPeriod: 1, timeElapsedInSeconds: 300, opponentName: 'Rivals FC' });
    mockGetSavedGames.mockResolvedValue({ [GAME_A]: gameA });
    let snapshot = { ...gameDataQueriesResult({}, GAME_A), isSettling: true }; // stale, refetching
    mockUseGameDataQueries.mockImplementation(() => snapshot);
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const view = renderHook(() => useGameOrchestration({ skipInitialSetup: true }), { wrapper: Wrapper });
    await act(async () => { await Promise.resolve(); });
    snapshot = { ...gameDataQueriesResult({ [GAME_A]: gameA }, GAME_A), isSettling: false }; // the refetch lands
    view.rerender();
    await waitFor(() => expect(session(view).opponentName).toBe('Rivals FC'), { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    expect(session(view).timeElapsedInSeconds).toBe(300);
    view.unmount();
  });

  /**
   * Paused at 12:34.5, then a reload. Comes back paused at the same time and does not
   * start by itself.
   */
  it('paused across a reload comes back paused at the same time', async () => {
    seed({ [GAME_A]: createInProgressGame({ currentPeriod: 1, timeElapsedInSeconds: 754.5 }) }, GAME_A);
    const view = await mount();
    await waitFor(() => expect(session(view).timeElapsedInSeconds).toBe(754.5), { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    expect(session(view).isTimerRunning).toBe(false);
    view.unmount();
  });
});

/**
 * Review 5.12: the menu's "finish this game" badge counts pending voice clips like the
 * wrap-up checklist does - they disagreed by one for every game with dictation.
 * @critical
 */
describe('finish-this-game badge counts voice clips', () => {
  let queryClient: QueryClient;
  const GAME = 'game-done';
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
    const game = createInProgressGame({ gameStatus: 'gameEnd', isPlayed: true, gameDate: '2024-01-01' } as Partial<AppState>);
    mockGetSavedGames.mockResolvedValue({ [GAME]: game });
    mockUseGameDataQueries.mockReturnValue(gameDataQueriesResult({ [GAME]: game }, GAME));
  });
  afterEach(() => queryClient.clear());

  const badgeTotal = async () => {
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const view = renderHook(() => useGameOrchestration({ skipInitialSetup: true }), { wrapper: Wrapper });
    await waitFor(() => expect(view.result.current.isBootstrapping).toBe(false), { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    await waitFor(() => expect(view.result.current.gameContainerProps.fieldProps.finishProgress).not.toBeNull(), { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    await waitFor(() => expect(mockCountClips).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    return view;
  };
  const total = (view: Awaited<ReturnType<typeof badgeTotal>>) => view.result.current.gameContainerProps.fieldProps.finishProgress!.total;

  it('a pending clip adds the voice-notes item to the badge total', async () => {
    mockCountClips.mockResolvedValue(0);
    const a = await badgeTotal();
    const without = total(a);
    a.unmount();
    mockCountClips.mockResolvedValue(1);
    const b = await badgeTotal();
    expect(total(b)).toBe(without + 1);
    b.unmount();
  });

  it('re-counts when the clip store reports a saved clip (after the write)', async () => {
    mockCountClips.mockResolvedValue(0);
    const view = await badgeTotal();
    const without = total(view);
    mockCountClips.mockResolvedValue(1);
    await act(async () => { clipListeners.forEach((l) => l()); });
    await waitFor(() => expect(total(view)).toBe(without + 1));
    view.unmount();
  });
});

