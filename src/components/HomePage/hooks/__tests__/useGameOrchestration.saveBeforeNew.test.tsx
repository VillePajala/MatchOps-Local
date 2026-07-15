/**
 * Tests for useGameOrchestration - "Save & Continue" (Save Before New) re-entry guard
 *
 * @edge-case - Mobile double-tap on the "Save Current Game?" dialog must not
 * start two saves. The dialog stays open during the async save (it only closes
 * on success, per the save-loss fix), so without an in-flight guard a second tap
 * would create a DUPLICATE game.
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGameOrchestration } from '../useGameOrchestration';
import type { Player, AppState } from '@/types';

/** Time needed for React Query initialization and hook bootstrapping */
const BOOTSTRAPPING_TIMEOUT_MS = 5000;

// Controllable savedGames mocks
const mockSaveGame = jest.fn().mockResolvedValue({});
const mockGetSavedGames = jest.fn();
const mockGetLatestGameId = jest.fn().mockResolvedValue(null);
const mockCreateGame = jest.fn();

jest.mock('@/utils/savedGames', () => ({
  saveGame: (...args: unknown[]) => mockSaveGame(...args),
  getSavedGames: () => mockGetSavedGames(),
  getLatestGameId: () => mockGetLatestGameId(),
  deleteGame: jest.fn().mockResolvedValue(true),
  createGame: (...args: unknown[]) => mockCreateGame(...args),
  removeGameEvent: jest.fn().mockResolvedValue({}),
  updateGameDetails: jest.fn().mockResolvedValue({}),
}));

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

jest.mock('@/utils/storage', () => ({
  getStorageItem: jest.fn().mockResolvedValue(null),
  setStorageItem: jest.fn().mockResolvedValue(undefined),
  removeStorageItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/utils/timerStateManager', () => ({
  loadTimerStateForGame: jest.fn().mockResolvedValue(null),
  clearTimerState: jest.fn().mockResolvedValue(undefined),
  saveTimerState: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/utils/timerAnchor', () => ({
  clearTimerAnchor: jest.fn(),
}));

jest.mock('@/utils/masterRoster', () => ({
  setPlayerFairPlayCardStatus: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/utils/teams', () => ({
  getTeams: jest.fn().mockResolvedValue([]),
  getTeam: jest.fn().mockResolvedValue(null),
}));

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

