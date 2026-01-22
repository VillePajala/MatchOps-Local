'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { HiOutlineCloud, HiOutlineServer, HiOutlineArrowPath, HiOutlineExclamationTriangle, HiOutlineTrash, HiOutlineUser, HiOutlineLockClosed, HiOutlineArrowRightOnRectangle } from 'react-icons/hi2';
import {
  getBackendMode,
  isCloudAvailable,
  enableCloudMode,
  getCloudAccountInfo,
  clearMigrationCompleted,
  type CloudAccountInfo,
} from '@/config/backendConfig';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { getDataStore } from '@/datastore/factory';
import { primaryButtonStyle, secondaryButtonStyle, dangerButtonStyle } from '@/styles/modalStyles';
import logger from '@/utils/logger';
import CloudAuthModal from './CloudAuthModal';
import ReverseMigrationWizard from './ReverseMigrationWizard';

interface CloudSyncSectionProps {
  /** Callback when mode changes (app needs restart) */
  onModeChange?: () => void;
  /** Callback to show the re-authentication modal for deleting cloud data from local mode */
  onShowAuthModal?: () => void;
  /** Callback to show the reverse migration wizard when disabling cloud */
  onShowReverseMigration?: () => void;
}

/**
 * Cloud Sync settings section for SettingsModal.
 * Allows users to enable/disable cloud mode and shows current sync status.
 *
 * When cloud mode is enabled:
 * - Data syncs to Supabase cloud
 * - Requires authentication
 * - Works across devices
 *
 * When local mode is enabled (default):
 * - Data stored in browser IndexedDB
 * - Works offline
 * - Single device only
 */
