'use client';

import ModalProvider from '@/contexts/ModalProvider';
import HomePage from '@/components/HomePage';
import StartScreen from '@/components/StartScreen';
import LoginScreen from '@/components/LoginScreen';
import MigrationWizard from '@/components/MigrationWizard';
import WelcomeScreen from '@/components/WelcomeScreen';
import AuthModal from '@/components/AuthModal';
import ErrorBoundary from '@/components/ErrorBoundary';
import { MigrationStatus } from '@/components/MigrationStatus';
import UpgradePromptModal from '@/components/UpgradePromptModal';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useAppResume } from '@/hooks/useAppResume';
import { usePremium } from '@/hooks/usePremium';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useToast } from '@/contexts/ToastProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { getCurrentGameIdSetting, saveCurrentGameIdSetting as utilSaveCurrentGameIdSetting } from '@/utils/appSettings';
import { getSavedGames, getLatestGameId } from '@/utils/savedGames';
import { getMasterRoster } from '@/utils/masterRosterManager';
import { runMigration } from '@/utils/migration';
import {
  hasMigrationCompleted,
  setMigrationCompleted,
  hasSeenWelcome,
  setWelcomeSeen,
  clearWelcomeSeen,
  enableCloudMode,
  disableCloudMode,
  isCloudAvailable,
  hasPendingPostLoginCheck,
  setPendingPostLoginCheck,
  clearPendingPostLoginCheck,
} from '@/config/backendConfig';
import { hasLocalDataToMigrate } from '@/services/migrationService';
import { hasCloudData, hydrateLocalFromCloud } from '@/services/reverseMigrationService';
import { migrateLegacyData } from '@/services/legacyMigrationService';
import { resetFactory } from '@/datastore/factory';
import { importFromFilePicker } from '@/utils/importHelper';
import logger from '@/utils/logger';

// Toast display duration before force reload - allows user to see the notification
const FORCE_RELOAD_NOTIFICATION_DELAY_MS = 800;

