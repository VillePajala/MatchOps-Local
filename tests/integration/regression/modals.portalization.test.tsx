// Quieten env side-effects (i18n + storage bootstrap) for this test
jest.mock('@/i18n', () => ({ __esModule: true, default: { isInitialized: true, language: 'en', changeLanguage: jest.fn(() => Promise.resolve()) } }));
jest.mock('@/utils/storage', () => {
  const actual = jest.requireActual('@/utils/storage');
  return { ...actual, getStorageJSON: jest.fn(async (_k: string, opts?: any) => opts?.defaultValue ?? null) };
});
 
// @ts-ignore
console.error = jest.fn();
 
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

const createMutation = <T, V>(): UseMutationResult<T, Error, V, unknown> =>
  ({ mutate: jest.fn(), mutateAsync: jest.fn(), reset: jest.fn(), status: 'idle' } as unknown as UseMutationResult<T, Error, V, unknown>);

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
    gameIdentifierForSave: '',
    isPlayed: false,
    isRosterUpdating: false,
    rosterError: null,
    loadGameState: {
      isLoadingGamesList: false,
      loadGamesListError: null,
      isGameLoading: false,
      gameLoadError: null,
      isGameDeleting: false,
      gameDeleteError: null,
      processingGameId: null,
    },
    seasonTournamentMutations: {},
    updateGameDetailsMutation: createMutation(),
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
    setNewGameDemandFactor: noop,
    startNewGameWithSetup: noop,
    cancelNewGameSetup: noop,
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

// NOTE: Skipped in CI/jsdom due to occasional ESM interop issues when layering providers.
// Manual verification and focused component tests cover portalization behavior.
describe('Modal portalization (renders to document.body)', () => {
  it('renders season modal outside the RTL container (via portal)', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const props = createProps();
    // Open the season/tournament modal
    props.state.isSeasonTournamentModalOpen = true;
    // Provide all mutations so modal renders
    props.data.seasonTournamentMutations = {
      addSeason: createMutation<Season | null, Partial<Season> & { name: string }>(),
      addTournament: createMutation<Tournament | null, Partial<Tournament> & { name: string }>(),
      updateSeason: createMutation<Season | null, Season>(),
      deleteSeason: createMutation<boolean, string>(),
      updateTournament: createMutation<Tournament | null, Tournament>(),
      deleteTournament: createMutation<boolean, string>(),
    };

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
