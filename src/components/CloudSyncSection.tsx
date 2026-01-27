'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { HiOutlineCloud, HiOutlineServer, HiOutlineArrowPath, HiOutlineExclamationTriangle, HiOutlineTrash, HiOutlineUser, HiOutlineArrowRightOnRectangle, HiOutlineCreditCard, HiOutlineArrowUpTray } from 'react-icons/hi2';
import {
  getBackendMode,
  isCloudAvailable,
  enableCloudMode,
  getCloudAccountInfo,
  clearMigrationCompleted,
  hasMigrationCompleted,
  type CloudAccountInfo,
} from '@/config/backendConfig';
import { hasLocalDataToMigrate } from '@/services/migrationService';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useSubscriptionOptional, clearSubscriptionCache } from '@/contexts/SubscriptionContext';
import { getDataStore } from '@/datastore/factory';
// Note: We use custom Tailwind classes for buttons in this redesigned component
import logger from '@/utils/logger';
import { NetworkError, AuthError } from '@/interfaces/DataStoreErrors';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import SyncStatusIndicator from './SyncStatusIndicator';
import CloudAuthModal from './CloudAuthModal';
import ReverseMigrationWizard from './ReverseMigrationWizard';
import UpgradePromptModal from './UpgradePromptModal';
import PendingSyncWarningModal from './PendingSyncWarningModal';

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

  // Subscription status for cloud mode (null in local mode)
  const subscription = useSubscriptionOptional();
  // Only consider user as having subscription when we've confirmed it
  // If context is null or still loading, don't show subscribe button (safer default)
  const subscriptionLoading = !subscription || subscription.isLoading;
  const hasSubscription = subscription?.isActive ?? false;

  // Sync status for cloud mode (shows sync details)
  const syncStatus = useSyncStatus();

  // State for showing upgrade modal when user wants to subscribe
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

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

  // Pending sync warning modal state (shown before reverse migration if pending syncs exist)
  const [showPendingSyncWarning, setShowPendingSyncWarning] = useState(false);

  // Sign out state
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Import local data state
  const [isCheckingLocalData, setIsCheckingLocalData] = useState(false);

  // Track mount state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Track if we've shown the auto upgrade modal this session
  const hasShownAutoUpgradeRef = useRef(false);

  // Auto-show upgrade modal when in cloud mode without subscription
  // This makes the subscription requirement more prominent than just a banner
  useEffect(() => {
    if (
      currentMode === 'cloud' &&
      user && // User is authenticated
      !subscriptionLoading &&
      !hasSubscription &&
      !hasShownAutoUpgradeRef.current
    ) {
      hasShownAutoUpgradeRef.current = true;
      setShowUpgradeModal(true);
    }
  }, [currentMode, user, subscriptionLoading, hasSubscription]);

  // Actually enable cloud mode (called after premium check passes)
  const executeEnableCloud = useCallback(() => {
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
  }, [cloudAvailable, showToast, t, onModeChange]);

  // Handle enable cloud - no premium gate, subscription checked after login
  const handleEnableCloud = useCallback(() => {
    executeEnableCloud();
  }, [executeEnableCloud]);

  const handleDisableCloud = () => {
    // If reverse migration wizard callback is provided, show it instead of directly disabling
    // This allows user to download their data before switching to local mode
    if (onShowReverseMigration) {
      onShowReverseMigration();
      return;
    }

    // Check if there are pending/failed syncs before proceeding
    // This prevents data loss from unsynced local changes
    if (syncStatus.pendingCount > 0 || syncStatus.failedCount > 0) {
      setShowPendingSyncWarning(true);
      return;
    }

    // No pending syncs - show reverse migration wizard directly
    setShowReverseMigrationWizard(true);
  };

  /**
   * Handle user choice from pending sync warning modal
   */
  const handlePendingSyncWarningAction = useCallback(async (action: 'sync' | 'discard' | 'cancel') => {
    switch (action) {
      case 'sync':
        // Keep modal open during sync to show isSyncing state via syncStatus prop
        // This gives user visual feedback that sync is in progress
        try {
          await syncStatus.syncNow();
          // Sync completed - close modal and proceed to wizard
          setShowPendingSyncWarning(false);
          setShowReverseMigrationWizard(true);
        } catch (error) {
          // On error, keep modal open so user can try again or choose to discard
          logger.error('[CloudSyncSection] Sync before mode switch failed:', error);
          showToast(
            t('cloudSync.pendingSync.syncFailed', 'Sync failed. Please try again or discard changes.'),
            'error'
          );
        }
        break;

      case 'discard':
        setShowPendingSyncWarning(false);
        // Clear the failed items and proceed
        if (syncStatus.failedCount > 0) {
          await syncStatus.clearFailed();
        }
        // Proceed to reverse migration wizard
        setShowReverseMigrationWizard(true);
        break;

      case 'cancel':
        setShowPendingSyncWarning(false);
        break;
    }
  }, [syncStatus, showToast, t]);

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

      // Provide actionable feedback based on error type
      if (error instanceof NetworkError) {
        showToast(
          t('cloudSync.clearNetworkError', 'Network error. Please check your connection and try again.'),
          'error'
        );
      } else if (error instanceof AuthError) {
        showToast(
          t('cloudSync.clearAuthError', 'Session expired. Please sign out and sign in again.'),
          'error'
        );
      } else {
        showToast(
          t('cloudSync.clearError', 'Failed to clear cloud data. Please try again.'),
          'error'
        );
      }
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

      // Provide actionable feedback based on error type
      if (error instanceof NetworkError) {
        showToast(
          t('cloudSync.signOutNetworkError', 'Network error. You can continue using the app offline.'),
          'error'
        );
      } else {
        showToast(
          t('cloudSync.signOutError', 'Failed to sign out. Please try again.'),
          'error'
        );
      }
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
   * Handle import local data to cloud.
   * Checks if there's local data to migrate, and if so, clears the migration
   * completed flag and reloads the page to trigger the migration wizard.
   */
  const handleImportLocalData = async () => {
    if (!user?.id) {
      showToast(
        t('cloudSync.importLocalData.notSignedIn', 'Please sign in first.'),
        'error'
      );
      return;
    }

    setIsCheckingLocalData(true);
    try {
      const result = await hasLocalDataToMigrate();

      if (result.checkFailed) {
        logger.error('[CloudSyncSection] Failed to check local data:', result.error);
        showToast(
          t('cloudSync.importLocalData.checkFailed', 'Failed to check for local data. Please try again.'),
          'error'
        );
        return;
      }

      if (!result.hasData) {
        showToast(
          t('cloudSync.importLocalData.noData', 'No local data found to import.'),
          'info'
        );
        return;
      }

      // Local data exists - clear migration completed flag and reload to trigger wizard
      // This allows the user to re-run migration even if they've migrated before
      if (hasMigrationCompleted(user.id)) {
        clearMigrationCompleted(user.id);
        logger.info('[CloudSyncSection] Cleared migration completed flag to allow re-migration');
      }

      showToast(
        t('cloudSync.importLocalData.starting', 'Starting import... Reloading.'),
        'success'
      );

      // Reload page to trigger migration wizard in page.tsx
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      logger.error('[CloudSyncSection] Error checking local data:', error);
      showToast(
        t('cloudSync.importLocalData.error', 'An error occurred. Please try again.'),
        'error'
      );
    } finally {
      if (isMountedRef.current) {
        setIsCheckingLocalData(false);
      }
    }
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

  /**
   * Format timestamp as relative time (e.g., "2 minutes ago")
   */
  const formatRelativeTime = (timestamp: number | null): string => {
    if (!timestamp) {
      return t('cloudSync.cloudAccount.neverSynced', 'Never');
    }
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) {
      return t('cloudSync.syncDetails.justNow', 'Just now');
    } else if (diffMinutes < 60) {
      return t('cloudSync.syncDetails.minutesAgo', '{{count}} min ago', { count: diffMinutes });
    } else if (diffHours < 24) {
      return t('cloudSync.syncDetails.hoursAgo', '{{count}} hr ago', { count: diffHours });
    } else {
      return t('cloudSync.syncDetails.daysAgo', '{{count}} days ago', { count: diffDays });
    }
  };

  // Shared styles
  const sectionCardStyle = 'rounded-xl bg-gradient-to-b from-slate-800/60 to-slate-800/30 border border-slate-700/50 backdrop-blur-sm';
  const sectionTitleStyle = 'text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3';

  return (
    <div className="space-y-4 -mx-2 sm:-mx-4 md:-mx-6 -mt-2 sm:-mt-4 md:-mt-6 pb-2">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-xl font-bold text-slate-100 tracking-tight">
          {t('cloudSync.title', 'Account & Sync')}
        </h3>
        <p className="text-sm text-slate-400 mt-1">
          {t('cloudSync.subtitle', 'Manage your data storage and sync settings')}
        </p>
      </div>

      {/* Current Mode Status Card */}
      <div className="px-4">
        <div className={`${sectionCardStyle} overflow-hidden`}>
          {currentMode === 'cloud' ? (
            <div className="relative">
              {/* Gradient accent */}
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-500" />
              <div className="p-4">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-sky-500/20 to-indigo-500/20 border border-sky-500/30">
                    <HiOutlineCloud className="h-6 w-6 text-sky-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold text-slate-100">
                        {t('cloudSync.cloudMode', 'Cloud Sync Enabled')}
                      </span>
                      {hasSubscription && (
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                          {t('cloudSync.active', 'Active')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 mt-1">
                      {subscriptionLoading || hasSubscription
                        ? t('cloudSync.cloudDescription', 'Your data syncs to the cloud. Access from any device after signing in.')
                        : t('cloudSync.cloudNoSubscription', 'You have a cloud account but sync is paused. Subscribe to enable cloud sync.')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative">
              {/* Gradient accent */}
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-slate-600 via-slate-500 to-slate-600" />
              <div className="p-4">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-slate-600/30 to-slate-700/30 border border-slate-600/50">
                    <HiOutlineServer className="h-6 w-6 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-lg font-semibold text-slate-100">
                      {t('cloudSync.localMode', 'Local Storage')}
                    </span>
                    <p className="text-sm text-slate-400 mt-1">
                      {t('cloudSync.localDescription', 'Your data is stored locally on this device. Works offline, but data is not synced.')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sync Details - shown in cloud mode with active subscription */}
      {currentMode === 'cloud' && hasSubscription && (
        <div className="px-4">
          <p className={sectionTitleStyle}>{t('cloudSync.syncDetails.sectionTitle', 'Sync Status')}</p>
          <div className={`${sectionCardStyle} p-4 space-y-4`}>
            {/* Status and Indicator */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SyncStatusIndicator />
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    {syncStatus.isSyncing
                      ? t('cloudSync.syncDetails.syncing', 'Syncing...')
                      : syncStatus.state === 'synced'
                        ? t('cloudSync.syncDetails.allSynced', 'All synced')
                        : syncStatus.state === 'offline'
                          ? t('cloudSync.syncDetails.offline', 'Offline')
                          : syncStatus.pendingCount > 0
                            ? t('cloudSync.syncDetails.pendingShort', '{{count}} pending', { count: syncStatus.pendingCount })
                            : t('cloudSync.syncDetails.ready', 'Ready')}
                  </p>
                  <p className="text-xs text-slate-500">
                    {syncStatus.lastSyncedAt
                      ? t('cloudSync.syncDetails.lastSyncedAt', 'Last synced {{time}}', { time: formatRelativeTime(syncStatus.lastSyncedAt) })
                      : t('cloudSync.cloudAccount.neverSynced', 'Never synced')}
                  </p>
                </div>
              </div>
              <button
                onClick={syncStatus.syncNow}
                disabled={!syncStatus.isOnline || syncStatus.pendingCount === 0 || syncStatus.isSyncing}
                className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 text-slate-300 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                title={t('cloudSync.syncDetails.syncNow', 'Sync Now')}
              >
                <HiOutlineArrowPath className={`h-5 w-5 ${syncStatus.isSyncing ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Failed Operations Warning */}
            {syncStatus.failedCount > 0 && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <div className="flex items-center gap-2 mb-3">
                  <HiOutlineExclamationTriangle className="h-4 w-4 text-red-400" />
                  <p className="text-sm font-medium text-red-300">
                    {t('cloudSync.syncDetails.failedCount', '{{count}} operations failed to sync.', { count: syncStatus.failedCount })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={syncStatus.retryFailed}
                    className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 text-slate-200 transition-colors"
                  >
                    {t('cloudSync.syncDetails.retry', 'Retry')}
                  </button>
                  <button
                    onClick={syncStatus.clearFailed}
                    className="flex-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 transition-colors"
                  >
                    {t('cloudSync.syncDetails.discard', 'Discard')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subscription Warning - shown in cloud mode without active subscription */}
      {/* Only show when we've confirmed no subscription (not while loading) */}
      {currentMode === 'cloud' && !subscriptionLoading && !hasSubscription && (
        <div className="px-4">
          <div className="relative rounded-xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 overflow-hidden">
            {/* Decorative gradient */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-amber-500/20 to-transparent rounded-full blur-2xl" />
            <div className="relative p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/30">
                  <HiOutlineExclamationTriangle className="h-5 w-5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-300">
                    {t('cloudSync.subscriptionRequired', 'Subscription Required')}
                  </p>
                  <p className="text-sm text-amber-300/70 mt-1">
                    {t('cloudSync.subscriptionRequiredDescription', 'Your account is active but cloud sync is paused. Subscribe to sync your data across devices.')}
                  </p>
                  <button
                    onClick={() => setShowUpgradeModal(true)}
                    className="mt-3 px-4 py-2 text-sm font-semibold bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-900 rounded-lg shadow-lg shadow-amber-500/20 transition-all hover:shadow-amber-500/30"
                  >
                    {t('cloudSync.subscribeButton', 'Subscribe Now')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Account Actions - Only shown in cloud mode */}
      {currentMode === 'cloud' && (
        <div className="px-4">
          <p className={sectionTitleStyle}>{t('cloudSync.accountActions', 'Account')}</p>
          <div className={`${sectionCardStyle} divide-y divide-slate-700/50`}>
            {/* Sign Out */}
            <button
              onClick={handleSignOut}
              disabled={isSigningOut || isChangingMode}
              className="w-full flex items-center gap-3 p-3 hover:bg-slate-700/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed first:rounded-t-xl last:rounded-b-xl"
            >
              <div className="p-2 rounded-lg bg-slate-700/50">
                {isSigningOut ? (
                  <HiOutlineArrowPath className="h-4 w-4 text-slate-300 animate-spin" />
                ) : (
                  <HiOutlineArrowRightOnRectangle className="h-4 w-4 text-slate-300" />
                )}
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium text-slate-200">
                  {isSigningOut ? t('cloudSync.signingOut', 'Signing out...') : t('cloudSync.signOutButton', 'Sign Out')}
                </p>
                <p className="text-xs text-slate-500">{t('cloudSync.signOutDescription', 'Sign out of your cloud account')}</p>
              </div>
            </button>

            {/* Manage Subscription - Only shown for users with active subscription */}
            {hasSubscription && (
              <>
                <a
                  href="https://play.google.com/store/account/subscriptions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center gap-3 p-3 hover:bg-slate-700/30 transition-colors no-underline"
                >
                  <div className="p-2 rounded-lg bg-slate-700/50">
                    <HiOutlineCreditCard className="h-4 w-4 text-slate-300" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-slate-200">{t('cloudSync.manageSubscription', 'Manage Subscription')}</p>
                    <p className="text-xs text-slate-500">{t('cloudSync.manageSubscriptionDescription', 'View or cancel on Google Play')}</p>
                  </div>
                </a>

                {/* Import Local Data Button */}
                <button
                  onClick={handleImportLocalData}
                  disabled={isCheckingLocalData || isChangingMode}
                  className="w-full flex items-center gap-3 p-3 hover:bg-slate-700/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed last:rounded-b-xl"
                >
                  <div className="p-2 rounded-lg bg-slate-700/50">
                    {isCheckingLocalData ? (
                      <HiOutlineArrowPath className="h-4 w-4 text-slate-300 animate-spin" />
                    ) : (
                      <HiOutlineArrowUpTray className="h-4 w-4 text-slate-300" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-slate-200">
                      {isCheckingLocalData ? t('cloudSync.importLocalData.checking', 'Checking...') : t('cloudSync.importLocalData.button', 'Import Local Data to Cloud')}
                    </p>
                    <p className="text-xs text-slate-500">{t('cloudSync.importLocalData.description', 'Migrate data from this device')}</p>
                  </div>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Cloud Not Available Warning */}
      {!cloudAvailable && currentMode === 'local' && (
        <div className="px-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <HiOutlineExclamationTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-300/80">
              {t('cloudSync.notAvailable', 'Cloud sync is not available. This feature requires a premium subscription and server configuration.')}
            </p>
          </div>
        </div>
      )}

      {/* Mode Switch Section */}
      <div className="px-4 pt-2">
        <p className={sectionTitleStyle}>{t('cloudSync.switchMode', 'Switch Mode')}</p>
        {currentMode === 'local' ? (
          <button
            onClick={handleEnableCloud}
            disabled={isChangingMode || !cloudAvailable}
            className="w-full flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all"
          >
            <div className="p-2 rounded-lg bg-white/10">
              {isChangingMode ? (
                <HiOutlineArrowPath className="h-5 w-5 text-white animate-spin" />
              ) : (
                <HiOutlineCloud className="h-5 w-5 text-white" />
              )}
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-white">
                {isChangingMode ? t('cloudSync.enabling', 'Enabling...') : t('cloudSync.enableButton', 'Enable Cloud Sync')}
              </p>
              <p className="text-xs text-white/70">{t('cloudSync.enableDescription', 'Sync data across all your devices')}</p>
            </div>
          </button>
        ) : (
          <button
            onClick={handleDisableCloud}
            disabled={isChangingMode}
            className={`w-full flex items-center gap-3 p-4 rounded-xl ${sectionCardStyle} hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
          >
            <div className="p-2 rounded-lg bg-slate-700/50">
              {isChangingMode ? (
                <HiOutlineArrowPath className="h-5 w-5 text-slate-300 animate-spin" />
              ) : (
                <HiOutlineServer className="h-5 w-5 text-slate-300" />
              )}
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-slate-200">
                {isChangingMode ? t('cloudSync.disabling', 'Disabling...') : t('cloudSync.disableButton', 'Switch to Local Mode')}
              </p>
              <p className="text-xs text-slate-500">{t('cloudSync.disableDescription', 'Store data only on this device')}</p>
            </div>
          </button>
        )}

        {/* Migration Note */}
        {currentMode === 'local' && cloudAvailable && (
          <p className="text-xs text-slate-500 mt-2 text-center">
            {t('cloudSync.migrationNote', 'When you enable cloud sync, you can migrate your existing local data to the cloud.')}
          </p>
        )}
      </div>

      {/* Clear Cloud Data Section - Only shown when cloud mode is active AND cloud is available */}
      {/* Safety: If cloudAvailable is false, getDataStore() falls back to LocalDataStore */}
      {/* which would clear local IndexedDB instead of cloud data - so we must gate on both */}
      {currentMode === 'cloud' && cloudAvailable && (
        <div className="px-4 pt-4">
          <p className={`${sectionTitleStyle} text-red-400`}>{t('cloudSync.dangerZone', 'Danger Zone')}</p>

          {!showClearConfirm ? (
            <div className={`${sectionCardStyle} border-red-500/20`}>
              <button
                onClick={() => setShowClearConfirm(true)}
                disabled={isChangingMode}
                className="w-full flex items-center gap-3 p-3 hover:bg-red-500/10 transition-colors rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30">
                  <HiOutlineTrash className="h-4 w-4 text-red-400" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-red-300">{t('cloudSync.clearCloudData', 'Clear All Cloud Data')}</p>
                  <p className="text-xs text-slate-500">{t('cloudSync.clearNote', 'Permanently delete all data from the cloud')}</p>
                </div>
              </button>
            </div>
          ) : (
            <div className="rounded-xl bg-gradient-to-b from-red-900/30 to-red-900/10 border border-red-500/30 p-4">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 rounded-lg bg-red-500/20">
                  <HiOutlineExclamationTriangle className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-red-300">
                    {t('cloudSync.clearWarningTitle', 'This action cannot be undone!')}
                  </p>
                  <p className="text-sm text-red-300/70 mt-1">
                    {t('cloudSync.clearWarningDescription', 'All your games, players, teams, seasons, and other data will be permanently deleted from the cloud.')}
                  </p>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
                  {t('cloudSync.clearConfirmLabel', 'Type DELETE to confirm:')}
                </label>
                <input
                  type="text"
                  value={clearConfirmText}
                  onChange={(e) => setClearConfirmText(e.target.value)}
                  placeholder="DELETE"
                  disabled={isClearingCloud}
                  className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-600/50 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 disabled:opacity-50 transition-all"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowClearConfirm(false);
                    setClearConfirmText('');
                  }}
                  disabled={isClearingCloud}
                  className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 text-slate-200 disabled:opacity-50 transition-colors"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  onClick={handleClearCloudData}
                  disabled={clearConfirmText !== 'DELETE' || isClearingCloud}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:bg-red-600/30 disabled:text-red-300/50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
        </div>
      )}

      {/* Cloud Account Section - Shown in LOCAL mode when user has cloud account info */}
      {currentMode === 'local' && cloudAccountInfo && (
        <div className="px-4 pt-4">
          <p className={sectionTitleStyle}>{t('cloudSync.cloudAccount.title', 'Cloud Account')}</p>
          <div className={`${sectionCardStyle} p-4 space-y-4`}>
            {/* Account info */}
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-700/50">
                <HiOutlineUser className="h-5 w-5 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">
                  {cloudAccountInfo?.email || t('cloudSync.cloudAccount.unknownEmail', 'Unknown')}
                </p>
                <p className="text-xs text-slate-500">
                  {t('cloudSync.cloudAccount.lastSynced', 'Last synced: {{date}}', {
                    date: formatDate(cloudAccountInfo?.lastSyncedAt),
                  })}
                </p>
              </div>
              {cloudAccountInfo?.hasCloudData && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  {t('cloudSync.cloudAccount.hasData', 'Has data')}
                </span>
              )}
            </div>

            {/* Delete cloud data from local mode */}
            {cloudAccountInfo?.hasCloudData && (
              <div className="pt-3 border-t border-slate-700/50">
                <button
                  onClick={handleDeleteCloudFromLocalMode}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 transition-colors"
                >
                  <HiOutlineTrash className="h-4 w-4 text-red-400" />
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-red-300">{t('cloudSync.cloudAccount.deleteCloudData', 'Delete All Cloud Data')}</p>
                    <p className="text-xs text-slate-500">{t('cloudSync.cloudAccount.deleteNote', 'Permanently delete data from servers')}</p>
                  </div>
                </button>
              </div>
            )}
          </div>
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

      {/* Upgrade modal - shown when user wants to subscribe */}
      <UpgradePromptModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        variant="cloudUpgrade"
        onUpgradeSuccess={async () => {
          setShowUpgradeModal(false);
          // CRITICAL: Clear subscription cache before reload
          // Otherwise the stale "none" cached value will be used on reload
          if (user) {
            await clearSubscriptionCache(user.id);
          }
          // After subscription, reload page to trigger fresh migration check
          // This ensures migration wizard shows if there's local data to import
          showToast(
            t('cloudSync.subscriptionSuccess', 'Subscription activated! Reloading...'),
            'success'
          );
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }}
      />

      {/* Pending sync warning modal - shown when trying to switch to local with unsynced changes */}
      {showPendingSyncWarning && (
        <PendingSyncWarningModal
          pendingCount={syncStatus.pendingCount}
          failedCount={syncStatus.failedCount}
          isSyncing={syncStatus.isSyncing}
          isOnline={syncStatus.isOnline}
          onAction={handlePendingSyncWarningAction}
        />
      )}
    </div>
  );
}
