'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineCloud, HiOutlineServer, HiOutlineArrowPath, HiOutlineExclamationTriangle, HiOutlineTrash, HiOutlineUser, HiOutlineLockClosed, HiOutlineArrowRightOnRectangle, HiOutlineArrowUpTray, HiOutlinePause, HiOutlinePlay } from 'react-icons/hi2';
// HiOutlineCreditCard removed — Manage Subscription link hidden until subscription support is live
import {
  getBackendMode,
  isCloudAvailable,
  enableCloudMode,
  disableCloudMode,
  getCloudAccountInfo,
  clearMigrationCompleted,
  hasMigrationCompleted,
  clearWelcomeSeen,
  type CloudAccountInfo,
} from '@/config/backendConfig';
import type { LocalDataCheckResult } from '@/services/migrationService';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useSubscriptionOptional, clearSubscriptionCache } from '@/contexts/SubscriptionContext';
import { primaryButtonStyle, secondaryButtonStyle } from '@/styles/modalStyles';
import logger from '@/utils/logger';
import { isPlayStoreContext } from '@/utils/platform';
import { NetworkError } from '@/interfaces/DataStoreErrors';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import SyncStatusIndicator from './SyncStatusIndicator';
import CloudAuthModal from './CloudAuthModal';
import ReverseMigrationWizard from './ReverseMigrationWizard';
import UpgradePromptModal from './UpgradePromptModal';
import PendingSyncWarningModal from './PendingSyncWarningModal';
import TransitionOverlay from './TransitionOverlay';

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
  const { user } = useAuth();
  const isPlayStoreCtx = isPlayStoreContext();

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

  // Transition overlay message (replaces toast+reload pattern)
  const [transitionMessage, setTransitionMessage] = useState<string | null>(null);

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
        setTransitionMessage(
          t('cloudSync.enabledReloading', 'Cloud mode enabled. Reloading...')
        );
        onModeChange?.();
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
    setTransitionMessage(
      t('cloudSync.switchedToLocal', 'Switched to local mode. Reloading...')
    );
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

      setTransitionMessage(
        t('cloudSync.signedOut', 'Signed out successfully. Reloading...')
      );
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
   * Handle "Start Over" - sign out, disable cloud mode, return to WelcomeScreen.
   * Different from Sign Out which stays in cloud mode and shows LoginScreen.
   */
  const handleStartOver = async () => {
    setIsSigningOut(true);
    try {
      // 1. Clear migration completed flag (while we still have user ID)
      if (user?.id) {
        clearMigrationCompleted(user.id);
      }

      // 2. Sign out
      const { getAuthService } = await import('@/datastore/factory');
      const authService = await getAuthService();
      await authService.signOut();

      // 3. Clear welcome seen flag to show WelcomeScreen
      clearWelcomeSeen();

      // 4. Disable cloud mode
      disableCloudMode();

      setTransitionMessage(
        t('cloudSync.startingOver', 'Starting over. Reloading...')
      );
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      logger.error('[CloudSyncSection] Failed to start over:', error);
      showToast(
        t('cloudSync.startOverError', 'Failed to start over. Please try again.'),
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
    setTransitionMessage(
      t('cloudSync.cloudAccount.deleteSuccess', 'Cloud data deleted successfully.')
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
      const { hasLocalDataToMigrate } = await import('@/services/migrationService');
      const result: LocalDataCheckResult = await hasLocalDataToMigrate();

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

      setTransitionMessage(
        t('cloudSync.importLocalData.starting', 'Starting import... Reloading.')
      );
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

  const labelStyle = 'text-sm font-medium text-slate-300 mb-1';

  return (
    <div className="space-y-3 bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
      <h3 className="text-lg font-semibold text-slate-200">
        {t('cloudSync.title', 'Account & Sync')}
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
          ? (subscriptionLoading || hasSubscription
            ? t('cloudSync.cloudDescription', 'Your data syncs to the cloud. Access from any device after signing in.')
            : t('cloudSync.cloudNoSubscription', 'You have a cloud account but sync is paused. Subscribe to enable cloud sync.'))
          : t('cloudSync.localDescription', 'Your data is stored locally on this device. Works offline, but data is not synced.')
        }
      </p>

      {/* Sync Details - shown in cloud mode with active subscription */}
      {currentMode === 'cloud' && hasSubscription && (
        <div className="p-3 rounded-md bg-slate-800/50 space-y-3">
          {/* Sync Status Row */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">{t('cloudSync.syncDetails.status', 'Sync Status')}</span>
            <SyncStatusIndicator />
          </div>

          {/* Last Synced Row */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">{t('cloudSync.syncDetails.lastSynced', 'Last synced')}</span>
            <span className="text-slate-300">
              {syncStatus.lastSyncedAt
                ? formatRelativeTime(syncStatus.lastSyncedAt)
                : t('cloudSync.cloudAccount.neverSynced', 'Never')}
            </span>
          </div>

          {/* Pending Changes Row */}
          {syncStatus.pendingCount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">{t('cloudSync.syncDetails.pendingChanges', 'Pending changes')}</span>
              <span className="text-amber-400 font-medium">{syncStatus.pendingCount}</span>
            </div>
          )}

          {/* Sync Control Buttons */}
          <div className="flex gap-2">
            {/* Sync Now Button */}
            <button
              onClick={syncStatus.syncNow}
              disabled={!syncStatus.isOnline || syncStatus.pendingCount === 0 || syncStatus.isSyncing || syncStatus.isPaused}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-600 text-white hover:bg-slate-500 border border-slate-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncStatus.isSyncing ? (
                <>
                  <HiOutlineArrowPath className="h-3.5 w-3.5 animate-spin" />
                  {t('cloudSync.syncDetails.syncing', 'Syncing...')}
                </>
              ) : (
                <>
                  <HiOutlineArrowPath className="h-3.5 w-3.5" />
                  {t('cloudSync.syncDetails.syncNow', 'Sync Now')}
                </>
              )}
            </button>

            {/* Pause/Resume Button */}
            <button
              onClick={syncStatus.isPaused ? syncStatus.resume : syncStatus.pause}
              disabled={syncStatus.isSyncing}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                syncStatus.isPaused
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                  : 'bg-slate-600 text-white hover:bg-slate-500 border border-slate-500/30'
              }`}
              title={syncStatus.isPaused
                ? t('cloudSync.syncDetails.resumeTitle', 'Resume automatic sync')
                : t('cloudSync.syncDetails.pauseTitle', 'Pause automatic sync')
              }
            >
              {syncStatus.isPaused ? (
                <>
                  <HiOutlinePlay className="h-3.5 w-3.5" />
                  {t('cloudSync.syncDetails.resume', 'Resume')}
                </>
              ) : (
                <>
                  <HiOutlinePause className="h-3.5 w-3.5" />
                  {t('cloudSync.syncDetails.pause', 'Pause')}
                </>
              )}
            </button>
          </div>

          {/* Paused Warning */}
          {syncStatus.isPaused && (
            <div className="p-2 rounded-md bg-amber-500/10 border border-amber-500/30">
              <p className="text-xs text-amber-300">
                {t('cloudSync.syncDetails.pausedWarning', 'Sync is paused. Changes are saved locally and will sync when you resume.')}
              </p>
            </div>
          )}

          {/* Failed Operations Warning */}
          {syncStatus.failedCount > 0 && (
            <div className="p-3 rounded-md bg-red-900/20 border border-red-700">
              <div className="flex items-center gap-2 mb-2">
                <HiOutlineExclamationTriangle className="h-4 w-4 text-red-400" />
                <p className="text-sm text-red-300">
                  {t('cloudSync.syncDetails.failedCount', '{{count}} operations failed to sync.', { count: syncStatus.failedCount })}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={syncStatus.retryFailed}
                  className="flex-1 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-600 text-white hover:bg-slate-500 border border-slate-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('cloudSync.syncDetails.retry', 'Retry')}
                </button>
                <button
                  onClick={syncStatus.clearFailed}
                  className="flex-1 px-3 py-1.5 rounded-md text-xs font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('cloudSync.syncDetails.discard', 'Discard')}
                </button>
              </div>
            </div>
          )}

          {/* Cloud Not Connected Warning - pending items but cloud backend not ready */}
          {!syncStatus.cloudConnected && syncStatus.pendingCount > 0 && !syncStatus.isLoading && (
            <div className="p-3 rounded-md bg-amber-900/20 border border-amber-700">
              <div className="flex items-center gap-2">
                <HiOutlineExclamationTriangle className="h-4 w-4 text-amber-400" />
                <p className="text-sm text-amber-300">
                  {t('cloudSync.syncDetails.cloudNotConnected', 'Cloud connection initializing... Changes will sync automatically when ready.')}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subscription Warning - shown in cloud mode without active subscription */}
      {/* Only show when we've confirmed no subscription (not while loading) */}
      {currentMode === 'cloud' && !subscriptionLoading && !hasSubscription && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30">
          <HiOutlineExclamationTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-amber-300 font-medium">
              {t('cloudSync.subscriptionRequired', 'Subscription Required')}
            </p>
            <p className="text-sm text-amber-300/80 mt-1">
              {t('cloudSync.subscriptionRequiredDescription', 'Your account is active but cloud sync is paused. Subscribe to sync your data across devices.')}
            </p>
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="mt-2 px-3 py-1.5 text-sm font-medium bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-md transition-colors"
            >
              {t('cloudSync.subscribeButton', 'Subscribe Now')}
            </button>
          </div>
        </div>
      )}

      {/* Sign Out Button - Only shown in cloud mode */}
      {currentMode === 'cloud' && (
        <div className="pt-2 space-y-2">
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

          {/* Manage Subscription Link - Hidden until subscription support is live */}
          {/* {hasSubscription && (
            <a
              href="https://play.google.com/store/account/subscriptions"
              target="_blank"
              rel="noopener noreferrer"
              className={`${secondaryButtonStyle} flex items-center justify-center gap-2 w-full py-2 text-sm no-underline`}
            >
              <HiOutlineCreditCard className="h-4 w-4" />
              {t('cloudSync.manageSubscription', 'Manage Subscription')}
            </a>
          )} */}

          {/* Import Local Data Button - for users who want to migrate local data to cloud */}
          {hasSubscription && (
            <button
              onClick={handleImportLocalData}
              disabled={isCheckingLocalData || isChangingMode}
              className={`${secondaryButtonStyle} flex items-center justify-center gap-2 w-full py-2 text-sm`}
            >
              {isCheckingLocalData ? (
                <>
                  <HiOutlineArrowPath className="h-4 w-4 animate-spin" />
                  {t('cloudSync.importLocalData.checking', 'Checking...')}
                </>
              ) : (
                <>
                  <HiOutlineArrowUpTray className="h-4 w-4" />
                  {t('cloudSync.importLocalData.button', 'Import Local Data to Cloud')}
                </>
              )}
            </button>
          )}

          {/* Start Over link - sign out, disable cloud, return to WelcomeScreen */}
          {/* Hidden in Play Store context — cloud mode is required */}
          {!isPlayStoreCtx && (
            <button
              onClick={handleStartOver}
              disabled={isSigningOut || isChangingMode}
              className="w-full text-center text-slate-400 hover:text-white text-sm underline transition-colors disabled:opacity-50 pt-2"
            >
              {t('cloudSync.startOver', 'Sign out and return to setup')}
            </button>
          )}
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

      {/* Mode Toggle Button — hidden in Play Store when already in cloud mode */}
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
        ) : !isPlayStoreCtx ? (
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
        ) : null}
      </div>

      {/* Migration Note */}
      {currentMode === 'local' && cloudAvailable && (
        <p className="text-xs text-slate-500">
          {t('cloudSync.migrationNote', 'When you enable cloud sync, you can migrate your existing local data to the cloud.')}
        </p>
      )}

      {/* Switch to Local Mode note - explains the cloud data deletion option */}
      {currentMode === 'cloud' && (
        <p className="text-xs text-slate-500">
          {t('cloudSync.switchToLocalNote', 'When switching to local mode, you can choose to keep or delete your cloud data.')}
        </p>
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

          {/* Account info - horizontal card style */}
          <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-md mb-2">
            <HiOutlineUser className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-200">
                {cloudAccountInfo?.email || t('cloudSync.cloudAccount.unknownEmail', 'Unknown')}
              </p>
              <p className="text-xs text-slate-400">
                {t('cloudSync.cloudAccount.lastSynced', 'Last synced: {{date}}', {
                  date: formatDate(cloudAccountInfo?.lastSyncedAt),
                })}
              </p>
              {cloudAccountInfo?.hasCloudData && (
                <p className="text-xs text-amber-400 mt-1">
                  {t('cloudSync.cloudAccount.hasCloudData', 'You have data stored in the cloud.')}
                </p>
              )}
            </div>
          </div>

          {/* Delete cloud data from local mode - horizontal card style */}
          {cloudAccountInfo?.hasCloudData && (
            <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-md border border-red-700/30">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-200">
                  {t('cloudSync.cloudAccount.deleteCloudData', 'Delete All Cloud Data')}
                </p>
                <p className="text-xs text-slate-400">
                  {t('cloudSync.cloudAccount.deleteNote', 'This will permanently delete all your data from our servers.')}
                </p>
              </div>
              <button
                onClick={handleDeleteCloudFromLocalMode}
                className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/50 rounded text-sm font-medium transition-colors"
              >
                <HiOutlineTrash className="h-5 w-5" />
              </button>
            </div>
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
          userId={user?.id}
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
          setTransitionMessage(
            t('cloudSync.subscriptionSuccess', 'Subscription activated! Reloading...')
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

      {transitionMessage && <TransitionOverlay message={transitionMessage} />}
    </div>
  );
}
