/**
 * Tests for useGameOrchestration - the venue address rides the session
 *
 * REGRESSION. A match created with a pinned venue persisted its street address,
 * but loading that match into the session dropped `locationAddress` (the pin's
 * lat/lng were carried, the address beside them was not). Ottelutiedot then
 * showed an empty address field, and because the autosave snapshot is the
 * session state spread whole, the very next save wrote the address back as
 * undefined - the coach typed it once and the app forgot it.
 *
 * @integration @critical - the address is what makes a venue findable again
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


describe('useGameOrchestration - the venue address rides the session', () => {
  let queryClient: QueryClient;
  const GAME_ID = 'game-1';
  const ADDRESS = 'Kirkkokatu 1, Savonlinna';

  const withVenue = (overrides?: Partial<AppState>) => createInProgressGame({
    gameLocation: 'Mitta-Keittiöt Areena',
    locationLat: 61.868,
    locationLng: 28.879,
    locationAddress: ADDRESS,
    ...overrides,
  });

  const arrange = (game: AppState) => {
    mockGetSavedGames.mockResolvedValue({ [GAME_ID]: game });
    mockUseGameDataQueries.mockReturnValue(gameDataQueriesResult({ [GAME_ID]: game }, GAME_ID));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  const renderOrchestration = async () => {
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    Wrapper.displayName = 'TestQueryClientWrapper';
    const { result } = renderHook(() => useGameOrchestration({ skipInitialSetup: true }), { wrapper: Wrapper });
    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    }, { timeout: BOOTSTRAPPING_TIMEOUT_MS });
    return result;
  };

  /**
   * @critical - the three travel together: the pin without its address cannot
   * be shown in Ottelutiedot, and a session without the address overwrites the
   * stored one on the next autosave.
   */
  it('loads the address into the session beside the pin', async () => {
    arrange(withVenue());

    const result = await renderOrchestration();

    const session = result.current.modalManagerProps.data.gameSessionState;
    expect(session.locationAddress).toBe(ADDRESS);
    expect(session.locationLat).toBe(61.868);
    expect(session.locationLng).toBe(28.879);
  });

  /** A typed-only venue has no address, and must not grow one. */
  it('leaves it unset for a venue that was only typed', async () => {
    arrange(withVenue({ locationLat: undefined, locationLng: undefined, locationAddress: undefined }));

    const result = await renderOrchestration();

    expect(result.current.modalManagerProps.data.gameSessionState.locationAddress).toBeUndefined();
  });
});