jest.mock('@/contexts/ToastProvider', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock('@/contexts/ModalProvider', () => ({
  useModalContext: () => ({
    isGameSettingsModalOpen: false,
    setIsGameSettingsModalOpen: jest.fn(),
    isLoadGameModalOpen: false,
    setIsLoadGameModalOpen: jest.fn(),
    isRosterModalOpen: false,
    setIsRosterModalOpen: jest.fn(),
    isSeasonTournamentModalOpen: false,
    setIsSeasonTournamentModalOpen: jest.fn(),
    isTrainingResourcesOpen: false,
    setIsTrainingResourcesOpen: jest.fn(),
    isRulesDirectoryOpen: false,
    setIsRulesDirectoryOpen: jest.fn(),
    isGoalLogModalOpen: false,
    setIsGoalLogModalOpen: jest.fn(),
    isGameStatsModalOpen: false,
    setIsGameStatsModalOpen: jest.fn(),
    isNewGameSetupModalOpen: false,
    setIsNewGameSetupModalOpen: jest.fn(),
    // L.3b: the prefill selection lives in ModalProvider now.
    playerIdsForNewGame: null,
    setPlayerIdsForNewGame: jest.fn(),
    isSettingsModalOpen: false,
    setIsSettingsModalOpen: jest.fn(),
    openSettingsToTab: jest.fn(),
    settingsInitialTab: null,
    isPlayerAssessmentModalOpen: false,
    setIsPlayerAssessmentModalOpen: jest.fn(),
  }),
}));

jest.mock('@/hooks/usePremium', () => ({
  usePremium: () => ({
    canCreate: jest.fn().mockReturnValue(true),
    showUpgradePrompt: jest.fn(),
    isPremium: true,
  }),
}));

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

jest.mock('@/hooks/useGameDataQueries', () => ({
  useGameDataQueries: () => ({
    currentGameIdQuery: { data: null, isLoading: false },
    savedGamesQuery: { data: {}, isLoading: false, refetch: jest.fn() },
    masterRosterQuery: { data: [], isLoading: false },
    seasonsQuery: { data: [], isLoading: false },
    tournamentsQuery: { data: [], isLoading: false },
    teamsQuery: { data: [], isLoading: false },
  }),
}));

jest.mock('@/datastore', () => ({
  getDataStore: jest.fn().mockResolvedValue({
    getGames: jest.fn().mockResolvedValue({}),
    saveGame: jest.fn().mockResolvedValue({}),
  }),
}));

jest.mock('@/utils/masterRosterManager', () => ({
  getAllPlayers: jest.fn().mockResolvedValue([]),
  addPlayer: jest.fn().mockResolvedValue(null),
  updatePlayer: jest.fn().mockResolvedValue(null),
  removePlayer: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/utils/seasons', () => ({
  getSeasons: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/utils/tournaments', () => ({
  getTournaments: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/hooks/usePlayerAssessments', () => ({
  __esModule: true,
  default: () => ({
    assessments: {},
    updateAssessment: jest.fn(),
    clearAssessments: jest.fn(),
  }),
}));

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

jest.mock('@/utils/debug', () => ({
  debug: {
    log: jest.fn(),
    enabled: jest.fn().mockReturnValue(false),
  },
}));

const createMockPlayer = (overrides?: Partial<Player>): Player => ({
  id: 'player-1',
  name: 'Test Player',
  jerseyNumber: '10',
  isGoalie: false,
  receivedFairPlayCard: false,
  notes: '',
  ...overrides,
});

const createMockAppState = (overrides?: Partial<AppState>): AppState => ({
  playersOnField: [],
  opponents: [],
  drawings: [],
  availablePlayers: [
    createMockPlayer({ id: 'player-1', name: 'Player One', isGoalie: false }),
    createMockPlayer({ id: 'player-2', name: 'Player Two', isGoalie: true }),
  ],
  showPlayerNames: true,
  teamName: 'Test Team',
  gameEvents: [],
  opponentName: 'Opponent',
  gameDate: '2024-01-01',
  homeScore: 0,
  awayScore: 0,
  gameNotes: '',
  homeOrAway: 'home',
  numberOfPeriods: 2,
  periodDurationMinutes: 15,
  currentPeriod: 1,
  gameStatus: 'notStarted',
  demandFactor: 1,
  selectedPlayerIds: ['player-1', 'player-2'],
  gamePersonnel: [],
  seasonId: '',
  tournamentId: '',
  subIntervalMinutes: 5,
  completedIntervalDurations: [],
  lastSubConfirmationTimeSeconds: 0,
  tacticalDiscs: [],
  tacticalDrawings: [],
  tacticalBallPosition: { relX: 0.5, relY: 0.5 },
  ...overrides,
});

describe('useGameOrchestration - Save Before New re-entry guard', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    mockGetSavedGames.mockResolvedValue({ 'game-123': createMockAppState() });
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

  /**
   * @edge-case - A second confirm tap while the save is in flight must be ignored,
   * so only ONE game is created (no duplicate).
   */
  it('ignores a re-entrant confirm tap while the save is still in flight', async () => {
    // Make createGame hang so the first save stays in flight across the second tap.
    let resolveCreate: (value: { gameId: string; gameData: AppState }) => void = () => {};
    const createPromise = new Promise<{ gameId: string; gameData: AppState }>((resolve) => {
      resolveCreate = resolve;
    });
    mockCreateGame.mockReturnValue(createPromise);

    const { result } = renderHook(
      () => useGameOrchestration({ skipInitialSetup: true }),
      { wrapper: createWrapper() }
    );

    await waitFor(
      () => expect(result.current.isBootstrapping).toBe(false),
      { timeout: BOOTSTRAPPING_TIMEOUT_MS }
    );

    const { saveBeforeNewConfirmed } = result.current.modalManagerProps.handlers;

    await act(async () => {
      // First tap starts the save (awaits the hanging createGame).
      void saveBeforeNewConfirmed();
      // Second tap should hit the in-flight guard and do nothing.
      void saveBeforeNewConfirmed();
      // Let the microtask queue drain so both invocations run their sync prefix.
      await Promise.resolve();
    });

    expect(mockCreateGame).toHaveBeenCalledTimes(1);

    // Resolve the save and let the success path finish cleanly.
    await act(async () => {
      resolveCreate({ gameId: 'new-game', gameData: createMockAppState() });
      await Promise.resolve();
    });

    expect(mockCreateGame).toHaveBeenCalledTimes(1);
  });

  /**
   * @edge-case - After a save completes, the guard is released so a later
   * legitimate confirm can save again.
   */
  it('releases the guard after the save completes', async () => {
    mockCreateGame.mockResolvedValue({ gameId: 'new-game', gameData: createMockAppState() });

    const { result } = renderHook(
      () => useGameOrchestration({ skipInitialSetup: true }),
      { wrapper: createWrapper() }
    );

    await waitFor(
      () => expect(result.current.isBootstrapping).toBe(false),
      { timeout: BOOTSTRAPPING_TIMEOUT_MS }
    );

    const { saveBeforeNewConfirmed } = result.current.modalManagerProps.handlers;

    await act(async () => {
      await saveBeforeNewConfirmed();
    });
    await act(async () => {
      await saveBeforeNewConfirmed();
    });

    expect(mockCreateGame).toHaveBeenCalledTimes(2);
  });
});
