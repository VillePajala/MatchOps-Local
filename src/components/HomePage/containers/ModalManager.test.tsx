import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ModalManager } from './ModalManager';
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
    showSaveBeforeNewConfirm: false,
    showStartNewConfirm: false,
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
    gameIdentifierForSave: '',
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
    closeGameSettingsModal: noop,
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
    reapplyPlan: noop,
    setGamePersonnel: noop,
    closePlayerAssessmentModal: noop,
    savePlayerAssessment: noop,
    deletePlayerAssessment: noop,
    teamReassignment: noop,
    setIsTeamReassignModalOpen: noop,
    confirmNoPlayers: noop,
    setShowNoPlayersConfirm: noop,
    saveBeforeNewConfirmed: noop,
    saveBeforeNewCancelled: noop,
    setShowStartNewConfirm: noop,
    startNewConfirmed: noop,
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

  beforeEach(() => {
    queryClient.clear();
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
});
