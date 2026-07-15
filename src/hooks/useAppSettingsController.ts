/**
 * App/device-scope settings handlers, extracted from useGameOrchestration for
 * L.0b of the two-level restructure: SettingsModal + InstructionsModal render
 * in the page-level ClubModalsHost, so their handlers must work WITHOUT the
 * match view (useGameOrchestration) mounted.
 *
 * Owns: app language, default team name, backup export/download, the hard
 * reset confirm flow, cloud re-sync, factory reset, the resetting overlay
 * flag, and the Settings -> "show app guide" -> Instructions chain.
 */
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useToast } from '@/contexts/ToastProvider';
import { useDataStore } from '@/hooks/useDataStore';
import { useModalContext } from '@/contexts/ModalProvider';
import { exportFullBackup, trySharePrewarmedBackup } from '@/utils/fullBackup';
import {
  resetAppSettings as utilResetAppSettings,
  resetUserAppSettings as utilResetUserAppSettings,
  saveHasSeenAppGuide,
  getLastHomeTeamName as utilGetLastHomeTeamName,
  updateAppSettings as utilUpdateAppSettings,
} from '@/utils/appSettings';
import { getDataStore } from '@/datastore';
import { setMigrationCompleted } from '@/config/backendConfig';
import logger from '@/utils/logger';
import { reloadApp } from '@/utils/reloadApp';

export interface UseAppSettingsControllerReturn {
  appLanguage: string;
  setAppLanguage: (language: string) => void;
  defaultTeamNameSetting: string;
  setDefaultTeamNameSetting: (name: string) => void;
  /** True while a reset/re-sync is wiping data (shared via ModalProvider:
   *  ClubModalsHost renders the overlay, HomePage unmounts the game tree). */
  isResetting: boolean;
  showHardResetConfirm: boolean;
  setShowHardResetConfirm: (open: boolean) => void;
  handleHardResetApp: () => void;
  handleHardResetConfirmed: () => Promise<void>;
  handleResyncFromCloud: () => Promise<void>;
  handleFactoryReset: () => Promise<void>;
  handleCreateBackup: () => void;
  handleCloudDataDownload: () => Promise<void>;
  handleShowAppGuide: () => void;
}

