import { render, screen, renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ModalManager } from './ModalManager';
import { useModalHardwareBack, __resetModalHardwareBackForTests } from '@/hooks/useModalHardwareBack';
import { PremiumProvider } from '@/contexts/PremiumContext';
import { initialGameSessionStatePlaceholder } from '@/hooks/useGameSessionReducer';
import type { Season, Tournament, Team, PlayerAssessment } from '@/types';
import type { ModalManagerProps } from './ModalManager';

// L.1: this suite previously targeted SeasonTournamentManagementModal, which
// lifted to ClubModalsHost - GameStats is a dynamic ModalManager modal that
// exercises the same open/closed render gating.
function StatsModalMock() {
  return <div data-testid="stats-modal" />;
}

jest.mock('@/components/GameStatsModal', () => ({
  __esModule: true,
  default: StatsModalMock,
}));

jest.mock('@/contexts/ToastProvider', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

jest.mock('@/contexts/ModalProvider', () => ({
  useModalContext: () => ({
    isGoalLogModalOpen: false,
    isGameStatsModalOpen: false,
    isNewGameSetupModalOpen: false,
    isGameSettingsModalOpen: false,
    isSettingsModalOpen: false,
    isPlayerAssessmentModalOpen: false,
    setIsGoalLogModalOpen: jest.fn(),
    setIsGameStatsModalOpen: jest.fn(),
    setIsTrainingResourcesOpen: jest.fn(),
    setIsLoadGameModalOpen: jest.fn(),
    setIsRosterModalOpen: jest.fn(),
    setIsSeasonTournamentModalOpen: jest.fn(),
    setIsGameSettingsModalOpen: jest.fn(),
    setIsSettingsModalOpen: jest.fn(),
    setIsPlayerAssessmentModalOpen: jest.fn(),
  }),
}));

jest.mock('@/contexts/AuthProvider', () => ({
  useAuth: () => ({
    user: null,
    session: null,
    mode: 'local',
    isAuthenticated: false,
    isLoading: false,
    signIn: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn(),
    resetPassword: jest.fn(),
  }),
}));

const noop = () => {};



const createProps = (): ModalManagerProps => ({
  state: {
    isGoalLogModalOpen: false,
    isGameStatsModalOpen: false,
    isGameSettingsModalOpen: false,
    isPlayerAssessmentModalOpen: false,
    isTeamReassignModalOpen: false,
    showNoPlayersConfirm: false,
    showResetFieldConfirm: false,
  },
  data: {
    gameSessionState: initialGameSessionStatePlaceholder,
    availablePlayers: [],
    playersForCurrentGame: [],
    savedGames: {},
    currentGameId: null,
    canReapplyPlan: false,
    teams: [] as Team[],
    seasons: [] as Season[],
    tournaments: [] as Tournament[],
    masterRoster: [],
    personnel: [],
    playerAssessments: {} as Record<string, PlayerAssessment>,
    availableTeams: [],
    orphanedGameInfo: null,
    isPlayed: false,
  },
  handlers: {
    toggleGoalLogModal: noop,
    addGoalEvent: noop,
    logOpponentGoal: noop,
    recalculateScore: noop,
    updateGameEvent: noop,
    deleteGameEvent: async () => true,
    toggleGameStatsModal: noop,
    exportOneExcel: noop,
    exportAggregateExcel: noop,
    exportPlayerExcel: noop,
    gameLogClick: noop,
    exportOneJson: noop,
    closeGameSettingsModal: jest.fn(),
    teamNameChange: noop,
    opponentNameChange: noop,
    gameDateChange: noop,
    gameLocationChange: noop,
    gameTimeChange: noop,
    gameNotesChange: noop,
    playerPositionsChange: noop,
    ageGroupChange: noop,
    tournamentLevelChange: noop,
    tournamentSeriesIdChange: noop,
    teamIdChange: noop,
    awardFairPlayCard: noop,
    setNumberOfPeriods: noop,
    setPeriodDuration: noop,
    setDemandFactor: noop,
    setSeasonId: noop,
    setTournamentId: noop,
    setLeagueId: noop,
    setCustomLeagueName: noop,
    setGameType: noop,
    setGender: noop,
    setWentToOvertime: noop,
    setWentToPenalties: noop,
    setShootoutKicks: noop,
    setHomeOrAway: noop,
    setIsPlayed: noop,
    updateSelectedPlayers: noop,
    addPlayerToClubRoster: async () => null,
    reapplyPlan: noop,
    setGamePersonnel: noop,
    closePlayerAssessmentModal: noop,
    savePlayerAssessment: noop,
    deletePlayerAssessment: noop,
    teamReassignment: noop,
    setIsTeamReassignModalOpen: noop,
    confirmNoPlayers: noop,
    setShowNoPlayersConfirm: noop,
    setShowResetFieldConfirm: noop,
    resetFieldConfirmed: noop,
    openSettingsModal: noop,
  },
});

describe('ModalManager', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  let backSpy: jest.SpyInstance;

  beforeEach(() => {
    queryClient.clear();
    __resetModalHardwareBackForTests();
    // No-op implementation: jsdom's real back() fires an ASYNC popstate that
    // races the next test's assertions (a tracked modal unmounting in RTL
    // cleanup calls it) - same guard as ClubModalsHost.test.tsx.
    backSpy = jest.spyOn(window.history, 'back').mockImplementation(() => {});
  });

  afterEach(() => {
    backSpy.mockRestore();
  });

  const renderWithProvider = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <PremiumProvider>
          {component}
        </PremiumProvider>
      </QueryClientProvider>
    );
  };

  it('does not render stats modal when closed', () => {
    renderWithProvider(<ModalManager {...createProps()} />);
    expect(screen.queryByTestId('stats-modal')).toBeNull();
  });

  it('renders stats modal when open', async () => {
    const props = createProps();
    props.state.isGameStatsModalOpen = true;

    renderWithProvider(<ModalManager {...props} />);

    expect(await screen.findByTestId('stats-modal')).toBeInTheDocument();
  });

  /**
   * 3.1 hardware-back contract: with the page-level "back exits to Home"
   * entry at the BOTTOM of the stack, an open MATCH-scope modal must
   * consume the back press - back closes the modal, it never exits the
   * match while one is open. Regression test for the 3.1 review Bug.
   * @critical
   */
  it('hardware back closes an open match-scope modal INSTEAD of exiting the match', async () => {
    const goHome = jest.fn();
    // Simulate page.tsx's match-level registration (bottom of the stack).
    const { result: _pageEntry } = renderHook(() => useModalHardwareBack(true, goHome));

    const props = createProps();
    props.state.isGameSettingsModalOpen = true;
    renderWithProvider(<ModalManager {...props} />);

    // Back press #1: the OPEN modal (registered above the match entry)
    // closes; the match stays.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(props.handlers.closeGameSettingsModal).toHaveBeenCalledTimes(1);
    expect(goHome).not.toHaveBeenCalled();

    // Back press #2 (no modal left): NOW back exits to Home.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(goHome).toHaveBeenCalledTimes(1);
  });
});