export default function CloudSyncSection({
  onModeChange,
  onShowAuthModal,
  onShowReverseMigration,
}: CloudSyncSectionProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Use lazy initialization to load values only once on mount (avoids lint warning about setState in useEffect)
  const [currentMode] = useState<'local' | 'cloud'>(() => getBackendMode());
  const [cloudAvailable] = useState(() => isCloudAvailable());
  const [isChangingMode, setIsChangingMode] = useState(false);

  // Clear cloud data confirmation state
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [isClearingCloud, setIsClearingCloud] = useState(false);

  // Cloud account info (for showing cloud account section in local mode)
  const [cloudAccountInfo] = useState<CloudAccountInfo | null>(() => getCloudAccountInfo());
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Reverse migration wizard state
  const [showReverseMigrationWizard, setShowReverseMigrationWizard] = useState(false);

  // Sign out state
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Track mount state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleEnableCloud = () => {
    if (!cloudAvailable) {
      showToast(
        t('cloudSync.notConfigured', 'Cloud sync is not configured. Contact support for access.'),
        'error'
      );
      return;
    }

    setIsChangingMode(true);
    try {
      const success = enableCloudMode();
      if (success) {
        showToast(
          t('cloudSync.enabledReloading', 'Cloud mode enabled. Reloading...'),
          'success'
        );
        onModeChange?.();
        // Reload after brief delay so user sees the toast
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        showToast(
          t('cloudSync.enableFailed', 'Failed to enable cloud mode. Please try again.'),
          'error'
        );
        if (isMountedRef.current) {
          setIsChangingMode(false);
        }
      }
    } catch (error) {
      logger.error('[CloudSyncSection] Failed to enable cloud mode:', error);
      showToast(
        t('cloudSync.enableError', 'An error occurred while enabling cloud mode.'),
        'error'
      );
      if (isMountedRef.current) {
        setIsChangingMode(false);
      }
    }
  };

  const handleDisableCloud = () => {
    // If reverse migration wizard callback is provided, show it instead of directly disabling
    // This allows user to download their data before switching to local mode
    if (onShowReverseMigration) {
      onShowReverseMigration();
      return;
    }

    // Show reverse migration wizard to let user choose what to do with their data
    setShowReverseMigrationWizard(true);
  };

  /**
   * Handle reverse migration wizard completion.
   * The wizard handles mode switching, we handle closing and page reload.
   */
  const handleReverseMigrationComplete = () => {
    setShowReverseMigrationWizard(false);
    showToast(
      t('cloudSync.switchedToLocal', 'Switched to local mode. Reloading...'),
      'success'
    );
    // Reload after brief delay so user sees the toast
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  /**
   * Handle reverse migration wizard cancellation
   */
  const handleReverseMigrationCancel = () => {
    setShowReverseMigrationWizard(false);
  };

  const handleClearCloudData = async () => {
    if (clearConfirmText !== 'DELETE') {
      return;
    }

    // Safety check: Ensure cloud is actually available
    // This prevents accidentally clearing local data if cloud config is missing
    if (!cloudAvailable) {
      logger.error('[CloudSyncSection] Attempted to clear cloud data but cloud is unavailable');
      showToast(
        t('cloudSync.cloudUnavailable', 'Cloud is not available. Cannot clear cloud data.'),
        'error'
      );
      return;
    }

    setIsClearingCloud(true);
    try {
      const dataStore = await getDataStore();

      // Defense-in-depth: Verify we're actually using cloud backend
      // This catches edge cases where cloudAvailable is true but factory returned LocalDataStore
      const backendName = dataStore.getBackendName();
      if (backendName !== 'supabase') {
        logger.error(`[CloudSyncSection] Expected supabase backend but got ${backendName}`);
        showToast(
          t('cloudSync.wrongBackend', 'Cannot clear: not connected to cloud storage.'),
          'error'
        );
        return;
      }

      await dataStore.clearAllUserData();

      // Invalidate all React Query cache to refresh UI with empty state
      // This avoids page reload which could lose unsaved work
      await queryClient.invalidateQueries();

      showToast(
        t('cloudSync.clearSuccess', 'All cloud data deleted.'),
        'success'
      );

      // Reset the confirmation dialog
      setShowClearConfirm(false);
      setClearConfirmText('');
    } catch (error) {
      logger.error('[CloudSyncSection] Failed to clear cloud data:', error);
      showToast(
        t('cloudSync.clearError', 'Failed to clear cloud data. Please try again.'),
        'error'
      );
    } finally {
      if (isMountedRef.current) {
        setIsClearingCloud(false);
      }
    }
  };

  /**
   * Handle initiating cloud data deletion from local mode.
   * This requires re-authentication since session may have expired.
   */
  const handleDeleteCloudFromLocalMode = () => {
    if (!cloudAccountInfo) {
      logger.warn('[CloudSyncSection] No cloud account info available');
      showToast(
        t('cloudSync.cloudAccount.noAccountInfo', 'No cloud account information found. Cannot delete cloud data.'),
        'error'
      );
      return;
    }

    // Show auth modal for re-authentication
    if (onShowAuthModal) {
      onShowAuthModal();
    } else {
      // Use internal CloudAuthModal
      setShowAuthModal(true);
    }
  };

  /**
   * Handle sign out from cloud mode.
   * Signs out of the Supabase session and reloads the app.
   */
  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      // Clear migration completed flag BEFORE signing out (while we still have user ID)
      // This ensures that when user signs back in, the app will re-check for cloud data
      if (user?.id) {
        clearMigrationCompleted(user.id);
      }

      // Dynamic import to avoid bundling Supabase in local mode builds
      const { getAuthService } = await import('@/datastore/factory');
      const authService = await getAuthService();
      await authService.signOut();

      showToast(
        t('cloudSync.signedOut', 'Signed out successfully. Reloading...'),
        'success'
      );

      // Reload after brief delay so user sees the toast
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      logger.error('[CloudSyncSection] Failed to sign out:', error);
      showToast(
        t('cloudSync.signOutError', 'Failed to sign out. Please try again.'),
        'error'
      );
      if (isMountedRef.current) {
        setIsSigningOut(false);
      }
    }
  };

  /**
   * Handle successful cloud data deletion from CloudAuthModal
   */
  const handleCloudAuthComplete = () => {
    setShowAuthModal(false);
    // Refresh state - the CloudAuthModal already cleared the cloud account info
    // Trigger a page reload to reflect the changes
    showToast(
      t('cloudSync.cloudAccount.deleteSuccess', 'Cloud data deleted successfully.'),
      'success'
    );
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  /**
   * Format date for display
   */
  const formatDate = (isoString: string | undefined): string => {
    if (!isoString) {
      return t('cloudSync.cloudAccount.neverSynced', 'Never');
    }
    try {
      const date = new Date(isoString);
      // Check for invalid date (NaN check)
      if (isNaN(date.getTime())) {
        logger.warn('[CloudSyncSection] Invalid date received:', { isoString });
        return t('cloudSync.cloudAccount.unknownDate', 'Unknown');
      }
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (error) {
      logger.debug('[CloudSyncSection] Failed to format date, using raw string:', { isoString, error });
      return isoString;
    }
  };

  const labelStyle = 'text-sm font-medium text-slate-300 mb-1';

  return (
    <div className="space-y-3 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6">
      <h3 className="text-lg font-semibold text-slate-200">
        {t('cloudSync.title', 'Cloud Sync')}
      </h3>

      {/* Current Status */}
      <div className="flex items-center gap-3 p-3 rounded-md bg-slate-800/50">
        {currentMode === 'cloud' ? (
          <>
            <HiOutlineCloud className="h-6 w-6 text-sky-400" />
            <div>
              <p className={labelStyle}>{t('cloudSync.statusLabel', 'Current Mode')}</p>
              <p className="text-sm text-sky-400 font-medium">
                {t('cloudSync.cloudMode', 'Cloud Sync Enabled')}
              </p>
            </div>
          </>
        ) : (
          <>
            <HiOutlineServer className="h-6 w-6 text-slate-400" />
            <div>
              <p className={labelStyle}>{t('cloudSync.statusLabel', 'Current Mode')}</p>
              <p className="text-sm text-slate-300 font-medium">
                {t('cloudSync.localMode', 'Local Storage')}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Mode Description */}
      <p className="text-sm text-slate-400">
        {currentMode === 'cloud'
          ? t('cloudSync.cloudDescription', 'Your data syncs to the cloud. Access from any device after signing in.')
          : t('cloudSync.localDescription', 'Your data is stored locally on this device. Works offline, but data is not synced.')
        }
      </p>

      {/* Sign Out Button - Only shown in cloud mode */}
      {currentMode === 'cloud' && (
        <div className="pt-2">
          <button
            onClick={handleSignOut}
            disabled={isSigningOut || isChangingMode}
            className={`${secondaryButtonStyle} flex items-center justify-center gap-2 w-full py-2 text-sm`}
          >
            {isSigningOut ? (
              <>
                <HiOutlineArrowPath className="h-4 w-4 animate-spin" />
                {t('cloudSync.signingOut', 'Signing out...')}
              </>
            ) : (
              <>
                <HiOutlineArrowRightOnRectangle className="h-4 w-4" />
                {t('cloudSync.signOutButton', 'Sign Out')}
              </>
            )}
          </button>
        </div>
      )}

      {/* Cloud Not Available Warning */}
      {!cloudAvailable && currentMode === 'local' && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30">
          <HiOutlineExclamationTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-300">
            {t('cloudSync.notAvailable', 'Cloud sync is not available. This feature requires a premium subscription and server configuration.')}
          </p>
        </div>
      )}

      {/* Mode Toggle Button */}
      <div className="pt-2">
        {currentMode === 'local' ? (
          <button
            onClick={handleEnableCloud}
            disabled={isChangingMode || !cloudAvailable}
            className={`${primaryButtonStyle} flex items-center justify-center gap-2 w-full py-3`}
          >
            {isChangingMode ? (
              <HiOutlineArrowPath className="h-5 w-5 animate-spin" />
            ) : (
              <HiOutlineCloud className="h-5 w-5" />
            )}
            {isChangingMode
              ? t('cloudSync.enabling', 'Enabling...')
              : t('cloudSync.enableButton', 'Enable Cloud Sync')
            }
          </button>
        ) : (
          <button
            onClick={handleDisableCloud}
            disabled={isChangingMode}
            className={`${secondaryButtonStyle} flex items-center justify-center gap-2 w-full py-3`}
          >
            {isChangingMode ? (
              <HiOutlineArrowPath className="h-5 w-5 animate-spin" />
            ) : (
              <HiOutlineServer className="h-5 w-5" />
            )}
            {isChangingMode
              ? t('cloudSync.disabling', 'Disabling...')
              : t('cloudSync.disableButton', 'Switch to Local Mode')
            }
          </button>
        )}
      </div>

      {/* Migration Note */}
      {currentMode === 'local' && cloudAvailable && (
        <p className="text-xs text-slate-500">
          {t('cloudSync.migrationNote', 'When you enable cloud sync, you can migrate your existing local data to the cloud.')}
        </p>
      )}

      {/* Clear Cloud Data Section - Only shown when cloud mode is active AND cloud is available */}
      {/* Safety: If cloudAvailable is false, getDataStore() falls back to LocalDataStore */}
      {/* which would clear local IndexedDB instead of cloud data - so we must gate on both */}
      {currentMode === 'cloud' && cloudAvailable && (
        <div className="pt-4 mt-4 border-t border-slate-700">
          <h4 className="text-sm font-medium text-slate-300 mb-2">
            {t('cloudSync.dangerZone', 'Danger Zone')}
          </h4>

          {!showClearConfirm ? (
            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={isChangingMode}
              className={`${dangerButtonStyle} flex items-center justify-center gap-2 w-full py-3 !bg-red-600/20 hover:!bg-red-600/30 !text-red-400 border border-red-500/50`}
            >
              <HiOutlineTrash className="h-5 w-5" />
              {t('cloudSync.clearCloudData', 'Clear All Cloud Data')}
            </button>
          ) : (
            <div className="p-4 rounded-md bg-red-900/20 border border-red-500/50">
              <div className="flex items-start gap-2 mb-3">
                <HiOutlineExclamationTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-red-300 font-medium">
                    {t('cloudSync.clearWarningTitle', 'This action cannot be undone!')}
                  </p>
                  <p className="text-sm text-red-300/80 mt-1">
                    {t('cloudSync.clearWarningDescription', 'All your games, players, teams, seasons, and other data will be permanently deleted from the cloud.')}
                  </p>
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-sm text-slate-300 mb-1">
                  {t('cloudSync.clearConfirmLabel', 'Type DELETE to confirm:')}
                </label>
                <input
                  type="text"
                  value={clearConfirmText}
                  onChange={(e) => setClearConfirmText(e.target.value)}
                  placeholder="DELETE"
                  disabled={isClearingCloud}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-50"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowClearConfirm(false);
                    setClearConfirmText('');
                  }}
                  disabled={isClearingCloud}
                  className={`${secondaryButtonStyle} flex-1`}
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  onClick={handleClearCloudData}
                  disabled={clearConfirmText !== 'DELETE' || isClearingCloud}
                  className={`${dangerButtonStyle} flex-1 flex items-center justify-center gap-2`}
                >
                  {isClearingCloud ? (
                    <>
                      <HiOutlineArrowPath className="h-4 w-4 animate-spin" />
                      {t('cloudSync.clearing', 'Clearing...')}
                    </>
                  ) : (
                    <>
                      <HiOutlineTrash className="h-4 w-4" />
                      {t('cloudSync.confirmClear', 'Clear All Data')}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500 mt-2">
            {t('cloudSync.clearNote', 'This will delete all your data from the cloud. Local data on this device will not be affected.')}
          </p>
        </div>
      )}

      {/* Cloud Account Section - Shown in LOCAL mode when user has cloud account info */}
      {currentMode === 'local' && cloudAccountInfo && (
        <div className="pt-4 mt-4 border-t border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <HiOutlineLockClosed className="h-5 w-5 text-slate-400" />
            <h4 className="text-sm font-medium text-slate-300">
              {t('cloudSync.cloudAccount.title', 'Cloud Account')}
            </h4>
          </div>

          {/* Account info */}
          <div className="p-3 rounded-md bg-slate-800/50 space-y-2 mb-3">
            <div className="flex items-center gap-2">
              <HiOutlineUser className="h-4 w-4 text-slate-400" />
              <span className="text-sm text-slate-300">{cloudAccountInfo?.email || t('cloudSync.cloudAccount.unknownEmail', 'Unknown')}</span>
            </div>
            <div className="text-xs text-slate-500">
              {t('cloudSync.cloudAccount.lastSynced', 'Last synced: {{date}}', {
                date: formatDate(cloudAccountInfo?.lastSyncedAt),
              })}
            </div>
            {cloudAccountInfo?.hasCloudData && (
              <div className="text-xs text-amber-400">
                {t('cloudSync.cloudAccount.hasCloudData', 'You have data stored in the cloud.')}
              </div>
            )}
          </div>

          {/* Delete cloud data from local mode */}
          {cloudAccountInfo?.hasCloudData && (
            <>
              <button
                onClick={handleDeleteCloudFromLocalMode}
                className={`${dangerButtonStyle} flex items-center justify-center gap-2 w-full py-2 text-sm !bg-red-600/20 hover:!bg-red-600/30 !text-red-400 border border-red-500/50`}
              >
                <HiOutlineTrash className="h-4 w-4" />
                {t('cloudSync.cloudAccount.deleteCloudData', 'Delete All Cloud Data')}
              </button>

              <p className="text-xs text-slate-500 mt-2">
                {t('cloudSync.cloudAccount.deleteNote', 'This will permanently delete all your data from our servers.')}
              </p>
            </>
          )}
        </div>
      )}

      {/* CloudAuthModal for re-authentication when deleting cloud data from local mode */}
      {showAuthModal && cloudAccountInfo && (
        <CloudAuthModal
          email={cloudAccountInfo.email}
          onComplete={handleCloudAuthComplete}
          onCancel={() => setShowAuthModal(false)}
        />
      )}

      {/* ReverseMigrationWizard for migrating from cloud to local */}
      {showReverseMigrationWizard && (
        <ReverseMigrationWizard
          onComplete={handleReverseMigrationComplete}
          onCancel={handleReverseMigrationCancel}
        />
      )}
    </div>
  );
}
