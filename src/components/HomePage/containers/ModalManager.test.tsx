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
    setIsNewGameSetupModalOpen: jest.fn(),
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
  gameSessionState: initialGameSessionStatePlaceholder,
  availablePlayers: [],
  playersForCurrentGame: [],
  isRosterUpdating: false,
  rosterError: null,
  savedGames: {},
  currentGameId: null,
  masterRosterQueryResultData: [],
  seasons: [] as Season[],
  tournaments: [] as Tournament[],
  teams: [] as Team[],
  playerAssessments: {} as Record<string, PlayerAssessment>,
  timeElapsedInSeconds: 0,
  selectedPlayerForStats: null,
  isTeamManagerOpen: false,
  showNoPlayersConfirm: false,
  showHardResetConfirm: false,
  showSaveBeforeNewConfirm: false,
  showStartNewConfirm: false,
  gameIdentifierForSave: '',
  isTeamReassignModalOpen: false,
  orphanedGameInfo: null,
  availableTeams: [],
  isLoadingGamesList: false,
  loadGamesListError: null,
  isGameLoading: false,
  gameLoadError: null,
  isGameDeleting: false,
  gameDeleteError: null,
  processingGameId: null,
  isPlayed: false,
  playerIdsForNewGame: null,
  newGameDemandFactor: 1,
  defaultTeamNameSetting: '',
  appLanguage: 'en',
  isInstructionsModalOpen: false,
  personnel: [],
  // Personnel manager state is not part of ModalManagerProps; skip here
  handleToggleGoalLogModal: noop,
  handleAddGoalEvent: noop,
  handleLogOpponentGoal: noop,
  handleUpdateGameEvent: noop,
  handleDeleteGameEvent: async () => true,
  handleToggleGameStatsModal: noop,
  handleExportOneExcel: noop,
  handleExportAggregateExcel: noop,
  handleExportPlayerExcel: noop,
  handleGameLogClick: noop,
  handleCloseLoadGameModal: noop,
  handleLoadGame: noop,
  handleDeleteGame: noop,
  handleExportOneJson: noop,
  setIsNewGameSetupModalOpen: noop,
  // Team roster modal controls
  isTeamRosterModalOpen: false,
  selectedTeamForRoster: null,
  setSelectedTeamForRoster: noop,
  setIsTeamRosterModalOpen: noop,
  handleManageTeamRoster: noop,
  handleCloseTeamRosterModal: noop,
  handleBackToTeamManager: noop,
  handleStartNewGameWithSetup: noopAsync,
  handleCancelNewGameSetup: noop,
  setNewGameDemandFactor: noop,
  closeRosterModal: noop,
  handleUpdatePlayerForModal: async () => {},
  handleRenamePlayerForModal: noop,
  handleSetJerseyNumberForModal: noop,
  handleSetPlayerNotesForModal: noop,
  handleRemovePlayerForModal: noop,
  handleAddPlayerForModal: noop,
  handleOpenPlayerStats: noop,
  handleCloseSeasonTournamentModal: noop,
  handleCloseGameSettingsModal: noop,
  handleTeamNameChange: noop,
  handleOpponentNameChange: noop,
  handleGameDateChange: noop,
  handleGameLocationChange: noop,
  handleGameTimeChange: noop,
  handleGameNotesChange: noop,
  handleAgeGroupChange: noop,
  handleTournamentLevelChange: noop,
  handleAwardFairPlayCard: noop,
  handleSetNumberOfPeriods: noop,
  handleSetPeriodDuration: noop,
  handleSetDemandFactor: noop,
  handleSetSeasonId: noop,
  handleSetTournamentId: noop,
  handleSetHomeOrAway: noop,
  handleSetIsPlayed: noop,
  handleUpdateSelectedPlayers: noop,
  handleSetGamePersonnel: noop,
  handleTeamIdChange: noop,
  handleCloseSettingsModal: noop,
  handleShowAppGuide: noop,
  handleHardResetApp: noop,
  onDataImportSuccess: noop,
  closePlayerAssessmentModal: noop,
  handleSavePlayerAssessment: noop,
  handleDeletePlayerAssessment: noop,
  handleCloseTeamManagerModal: noop,
  handleToggleTrainingResources: noop,
  handleToggleInstructionsModal: noop,
  setShowNoPlayersConfirm: noop,
  handleNoPlayersConfirmed: noop,
  setShowHardResetConfirm: noop,
  handleHardResetConfirmed: noop,
  handleSaveBeforeNewConfirmed: noop,
  handleSaveBeforeNewCancelled: noop,
  setShowStartNewConfirm: noop,
  handleStartNewConfirmed: noop,
  setIsTeamReassignModalOpen: noop,
  handleTeamReassignment: noop,
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
    props.addSeasonMutation = createMutation<Season | null, Partial<Season> & { name: string }>();
    props.addTournamentMutation = createMutation<Tournament | null, Partial<Tournament> & { name: string }>();
    props.updateSeasonMutation = createMutation<Season | null, Season>();
    props.deleteSeasonMutation = createMutation<boolean, string>();
    props.updateTournamentMutation = createMutation<Tournament | null, Tournament>();
    props.deleteTournamentMutation = createMutation<boolean, string>();

    renderWithProvider(<ModalManager {...props} />);

    expect(screen.getByTestId('season-modal')).toBeInTheDocument();
  });
});
