/**
 * L.0a/L.0b: club/app-scope modals render at PAGE level - opening them never
 * mounts the match view, and hardware back closes the topmost modal
 * (modal governance contract).
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ClubModalsHost from './ClubModalsHost';
import ModalProvider, { useModalContext } from '@/contexts/ModalProvider';
import { __resetModalHardwareBackForTests } from '@/hooks/useModalHardwareBack';

jest.mock('@/components/TrainingResourcesModal', () => ({
  __esModule: true,
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="training-modal"><button onClick={onClose}>close-training</button></div>
  ),
}));
jest.mock('@/components/RulesDirectoryModal', () => ({
  __esModule: true,
  default: () => <div data-testid="rules-modal" />,
}));
jest.mock('@/components/InstructionsModal', () => ({
  __esModule: true,
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="instructions-modal"><button onClick={onClose}>close-instructions</button></div>
  ),
}));
jest.mock('@/components/SettingsModal', () => ({
  __esModule: true,
  default: ({ onClose, initialTab }: { onClose: () => void; initialTab?: string }) => (
    <div data-testid="settings-modal" data-initial-tab={initialTab ?? ''}>
      <button onClick={onClose}>close-settings</button>
    </div>
  ),
}));

const mockController = {
  appLanguage: 'fi',
  setAppLanguage: jest.fn(),
  defaultTeamNameSetting: 'FC Test',
  setDefaultTeamNameSetting: jest.fn(),
  isResetting: false,
  showHardResetConfirm: false,
  setShowHardResetConfirm: jest.fn(),
  handleHardResetApp: jest.fn(),
  handleHardResetConfirmed: jest.fn(),
  handleResyncFromCloud: jest.fn(),
  handleFactoryReset: jest.fn(),
  handleCreateBackup: jest.fn(),
  handleCloudDataDownload: jest.fn(),
  handleShowAppGuide: jest.fn(),
};
jest.mock('@/hooks/useAppSettingsController', () => ({
  __esModule: true,
  useAppSettingsController: () => mockController,
  default: () => mockController,
}));

jest.mock('@/components/SeasonTournamentManagementModal', () => ({
  __esModule: true,
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="season-tournament-modal"><button onClick={onClose}>close-season</button></div>
  ),
}));
jest.mock('@/components/PersonnelManagerModal', () => ({
  __esModule: true,
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="personnel-modal"><button onClick={onClose}>close-personnel</button></div>
  ),
}));
jest.mock('@/hooks/useSeasonTournamentManagement', () => ({
  __esModule: true,
  useSeasonTournamentManagement: () => ({
    seasons: [], tournaments: [], masterRoster: [],
    addSeasonMutation: {}, addTournamentMutation: {}, updateSeasonMutation: {},
    deleteSeasonMutation: {}, updateTournamentMutation: {}, deleteTournamentMutation: {},
  }),
}));
jest.mock('@/hooks/usePersonnelManager', () => ({
  __esModule: true,
  usePersonnelManager: () => ({
    personnel: [], isLoading: false, error: null,
    addPersonnel: jest.fn(), updatePersonnel: jest.fn(), removePersonnel: jest.fn(),
  }),
}));

jest.mock('@/components/RosterSettingsModal', () => ({
  __esModule: true,
  default: ({ onOpenPlayerStats }: { onOpenPlayerStats: (id: string) => void }) => (
    <div data-testid="roster-modal">
      <button onClick={() => onOpenPlayerStats('p1')}>player-stats-p1</button>
    </div>
  ),
}));
jest.mock('@/components/TeamManagerModal', () => ({
  __esModule: true,
  default: () => <div data-testid="team-manager-modal" />,
}));
const mockRosterController = {
  availablePlayers: [{ id: 'p1', name: 'Testaaja' }],
  isRosterUpdating: false,
  rosterError: null,
  handleUpdatePlayerForModal: jest.fn(),
  handleRenamePlayerForModal: jest.fn(),
  handleSetJerseyNumberForModal: jest.fn(),
  handleSetPlayerNotesForModal: jest.fn(),
  handleRemovePlayerForModal: jest.fn(),
  handleAddPlayerForModal: jest.fn(),
};
jest.mock('@/hooks/useRosterSettingsController', () => ({
  __esModule: true,
  useRosterSettingsController: () => mockRosterController,
}));
jest.mock('@/hooks/useTeamQueries', () => ({
  useTeamsQuery: () => ({ data: [] }),
}));

jest.mock('@/components/LoadGameModal', () => ({
  __esModule: true,
  default: ({ onLoad }: { onLoad: (id: string) => void }) => (
    <div data-testid="load-game-modal">
      <button onClick={() => onLoad('g1')}>pick-g1</button>
    </div>
  ),
}));
const mockLoadGameController = {
  savedGames: {},
  currentGameId: undefined,
  isLoadingGamesList: false,
  loadGamesListError: null,
  isGameLoading: false,
  isGameDeleting: false,
  gameDeleteError: null,
  processingGameId: null,
  handleLoadGame: jest.fn(),
  handleDeleteGame: jest.fn(),
  handleExportOneJson: jest.fn(),
  handleExportOneExcel: jest.fn(),
};
let capturedLoadGameArgs: { onEnterMatch: () => void } | undefined;
jest.mock('@/hooks/useLoadGameController', () => ({
  __esModule: true,
  useLoadGameController: (args: { onEnterMatch: () => void }) => {
    capturedLoadGameArgs = args;
    return mockLoadGameController;
  },
}));

jest.mock('@/components/NewGameSetupModal', () => ({
  __esModule: true,
  default: ({ onStart, onCancel }: { onStart: (...args: unknown[]) => void; onCancel: () => void }) => (
    <div data-testid="new-game-setup-modal">
      <button onClick={() => onStart(['p1'], 'Home', 'Away')}>confirm-new-game</button>
      <button onClick={onCancel}>cancel-new-game</button>
    </div>
  ),
}));
const mockNewGameSetupController = {
  savedGames: {},
  masterRoster: [{ id: 'p1', name: 'Testaaja', isGoalie: false }],
  isRosterLoading: false,
  newGameDemandFactor: 1,
  setNewGameDemandFactor: jest.fn(),
  handleStartNewGameWithSetup: jest.fn(),
  handleCancelNewGameSetup: jest.fn(),
};
jest.mock('@/hooks/useNewGameSetupController', () => ({
  __esModule: true,
  useNewGameSetupController: () => mockNewGameSetupController,
}));

jest.mock('@/components/GameStatsModal', () => ({
  __esModule: true,
  default: ({ aggregateOnly, initialTab, initialSelectedPlayerId, onGameClick }: {
    aggregateOnly?: boolean;
    initialTab?: string;
    initialSelectedPlayerId?: string | null;
    onGameClick?: (id: string) => void;
  }) => (
    <div data-testid="club-stats-modal">
      <span data-testid="club-stats-shape">
        {aggregateOnly ? 'aggregate' : 'full'}:{initialTab ?? 'default'}:{initialSelectedPlayerId ?? 'none'}
      </span>
      <button onClick={() => onGameClick?.('g1')}>stats-open-g1</button>
    </div>
  ),
}));
const mockClubStatsController = {
  savedGames: {},
  masterRoster: [],
  handleExportAggregateExcel: jest.fn(),
  handleExportPlayerExcel: jest.fn(),
};
jest.mock('@/hooks/useClubStatsController', () => ({
  __esModule: true,
  useClubStatsController: () => mockClubStatsController,
}));

jest.mock('@/components/PlaytimePlannerModal', () => ({
  __esModule: true,
  default: ({ onFlushLiveGame }: { onFlushLiveGame?: () => Promise<void> }) => (
    <div data-testid="playtime-planner-modal">
      <button onClick={() => onFlushLiveGame?.()} disabled={!onFlushLiveGame}>
        planner-flush
      </button>
    </div>
  ),
}));

const mockFlushLiveGame = jest.fn().mockResolvedValue(undefined);

function Opener() {
  const {
    setIsTrainingResourcesOpen,
    setIsRulesDirectoryOpen,
    setIsInstructionsModalOpen,
    setIsSettingsModalOpen,
    openSettingsToTab,
    setIsSeasonTournamentModalOpen,
    setIsPersonnelManagerOpen,
    setIsRosterModalOpen,
    setIsTeamManagerOpen,
    setIsLoadGameModalOpen,
    setIsNewGameSetupModalOpen,
    setIsPlaytimePlannerOpen,
    setPlannerLiveGameHooks,
    openClubStatsToTab,
  } = useModalContext();
  return (
    <>
      <button onClick={() => setIsTrainingResourcesOpen(true)}>open-training</button>
      <button onClick={() => setIsRulesDirectoryOpen(true)}>open-rules</button>
      <button onClick={() => setIsInstructionsModalOpen(true)}>open-instructions</button>
      <button onClick={() => setIsSettingsModalOpen(true)}>open-settings</button>
      <button onClick={() => openSettingsToTab('data')}>open-settings-data</button>
      <button onClick={() => setIsSeasonTournamentModalOpen(true)}>open-season</button>
      <button onClick={() => setIsPersonnelManagerOpen(true)}>open-personnel</button>
      <button onClick={() => setIsRosterModalOpen(true)}>open-roster</button>
      <button onClick={() => setIsTeamManagerOpen(true)}>open-teams</button>
      <button onClick={() => setIsLoadGameModalOpen(true)}>open-load</button>
      <button onClick={() => setIsNewGameSetupModalOpen(true)}>open-new-game</button>
      <button onClick={() => setIsPlaytimePlannerOpen(true)}>open-planner</button>
      <button onClick={() => openClubStatsToTab('season')}>open-club-stats</button>
      <button
        onClick={() =>
          setPlannerLiveGameHooks({
            onFlushLiveGame: mockFlushLiveGame,
            onLinkedGamesUpdated: jest.fn(),
          })
        }
      >
        register-live-hooks
      </button>
    </>
  );
}

function StatsProbe() {
  const { selectedPlayerForStats, isGameStatsModalOpen } = useModalContext();
  return (
    <div data-testid="stats-probe">
      {selectedPlayerForStats?.name ?? 'none'}:{isGameStatsModalOpen ? 'open' : 'closed'}
    </div>
  );
}

const renderHost = () =>
  render(
    <ModalProvider>
      <Opener />
      <ClubModalsHost />
    </ModalProvider>,
  );

describe('ClubModalsHost (L.0a/L.0b)', () => {
  let backSpy: jest.SpyInstance;

  beforeEach(() => {
    __resetModalHardwareBackForTests();
    mockController.isResetting = false;
    mockController.showHardResetConfirm = false;
    // No-op implementation: jsdom's real back() fires an async popstate that
    // would race the assertions; the suppression counter is reset above.
    backSpy = jest.spyOn(window.history, 'back').mockImplementation(() => {});
  });

  afterEach(() => {
    backSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('renders nothing until a club modal opens, then renders it at host level', async () => {
    renderHost();
    expect(screen.queryByTestId('training-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('open-training'));
    await waitFor(() => expect(screen.getByTestId('training-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByText('open-rules'));
    await waitFor(() => expect(screen.getByTestId('rules-modal')).toBeInTheDocument());
  });

  it('renders SeasonTournament and Personnel at host level, back closes them (L.1)', async () => {
    renderHost();
    fireEvent.click(screen.getByText('open-season'));
    await waitFor(() => expect(screen.getByTestId('season-tournament-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByText('open-personnel'));
    await waitFor(() => expect(screen.getByTestId('personnel-modal')).toBeInTheDocument());
    // Hardware back (governance): closes topmost (Personnel) first, then Season.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(screen.queryByTestId('personnel-modal')).not.toBeInTheDocument());
    expect(screen.getByTestId('season-tournament-modal')).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(screen.queryByTestId('season-tournament-modal')).not.toBeInTheDocument());
  });

  it('renders Roster and TeamManager at host level (L.2)', async () => {
    renderHost();
    fireEvent.click(screen.getByText('open-roster'));
    await waitFor(() => expect(screen.getByTestId('roster-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByText('open-teams'));
    await waitFor(() => expect(screen.getByTestId('team-manager-modal')).toBeInTheDocument());
    // Hardware back closes topmost (TeamManager) first, Roster stays.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(screen.queryByTestId('team-manager-modal')).not.toBeInTheDocument());
    expect(screen.getByTestId('roster-modal')).toBeInTheDocument();
  });

  it('roster player-stats shortcut opens HOST club stats on the player deep-link - no match mount (L.4)', async () => {
    const onEnterMatch = jest.fn();
    render(
      <ModalProvider>
        <Opener />
        <StatsProbe />
        <ClubModalsHost onEnterMatch={onEnterMatch} />
      </ModalProvider>,
    );
    fireEvent.click(screen.getByText('open-roster'));
    await waitFor(() => expect(screen.getByTestId('roster-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByText('player-stats-p1'));
    // Roster closes; the club-stats surface opens with the player deep-link.
    // The L.2 interim (enter the match to show stats) is retired.
    await waitFor(() => expect(screen.queryByTestId('roster-modal')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('club-stats-modal')).toBeInTheDocument());
    expect(screen.getByTestId('club-stats-shape')).toHaveTextContent('aggregate:player:p1');
    expect(onEnterMatch).not.toHaveBeenCalled();
  });

  it('club stats renders at host level; a game-row tap is the LoadGame level crossing (L.4)', async () => {
    renderHost();
    fireEvent.click(screen.getByText('open-club-stats'));
    await waitFor(() => expect(screen.getByTestId('club-stats-modal')).toBeInTheDocument());
    expect(screen.getByTestId('club-stats-shape')).toHaveTextContent('aggregate:season:none');
    // Tapping a game row hands the pick to the load controller. The surface
    // must NOT close yet - a stale row (game deleted elsewhere) errors and
    // keeps it open, so only the controller's success callback closes it.
    fireEvent.click(screen.getByText('stats-open-g1'));
    expect(mockLoadGameController.handleLoadGame).toHaveBeenCalledWith('g1');
    expect(screen.getByTestId('club-stats-modal')).toBeInTheDocument();
    // Simulate the successful load: the controller fires onEnterMatch.
    act(() => capturedLoadGameArgs!.onEnterMatch());
    await waitFor(() => expect(screen.queryByTestId('club-stats-modal')).not.toBeInTheDocument());
  });

  it('renders LoadGame at host level and delegates the pick to the controller (L.3a)', async () => {
    renderHost();
    fireEvent.click(screen.getByText('open-load'));
    await waitFor(() => expect(screen.getByTestId('load-game-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByText('pick-g1'));
    expect(mockLoadGameController.handleLoadGame).toHaveBeenCalledWith('g1');
  });

  it('renders NewGameSetup at host level and delegates the confirm to the controller (L.3b)', async () => {
    renderHost();
    fireEvent.click(screen.getByText('open-new-game'));
    await waitFor(() => expect(screen.getByTestId('new-game-setup-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByText('confirm-new-game'));
    expect(mockNewGameSetupController.handleStartNewGameWithSetup).toHaveBeenCalledWith(['p1'], 'Home', 'Away');
    // Cancel closes in place and resets the controller's slider state. (The
    // provider's anti-flash guard ignores a close within 200ms of opening -
    // step Date.now past it instead of sleeping.)
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 300);
    try {
      fireEvent.click(screen.getByText('cancel-new-game'));
      await waitFor(() => expect(screen.queryByTestId('new-game-setup-modal')).not.toBeInTheDocument());
    } finally {
      nowSpy.mockRestore();
    }
    expect(mockNewGameSetupController.handleCancelNewGameSetup).toHaveBeenCalled();
  });

  it('swaps NewGameSetup for the add-players confirm when the club roster is empty (L.3b)', async () => {
    mockNewGameSetupController.masterRoster = [];
    try {
      renderHost();
      fireEvent.click(screen.getByText('open-new-game'));
      // The setup modal must NOT render - the confirm takes its place.
      await waitFor(() => expect(screen.getByText('No Players in Roster')).toBeInTheDocument());
      expect(screen.queryByTestId('new-game-setup-modal')).not.toBeInTheDocument();
      // Confirming hands over to the (lifted) roster modal. Step Date.now
      // past the provider's 200ms anti-flash close guard first.
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 300);
      try {
        fireEvent.click(screen.getByText('Add Players'));
        await waitFor(() => expect(screen.getByTestId('roster-modal')).toBeInTheDocument());
        expect(screen.queryByText('No Players in Roster')).not.toBeInTheDocument();
      } finally {
        nowSpy.mockRestore();
      }
    } finally {
      mockNewGameSetupController.masterRoster = [{ id: 'p1', name: 'Testaaja', isGoalie: false }];
    }
  });

  it('renders NEITHER the setup modal nor the confirm while the roster query is still loading (L.3b)', async () => {
    mockNewGameSetupController.masterRoster = [];
    mockNewGameSetupController.isRosterLoading = true;
    try {
      renderHost();
      fireEvent.click(screen.getByText('open-new-game'));
      // No empty-roster setup-form flash, no premature confirm - the surface
      // is picked once the roster has actually loaded.
      await waitFor(() =>
        expect(screen.queryByTestId('new-game-setup-modal')).not.toBeInTheDocument(),
      );
      expect(screen.queryByText('No Players in Roster')).not.toBeInTheDocument();
    } finally {
      mockNewGameSetupController.isRosterLoading = false;
      mockNewGameSetupController.masterRoster = [{ id: 'p1', name: 'Testaaja', isGoalie: false }];
    }
  });

  it('renders the planner at host level; live-game hooks flow only when the match registered them (L.3c)', async () => {
    renderHost();
    fireEvent.click(screen.getByText('open-planner'));
    await waitFor(() => expect(screen.getByTestId('playtime-planner-modal')).toBeInTheDocument());
    // No match mounted - no live hooks registered - the flush hook is absent
    // (the planner then operates on storage alone).
    expect(screen.getByText('planner-flush')).toBeDisabled();

    // The match registers its hooks -> the planner reaches the live game.
    fireEvent.click(screen.getByText('register-live-hooks'));
    await waitFor(() => expect(screen.getByText('planner-flush')).toBeEnabled());
    fireEvent.click(screen.getByText('planner-flush'));
    expect(mockFlushLiveGame).toHaveBeenCalledTimes(1);
  });

  it('renders Settings and Instructions at host level (L.0b)', async () => {
    renderHost();
    expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('instructions-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('open-settings'));
    await waitFor(() => expect(screen.getByTestId('settings-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByText('open-instructions'));
    await waitFor(() => expect(screen.getByTestId('instructions-modal')).toBeInTheDocument());
  });

  it('passes settingsInitialTab through to SettingsModal (openSettingsToTab contract)', async () => {
    renderHost();
    fireEvent.click(screen.getByText('open-settings-data'));
    await waitFor(() =>
      expect(screen.getByTestId('settings-modal')).toHaveAttribute('data-initial-tab', 'data'),
    );
  });

  it('hardware back closes the open modal (governance contract)', async () => {
    renderHost();
    fireEvent.click(screen.getByText('open-settings'));
    await waitFor(() => expect(screen.getByTestId('settings-modal')).toBeInTheDocument());
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument());
    // Closed by the back press itself - no programmatic back needed.
    expect(backSpy).not.toHaveBeenCalled();
  });

  it('hardware back closes only the TOPMOST modal when two are stacked', async () => {
    renderHost();
    fireEvent.click(screen.getByText('open-training'));
    await waitFor(() => expect(screen.getByTestId('training-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByText('open-rules'));
    await waitFor(() => expect(screen.getByTestId('rules-modal')).toBeInTheDocument());
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    // Rules opened last -> it closes; Training underneath stays open.
    await waitFor(() => expect(screen.queryByTestId('rules-modal')).not.toBeInTheDocument());
    expect(screen.getByTestId('training-modal')).toBeInTheDocument();
    // A second back press closes the remaining modal.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(screen.queryByTestId('training-modal')).not.toBeInTheDocument());
  });

  it('closing via the modal UI consumes the pushed history entry', async () => {
    renderHost();
    fireEvent.click(screen.getByText('open-training'));
    await waitFor(() => expect(screen.getByTestId('training-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByText('close-training'));
    await waitFor(() => expect(screen.queryByTestId('training-modal')).not.toBeInTheDocument());
    // The hook consumed its own history entry exactly once...
    expect(backSpy).toHaveBeenCalledTimes(1);
    // ...and the popstate that back() fires is swallowed - it must not
    // close or reopen anything.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.queryByTestId('training-modal')).not.toBeInTheDocument();
  });

  it('closing the topmost sub-guard modal via UI retires its own entry; the one under it stays until back', async () => {
    // Training / Rules / Club stats can be opened over the MATCH view, so they
    // register as PREEMPTIVE sub-guards (each owns its own history entry) rather
    // than sharing the sentinel. Realistic stacking is LIFO (the visible/top
    // modal is the one you can close), so open Rules first, Training on top.
    renderHost();
    fireEvent.click(screen.getByText('open-rules'));
    await waitFor(() => expect(screen.getByTestId('rules-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByText('open-training'));
    await waitFor(() => expect(screen.getByTestId('training-modal')).toBeInTheDocument());
    // Close the TOPMOST (training) via UI - it retires exactly its own entry
    // with one suppressed back(); Rules under it stays open.
    fireEvent.click(screen.getByText('close-training'));
    await waitFor(() => expect(screen.queryByTestId('training-modal')).not.toBeInTheDocument());
    expect(screen.getByTestId('rules-modal')).toBeInTheDocument();
    expect(backSpy).toHaveBeenCalledTimes(1);
    // That programmatic back's popstate is swallowed (a real WebView fires it;
    // here history.back is mocked, so dispatch it manually) - closes nothing.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByTestId('rules-modal')).toBeInTheDocument();
    // The next real back closes the remaining modal via its own sub-guard.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(screen.queryByTestId('rules-modal')).not.toBeInTheDocument());
  });

  it('renders the resetting overlay when a reset is in progress (L.0b)', () => {
    mockController.isResetting = true;
    renderHost();
    expect(screen.getByTestId('reset-overlay')).toBeInTheDocument();
  });

  it('unmounts all lifted modals during a reset wipe - overlay only (L.0b)', async () => {
    renderHost();
    fireEvent.click(screen.getByText('open-settings'));
    await waitFor(() => expect(screen.getByTestId('settings-modal')).toBeInTheDocument());
    // The wipe starts (re-render via a context change so the host re-reads
    // the controller flag): everything under the overlay must unmount.
    mockController.isResetting = true;
    fireEvent.click(screen.getByText('open-settings-data'));
    await waitFor(() => expect(screen.getByTestId('reset-overlay')).toBeInTheDocument());
    expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument();
  });

  it('hard-reset confirm dialog confirms through the controller (L.0b)', () => {
    mockController.showHardResetConfirm = true;
    renderHost();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(mockController.handleHardResetConfirmed).toHaveBeenCalledTimes(1);
  });

  it('hardware back closes the hard-reset confirm, NOT the Settings underneath (L.0b)', async () => {
    renderHost();
    // 1. Settings opens first and registers on the back stack.
    fireEvent.click(screen.getByText('open-settings'));
    await waitFor(() => expect(screen.getByTestId('settings-modal')).toBeInTheDocument());
    // 2. The confirm dialog opens ON TOP (re-render via a context change so
    //    its hardware-back effect re-runs and pushes it above Settings).
    mockController.showHardResetConfirm = true;
    fireEvent.click(screen.getByText('open-settings-data'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument());
    // 3. Hardware back must target the TOPMOST entry: the confirm dialog.
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(mockController.setShowHardResetConfirm).toHaveBeenCalledWith(false);
    // Settings must stay open - no orphaned destructive dialog scenario.
    expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
  });
});
