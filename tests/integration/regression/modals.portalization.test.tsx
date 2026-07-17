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

import { render, waitFor } from '../../utils/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ModalManager } from '@/components/HomePage/containers/ModalManager';
import { initialGameSessionStatePlaceholder } from '@/hooks/useGameSessionReducer';
import type { Season, Tournament, Team, PlayerAssessment } from '@/types';
import type { ModalManagerProps } from '@/components/HomePage/containers/ModalManager';
import type { UseMutationResult } from '@tanstack/react-query';

// Stub a modal to make it easy to select in DOM without require().
// L.1 note: this regression previously targeted SeasonTournamentManagementModal,
// which lifted to ClubModalsHost - GameStats is a dynamic ModalManager modal
// that still exercises the same ModalPortal path.
function StatsModalPortalMock() {
  return <div data-testid="stats-modal-portal" />;
}

jest.mock('@/components/GameStatsModal', () => ({
  __esModule: true,
  default: StatsModalPortalMock,
}));

jest.mock('@/contexts/ModalProvider', () => {
  const actual = jest.requireActual('@/contexts/ModalProvider');
  return {
    __esModule: true,
    ...actual,
    useModalContext: () => ({
      isGoalLogModalOpen: false,
      isGameStatsModalOpen: false,
      isNewGameSetupModalOpen: false,
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
    updateGameDetailsMutation: createMutation(),
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
    setHomeOrAway: noop,
    setIsPlayed: noop,
    updateSelectedPlayers: noop,
    addPlayerToClubRoster: async () => null,
    wrapUpToGameSettings: noop,
    wrapUpToAssessments: noop,
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
    setWentToOvertime: noop,
    setWentToPenalties: noop,
    setShootoutKicks: noop,
  },
});

// NOTE: Skipped in CI/jsdom due to occasional ESM interop issues when layering providers.
// Manual verification and focused component tests cover portalization behavior.
describe('Modal portalization (renders to document.body)', () => {
  it('renders a ModalManager modal outside the RTL container (via portal)', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const props = createProps();
    // Open the (mocked) Game Stats modal - a dynamic ModalManager modal
    props.state.isGameStatsModalOpen = true;

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <ModalManager {...props} />
      </QueryClientProvider>
    );

    // next/dynamic loads components asynchronously — wait for resolution
    let modal: HTMLElement | null = null;
    await waitFor(() => {
      modal = document.querySelector('[data-testid="stats-modal-portal"]') as HTMLElement | null;
      expect(modal).not.toBeNull();
    });

    // Ensure the modal element is not inside the RTL container
    expect(container.contains(modal!)).toBe(false);
  });
});
