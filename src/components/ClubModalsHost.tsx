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
 * asks the page (onEnterMatchForPlayerStats) to mount the match view, where
 * GameStats still renders until L.4.
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

export interface ClubModalsHostProps {
  /** Mounts the match view (page owns the screen state) so GameStats - still
   *  match-side until L.4 - can open for the roster modal's stats shortcut. */
  onEnterMatchForPlayerStats?: () => void;
}

export default function ClubModalsHost({ onEnterMatchForPlayerStats }: ClubModalsHostProps = {}) {
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
    setSelectedPlayerForStats,
    setIsGameStatsModalOpen,
  } = useModalContext();

  const settings = useAppSettingsController();
  const seasonTournament = useSeasonTournamentManagement();
  const personnelManager = usePersonnelManager();
  const rosterSettings = useRosterSettingsController();
  const { data: teams = [] } = useTeamsQuery();

  // Roster modal's per-player stats shortcut: set the shared deep-link, open
  // GameStats (renders match-side until L.4) and make sure the match view is
  // mounted. In-match this opens instantly; from Home it enters the match.
  const handleOpenPlayerStats = (playerId: string) => {
    const player = rosterSettings.availablePlayers.find((p) => p.id === playerId);
    if (!player) return;
    setSelectedPlayerForStats(player);
    setIsRosterModalOpen(false);
    setIsGameStatsModalOpen(true);
    onEnterMatchForPlayerStats?.();
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