export default function Home() {
  const [screen, setScreen] = useState<'start' | 'home'>('start');
  const [initialAction, setInitialAction] = useState<'newGame' | 'loadGame' | 'resumeGame' | 'explore' | 'season' | 'stats' | 'roster' | 'teams' | 'settings' | null>(null);
  const [canResume, setCanResume] = useState(false);
  const [hasPlayers, setHasPlayers] = useState(false);
  const [hasSavedGames, setHasSavedGames] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isCheckingState, setIsCheckingState] = useState(true);
  const [showMigrationWizard, setShowMigrationWizard] = useState(false);
  // Welcome screen state (first-install onboarding)
  const [showWelcome, setShowWelcome] = useState(false);
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  // Issue #336: Auth modal for sign-in from welcome screen (stays in local mode)
  const [showAuthModal, setShowAuthModal] = useState(false);
  // Post-login upgrade modal (shown when user authenticates without subscription)
  const [showPostLoginUpgrade, setShowPostLoginUpgrade] = useState(false);
  // Ref to track if migration check has been initiated (prevents race conditions)
  const migrationCheckInitiatedRef = useRef(false);
  // Ref to track if legacy database migration has been checked this session
  const legacyMigrationCheckedRef = useRef(false);
  // State to track if post-login data loading has completed (migration/hydration check)
  // Using state instead of ref so changes trigger re-renders
  const [postLoginCheckComplete, setPostLoginCheckComplete] = useState(false);
  const { showToast } = useToast();
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: isAuthLoading, mode, user, isSigningOut } = useAuth();
  // Note: usePremium is for local mode limits (legacy); cloud mode uses useSubscription
  const { isPremium: _isPremium, isLoading: _isPremiumLoading } = usePremium();
  // Cloud subscription status - fetched from Supabase (NOT local storage)
  const { isActive: hasActiveSubscription, isLoading: isSubscriptionLoading } = useSubscription();
  const queryClient = useQueryClient();

  // Note: Cloud upgrade gate removed - account creation is free
  // Subscription status is checked after login via SubscriptionContext
  // CloudSyncSection shows subscription banner if user has no active subscription

  // Extract userId to avoid effect re-runs when user object reference changes
  const userId = user?.id;

  // Compute post-login loading state synchronously (not via effect) to avoid race conditions
  // This ensures the loading screen shows immediately when conditions are met, not one render cycle later
  const isPostLoginLoading =
    mode === 'cloud' &&
    isAuthenticated &&
    !!userId &&
    !isAuthLoading &&
    !postLoginCheckComplete;

  // A user is considered "first time" if they haven't created a roster OR a game yet.
  // This ensures they are guided through the full setup process.
  const isFirstTimeUser = !hasPlayers || !hasSavedGames;

  const checkAppState = useCallback(async () => {
    setIsCheckingState(true);
    try {
      // Run IndexedDB migration to ensure legacy data is converted to IndexedDB.
      // App settings migration happens automatically in getAppSettings() when needed.
      await runMigration();

      // Check for resume capability
      // CRITICAL: Pass userId for user-scoped storage (cloud mode)
      // Without userId, DataStore queries anonymous/legacy storage instead of user's data
      const lastId = await getCurrentGameIdSetting(userId);
      const games = await getSavedGames(userId);

      if (lastId && games[lastId]) {
        setCanResume(true);
      } else {
        // Fallback: if currentGameId is missing or stale but there are games, select the latest game
        const ids = Object.keys(games || {}).filter(id => id !== 'unsaved_game');
        if (ids.length > 0) {
          const latestId = getLatestGameId(games);
          if (latestId) {
            await utilSaveCurrentGameIdSetting(latestId, userId);
            setCanResume(true);
          } else {
            setCanResume(false);
          }
        } else {
          setCanResume(false);
        }
      }

      // Check if user has any saved games
      setHasSavedGames(Object.keys(games).length > 0);

      // Check if user has any players in roster
      // CRITICAL: Pass userId for user-scoped storage (cloud mode)
      const roster = await getMasterRoster(userId);
      setHasPlayers(roster.length > 0);
    } catch (error) {
      logger.warn('Failed to check initial game state', { error });
      setCanResume(false);
      setHasSavedGames(false);
      setHasPlayers(false);
    } finally {
      setIsCheckingState(false);
    }
  }, [userId]);

  const handleDataImportSuccess = useCallback(() => {
    // Trigger app state refresh after data import
    setRefreshTrigger(prev => prev + 1);
    // Stay in current screen - modal will close naturally after user clicks Continue
  }, []);

  // ============================================================================
  // WELCOME SCREEN HANDLERS (First-Install Onboarding)
  // ============================================================================

  // Check if welcome screen should be shown on mount
  // NOTE: This effect runs once on initial mount, before any auth/migration logic.
  // The empty dependency array ensures it only checks the localStorage flag once.
  // Other flows (auth, migration) run after this check completes.
  useEffect(() => {
    // Only check on client side
    if (typeof window === 'undefined') return;

    // Show welcome screen if user hasn't seen it yet
    if (!hasSeenWelcome()) {
      logger.info('[page.tsx] First install detected - showing welcome screen');
      setShowWelcome(true);
    }
  }, []);

  // Handle "Start Fresh" (local mode) from welcome screen
  const handleWelcomeStartLocal = useCallback(() => {
    logger.info('[page.tsx] Welcome: User chose local mode');
    setWelcomeSeen();

    // Explicitly ensure we're in local mode
    // This handles edge cases where mode might be 'cloud' from previous sessions
    const result = disableCloudMode();
    if (!result.success) {
      // Should rarely happen, log but continue
      logger.warn('[page.tsx] Failed to ensure local mode:', result.message);
    }

    // If mode was cloud, reload to reinitialize in local mode
    // Otherwise just hide welcome screen
    if (mode === 'cloud') {
      logger.info('[page.tsx] Mode was cloud, reloading to switch to local');
      showToast(t('page.startingLocalMode', 'Starting in local mode...'), 'info');
      setTimeout(() => {
        try {
          window.location.reload();
        } catch (error) {
          logger.error('[page.tsx] Reload blocked', error);
          showToast(t('page.refreshPageManually', 'Please refresh the page manually'), 'error');
        }
      }, FORCE_RELOAD_NOTIFICATION_DELAY_MS);
    } else {
      setShowWelcome(false);
      // Mode is already 'local', proceed to app state check
      setRefreshTrigger(prev => prev + 1);
    }
  }, [mode, showToast, t]);

  // Handle "Sign In to Cloud" from welcome screen
  // Issue #336: Sign-in creates account but stays in local mode (auth ≠ sync)
  const handleWelcomeSignInCloud = useCallback(() => {
    logger.info('[page.tsx] Welcome: User chose to sign in - showing auth modal (staying in local mode)');
    setShowAuthModal(true);
  }, []);

  // Handle successful auth from welcome screen's auth modal
  // Issue #336: User signed in but stays in local mode - sync is a separate toggle
  const handleWelcomeAuthSuccess = useCallback(() => {
    logger.info('[page.tsx] Welcome: Auth successful - dismissing welcome, staying in local mode');
    setShowAuthModal(false);
    setWelcomeSeen();
    setShowWelcome(false);
    // Trigger app state refresh to pick up authenticated state
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // Handle auth modal cancel from welcome screen
  const handleWelcomeAuthCancel = useCallback(() => {
    logger.info('[page.tsx] Welcome: Auth modal cancelled');
    setShowAuthModal(false);
  }, []);

  // Handle "Import Backup" from welcome screen
  // Import backup puts user in local mode (same as "Start Fresh")
  const handleWelcomeImportBackup = useCallback(async () => {
    logger.info('[page.tsx] Welcome: User chose to import backup');
    setIsImportingBackup(true);

    try {
      // Note: userId will be undefined for welcome screen imports (user not authenticated yet)
      // This correctly imports into legacy storage; user can migrate after signing in
      const result = await importFromFilePicker(showToast, userId);

      if (result.success) {
        logger.info('[page.tsx] Welcome: Backup import succeeded');
        // Set welcome flag and hide screen before reload
        setWelcomeSeen();
        setShowWelcome(false);

        // Ensure local mode - imported backups are local data, not cloud data
        // This handles edge cases where mode might be 'cloud' from env or previous sessions
        const modeResult = disableCloudMode();
        if (!modeResult.success) {
          logger.warn('[page.tsx] Failed to ensure local mode after import:', modeResult.message);
        }

        // Trigger full page reload to ensure all caches are fresh
        // This is the safest way to ensure imported data is properly loaded
        try {
          window.location.reload();
        } catch (reloadError) {
          // Reload blocked - clear flag so user can retry after manual refresh
          clearWelcomeSeen();
          setShowWelcome(true);
          logger.error('[page.tsx] Reload blocked after import', reloadError);
          showToast(t('page.importSucceededRefresh', 'Import succeeded. Please refresh the page manually.'), 'info');
        }
      } else if (result.cancelled) {
        logger.info('[page.tsx] Welcome: User cancelled import');
        // Stay on welcome screen - user can try again or choose different option
      } else {
        logger.warn('[page.tsx] Welcome: Import failed:', result.error);
        showToast(result.error || t('page.failedToImportBackup', 'Failed to import backup'), 'error');
        // Stay on welcome screen
      }
    } catch (error) {
      logger.error('[page.tsx] Welcome: Import error:', error);
      showToast(t('page.failedToImportBackup', 'Failed to import backup'), 'error');
    } finally {
      setIsImportingBackup(false);
    }
  }, [showToast, t, userId]);

  // Handle "Back" from LoginScreen - return to WelcomeScreen
  const handleLoginBack = useCallback(() => {
    logger.info('[page.tsx] Login: User clicked back, returning to welcome screen');
    setShowWelcome(true);
  }, []);

  // Handle "Use without account" from LoginScreen - switch to local mode
  const handleLoginUseLocalMode = useCallback(() => {
    logger.info('[page.tsx] Login: User chose local mode');
    const result = disableCloudMode();
    if (result.success) {
      // Local mode enabled - reload to re-initialize AuthProvider in local mode
      setWelcomeSeen();
      showToast(t('page.localModeEnabledReloading', 'Local mode enabled. Reloading...'), 'info');
      setTimeout(() => {
        try {
          window.location.reload();
        } catch (error) {
          clearWelcomeSeen();
          logger.error('[page.tsx] Reload blocked', error);
          showToast(t('page.refreshPageManuallyContinue', 'Please refresh the page manually to continue'), 'error');
        }
      }, FORCE_RELOAD_NOTIFICATION_DELAY_MS);
    } else {
      logger.error('[page.tsx] Failed to switch to local mode:', result.message);
      showToast(t('page.failedToSwitchLocalMode', 'Failed to switch to local mode'), 'error');
    }
  }, [showToast, t]);

  // Actually enable cloud sync (called after premium check passes)
  const executeEnableCloudSync = useCallback(() => {
    logger.info('[page.tsx] StartScreen: Enabling cloud sync');
    const success = enableCloudMode();
    if (success) {
      showToast(t('page.cloudModeEnabledReloading', 'Cloud mode enabled. Reloading...'), 'info');
      setTimeout(() => {
        try {
          window.location.reload();
        } catch (error) {
          logger.error('[page.tsx] Reload blocked', error);
          showToast(t('page.refreshPageManuallyContinue', 'Please refresh the page manually to continue'), 'error');
        }
      }, FORCE_RELOAD_NOTIFICATION_DELAY_MS);
    } else {
      showToast(t('page.cloudSyncNotAvailable', 'Cloud sync is not available'), 'error');
    }
  }, [showToast, t]);

  // Handle "Enable Cloud Sync" from StartScreen (local mode users)
  // No premium gate - account creation is free, subscription only required for active sync
  const handleEnableCloudSync = useCallback(() => {
    logger.info('[page.tsx] StartScreen: User chose to enable cloud sync');
    // Set flag so we check premium status after login and show upgrade modal if needed
    setPendingPostLoginCheck();
    executeEnableCloudSync();
  }, [executeEnableCloudSync]);

  // Handle "Sign in as existing subscriber" from StartScreen (desktop only)
  // Enables cloud mode and reloads to show LoginScreen (subscription verified after login)
  const handleSignInExistingSubscriber = useCallback(() => {
    logger.info('[page.tsx] StartScreen: Existing subscriber signing in (desktop)');
    // Set flag to check premium status after login (even for existing subscribers, verify their status)
    setPendingPostLoginCheck();
    executeEnableCloudSync();
  }, [executeEnableCloudSync]);

  // Re-run checkAppState when:
  // - Component mounts (initial load)
  // - refreshTrigger changes (data import, app resume)
  // - isAuthenticated changes (user signs in/out in cloud mode)
  // - userId changes (ensures we have user ID for user-scoped storage)
  // In cloud mode, checkAppState() needs auth AND userId to access DataStore
  useEffect(() => {
    // Skip if auth is still loading
    if (isAuthLoading) return;

    // In cloud mode, only check state when authenticated AND userId is available
    // userId is required for user-scoped storage queries
    if (mode === 'cloud') {
      if (!isAuthenticated) {
        // Clear loading state so LoginScreen can render instead of spinner
        setIsCheckingState(false);
        return;
      }
      // CRITICAL: Wait for userId to be available before checking app state
      // Without this, getSavedGames(undefined) queries wrong storage
      if (!userId) {
        logger.debug('[page.tsx] checkAppState: waiting for userId');
        return;
      }
    }

    checkAppState();
  }, [checkAppState, refreshTrigger, isAuthenticated, isAuthLoading, mode, userId]);

  // Reset post-login check state when user signs out
  // This ensures the loading screen shows again on next sign-in
  useEffect(() => {
    if (!userId) {
      setPostLoginCheckComplete(false);
    }
  }, [userId]);

  // ============================================================================
  // LEGACY DATABASE MIGRATION (MatchOpsLocal → User-Scoped Database)
  // ============================================================================
  // When a user signs in, check if they have data in the legacy global database
  // that needs to be migrated to their user-scoped database.
  // This runs once per session when userId becomes available.
  useEffect(() => {
    // Skip if no userId (user not signed in)
    if (!userId) {
      // Reset ref when user signs out to allow re-check on next sign-in
      legacyMigrationCheckedRef.current = false;
      return;
    }

    // Skip if auth is still loading
    if (isAuthLoading) {
      return;
    }

    // Skip if already checked this session
    if (legacyMigrationCheckedRef.current) {
      return;
    }

    // Mark as checked before async work to prevent re-runs
    let cancelled = false;
    legacyMigrationCheckedRef.current = true;

    const checkLegacyMigration = async () => {
      try {
        logger.info('[page.tsx] Checking for legacy database migration', { userId });
        const result = await migrateLegacyData(userId);

        // Don't update state if effect was cleaned up (component unmounted or deps changed)
        if (cancelled) return;

        switch (result.status) {
          case 'migrated':
            // Show success toast with entity count
            logger.info('[page.tsx] Legacy migration completed', result);
            showToast(
              t('page.legacyDataMigrated', 'Your data has been migrated to your account ({{count}} items)', {
                count: result.entityCount ?? 0,
              }),
              'success'
            );
            // Trigger app state refresh to pick up migrated data
            setRefreshTrigger(prev => prev + 1);
            break;

          case 'already_migrated':
            // Silent - user already has data
            logger.debug('[page.tsx] Legacy migration skipped - user already has data');
            break;

          case 'no_legacy_data':
            // Silent - no legacy database
            logger.debug('[page.tsx] Legacy migration skipped - no legacy data');
            break;

          case 'migration_error':
            // Show error toast
            logger.error('[page.tsx] Legacy migration failed', { error: result.error });
            showToast(
              t('page.legacyMigrationFailed', 'Could not migrate your data. Please contact support if this persists.'),
              'error'
            );
            // Reset ref to allow retry on next effect run (respect cancelled flag)
            if (!cancelled) {
              legacyMigrationCheckedRef.current = false;
            }
            break;
        }
      } catch (error) {
        if (cancelled) return;
        logger.error('[page.tsx] Legacy migration check failed', { error });
        // Reset ref to allow retry
        legacyMigrationCheckedRef.current = false;
      }
    };

    checkLegacyMigration();

    // Cleanup: prevent state updates if effect re-runs or component unmounts
    return () => {
      cancelled = true;
    };
    // Deps: t, showToast, setRefreshTrigger are stable (from hooks/context) and intentionally omitted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isAuthLoading]);

  // Check if migration wizard should be shown (cloud mode only, post-authentication)
  // This runs once when the user first authenticates in cloud mode
  // Uses ref to prevent race conditions without causing effect re-runs
  useEffect(() => {
    // Only check in cloud mode when authenticated
    if (mode !== 'cloud' || !isAuthenticated || !userId) {
      // Reset ref when conditions aren't met (allows re-check on sign in)
      migrationCheckInitiatedRef.current = false;
      return;
    }

    // Wait for subscription status to load before checking migration
    // This ensures the post-login subscription check runs first
    if (isSubscriptionLoading) {
      return;
    }

    // Skip if there's a pending post-login check (subscription check hasn't passed yet)
    // This ensures we don't show migration wizard until user has verified subscription
    if (hasPendingPostLoginCheck()) {
      logger.info('[page.tsx] Migration check: waiting for post-login subscription check to complete');
      return;
    }

    // Skip migration wizard if user has no active subscription
    // Account is free, but sync requires subscription. Without subscription:
    // - Sync is paused (CloudSyncSection shows subscription banner)
    // - Migration is pointless (data won't sync until they subscribe)
    // - User can subscribe anytime and migration will be offered then
    if (!hasActiveSubscription) {
      logger.info('[page.tsx] Migration check: skipping - user has no active subscription');
      // Mark post-login check complete so user can proceed to app
      setPostLoginCheckComplete(true);
      return;
    }

    // Skip if check already initiated this session (ref prevents race conditions)
    if (migrationCheckInitiatedRef.current) return;

    // Mark as initiated before async work
    migrationCheckInitiatedRef.current = true;

    const checkMigrationNeeded = async () => {
      try {
        // Migration already completed for this user - skip wizard but still refetch data
        // This handles the sign out → sign in flow where React Query caches may be stale
        if (hasMigrationCompleted(userId)) {
          logger.info('[page.tsx] Migration already completed for this user, refetching queries');
          await queryClient.refetchQueries();
          setRefreshTrigger(prev => prev + 1);
          // Mark post-login check complete and clear loading state
          setPostLoginCheckComplete(true);
          return;
        }

        // Check if there's local data to migrate
        const result = await hasLocalDataToMigrate();
        if (result.checkFailed) {
          // Storage check failed - notify user and allow retry on next effect cycle
          logger.warn('[page.tsx] Failed to check local data:', result.error);
          showToast(
            t('page.couldNotCheckLocalData', 'Could not check for local data. Please refresh the page to try again.'),
            'info'
          );
          // Reset to allow retry on next effect run
          migrationCheckInitiatedRef.current = false;
          // Mark post-login check complete even on failure (user can use app)
          setPostLoginCheckComplete(true);
        } else if (result.hasData) {
          // Local data found - show simplified migration wizard
          // (No need to fetch cloud counts - wizard always uses merge mode)
          logger.info('[page.tsx] Local data found, showing migration wizard');
          setShowMigrationWizard(true);
          // Mark post-login check complete - wizard handles its own loading
          setPostLoginCheckComplete(true);
        } else {
          // No local data - check if cloud has data that needs to be loaded
          logger.info('[page.tsx] No local data, checking if cloud has data...');

          const cloudResult = await hasCloudData();
          if (cloudResult.checkFailed) {
            // Cloud check failed - notify user but don't block them
            // They can use the app, data will load when queries run
            logger.warn('[page.tsx] Failed to check cloud data:', cloudResult.error);
            showToast(
              t('page.couldNotCheckCloudData', 'Could not check cloud data. Your data will load automatically.'),
              'info'
            );
            setMigrationCompleted(userId);
            // Mark post-login check complete
            setPostLoginCheckComplete(true);
          } else if (cloudResult.hasData) {
            // Cloud has data but local is empty - hydrate local storage from cloud
            // This handles the "new device login" scenario where user has
            // cloud data but empty local device. We must download cloud data
            // to local storage first, then refetch queries to update UI.
            logger.info('[page.tsx] Cloud has data, hydrating local storage from cloud...');
            const hydrationResult = await hydrateLocalFromCloud(userId);

            if (hydrationResult.success) {
              logger.info('[page.tsx] Hydration successful, refreshing queries', {
                counts: hydrationResult.counts,
              });
              await queryClient.refetchQueries();
              setRefreshTrigger(prev => prev + 1);
              showToast(
                t('page.dataLoadedFromCloud', 'Your data has been loaded from the cloud.'),
                'success'
              );
            } else {
              logger.error('[page.tsx] Hydration failed', { errors: hydrationResult.errors });
              showToast(
                t('page.failedToLoadCloudData', 'Failed to load your cloud data. Please try refreshing.'),
                'error'
              );
            }
            setMigrationCompleted(userId);
            // Mark post-login check complete
            setPostLoginCheckComplete(true);
          } else {
            // Both local and cloud are empty - nothing to migrate now
            // Don't mark complete: if local data appears later (via backup import),
            // migration check should run again and show the wizard
            logger.info('[page.tsx] No local or cloud data to migrate currently');
            // Mark post-login check complete
            setPostLoginCheckComplete(true);
          }
        }
      } catch (error) {
        logger.warn('[page.tsx] Failed to check migration status', { error });
        // Notify user and allow retry on next effect run
        showToast(
          t('page.unableToCheckSync', 'Unable to check data for sync. Please refresh if you have data to sync.'),
          'info'
        );
        migrationCheckInitiatedRef.current = false;
        // Mark post-login check complete even on error (user can use app)
        setPostLoginCheckComplete(true);
      }
    };

    checkMigrationNeeded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isAuthenticated, userId, isSubscriptionLoading, hasActiveSubscription]);

  // ============================================================================
  // POST-LOGIN CHECK (Cloud Mode Only)
  // ============================================================================
  // When user signs in to cloud from WelcomeScreen, we clear the pending flag
  // and log subscription status. Account is FREE - no gating here.
  //
  // This effect triggers when:
  // - User is in cloud mode AND authenticated
  // - Auth and Subscription status are loaded
  // - There's a pending post-login check flag set
  //
  // User flow:
  // - With subscription: sync works immediately
  // - Without subscription: sync paused, banner shown in CloudSyncSection
  useEffect(() => {
    // Debug: Log all relevant state for diagnosing post-login check issues
    logger.debug('[page.tsx] Post-login check effect running', {
      mode,
      isAuthenticated,
      isAuthLoading,
      isSubscriptionLoading,
      hasActiveSubscription,
      hasPendingCheck: hasPendingPostLoginCheck(),
    });

    // Skip if not in cloud mode, not authenticated, or still loading
    if (mode !== 'cloud' || !isAuthenticated || isAuthLoading || isSubscriptionLoading) {
      logger.debug('[page.tsx] Post-login check: skipping (conditions not met)', {
        reason: mode !== 'cloud' ? 'not cloud mode' :
                !isAuthenticated ? 'not authenticated' :
                isAuthLoading ? 'auth still loading' : 'subscription still loading',
      });
      return;
    }

    // Check if there's a pending post-login check
    if (!hasPendingPostLoginCheck()) {
      logger.debug('[page.tsx] Post-login check: skipping (no pending flag)');
      return; // No pending check - user is returning to the app, not newly signing in
    }

    logger.info('[page.tsx] Post-login check: verifying subscription status');

    // Clear the pending flag - user is now logged in
    clearPendingPostLoginCheck();

    // Check subscription status and show upgrade modal if needed
    if (hasActiveSubscription) {
      logger.info('[page.tsx] Post-login check: user has active subscription, sync enabled');
    } else {
      // User has account but no subscription - show upgrade modal
      logger.info('[page.tsx] Post-login check: user has no subscription, showing upgrade modal');
      setShowPostLoginUpgrade(true);
    }
    // Migration check will run (if needed) via the other effect
  }, [mode, isAuthenticated, isAuthLoading, isSubscriptionLoading, hasActiveSubscription]);

  // Handle post-login upgrade modal close
  const handlePostLoginUpgradeClose = useCallback(() => {
    setShowPostLoginUpgrade(false);
    // User dismissed without subscribing - sync stays paused
    // They can subscribe later via Settings > Cloud Sync
    logger.info('[page.tsx] Post-login upgrade modal dismissed');
  }, []);

  // Handle successful subscription from post-login modal
  const handlePostLoginUpgradeSuccess = useCallback(() => {
    setShowPostLoginUpgrade(false);
    logger.info('[page.tsx] Post-login upgrade successful, sync enabled');
    // Refresh to pick up new subscription status
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // Handle migration wizard completion
  const handleMigrationComplete = useCallback(async () => {
    if (userId) {
      setMigrationCompleted(userId);
    }
    setShowMigrationWizard(false);

    // CRITICAL: Reset factory to ensure fresh DataStore instance
    // Without this, the factory may return a stale cached DataStore
    // that was initialized before migration completed
    try {
      await resetFactory();
      logger.info('[page.tsx] Factory reset after migration complete');
    } catch (error) {
      logger.warn('[page.tsx] Factory reset failed, continuing with cache invalidation', { error });
    }

    // After migration completes (local → cloud sync), we need to pull any
    // cloud data that wasn't in local. This handles the scenario where:
    // - User had local data (e.g., 5 games from testing)
    // - User also had cloud data (e.g., 81 games from another device)
    // - Migration pushed local → cloud (now cloud has 86 games)
    // - But local still only has 5 games!
    // Hydration pulls cloud → local so local has all 86 games
    if (userId) {
      logger.info('[page.tsx] Hydrating local from cloud after migration...');
      const hydrationResult = await hydrateLocalFromCloud(userId);
      if (hydrationResult.success) {
        logger.info('[page.tsx] Post-migration hydration successful', {
          counts: hydrationResult.counts,
        });
      } else {
        logger.warn('[page.tsx] Post-migration hydration failed', {
          errors: hydrationResult.errors,
        });
        // Non-fatal: user can refresh to retry
        showToast(
          t('page.partialSyncComplete', 'Sync complete. Some cloud data may not have loaded - refresh to retry.'),
          'info'
        );
      }
    }

    // CRITICAL: Refetch ALL React Query queries to load fresh data
    // invalidateQueries() only marks as stale; refetchQueries() forces immediate refetch
    // Without this, the app shows stale/empty data until user manually reloads
    await queryClient.refetchQueries();
    // Also trigger state refresh
    setRefreshTrigger(prev => prev + 1);
  }, [userId, queryClient, showToast, t]);

  // Handle migration wizard cancel - return to local mode
  const handleMigrationCancel = useCallback(() => {
    logger.info('[page.tsx] Migration cancelled, switching to local mode');
    setShowMigrationWizard(false);

    // Disable cloud mode and reload to reinitialize in local mode
    const result = disableCloudMode();
    if (result.success) {
      showToast(t('page.returningToLocalMode', 'Returning to local mode...'), 'info');
      setTimeout(() => {
        try {
          window.location.reload();
        } catch (error) {
          logger.error('[page.tsx] Reload blocked', error);
          showToast(t('page.refreshPageManually', 'Please refresh the page manually'), 'error');
        }
      }, FORCE_RELOAD_NOTIFICATION_DELAY_MS);
    } else {
      logger.error('[page.tsx] Failed to switch to local mode:', result.message);
      showToast(t('page.failedToSwitchLocalModeRetry', 'Failed to switch to local mode. Please try again.'), 'error');
    }
  }, [showToast, t]);

  // Handle app resume from background (Android TWA blank screen fix)
  // Triggers refreshTrigger to re-run checkAppState when returning from extended background
  useAppResume({
    onResume: () => {
      logger.log('[page.tsx] App resumed - triggering state refresh');
      setRefreshTrigger((prev) => prev + 1);
    },
    onBeforeForceReload: () => {
      // Show notification before force reload (5+ minute background)
      showToast(t('page.refreshingAfterBackground', 'Refreshing app after extended background period...'), 'info');
      return new Promise(resolve => setTimeout(resolve, FORCE_RELOAD_NOTIFICATION_DELAY_MS));
    },
    minBackgroundTime: 30000, // 30 seconds
    forceReloadTime: 300000,  // 5 minutes - force full page reload
  });

  // Listen for reload failure events from useAppResume
  // This handles the rare case where window.location.reload() fails
  useEffect(() => {
    const handleReloadFailed = () => {
      showToast(t('page.unableToRefreshApp', 'Unable to refresh app. Please close and reopen.'), 'error');
    };
    window.addEventListener('app-resume-reload-failed', handleReloadFailed);
    return () => window.removeEventListener('app-resume-reload-failed', handleReloadFailed);
  }, [showToast, t]);

  // Handle PWA shortcut query parameters (e.g., /?action=newGame)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');

    if (action) {
      // Map query parameter to valid action
      const validActions: Record<string, typeof initialAction> = {
        newGame: 'newGame',
        stats: 'stats',
        roster: 'roster',
        settings: 'settings',
        loadGame: 'loadGame',
      };

      const mappedAction = validActions[action];
      if (mappedAction) {
        // Clear the query parameter from URL to prevent re-triggering
        window.history.replaceState({}, '', window.location.pathname);
        // Skip start screen and go directly to the action
        setInitialAction(mappedAction);
        setScreen('home');
      }
    }
  }, []);

  const handleAction = (
    action: 'newGame' | 'loadGame' | 'resumeGame' | 'explore' | 'getStarted' | 'season' | 'stats' | 'roster' | 'teams' | 'settings'
  ) => {
    // For getStarted, we want to go to the main app with no specific action
    // This will trigger the soccer field center overlay for first-time users
    if (action === 'getStarted') {
      setInitialAction(null); // No specific action - let the natural onboarding flow take over
    } else {
      setInitialAction(action);
    }
    setScreen('home');
  };

  // Show login screen in cloud mode when not authenticated
  const needsAuth = mode === 'cloud' && !isAuthenticated;

  // Determine loading message based on state
  const getLoadingMessage = () => {
    if (isSigningOut) return t('page.signingOut', 'Signing out...');
    if (isPostLoginLoading) return t('page.loadingYourData', 'Loading your data...');
    return t('page.loading', 'Loading...');
  };

  return (
    <ErrorBoundary onError={(error, errorInfo) => {
      logger.error('App-level error caught:', error, errorInfo);
    }}>
      <ModalProvider>
        {isAuthLoading || isCheckingState || isPostLoginLoading || isSigningOut ? (
          // Loading state while checking auth, data, or during sign-out
          <LoadingScreen message={getLoadingMessage()} />
        ) : showWelcome ? (
          // First install: show welcome screen for onboarding choice
          <ErrorBoundary>
            <WelcomeScreen
              onStartLocal={handleWelcomeStartLocal}
              onSignInCloud={handleWelcomeSignInCloud}
              onImportBackup={handleWelcomeImportBackup}
              isCloudAvailable={isCloudAvailable()}
              isImporting={isImportingBackup}
            />
            {/* Issue #336: Auth modal for sign-in from welcome screen (stays in local mode) */}
            {showAuthModal && (
              <AuthModal
                onSuccess={handleWelcomeAuthSuccess}
                onCancel={handleWelcomeAuthCancel}
                allowRegistration={true}
              />
            )}
          </ErrorBoundary>
        ) : needsAuth ? (
          // Cloud mode: show login screen when not authenticated
          <ErrorBoundary>
            <LoginScreen
              onBack={handleLoginBack}
              onUseLocalMode={handleLoginUseLocalMode}
              allowRegistration={true}  // Account creation is free on all platforms
            />
          </ErrorBoundary>
        ) : showMigrationWizard ? (
          // Cloud mode: show simplified migration wizard to sync local data
          <ErrorBoundary>
            <MigrationWizard
              onComplete={handleMigrationComplete}
              onCancel={handleMigrationCancel}
            />
          </ErrorBoundary>
        ) : screen === 'start' ? (
          <ErrorBoundary>
            <StartScreen
              onLoadGame={() => handleAction('loadGame')}
              onResumeGame={() => handleAction('resumeGame')}
              onGetStarted={() => handleAction('getStarted')}
              onViewStats={() => handleAction('stats')}
              onOpenSettings={() => handleAction('settings')}
              canResume={canResume}
              hasSavedGames={hasSavedGames}
              isFirstTimeUser={isFirstTimeUser}
              onEnableCloudSync={handleEnableCloudSync}
              onSignInExistingSubscriber={handleSignInExistingSubscriber}
              isCloudAvailable={isCloudAvailable()}
            />
          </ErrorBoundary>
        ) : (
          <ErrorBoundary>
            <HomePage
              initialAction={initialAction ?? undefined}
              skipInitialSetup
              onDataImportSuccess={handleDataImportSuccess}
              isFirstTimeUser={isFirstTimeUser}
              onGoToStartScreen={() => setScreen('start')}
            />
          </ErrorBoundary>
        )}

        {/* Migration status overlay */}
        <MigrationStatus />

        {/* Post-login upgrade modal - shown when user authenticates without subscription */}
        <UpgradePromptModal
          isOpen={showPostLoginUpgrade}
          onClose={handlePostLoginUpgradeClose}
          variant="cloudUpgrade"
          onUpgradeSuccess={handlePostLoginUpgradeSuccess}
        />
      </ModalProvider>
    </ErrorBoundary>
  );
}
