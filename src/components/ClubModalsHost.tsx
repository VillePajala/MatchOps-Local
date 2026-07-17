'use client';

/**
 * ClubModalsHost - the page-level home for club/app-scope modals (two-level
 * restructure, L-waves). Rendered on BOTH screens (Home and match), so
 * opening these from Home never mounts the match view, and closing them
 * lands back on whatever screen the user was on.
 *
 * Wave L.0a: TrainingResources + RulesDirectory (self-contained; open-state
 * already lives in ModalProvider).
 * Wave L.0b: Settings + Instructions (handlers extracted to
 * useAppSettingsController; Instructions open-state moved to ModalProvider),
 * plus the Settings-owned hard-reset confirm dialog and resetting overlay.
 * Wave L.1: SeasonTournament + Personnel (query-backed CRUD; hook instances
 * useSeasonTournamentManagement/usePersonnelManager live here - query keys
 * are shared with the game side, so React Query dedupes).
 * Wave L.2: Roster + TeamManager (useRosterSettingsController owns the club
 * roster editing; the game side consumes roster changes via the query cache
 * and prunes deleted players from the live field/selection itself). The
 * roster modal's player-stats shortcut sets the shared player deep-link and
 * asks the page (onEnterMatch) to mount the match view, where GameStats
 * still renders until L.4.
 * Wave L.3a: LoadGame - the first LEVEL CROSSING. Picking a saved game
 * persists it as current, then onEnterMatch mounts a FRESH match whose
 * existing boot path loads it (useLoadGameController). Cancel stays put.
 * Wave L.3b: NewGameSetup - the create-side crossing. Confirming persists
 * the new game as current (useNewGameSetupController) and enters the match
 * fresh; the old match-side session apply is gone. Match-side flows (control
 * bar, save-before-new) open this same instance via the shared provider flag
 * + playerIdsForNewGame prefill. An empty club roster swaps the modal for
 * the add-players confirm (same guard the match applies before opening).
 * Wave L.3c: PlaytimePlanner - already fully self-contained (own storage,
 * own data loading); only the open-state moved to ModalProvider, retiring
 * GameContainer's PLANNER_OPEN_KEY sessionStorage hack (provider state
 * survives the resume-from-background flash that hack existed for). The
 * match view registers plannerLiveGameHooks while mounted so bulk re-apply
 * can still flush/refresh a live game; from Home they are null and the
 * planner works on storage alone.
 * Wave L.4: GameStats AGGREGATE side (aggregateOnly mode + isClubStatsOpen)
 * - team stats from Home with no game mounted; tapping a game row in the log
 * is the LoadGame level crossing (persist + fresh mount). The current-game
 * tab stays with the match modal (isGameStatsModalOpen), and the roster
 * modal's player-stats shortcut now lands HERE - the L.2 enter-the-match
 * interim is retired.
 * Later waves move the remaining club modals here - see
 * two-level-app-structure.md §6. A modal must NEVER render both here and in
 * ModalManager (dual-render guard: the ModalManager block is deleted in the
 * same PR that lifts a modal).
 *
 * NOTE: there is deliberately no <ModalPortal> wrapper here - every lifted
 * modal must position itself with `fixed inset-0` (all current ones do).
 * A future lifted modal without that styling would clip inside this host.
 */
import React from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import { useModalContext } from '@/contexts/ModalProvider';
import { useModalHardwareBack } from '@/hooks/useModalHardwareBack';
import { useAppSettingsController } from '@/hooks/useAppSettingsController';
import { useSeasonTournamentManagement } from '@/hooks/useSeasonTournamentManagement';
import { usePersonnelManager } from '@/hooks/usePersonnelManager';
import { useRosterSettingsController } from '@/hooks/useRosterSettingsController';
import { useLoadGameController } from '@/hooks/useLoadGameController';
import { useClubStatsController } from '@/hooks/useClubStatsController';
import { useNewGameSetupController } from '@/hooks/useNewGameSetupController';
import { useTeamsQuery } from '@/hooks/useTeamQueries';
import ConfirmationModal from '@/components/ConfirmationModal';

