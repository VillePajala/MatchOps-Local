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
import ConfirmationModal from '@/components/ConfirmationModal';

const TrainingResourcesModal = dynamic(() => import('@/components/TrainingResourcesModal'));
const RulesDirectoryModal = dynamic(() => import('@/components/RulesDirectoryModal'));
const SettingsModal = dynamic(() => import('@/components/SettingsModal'));
const InstructionsModal = dynamic(() => import('@/components/InstructionsModal'));

export default function ClubModalsHost() {
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
  } = useModalContext();

  const settings = useAppSettingsController();

  // Hardware-back contract (modal governance): back closes the topmost modal.
  useModalHardwareBack(isTrainingResourcesOpen, () => setIsTrainingResourcesOpen(false));
  useModalHardwareBack(isRulesDirectoryOpen, () => setIsRulesDirectoryOpen(false));
  useModalHardwareBack(isInstructionsModalOpen, () => setIsInstructionsModalOpen(false));
  useModalHardwareBack(isSettingsModalOpen, () => setIsSettingsModalOpen(false));
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