export function useAppSettingsController(): UseAppSettingsControllerReturn {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { userId } = useDataStore();
  const {
    setIsSettingsModalOpen,
    setIsInstructionsModalOpen,
    isAppResetting: isResetting,
    setIsAppResetting: setIsResetting,
  } = useModalContext();

  const [defaultTeamNameSetting, setDefaultTeamNameSetting] = useState<string>('');
  // SSR-safe initial value: must match i18n.ts default ('fi') so the server-rendered
  // HTML and the first client render produce identical markup (MATCHOPS-LOCAL-8K /
  // MATCHOPS-LOCAL-3). The real value is adopted post-hydration via useEffect below.
  const [appLanguage, setAppLanguage] = useState<string>('fi');
  const [showHardResetConfirm, setShowHardResetConfirm] = useState(false);

  // Adopt the real i18n language once on the client, after hydration has completed.
  useEffect(() => {
    if (i18n.language !== appLanguage) {
      setAppLanguage(i18n.language);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    utilGetLastHomeTeamName(userId).then((name) => setDefaultTeamNameSetting(name));
  }, [userId]);

  useEffect(() => {
    i18n.changeLanguage(appLanguage);
    utilUpdateAppSettings({ language: appLanguage }).catch((error) => {
      logger.warn('[useAppSettingsController] Failed to save language preference (non-critical)', { language: appLanguage, error });
    });
  }, [appLanguage]);

  const handleCreateBackup = useCallback(() => {
    // Try a SYNCHRONOUS share first (keeps the tap's user activation, which
    // navigator.share() requires). Falls back to the async export/download path
    // when no prewarmed backup is ready or the platform can't share files.
    if (!trySharePrewarmedBackup(showToast, userId)) {
      exportFullBackup(showToast, userId);
    }
  }, [showToast, userId]);

  const handleCloudDataDownload = useCallback(async () => {
    const { exportCloudDataDownload } = await import('@/utils/fullBackup');
    await exportCloudDataDownload(showToast);
  }, [showToast]);

  const handleShowAppGuide = useCallback(() => {
    saveHasSeenAppGuide(false);
    setIsSettingsModalOpen(false);
    setIsInstructionsModalOpen(true);
  }, [setIsSettingsModalOpen, setIsInstructionsModalOpen]);

  const handleHardResetApp = useCallback(() => {
    setShowHardResetConfirm(true);
  }, []);

  const handleHardResetConfirmed = useCallback(async () => {
    try {
      logger.log('Performing hard reset using utility...');

      // Show full-screen overlay AND unmount the game tree (HomePage reads the
      // shared flag) so no in-flight timer/autosave touches storage mid-wipe
      setIsResetting(true);

      // Clear storage completely (hard reset clears all user data)
      await utilResetAppSettings();

      logger.log('Hard reset complete, reloading app...');

      // Note: In development mode, Next.js HMR may show harmless module errors
      // after reload. These are cosmetic and don't affect functionality.
      // Production builds don't have this issue.
      reloadApp();
    } catch (error) {
      logger.error('Error during hard reset:', error);
      setIsResetting(false); // Re-enable UI on error
      showToast(t('page.failedResetAppData', 'Failed to reset application data.'), 'error');
    } finally {
      setShowHardResetConfirm(false);
    }
  }, [showToast, t, setIsResetting]);

  // Handler for Re-sync from Cloud (cloud mode)
  // Clears local data and migration flag - on reload, migration wizard will reimport from cloud
  const handleResyncFromCloud = useCallback(async () => {
    if (!userId) {
      showToast(t('page.noUserForResync', 'No user logged in'), 'error');
      return;
    }

    try {
      logger.log('[handleResyncFromCloud] Starting re-sync...');
      setIsResetting(true);

      // Clear user's local IndexedDB data and migration flag
      await utilResetUserAppSettings(userId, { clearMigrationFlag: true });

      logger.log('[handleResyncFromCloud] Local data cleared, reloading...');
      reloadApp();
    } catch (error) {
      logger.error('[handleResyncFromCloud] Failed:', error);
      setIsResetting(false);
      showToast(t('page.resyncFailed', 'Failed to re-sync. Please try again.'), 'error');
    }
  }, [userId, showToast, t, setIsResetting]);

  // Handler for Factory Reset (cloud mode - clears local + cloud)
  // Clears both local and cloud data, sets migration flag as complete (both are empty)
  const handleFactoryReset = useCallback(async () => {
    if (!userId) {
      showToast(t('page.noUserForFactoryReset', 'No user logged in'), 'error');
      return;
    }

    try {
      logger.log('[handleFactoryReset] Starting factory reset...');
      setIsResetting(true);

      // Data Safety - Layer 1: capture a restore point BEFORE wiping. Factory reset
      // has no rollback of its own, so this is the user's recovery path if they
      // reset by mistake. Kept in the separate backups DB (survives the clear).
      try {
        const { createSnapshot } = await import('@/utils/backupSnapshots');
        await createSnapshot(userId, 'pre-clear');
      } catch (snapshotError) {
        logger.warn('[handleFactoryReset] Pre-clear snapshot failed (non-fatal):', snapshotError);
      }

      // 1. Clear all data (cloud + local) via SyncedDataStore
      // SyncedDataStore.clearAllUserData() always clears local, even if cloud
      // clear fails (e.g., AbortError on Chrome Mobile). If cloud fails, it
      // re-throws after local is cleared, which we catch here.
      let cloudClearFailed = false;
      try {
        const dataStore = await getDataStore(userId);
        await dataStore.clearAllUserData();
        logger.log('[handleFactoryReset] Cloud and local data cleared');
      } catch (clearError) {
        // Local data is always cleared by SyncedDataStore, but cloud may have failed.
        // Log and continue — the user's primary intent is to reset local state.
        // Cloud data can be cleaned up on next attempt or via account deletion.
        logger.warn('[handleFactoryReset] Data clear partial failure (local cleared, cloud may have failed):', clearError);
        cloudClearFailed = true;
      }

      // 2. Close the storage adapter to ensure clean state
      await utilResetUserAppSettings(userId, { clearMigrationFlag: false });

      // 3. Set migration flag to skip cloud check (both local and cloud are empty now)
      setMigrationCompleted(userId);

      logger.log('[handleFactoryReset] Factory reset complete, reloading...');

      if (cloudClearFailed) {
        // Brief toast before reload so user knows cloud data may remain
        showToast(
          t('page.factoryResetPartial', 'Local data cleared. Cloud data may not have been fully removed — try again if needed.'),
          'error'
        );
        // Small delay so toast is visible before reload
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      reloadApp();
    } catch (error) {
      // Only reaches here if getDataStore, utilResetUserAppSettings, or setMigrationCompleted fails
      logger.error('[handleFactoryReset] Failed:', error);
      setIsResetting(false);
      showToast(t('page.factoryResetFailed', 'Failed to reset. Please try again.'), 'error');
    }
  }, [userId, showToast, t, setIsResetting]);

  return {
    appLanguage,
    setAppLanguage,
    defaultTeamNameSetting,
    setDefaultTeamNameSetting,
    isResetting,
    showHardResetConfirm,
    setShowHardResetConfirm,
    handleHardResetApp,
    handleHardResetConfirmed,
    handleResyncFromCloud,
    handleFactoryReset,
    handleCreateBackup,
    handleCloudDataDownload,
    handleShowAppGuide,
  };
}

export default useAppSettingsController;