const TrainingResourcesModal = dynamic(() => import('@/components/TrainingResourcesModal'));
const RulesDirectoryModal = dynamic(() => import('@/components/RulesDirectoryModal'));
const SettingsModal = dynamic(() => import('@/components/SettingsModal'));
const InstructionsModal = dynamic(() => import('@/components/InstructionsModal'));
const SeasonTournamentManagementModal = dynamic(() => import('@/components/SeasonTournamentManagementModal'));
const PersonnelManagerModal = dynamic(() => import('@/components/PersonnelManagerModal'));
const RosterSettingsModal = dynamic(() => import('@/components/RosterSettingsModal'));
const TeamManagerModal = dynamic(() => import('@/components/TeamManagerModal'));
const LoadGameModal = dynamic(() => import('@/components/LoadGameModal'));
const NewGameSetupModal = dynamic(() => import('@/components/NewGameSetupModal'));
const PlaytimePlannerModal = dynamic(() => import('@/components/PlaytimePlannerModal'));
const GameStatsModal = dynamic(() => import('@/components/GameStatsModal'));

export interface ClubModalsHostProps {
  /** The page's level crossing: freshly mount the match view (its boot path
   *  loads the persisted current game). Used by the LoadGame pick (L.3a) and
   *  by the roster modal's player-stats shortcut (GameStats is match-side
   *  until L.4). */
  onEnterMatch?: () => void;
  /** The persisted current game was deleted - the page remounts a live match
   *  so it cannot keep autosaving a ghost. No-op on the start screen. */
  onActiveGameDeleted?: () => void;
}

