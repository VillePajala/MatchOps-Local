// Quieten env side-effects (i18n + storage bootstrap) for this test
jest.mock('@/i18n', () => ({ __esModule: true, default: { isInitialized: true, language: 'en', changeLanguage: jest.fn(() => Promise.resolve()) } }));
jest.mock('@/utils/storage', () => {
  const actual = jest.requireActual('@/utils/storage');
  return { ...actual, getStorageJSON: jest.fn(async (_k: string, opts?: any) => opts?.defaultValue ?? null) };
});
// eslint-disable-next-line no-console
// @ts-ignore
console.error = jest.fn();
// eslint-disable-next-line no-console
// @ts-ignore
console.warn = jest.fn();

import { render } from '../../utils/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ModalManager } from '@/components/HomePage/containers/ModalManager';
import { initialGameSessionStatePlaceholder } from '@/hooks/useGameSessionReducer';
import type { Season, Tournament, Team, PlayerAssessment } from '@/types';
import type { ModalManagerProps } from '@/components/HomePage/containers/ModalManager';
import type { UseMutationResult } from '@tanstack/react-query';

// Stub a modal to make it easy to select in DOM without require()
function SeasonModalPortalMock() {
  return <div data-testid="season-modal-portal" />;
}

jest.mock('@/components/SeasonTournamentManagementModal', () => ({
  __esModule: true,
  default: SeasonModalPortalMock,
}));

jest.mock('@/contexts/ModalProvider', () => {
  const actual = jest.requireActual('@/contexts/ModalProvider');
  return {
    __esModule: true,
    ...actual,
    useModalContext: () => ({
      isGoalLogModalOpen: false,
      isGameStatsModalOpen: false,
      isTrainingResourcesOpen: false,
      isLoadGameModalOpen: false,
      isNewGameSetupModalOpen: false,
      isRosterModalOpen: false,
      isSeasonTournamentModalOpen: true, // OPEN THIS MODAL
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
  };
});

jest.mock('@/contexts/ToastProvider', () => {
  const actual = jest.requireActual('@/contexts/ToastProvider');
  return { __esModule: true, ...actual, useToast: () => ({ showToast: jest.fn() }) };
});
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string, f?: string) => f ?? k }) }));

const noop = () => {};
const noopAsync = async () => {};

const createMutation = <T, V>(): UseMutationResult<T, Error, V, unknown> =>
  ({ mutate: jest.fn(), mutateAsync: jest.fn(), reset: jest.fn(), status: 'idle' } as unknown as UseMutationResult<T, Error, V, unknown>);

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
  // Team roster modal controls
  isTeamRosterModalOpen: false,
  selectedTeamForRoster: null,
  setSelectedTeamForRoster: noop,
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
  updateGameDetailsMutation: createMutation(),
  handleTeamIdChange: noop,
  handleCloseSettingsModal: noop,
  handleShowAppGuide: noop,
  reducerDrivenModals: {
    newGameSetup: {
      isOpen: false,
      open: jest.fn(),
      close: jest.fn(),
    },
    roster: {
      isOpen: false,
      open: jest.fn(),
      close: jest.fn(),
    },
  },
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

// NOTE: Skipped in CI/jsdom due to occasional ESM interop issues when layering providers.
// Manual verification and focused component tests cover portalization behavior.
describe('Modal portalization (renders to document.body)', () => {
  it('renders season modal outside the RTL container (via portal)', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const props = createProps();
    // Provide all mutations so modal renders
    props.addSeasonMutation = createMutation<Season | null, Partial<Season> & { name: string }>();
    props.addTournamentMutation = createMutation<Tournament | null, Partial<Tournament> & { name: string }>();
    props.updateSeasonMutation = createMutation<Season | null, Season>();
    props.deleteSeasonMutation = createMutation<boolean, string>();
    props.updateTournamentMutation = createMutation<Tournament | null, Tournament>();
    props.deleteTournamentMutation = createMutation<boolean, string>();

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <ModalManager {...props} />
      </QueryClientProvider>
    );

    const modal = document.querySelector('[data-testid="season-modal-portal"]') as HTMLElement | null;
    expect(modal).not.toBeNull();
    // Ensure the modal element is not inside the RTL container
    expect(container.contains(modal!)).toBe(false);
  });
});
