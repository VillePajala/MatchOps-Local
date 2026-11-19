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
  requestAnonymousDataImport,
  hasMigrationCompleted,
  clearWelcomeSeen,
  type CloudAccountInfo,
} from '@/config/backendConfig';
import type { LocalDataCheckResult } from '@/services/migrationService';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useSubscriptionOptional, clearSubscriptionCache } from '@/contexts/SubscriptionContext';
import {
  primaryButtonStyle,
  secondaryButtonStyle,
  dangerButtonStyle,
  groupedListStyle,
  sectionLabelStyle,
  subtextStyle,
  warningBoxStyle,
  errorBoxStyle,
} from '@/styles/modalStyles';
import logger from '@/utils/logger';
import { isPlayStoreContext } from '@/utils/platform';
import { NetworkError } from '@/interfaces/DataStoreErrors';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import SyncStatusIndicator from './SyncStatusIndicator';
import CloudAuthModal from './CloudAuthModal';
import ReverseMigrationWizard from './ReverseMigrationWizard';
import UpgradePromptModal from './UpgradePromptModal';
import PendingSyncWarningModal from './PendingSyncWarningModal';
import { useSignOutWithPendingSyncWarning, syncUntilEmpty } from '@/hooks/useSignOutWithPendingSyncWarning';
import TransitionOverlay from './TransitionOverlay';
import { appLocale } from '@/utils/localeFormat';

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
  // Computed once — environment-stable, never changes at runtime.
  // Unlike page.tsx which also checks isCloudAvailable(), CloudSyncSection only renders
  // when already in cloud mode, so the isCloudAvailable() guard is redundant here.
  // INVARIANT: This component is only rendered when mode === 'cloud', which requires
  // isCloudAvailable() === true. If this invariant breaks (e.g., env var stripped from
  // bundle), the "Switch to Local Mode" button below would be hidden in Play Store
  // context with no escape route — investigate immediately if that happens.
  // useRef (not useMemo) because this is a stable environment check, not an optimization hint.
  const isPlayStoreCtxRef = useRef(isPlayStoreContext());
  const isPlayStoreCtx = isPlayStoreCtxRef.current;

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
        t('cloudSync.notConfigured', 'Cloud sync is not configured. Please try again later.'),
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
          // Wait until the queue is really empty: syncNow only starts processing, and
          // proceeding while the push runs abandoned what had not gone yet (review 3.13).
          if (!(await syncUntilEmpty(syncStatus.syncNow))) {
            throw new Error('Unsynced changes remain');
          }
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
        // Discard every unsent change, pending AND failed: the store's close no longer
        // clears an account's queue (review 3.13), so pending ones would otherwise be
        // uploaded later - over newer cloud data - after the coach chose to discard them.
        // If that fails, stay on the warning rather than continue as if discarded.
        try {
          await syncStatus.discardAllUnsent();
        } catch (error) {
          logger.error('[CloudSyncSection] Discarding unsent changes failed:', error);
          showToast(t('cloudSync.pendingSync.syncFailed', 'Sync failed. Please try again or discard changes.'), 'error');
          break;
        }
        setShowPendingSyncWarning(false);
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
  // Warns first when this account has changes not yet in the cloud (review 3.13).
  const { requestSignOut, signOutWarning } = useSignOutWithPendingSyncWarning(handleSignOut);

  /**
   * Handle "Start Over" - sign out, disable cloud mode, return to WelcomeScreen.
   * Different from Sign Out which stays in cloud mode and shows LoginScreen.
   */
  const handleStartOver = async () => {
    setIsSigningOut(true);
    try {
      // 1. Pre-flight: check disableCloudMode() BEFORE any destructive operations.
      // If this fails (storage_write_failed), nothing has been modified yet — safe to abort.
      const result = disableCloudMode();
      if (!result.success) {
        logger.error('[CloudSyncSection] Failed to disable cloud mode (pre-flight):', result.reason);
        showToast(
          t('cloudSync.startOverError', 'Failed to start over. Please try again.'),
          'error'
        );
        if (isMountedRef.current) {
          setIsSigningOut(false);
        }
        return;
      }

      // 2. Clear migration completed flag (while we still have user ID)
      if (user?.id) {
        clearMigrationCompleted(user.id);
      }

      // 3. Sign out
      const { getAuthService } = await import('@/datastore/factory');
      const authService = await getAuthService();
      await authService.signOut();

      // 4. Clear welcome seen flag to show WelcomeScreen
      clearWelcomeSeen();

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
      // This allows the user to re-run migration even if they've migrated before.
      // The explicit request also lets the wizard through when the data is recorded
      // as already taken (review 3.2).
      requestAnonymousDataImport(user.id);
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
      return date.toLocaleDateString(appLocale(), {
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

  const labelStyle = 'font-ui text-sm font-medium text-ink-2 mb-1';
  const smallButton = `${secondaryButtonStyle} min-h-10! px-4! text-sm!`;

  return (
    <section className="space-y-2 font-ui">
    <h3 className={`${sectionLabelStyle} px-1`}>
      {t('cloudSync.title', 'Account & Sync')}
    </h3>
    <div className={`${groupedListStyle} p-4 space-y-3`}>

      {/* Current Status: a plain row of the card, not a box inside it. */}
      <div className="flex items-center gap-3 min-h-14">
        {currentMode === 'cloud' ? (
          <>
            <HiOutlineCloud className="h-6 w-6 text-ink-2" />
            <div>
              <p className={labelStyle}>{t('cloudSync.statusLabel', 'Current Mode')}</p>
              <p className="font-ui text-base text-ink font-semibold">
                {t('cloudSync.cloudMode', 'Cloud Sync Enabled')}
              </p>
            </div>
          </>
        ) : (
          <>
            <HiOutlineServer className="h-6 w-6 text-ink-3" />
            <div>
              <p className={labelStyle}>{t('cloudSync.statusLabel', 'Current Mode')}</p>
              <p className="font-ui text-base text-ink font-semibold">
                {t('cloudSync.localMode', 'Local Storage')}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Mode Description */}
      <p className={subtextStyle}>
        {currentMode === 'cloud'
          ? (subscriptionLoading || hasSubscription
            ? t('cloudSync.cloudDescription', 'Your data syncs to the cloud. Access from any device after signing in.')
            : t('cloudSync.cloudNoSubscription', 'You have a cloud account but sync is paused. Subscribe to enable cloud sync.'))
          : t('cloudSync.localDescription', 'Your data is stored locally on this device. Works offline, but data is not synced.')
        }
      </p>

      {/* Sync Details - shown in cloud mode with active subscription */}
      {currentMode === 'cloud' && hasSubscription && (
        <div className="pt-3 border-t border-hairline space-y-3">
          {/* Sync Status Row */}
          <div className="flex items-center justify-between">
            <span className="font-ui text-sm text-ink-2">{t('cloudSync.syncDetails.status', 'Sync Status')}</span>
            <SyncStatusIndicator />
          </div>

          {/* Last Synced Row */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-3">{t('cloudSync.syncDetails.lastSynced', 'Last synced')}</span>
            <span className="text-ink-2">
              {syncStatus.lastSyncedAt
                ? formatRelativeTime(syncStatus.lastSyncedAt)
                : t('cloudSync.cloudAccount.neverSynced', 'Never')}
            </span>
          </div>

          {/* Pending Changes Row */}
          {syncStatus.pendingCount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-3">{t('cloudSync.syncDetails.pendingChanges', 'Pending changes')}</span>
              <span className="text-action font-semibold">{syncStatus.pendingCount}</span>
            </div>
          )}

          {/* Sync Control Buttons */}
          <div className="flex gap-2">
            {/* Sync Now Button */}
            <button
              onClick={syncStatus.syncNow}
              disabled={!syncStatus.isOnline || syncStatus.pendingCount === 0 || syncStatus.isSyncing || syncStatus.isPaused}
              className={`${smallButton} flex-1`}
            >
              {syncStatus.isSyncing ? (
                <>
                  <HiOutlineArrowPath className="h-4 w-4 animate-spin" />
                  {t('cloudSync.syncDetails.syncing', 'Syncing...')}
                </>
              ) : (
                <>
                  <HiOutlineArrowPath className="h-4 w-4" />
                  {t('cloudSync.syncDetails.syncNow', 'Sync Now')}
                </>
              )}
            </button>

            {/* Pause/Resume Button */}
            <button
              onClick={syncStatus.isPaused ? syncStatus.resume : syncStatus.pause}
              disabled={syncStatus.isSyncing}
              className={smallButton}
              title={syncStatus.isPaused
                ? t('cloudSync.syncDetails.resumeTitle', 'Resume automatic sync')
                : t('cloudSync.syncDetails.pauseTitle', 'Pause automatic sync')
              }
            >
              {syncStatus.isPaused ? (
                <>
                  <HiOutlinePlay className="h-4 w-4" />
                  {t('cloudSync.syncDetails.resume', 'Resume')}
                </>
              ) : (
                <>
                  <HiOutlinePause className="h-4 w-4" />
                  {t('cloudSync.syncDetails.pause', 'Pause')}
                </>
              )}
            </button>
          </div>

          {/* Paused Warning */}
          {syncStatus.isPaused && (
            <div className={`${warningBoxStyle} p-3!`}>
              <p className="font-ui text-sm text-ink-2">
                {t('cloudSync.syncDetails.pausedWarning', 'Sync is paused. Changes are saved locally and will sync when you resume.')}
              </p>
            </div>
          )}

          {/* Failed Operations Warning */}
          {syncStatus.failedCount > 0 && (
            <div className={`${errorBoxStyle} p-3!`}>
              <div className="flex items-center gap-2 mb-2">
                <HiOutlineExclamationTriangle className="h-4 w-4 text-red-400" />
                <p className="font-ui text-sm text-ink">
                  {t('cloudSync.syncDetails.failedCount', '{{count}} operations failed to sync.', { count: syncStatus.failedCount })}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={syncStatus.retryFailed}
                  className={`${smallButton} flex-1`}
                >
                  {t('cloudSync.syncDetails.retry', 'Retry')}
                </button>
                <button
                  onClick={syncStatus.clearFailed}
                  className={`${dangerButtonStyle} min-h-10! px-4! text-sm! flex-1`}
                >
                  {t('cloudSync.syncDetails.discard', 'Discard')}
                </button>
              </div>
            </div>
          )}

          {/* Cloud Not Connected Warning - pending items but cloud backend not ready */}
          {!syncStatus.cloudConnected && syncStatus.pendingCount > 0 && !syncStatus.isLoading && (
            <div className={`${warningBoxStyle} p-3!`}>
              <div className="flex items-center gap-2">
                <HiOutlineExclamationTriangle className="h-4 w-4 text-action" />
                <p className="font-ui text-sm text-ink-2">
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
        <div className={`${warningBoxStyle} flex items-start gap-2 p-3!`}>
          <HiOutlineExclamationTriangle className="h-5 w-5 text-action flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-ui text-sm text-ink font-semibold">
              {t('cloudSync.subscriptionRequired', 'Subscription Required')}
            </p>
            <p className={`${subtextStyle} mt-1`}>
              {t('cloudSync.subscriptionRequiredDescription', 'Your account is active but cloud sync is paused. Subscribe to sync your data across devices.')}
            </p>
            <button
              onClick={() => setShowUpgradeModal(true)}
              className={`${primaryButtonStyle} mt-3 min-h-10! px-4! text-sm!`}
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
            onClick={requestSignOut}
            disabled={isSigningOut || isChangingMode}
            className={`${secondaryButtonStyle} w-full`}
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
              className={`${secondaryButtonStyle} w-full`}
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
              className="w-full min-h-11 text-center font-ui text-ink-3 hover:text-ink text-sm underline underline-offset-[3px] transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-action rounded-full"
            >
              {t('cloudSync.startOver', 'Sign out and return to setup')}
            </button>
          )}
        </div>
      )}

      {/* Cloud Not Available Warning */}
      {!cloudAvailable && currentMode === 'local' && (
        <div className={`${warningBoxStyle} flex items-start gap-2 p-3!`}>
          <HiOutlineExclamationTriangle className="h-5 w-5 text-action flex-shrink-0 mt-0.5" />
          <p className="font-ui text-sm text-ink-2">
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
            className={`${primaryButtonStyle} w-full`}
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
            className={`${secondaryButtonStyle} w-full`}
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
        <p className={subtextStyle}>
          {t('cloudSync.migrationNote', 'When you enable cloud sync, you can migrate your existing local data to the cloud.')}
        </p>
      )}

      {/* Switch to Local Mode note - explains the cloud data deletion option */}
      {currentMode === 'cloud' && (
        <p className={subtextStyle}>
          {t('cloudSync.switchToLocalNote', 'When switching to local mode, you can choose to keep or delete your cloud data.')}
        </p>
      )}

      {/* Cloud Account Section - Shown in LOCAL mode when user has cloud account info */}
      {currentMode === 'local' && cloudAccountInfo && (
        <div className="pt-4 mt-4 border-t border-hairline">
          <div className="flex items-center gap-2 mb-3">
            <HiOutlineLockClosed className="h-5 w-5 text-ink-3" />
            <h4 className={sectionLabelStyle}>
              {t('cloudSync.cloudAccount.title', 'Cloud Account')}
            </h4>
          </div>

          {/* Account info - horizontal card style */}
          <div className="flex items-start gap-3 py-2 mb-2">
            <HiOutlineUser className="h-5 w-5 text-ink-3 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-ui text-base font-medium text-ink">
                {cloudAccountInfo?.email || t('cloudSync.cloudAccount.unknownEmail', 'Unknown')}
              </p>
              <p className={subtextStyle}>
                {t('cloudSync.cloudAccount.lastSynced', 'Last synced: {{date}}', {
                  date: formatDate(cloudAccountInfo?.lastSyncedAt),
                })}
              </p>
              {cloudAccountInfo?.hasCloudData && (
                <p className="font-ui text-sm text-ink-2 mt-1">
                  {t('cloudSync.cloudAccount.hasCloudData', 'You have data stored in the cloud.')}
                </p>
              )}
            </div>
          </div>

          {/* Delete cloud data from local mode - horizontal card style */}
          {cloudAccountInfo?.hasCloudData && (
            <div className={`${errorBoxStyle} flex items-start gap-3 p-3!`}>
              <div className="flex-1">
                <p className="font-ui text-base font-medium text-ink">
                  {t('cloudSync.cloudAccount.deleteCloudData', 'Delete All Cloud Data')}
                </p>
                <p className={subtextStyle}>
                  {t('cloudSync.cloudAccount.deleteNote', 'This will permanently delete all your data from our servers.')}
                </p>
              </div>
              <button
                onClick={handleDeleteCloudFromLocalMode}
                className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-full s1-ghost text-red-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
                aria-label={t('cloudSync.cloudAccount.deleteCloudData', 'Delete All Cloud Data')}
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
      {signOutWarning}
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
    </section>
  );
}