export default function ClubModalsHost({ onEnterMatch, onActiveGameDeleted }: ClubModalsHostProps = {}) {
  const { t } = useTranslation();
  const {
    isTrainingResourcesOpen,
    setIsTrainingResourcesOpen,
    isRulesDirectoryOpen,
    setIsRulesDirectoryOpen,
    isInstructionsModalOpen,
    setIsInstructionsModalOpen,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    settingsInitialTab,
    isSeasonTournamentModalOpen,
    setIsSeasonTournamentModalOpen,
    isPersonnelManagerOpen,
    setIsPersonnelManagerOpen,
    isRosterModalOpen,
    setIsRosterModalOpen,
    isTeamManagerOpen,
    setIsTeamManagerOpen,
    isLoadGameModalOpen,
    setIsLoadGameModalOpen,
    isNewGameSetupModalOpen,
    setIsNewGameSetupModalOpen,
    playerIdsForNewGame,
    setPlayerIdsForNewGame,
    isPlaytimePlannerOpen,
    setIsPlaytimePlannerOpen,
    plannerLiveGameHooks,
    isClubStatsOpen,
    setIsClubStatsOpen,
    clubStatsInitialTab,
    openClubStatsToTab,
    selectedPlayerForStats,
    setSelectedPlayerForStats,
  } = useModalContext();

  const settings = useAppSettingsController();
  const seasonTournament = useSeasonTournamentManagement();
  const personnelManager = usePersonnelManager();
  const rosterSettings = useRosterSettingsController();
  const { data: teams = [] } = useTeamsQuery();
  const loadGame = useLoadGameController({
    onEnterMatch: () => {
      // Fires only on a SUCCESSFUL load: close whichever surface initiated
      // it (the LoadGame modal or the club-stats game log) - a failed pick
      // keeps the surface open with the error visible.
      setIsLoadGameModalOpen(false);
      setIsClubStatsOpen(false);
      setSelectedPlayerForStats(null);
      onEnterMatch?.();
    },
    onActiveGameDeleted,
  });
  const clubStats = useClubStatsController();
  const newGameSetup = useNewGameSetupController({
    onGameCreated: () => {
      setIsNewGameSetupModalOpen(false);
      setPlayerIdsForNewGame(null);
      onEnterMatch?.();
    },
  });

  // Cancel/close for NewGameSetup: reset the controller's slider state and
  // clear the shared prefill so the next open starts from modal defaults.
  const handleCloseNewGameSetup = () => {
    newGameSetup.handleCancelNewGameSetup();
    setIsNewGameSetupModalOpen(false);
    setPlayerIdsForNewGame(null);
  };

  // Empty club roster: creating a game is meaningless - swap the setup modal
  // for the add-players confirm (mirrors the match-side pre-open guard, and
  // covers the Home entry which opens the flag directly via the bridge).
  // While the roster query is still LOADING, render NEITHER surface: showing
  // the confirm could flash over a populated roster, and showing the setup
  // form could flash an empty roster over a truly empty one.
  const showNoPlayersInsteadOfNewGame =
    isNewGameSetupModalOpen && !newGameSetup.isRosterLoading && newGameSetup.masterRoster.length === 0;
  const showNewGameSetup =
    isNewGameSetupModalOpen && !newGameSetup.isRosterLoading && !showNoPlayersInsteadOfNewGame;

  // Roster modal's per-player stats shortcut: set the shared deep-link and
  // open the HOST-level club stats on the player tab (L.4) - no match mount.
  const handleOpenPlayerStats = (playerId: string) => {
    const player = rosterSettings.availablePlayers.find((p) => p.id === playerId);
    if (!player) return;
    setSelectedPlayerForStats(player);
    setIsRosterModalOpen(false);
    openClubStatsToTab('player');
  };

  // Closing club stats clears the player deep-link so the NEXT open (from
  // any entry) starts fresh instead of landing on a stale player tab.
  const handleCloseClubStats = () => {
    setIsClubStatsOpen(false);
    setSelectedPlayerForStats(null);
  };

  // Hardware-back contract (modal governance): back closes the topmost modal.
  useModalHardwareBack(isTrainingResourcesOpen, () => setIsTrainingResourcesOpen(false));
  useModalHardwareBack(isRulesDirectoryOpen, () => setIsRulesDirectoryOpen(false));
  useModalHardwareBack(isInstructionsModalOpen, () => setIsInstructionsModalOpen(false));
  useModalHardwareBack(isSettingsModalOpen, () => setIsSettingsModalOpen(false));
  useModalHardwareBack(isSeasonTournamentModalOpen, () => setIsSeasonTournamentModalOpen(false));
  useModalHardwareBack(isPersonnelManagerOpen, () => setIsPersonnelManagerOpen(false));
  useModalHardwareBack(isRosterModalOpen, () => setIsRosterModalOpen(false));
  useModalHardwareBack(isTeamManagerOpen, () => setIsTeamManagerOpen(false));
  useModalHardwareBack(isLoadGameModalOpen, () => setIsLoadGameModalOpen(false));
  useModalHardwareBack(isNewGameSetupModalOpen, handleCloseNewGameSetup);
  useModalHardwareBack(isPlaytimePlannerOpen, () => setIsPlaytimePlannerOpen(false));
  useModalHardwareBack(isClubStatsOpen, handleCloseClubStats);
  // The hard-reset confirm stacks ON TOP of Settings - it must register too,
  // or back would close Settings underneath and orphan a destructive dialog.
  // (Registered after Settings so a same-render mount keeps it topmost.)
  useModalHardwareBack(settings.showHardResetConfirm, () => settings.setShowHardResetConfirm(false));

  if (settings.isResetting) {
    // Defense-in-depth during a data wipe: render ONLY the blocking overlay.
    // All lifted modals (incl. the Settings modal the reset was launched
    // from) unmount so nothing under the overlay can touch storage.
    return (
      <div
        className="fixed inset-0 bg-slate-900 z-[9999] flex flex-col items-center justify-center"
        role="alert"
        aria-live="assertive"
        data-testid="reset-overlay"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
          <div className="text-center">
            <h2 className="text-xl font-bold text-slate-200 mb-2">
              {t('reset.resetting', 'Resetting Application...')}
            </h2>
            <p className="text-sm text-slate-400">
              {t('reset.pleaseWait', 'Please wait while we clear all data')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {isTrainingResourcesOpen && (
        <TrainingResourcesModal isOpen onClose={() => setIsTrainingResourcesOpen(false)} />
      )}
      {isRulesDirectoryOpen && (
        <RulesDirectoryModal isOpen onClose={() => setIsRulesDirectoryOpen(false)} />
      )}
      {isInstructionsModalOpen && (
        <InstructionsModal isOpen onClose={() => setIsInstructionsModalOpen(false)} />
      )}
      {isSeasonTournamentModalOpen && (
        <SeasonTournamentManagementModal
          isOpen
          onClose={() => setIsSeasonTournamentModalOpen(false)}
          seasons={seasonTournament.seasons}
          tournaments={seasonTournament.tournaments}
          masterRoster={seasonTournament.masterRoster}
          addSeasonMutation={seasonTournament.addSeasonMutation}
          addTournamentMutation={seasonTournament.addTournamentMutation}
          updateSeasonMutation={seasonTournament.updateSeasonMutation}
          deleteSeasonMutation={seasonTournament.deleteSeasonMutation}
          updateTournamentMutation={seasonTournament.updateTournamentMutation}
          deleteTournamentMutation={seasonTournament.deleteTournamentMutation}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
        />
      )}
      {isLoadGameModalOpen && (
        <LoadGameModal
          isOpen
          onClose={() => setIsLoadGameModalOpen(false)}
          savedGames={loadGame.savedGames}
          onLoad={loadGame.handleLoadGame}
          onDelete={loadGame.handleDeleteGame}
          onExportOneJson={loadGame.handleExportOneJson}
          onExportOneExcel={loadGame.handleExportOneExcel}
          currentGameId={loadGame.currentGameId}
          seasons={seasonTournament.seasons}
          tournaments={seasonTournament.tournaments}
          teams={teams}
          isLoadingGamesList={loadGame.isLoadingGamesList}
          loadGamesListError={loadGame.loadGamesListError}
          isGameLoading={loadGame.isGameLoading}
          gameLoadError={loadGame.gameLoadError}
          isGameDeleting={loadGame.isGameDeleting}
          gameDeleteError={loadGame.gameDeleteError}
          processingGameId={loadGame.processingGameId}
        />
      )}
      {showNewGameSetup && (
        <NewGameSetupModal
          isOpen
          initialPlayerSelection={playerIdsForNewGame}
          demandFactor={newGameSetup.newGameDemandFactor}
          onDemandFactorChange={newGameSetup.setNewGameDemandFactor}
          onManageTeamRoster={() => {
            handleCloseNewGameSetup();
            setIsTeamManagerOpen(true);
          }}
          onStart={newGameSetup.handleStartNewGameWithSetup}
          onAddPlayerToRoster={(name, nickname) => rosterSettings.handleAddPlayerReturning({ name, nickname })}
          onCancel={handleCloseNewGameSetup}
          masterRoster={newGameSetup.masterRoster}
          seasons={seasonTournament.seasons}
          tournaments={seasonTournament.tournaments}
          teams={teams}
          personnel={personnelManager.personnel}
          savedGames={newGameSetup.savedGames}
        />
      )}
      <ConfirmationModal
        isOpen={showNoPlayersInsteadOfNewGame}
        title={t('controlBar.noPlayersTitle', 'No Players in Roster')}
        message={t('controlBar.noPlayersForNewGame', 'You need at least one player in your roster to create a game. Would you like to add players now?')}
        onConfirm={() => {
          handleCloseNewGameSetup();
          setIsRosterModalOpen(true);
        }}
        onCancel={handleCloseNewGameSetup}
        confirmLabel={t('common.addPlayers', 'Add Players')}
        variant="primary"
      />
      {isPlaytimePlannerOpen && (
        <PlaytimePlannerModal
          isOpen
          onClose={() => setIsPlaytimePlannerOpen(false)}
          onFlushLiveGame={plannerLiveGameHooks?.onFlushLiveGame}
          onLinkedGamesUpdated={plannerLiveGameHooks?.onLinkedGamesUpdated}
        />
      )}
      {isClubStatsOpen && (
        <GameStatsModal
          isOpen
          onClose={handleCloseClubStats}
          aggregateOnly
          /* Neutral current-game props: the current-game tab is hidden in
             aggregateOnly mode and there is no live match behind this
             surface. */
          teamName=""
          opponentName=""
          gameDate=""
          homeScore={0}
          awayScore={0}
          homeOrAway="home"
          availablePlayers={[]}
          gameEvents={[]}
          selectedPlayerIds={[]}
          savedGames={clubStats.savedGames}
          currentGameId={null}
          masterRoster={clubStats.masterRoster}
          personnelDirectory={personnelManager.personnel}
          onExportAggregateExcel={clubStats.handleExportAggregateExcel}
          onExportPlayerExcel={clubStats.handleExportPlayerExcel}
          initialSelectedPlayerId={selectedPlayerForStats?.id}
          initialTab={clubStatsInitialTab}
          onGameClick={(gameId) => {
            /* The log's game rows are the LoadGame level crossing. The
               surface closes via the load controller's onEnterMatch - i.e.
               only on SUCCESS; a stale row (game deleted elsewhere) keeps
               it open and the controller toasts the error. */
            void loadGame.handleLoadGame(gameId);
          }}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
        />
      )}
      {isRosterModalOpen && (
        <RosterSettingsModal
          isOpen
          onClose={() => setIsRosterModalOpen(false)}
          availablePlayers={rosterSettings.availablePlayers}
          onUpdatePlayer={rosterSettings.handleUpdatePlayerForModal}
          onRenamePlayer={rosterSettings.handleRenamePlayerForModal}
          onSetJerseyNumber={rosterSettings.handleSetJerseyNumberForModal}
          onSetPlayerNotes={rosterSettings.handleSetPlayerNotesForModal}
          onRemovePlayer={rosterSettings.handleRemovePlayerForModal}
          onAddPlayer={rosterSettings.handleAddPlayerForModal}
          isRosterUpdating={rosterSettings.isRosterUpdating}
          rosterError={rosterSettings.rosterError}
          onOpenPlayerStats={handleOpenPlayerStats}
        />
      )}
      {isTeamManagerOpen && (
        <TeamManagerModal
          isOpen
          onClose={() => setIsTeamManagerOpen(false)}
          teams={teams}
          masterRoster={rosterSettings.availablePlayers}
        />
      )}
      {isPersonnelManagerOpen && (
        <PersonnelManagerModal
          isOpen
          onClose={() => setIsPersonnelManagerOpen(false)}
          personnel={personnelManager.personnel}
          onAddPersonnel={personnelManager.addPersonnel}
          onUpdatePersonnel={personnelManager.updatePersonnel}
          onRemovePersonnel={personnelManager.removePersonnel}
          isUpdating={personnelManager.isLoading}
        />
      )}
      {isSettingsModalOpen && (
        <SettingsModal
          isOpen
          onClose={() => setIsSettingsModalOpen(false)}
          language={settings.appLanguage}
          onLanguageChange={settings.setAppLanguage}
          defaultTeamName={settings.defaultTeamNameSetting}
          onDefaultTeamNameChange={settings.setDefaultTeamNameSetting}
          onHardResetApp={settings.handleHardResetApp}
          onCreateBackup={settings.handleCreateBackup}
          onCloudDataDownload={settings.handleCloudDataDownload}
          initialTab={settingsInitialTab}
          onResyncFromCloud={settings.handleResyncFromCloud}
          onFactoryReset={settings.handleFactoryReset}
        />
      )}

      <ConfirmationModal
        isOpen={settings.showHardResetConfirm}
        title={t('controlBar.hardResetTitle', 'Reset Application')}
        message={t('controlBar.hardResetConfirmation', 'Are you sure you want to completely reset the application? All saved data (players, stats, positions) will be permanently lost.')}
        warningMessage={t('controlBar.hardResetWarning', 'This action cannot be undone. All your data will be permanently deleted.')}
        onConfirm={settings.handleHardResetConfirmed}
        onCancel={() => settings.setShowHardResetConfirm(false)}
        confirmLabel={t('common.reset', 'Reset')}
        variant="danger"
      />
    </>
  );
}
