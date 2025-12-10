import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ModalManager } from './ModalManager';
import { initialGameSessionStatePlaceholder } from '@/hooks/useGameSessionReducer';
import type { Season, Tournament, Team, PlayerAssessment } from '@/types';
import type { ModalManagerProps } from './ModalManager';
import type { UseMutationResult } from '@tanstack/react-query';

function SeasonModalMock() {
  return <div data-testid="season-modal" />;
}

jest.mock('@/components/SeasonTournamentManagementModal', () => ({
  __esModule: true,
  default: SeasonModalMock,
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
    isTrainingResourcesOpen: false,
    isLoadGameModalOpen: false,
    isNewGameSetupModalOpen: false,
    isRosterModalOpen: false,
    isSeasonTournamentModalOpen: false,
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

const noop = () => {};
const noopAsync = async () => {};


const createMutation = <T, V>(): UseMutationResult<T, Error, V, unknown> =>
  ({
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    reset: jest.fn(),
    status: 'idle',
  } as unknown as UseMutationResult<T, Error, V, unknown>);

const createProps = (): ModalManagerProps => ({
  state: {
    isTrainingResourcesOpen: false,
    isInstructionsModalOpen: false,
    isPersonnelManagerOpen: false,
    isTeamManagerOpen: false,
    isGoalLogModalOpen: false,
    isGameStatsModalOpen: false,
    isLoadGameModalOpen: false,
    isNewGameSetupModalOpen: false,
    isRosterModalOpen: false,
    isSeasonTournamentModalOpen: false,
    isGameSettingsModalOpen: false,
    isSettingsModalOpen: false,
    isPlayerAssessmentModalOpen: false,
    isTeamReassignModalOpen: false,
    showNoPlayersConfirm: false,
    showHardResetConfirm: false,
    showSaveBeforeNewConfirm: false,
    showStartNewConfirm: false,
    showResetFieldConfirm: false,
  },
  data: {
    loadGameState: {
      isLoadingGamesList: false,
      loadGamesListError: null,
      isGameLoading: false,
      gameLoadError: null,
      isGameDeleting: false,
      gameDeleteError: null,
      processingGameId: null,
    },
    gameSessionState: initialGameSessionStatePlaceholder,
    availablePlayers: [],
    playersForCurrentGame: [],
    savedGames: {},
    currentGameId: null,
    teams: [] as Team[],
    seasons: [] as Season[],
    tournaments: [] as Tournament[],
    masterRoster: [],
    personnel: [],
    personnelManager: {
      addPersonnel: async () => null,
      updatePersonnel: async () => null,
      removePersonnel: async () => {},
      isLoading: false,
    },
    playerAssessments: {} as Record<string, PlayerAssessment>,
    selectedPlayerForStats: null,
    playerIdsForNewGame: null,
    newGameDemandFactor: 1,
    availableTeams: [],
    orphanedGameInfo: null,
    appLanguage: 'en',
    defaultTeamNameSetting: '',
    isRosterUpdating: false,
    rosterError: null,
    gameIdentifierForSave: '',
    isPlayed: false,
    seasonTournamentMutations: {},
  },
  handlers: {
    toggleTrainingResources: noop,
    toggleInstructionsModal: noop,
    closePersonnelManager: noop,
    closeTeamManagerModal: noop,
    toggleGoalLogModal: noop,
    addGoalEvent: noop,
    logOpponentGoal: noop,
    updateGameEvent: noop,
    deleteGameEvent: async () => true,
    toggleGameStatsModal: noop,
    exportOneExcel: noop,
    exportAggregateExcel: noop,
    exportPlayerExcel: noop,
    gameLogClick: noop,
    closeLoadGameModal: noop,
    loadGame: noop,
    deleteGame: noop,
    exportOneJson: noop,
    setSelectedTeamForRoster: noop,
    startNewGameWithSetup: noopAsync,
    cancelNewGameSetup: noop,
    setNewGameDemandFactor: noop,
    closeRosterModal: noop,
    updatePlayerForModal: async () => {},
    renamePlayerForModal: noop,
    setJerseyNumberForModal: noop,
    setPlayerNotesForModal: noop,
    removePlayerForModal: noop,
    addPlayerForModal: noop,
    openPlayerStats: noop,
    closeSeasonTournamentModal: noop,
    closeGameSettingsModal: noop,
    teamNameChange: noop,
    opponentNameChange: noop,
    gameDateChange: noop,
    gameLocationChange: noop,
    gameTimeChange: noop,
    gameNotesChange: noop,
    ageGroupChange: noop,
    tournamentLevelChange: noop,
    awardFairPlayCard: noop,
    setNumberOfPeriods: noop,
    setPeriodDuration: noop,
    setDemandFactor: noop,
    setSeasonId: noop,
    setTournamentId: noop,
    setLeagueId: noop,
    setCustomLeagueName: noop,
    setGameType: noop,
    setHomeOrAway: noop,
    setIsPlayed: noop,
    updateSelectedPlayers: noop,
    setGamePersonnel: noop,
    closeSettingsModal: noop,
    setAppLanguage: noop,
    setDefaultTeamName: noop,
    showAppGuide: noop,
    hardResetApp: noop,
    closePlayerAssessmentModal: noop,
    savePlayerAssessment: noop,
    deletePlayerAssessment: noop,
    teamReassignment: noop,
    setIsTeamReassignModalOpen: noop,
    confirmNoPlayers: noop,
    setShowNoPlayersConfirm: noop,
    confirmHardReset: noop,
    setShowHardResetConfirm: noop,
    saveBeforeNewConfirmed: noop,
    saveBeforeNewCancelled: noop,
    setShowStartNewConfirm: noop,
    startNewConfirmed: noop,
    setShowResetFieldConfirm: noop,
    resetFieldConfirmed: noop,
    openSettingsModal: noop,
    onCreateBackup: noop,
    onDataImportSuccess: noop,
    manageTeamRosterFromNewGame: noop,
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
        {component}
      </QueryClientProvider>
    );
  };

  it('does not render season modal when mutations are missing', () => {
    renderWithProvider(<ModalManager {...createProps()} />);
    expect(screen.queryByTestId('season-modal')).toBeNull();
  });

  it('renders season modal when all mutations provided', () => {
    const props = createProps();
    props.data.seasonTournamentMutations = {
      addSeason: createMutation<Season | null, Partial<Season> & { name: string }>(),
      addTournament: createMutation<Tournament | null, Partial<Tournament> & { name: string }>(),
      updateSeason: createMutation<Season | null, Season>(),
      deleteSeason: createMutation<boolean, string>(),
      updateTournament: createMutation<Tournament | null, Tournament>(),
      deleteTournament: createMutation<boolean, string>(),
    };
    props.state.isSeasonTournamentModalOpen = true;

    renderWithProvider(<ModalManager {...props} />);

    expect(screen.getByTestId('season-modal')).toBeInTheDocument();
  });
});
