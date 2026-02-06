'use client';

import ModalProvider from '@/contexts/ModalProvider';
import HomePage from '@/components/HomePage';
import StartScreen from '@/components/StartScreen';
import LoginScreen from '@/components/LoginScreen';
import MigrationWizard from '@/components/MigrationWizard';
import WelcomeScreen from '@/components/WelcomeScreen';
import ErrorBoundary from '@/components/ErrorBoundary';
import { MigrationStatus } from '@/components/MigrationStatus';
import UpgradePromptModal from '@/components/UpgradePromptModal';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useAppResume } from '@/hooks/useAppResume';
import { useMultiTabPrevention } from '@/hooks/useMultiTabPrevention';
import { useDeepLinkHandler } from '@/hooks/useDeepLinkHandler';
import type { AppAction } from '@/hooks/useDeepLinkHandler';
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
import * as Sentry from '@sentry/nextjs';

// Toast display duration before force reload - allows user to see the notification
const FORCE_RELOAD_NOTIFICATION_DELAY_MS = 800;

export default function Home() {
  const [screen, setScreen] = useState<'start' | 'home'>('start');
  const { initialAction, hasDeepLink, setAction } = useDeepLinkHandler();
  const { isBlocked: isBlockedByOtherTab } = useMultiTabPrevention();
  const [canResume, setCanResume] = useState(false);
  const [hasPlayers, setHasPlayers] = useState(false);
  const [hasSavedGames, setHasSavedGames] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isCheckingState, setIsCheckingState] = useState(true);
  const [showMigrationWizard, setShowMigrationWizard] = useState(false);
  // Welcome screen state (first-install onboarding)
  const [showWelcome, setShowWelcome] = useState(false);
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  // Post-login upgrade modal (shown when user authenticates without subscription)
  const [showPostLoginUpgrade, setShowPostLoginUpgrade] = useState(false);
  // Track pending post-login check in state (initialized from localStorage)
  // Using state so clearing it triggers re-render and migration check can re-run
  const [pendingPostLoginCheckState, setPendingPostLoginCheckState] = useState(() => hasPendingPostLoginCheck());
  // Ref to track if migration check has been initiated (prevents race conditions)
  const migrationCheckInitiatedRef = useRef(false);
  // Ref to track if legacy database migration has been checked this session
  const legacyMigrationCheckedRef = useRef(false);
  // Ref to track if checkAppState has been triggered post-login (prevents premature postLoginCheckComplete)
  const checkAppStateTriggeredRef = useRef(false);
  // Ref to track previous value of isCheckingState (for detecting true→false transitions)
  const prevIsCheckingStateRef = useRef(false);
  // State to track if post-login data loading has completed (migration/hydration check)
  // Using state instead of ref so changes trigger re-renders
  const [postLoginCheckComplete, setPostLoginCheckComplete] = useState(false);
  const { showToast } = useToast();
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: isAuthLoading, mode, user, isSigningOut, initTimedOut, retryAuthInit } = useAuth();
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
  // NOTE: Do NOT require !!userId here - user/session might be set at slightly different times
  // and we need to show loading screen as soon as isAuthenticated is true
  const isPostLoginLoading =
    mode === 'cloud' &&
    isAuthenticated &&
    !isAuthLoading &&
    !postLoginCheckComplete;

  // Safety timeout: If post-login check doesn't complete within 120 seconds, force completion
  // This prevents users from getting stuck on the loading screen indefinitely due to:
  // - Network issues during migration check
  // - Race conditions during user transitions
  // - Unexpected errors that aren't caught
  // Note: 120 seconds is needed for large data sets (100+ games) to download from cloud
  useEffect(() => {
    if (!isPostLoginLoading) return;

    const timeoutId = setTimeout(() => {
      logger.warn('[page.tsx] Post-login check safety timeout - forcing completion to unblock user');
      setPostLoginCheckComplete(true);
    }, 120000); // 120 seconds - allows time for large data sets (100+ games) to download from cloud

    return () => clearTimeout(timeoutId);
  }, [isPostLoginLoading]);

  // DEBUG: Log loading state computation to diagnose post-login loading screen issues
  // This runs on every render to show the state progression
  useEffect(() => {
    logger.info('[page.tsx] Loading state debug', {
      mode,
      isAuthenticated,
      isAuthLoading,
      postLoginCheckComplete,
      isPostLoginLoading,
      isCheckingState,
      isSigningOut,
      willShowLoadingScreen: isAuthLoading || isCheckingState || isPostLoginLoading || isSigningOut,
    });
  }, [mode, isAuthenticated, isAuthLoading, postLoginCheckComplete, isPostLoginLoading, isCheckingState, isSigningOut]);

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

    // Explicitly ensure we're in local mode
    // This handles edge cases where mode might be 'cloud' from previous sessions
    const result = disableCloudMode();
    if (!result.success) {
      // Should rarely happen, log but continue
      logger.warn('[page.tsx] Failed to ensure local mode:', result.message);
    }

    // Only set welcome flag AFTER mode switch confirmed (prevents stuck state if localStorage fails)
    setWelcomeSeen();

    // If mode was cloud, reload to reinitialize in local mode
    // Otherwise just hide welcome screen
    if (mode === 'cloud') {
      logger.info('[page.tsx] Mode was cloud, reloading to switch to local');
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

  // Handle "Use Cloud Sync" from welcome screen
  // This ENABLES cloud mode AND shows login - clear intent, no confusion
  const handleWelcomeUseCloudSync = useCallback(() => {
    logger.info('[page.tsx] Welcome: User chose cloud sync - enabling cloud mode');

    // Enable cloud mode first (synchronous, returns boolean)
    const success = enableCloudMode();

    if (!success) {
      logger.error('[page.tsx] Failed to enable cloud mode');
      showToast(t('page.cloudSyncNotAvailable', 'Cloud sync is not available'), 'error');
      return;
    }

    // Only set welcome seen AFTER successful enable
    setWelcomeSeen();

    logger.info('[page.tsx] Cloud mode enabled, reloading...');

    // Reload to enter cloud mode - LoginScreen will show automatically
    setTimeout(() => {
      window.location.reload();
    }, FORCE_RELOAD_NOTIFICATION_DELAY_MS);
  }, [showToast, t]);

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
      // Mark that checkAppState is being triggered post-login
      // This allows the postLoginCheckComplete effect to know it's safe to proceed
      checkAppStateTriggeredRef.current = true;
    }

    checkAppState();
  }, [checkAppState, refreshTrigger, isAuthenticated, isAuthLoading, mode, userId]);

  // Reset post-login check state when user signs out
  // This ensures the loading screen shows again on next sign-in
  useEffect(() => {
    if (!userId) {
      setPostLoginCheckComplete(false);
      checkAppStateTriggeredRef.current = false;
    }
  }, [userId]);

  // Mark post-login check complete when checkAppState finishes
  // This ensures we don't clear the loading screen until data is actually loaded
  // The migration check effect may trigger checkAppState via refreshTrigger,
  // and we need to wait for that to complete before showing the app
  //
  // CRITICAL: We must detect the transition from isCheckingState=true to isCheckingState=false,
  // not just isCheckingState=false. This is because in React 18+, state updates are batched,
  // so during the first effect cycle after login:
  //   1. Effect at line ~376 runs, sets checkAppStateTriggeredRef=true, calls checkAppState()
  //   2. checkAppState() calls setIsCheckingState(true) - but state update is BATCHED
  //   3. This effect runs in the SAME cycle, isCheckingState is still FALSE from before!
  //   4. Without the transition check, postLoginCheckComplete would be set immediately (BUG!)
  // Track isCheckingState transitions for debugging
  // NOTE: In cloud mode, postLoginCheckComplete is set by the migration check effect,
  // NOT here. This is because checkAppState reads from LOCAL storage (which may be empty),
  // but we need to wait for cloud data to be HYDRATED before showing the app.
  // The migration check effect handles:
  // - Checking if cloud has data
  // - Hydrating local storage from cloud if needed
  // - Setting postLoginCheckComplete(true) when data is ready
  useEffect(() => {
    // Capture previous value and update ref for next render
    const wasChecking = prevIsCheckingStateRef.current;
    prevIsCheckingStateRef.current = isCheckingState;

    // Log the transition for debugging
    if (wasChecking && !isCheckingState && mode === 'cloud') {
      logger.info('[page.tsx] checkAppState completed - waiting for migration/hydration check to set postLoginCheckComplete');
    }
  }, [mode, isCheckingState]);

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
    if (pendingPostLoginCheckState) {
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
        // Migration already completed for this user - but we still need to check
        // if local data is complete. On a new device, after clearing IndexedDB,
        // or when cloud has more data than local (e.g., synced from another device),
        // we need to hydrate from cloud.
        const migrationFlagSet = hasMigrationCompleted(userId);
        logger.info('[page.tsx] Migration flag check', {
          userId: userId?.slice(0, 8) + '...',
          migrationFlagSet,
        });
        Sentry.addBreadcrumb({
          category: 'migration',
          message: `Migration flag check: ${migrationFlagSet ? 'SET' : 'NOT SET'}`,
          level: migrationFlagSet ? 'info' : 'warning',
          data: { userId: userId?.slice(0, 8), migrationFlagSet },
        });

        if (migrationFlagSet) {
          logger.info('[page.tsx] Migration already completed for this user, letting user proceed immediately');

          // PERFORMANCE FIX: Let user proceed IMMEDIATELY with local data.
          // Run cloud check + hydration entirely in background (non-blocking).
          // This eliminates the startup delay from hasCloudData() network call.
          //
          // The tradeoff: if local is empty (new device), user briefly sees empty state
          // before data loads. But this is rare and better than making ALL users wait.
          setPostLoginCheckComplete(true);

          // Refetch queries to load LOCAL data immediately
          // NOTE: Only call refetchQueries(), NOT setRefreshTrigger() - the latter
          // triggers checkAppState which sets isCheckingState=true, bringing back the loading screen
          queryClient.refetchQueries().catch(refetchError => {
            logger.warn('[page.tsx] Query refetch failed (non-blocking):', refetchError);
          });

          // Run cloud check + hydration entirely in background (fire and forget)
          (async () => {
            try {
              const cloudResult = await hasCloudData();
              if (cloudResult.checkFailed) {
                logger.warn('[page.tsx] Background cloud check failed:', cloudResult.error);
                return;
              }
              if (!cloudResult.hasData) {
                logger.info('[page.tsx] Background cloud check: no cloud data');
                return;
              }

              logger.info('[page.tsx] Background cloud check: cloud has data, starting hydration...');
              const hydrationResult = await hydrateLocalFromCloud(userId);

              if (hydrationResult.success) {
                const totalImported = hydrationResult.counts.games +
                  hydrationResult.counts.players +
                  hydrationResult.counts.teams;
                const totalSkipped = (hydrationResult.skipped?.games || 0) +
                  (hydrationResult.skipped?.players || 0) +
                  (hydrationResult.skipped?.teams || 0);

                logger.info('[page.tsx] Background hydration complete', {
                  imported: hydrationResult.counts,
                  skipped: hydrationResult.skipped,
                });

                // Refresh queries if we imported something - but don't show toast
                // Background sync should be seamless; the user doesn't need to be notified
                // NOTE: Only call refetchQueries(), NOT setRefreshTrigger() - the latter
                // triggers checkAppState which shows a loading screen, breaking the seamless UX
                if (totalImported > 0) {
                  logger.info('[page.tsx] Background hydration: imported data, refreshing queries silently');
                  queryClient.refetchQueries().catch(err => {
                    logger.warn('[page.tsx] Background hydration refetch failed:', err);
                  });
                } else if (totalSkipped > 0) {
                  logger.info('[page.tsx] Background hydration: no new data (local was already up-to-date)');
                }
              } else {
                logger.warn('[page.tsx] Background hydration failed', { errors: hydrationResult.errors });
              }
            } catch (err) {
              logger.error('[page.tsx] Background cloud sync exception:', err);
            }
          })();

          return;
        }

        // Check if there's local data to migrate (user-scoped storage)
        const result = await hasLocalDataToMigrate(userId);
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
            // Cloud check failed - check if it's a transient error that should retry
            const isAuthError = cloudResult.error?.includes('Not authenticated') ||
                               cloudResult.error?.includes('auth') ||
                               cloudResult.error?.includes('sign in');
            // AbortError happens during account switch when previous requests are cancelled
            // Treat it as transient - the new auth state will be ready soon
            // Build: 2026-02-04-v2
            const isAbortError = cloudResult.error?.includes('AbortError') ||
                                cloudResult.error?.includes('signal is aborted');

            if (isAuthError || isAbortError) {
              // Auth not ready or request aborted - don't proceed, allow retry on next effect cycle
              // This happens when the migration check runs before Supabase session is established,
              // or during account switch when old requests are being cancelled
              logger.info('[page.tsx] Cloud check failed (transient) - will retry when ready', {
                isAuthError,
                isAbortError,
                error: cloudResult.error,
              });
              migrationCheckInitiatedRef.current = false; // Allow retry
              // Don't set postLoginCheckComplete - keep loading screen visible
              return;
            }

            // Non-auth failure (network, etc) - notify user but don't block them
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
              logger.info('[page.tsx] Setting migration completed flag after successful hydration', {
                userId: userId?.slice(0, 8) + '...',
              });
              const flagSetSuccess = setMigrationCompleted(userId);
              Sentry.addBreadcrumb({
                category: 'migration',
                message: `Migration flag SET after hydration: ${flagSetSuccess ? 'success' : 'FAILED'}`,
                level: flagSetSuccess ? 'info' : 'error',
                data: { userId: userId?.slice(0, 8), flagSetSuccess },
              });
              // Mark post-login check complete
              setPostLoginCheckComplete(true);
            } else {
              // Check if failure was due to auth
              const hasAuthError = hydrationResult.errors?.some(err =>
                err.includes('Not authenticated') || err.includes('auth') || err.includes('sign in')
              );

              if (hasAuthError) {
                // Auth not ready - allow retry
                logger.info('[page.tsx] Hydration failed due to auth - will retry when auth is ready');
                migrationCheckInitiatedRef.current = false;
                return;
              }

              logger.error('[page.tsx] Hydration failed', { errors: hydrationResult.errors });
              showToast(
                t('page.failedToLoadCloudData', 'Failed to load your cloud data. Please try refreshing.'),
                'error'
              );
              setMigrationCompleted(userId);
              // Mark post-login check complete
              setPostLoginCheckComplete(true);
            }
          } else {
            // Both local and cloud are empty - new/fresh account
            // Mark migration completed so future logins skip the blocking hasCloudData() call.
            // Note: If user imports a backup later, the backup import code should
            // clear this flag (clearMigrationCompleted) to trigger migration wizard.
            logger.info('[page.tsx] No local or cloud data - new account, skipping migration check on future logins');
            setMigrationCompleted(userId);
            // Mark post-login check complete
            setPostLoginCheckComplete(true);
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isAuthError = errorMsg.includes('Not authenticated') ||
                           errorMsg.includes('auth') ||
                           errorMsg.includes('sign in') ||
                           (error instanceof Error && error.name === 'AuthError');

        if (isAuthError) {
          // Auth not ready yet - don't proceed, allow retry on next effect cycle
          logger.info('[page.tsx] Migration check failed due to auth - will retry when auth is ready', { error: errorMsg });
          migrationCheckInitiatedRef.current = false; // Allow retry
          // Don't set postLoginCheckComplete - keep loading screen visible
          return;
        }

        // Non-auth error - notify user and allow retry
        logger.warn('[page.tsx] Failed to check migration status', { error });
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
  }, [mode, isAuthenticated, userId, isSubscriptionLoading, hasActiveSubscription, pendingPostLoginCheckState]);

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
      hasPendingCheck: pendingPostLoginCheckState,
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
    if (!pendingPostLoginCheckState) {
      logger.debug('[page.tsx] Post-login check: skipping (no pending flag)');
      return; // No pending check - user is returning to the app, not newly signing in
    }

    logger.info('[page.tsx] Post-login check: verifying subscription status');

    // Clear the pending flag - user is now logged in
    // Clear both state (triggers re-render for migration check) and localStorage (persistence)
    setPendingPostLoginCheckState(false);
    clearPendingPostLoginCheck();

    // Check subscription status and show upgrade modal if needed
    if (hasActiveSubscription) {
      logger.info('[page.tsx] Post-login check: user has active subscription, sync enabled');
      // Migration check will re-run now that pendingPostLoginCheck is false (it's a dep)
    } else {
      // User has account but no subscription - show upgrade modal
      logger.info('[page.tsx] Post-login check: user has no subscription, showing upgrade modal');
      setShowPostLoginUpgrade(true);
      // Mark post-login check complete so loading screen clears
      // (migration check won't run because no subscription)
      setPostLoginCheckComplete(true);
    }
  }, [mode, isAuthenticated, isAuthLoading, isSubscriptionLoading, hasActiveSubscription, pendingPostLoginCheckState]);

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
      logger.info('[page.tsx] POST-MIGRATION HYDRATION: Starting cloud→local pull', { userId });
      const hydrationResult = await hydrateLocalFromCloud(userId);
      if (hydrationResult.success) {
        logger.info('[page.tsx] POST-MIGRATION HYDRATION: Success', {
          imported: hydrationResult.counts,
          skipped: hydrationResult.skipped,
        });
      } else {
        logger.warn('[page.tsx] POST-MIGRATION HYDRATION: Failed', {
          errors: hydrationResult.errors,
          imported: hydrationResult.counts,
          skipped: hydrationResult.skipped,
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

  // Listen for sync queue errors from SyncedDataStore (cloud mode)
  // These fire when a background sync operation fails after local write succeeded
  useEffect(() => {
    if (mode !== 'cloud') return;

    const handleSyncQueueError = (event: Event) => {
      const detail = (event as CustomEvent).detail as { entityType?: string; error?: string } | undefined;
      const entity = detail?.entityType ?? 'data';
      const errorMsg = detail?.error ?? 'Unknown error';
      logger.warn('[page.tsx] Sync queue error:', { entity, error: errorMsg });
      showToast(
        t('page.syncError', 'Failed to sync {{entity}} to cloud. Changes saved locally.', { entity }),
        'error'
      );
    };
    window.addEventListener('sync-queue-error', handleSyncQueueError);
    return () => window.removeEventListener('sync-queue-error', handleSyncQueueError);
  }, [mode, showToast, t]);

  // Skip start screen when a PWA shortcut deep link was detected
  useEffect(() => {
    if (hasDeepLink) {
      setScreen('home');
    }
  }, [hasDeepLink]);

  const handleAction = (
    action: AppAction | 'getStarted'
  ) => {
    setAction(action);
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

  // Compute whether to show loading screen
  const showLoadingScreen = isAuthLoading || isCheckingState || isPostLoginLoading || isSigningOut;

  return (
    <ErrorBoundary onError={(error, errorInfo) => {
      logger.error('App-level error caught:', error, errorInfo);
    }}>
      <ModalProvider>
        {isBlockedByOtherTab ? (
          // Multi-tab block: another tab is already running the app
          <div className="relative flex flex-col min-h-screen min-h-[100dvh] bg-slate-900 text-white overflow-hidden">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute -top-[20%] -right-[15%] w-[60%] h-[60%] bg-sky-500/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-[15%] -left-[10%] w-[55%] h-[55%] bg-sky-500/15 rounded-full blur-3xl" />
            </div>
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-8 pb-safe">
              <h1 className="text-5xl font-bold tracking-tight text-amber-400 mb-4">MatchOps</h1>
              <div className="max-w-sm text-center">
                <h2 className="text-xl font-semibold text-white mb-2">
                  {t('page.alreadyOpen', 'Already Open')}
                </h2>
                <p className="text-slate-400 mb-6">
                  {t('page.alreadyOpenDesc', 'MatchOps is already open in another tab. Please close this tab or the other one to continue.')}
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="w-full h-12 px-4 py-2 rounded-md text-base font-bold bg-gradient-to-b from-indigo-500 to-indigo-600 text-white hover:from-indigo-600 hover:to-indigo-700 transition-all"
                >
                  {t('page.tryAgain', 'Try Again')}
                </button>
              </div>
            </div>
          </div>
        ) : showLoadingScreen ? (
          // Loading state while checking auth, data, or during sign-out
          <LoadingScreen message={getLoadingMessage()} />
        ) : showWelcome ? (
          // First install: show welcome screen for onboarding choice
          <ErrorBoundary>
            <WelcomeScreen
              onStartLocal={handleWelcomeStartLocal}
              onUseCloudSync={handleWelcomeUseCloudSync}
              onImportBackup={handleWelcomeImportBackup}
              isCloudAvailable={isCloudAvailable()}
              isImporting={isImportingBackup}
            />
          </ErrorBoundary>
        ) : initTimedOut && mode === 'cloud' ? (
          // Cloud mode: auth initialization timed out - show retry screen
          // This prevents users from being stuck in a login loop when PWA resumes from background
          <ErrorBoundary>
            <div className="relative flex flex-col min-h-screen min-h-[100dvh] bg-slate-900 text-white overflow-hidden">
              {/* Ambient background */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[20%] -right-[15%] w-[60%] h-[60%] bg-sky-500/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-[15%] -left-[10%] w-[55%] h-[55%] bg-sky-500/15 rounded-full blur-3xl" />
              </div>
              <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-8 pb-safe">
                <h1 className="text-5xl font-bold tracking-tight text-amber-400 mb-4">MatchOps</h1>
                <div className="max-w-sm text-center">
                  <h2 className="text-xl font-semibold text-white mb-2">
                    {t('page.connectionTimeout', 'Connection Timeout')}
                  </h2>
                  <p className="text-slate-400 mb-6">
                    {t('page.connectionTimeoutDesc', 'Unable to connect to the server. This can happen after the app has been in the background for a while.')}
                  </p>
                  <div className="space-y-3">
                    <button
                      onClick={retryAuthInit}
                      className="w-full h-12 px-4 py-2 rounded-md text-base font-bold bg-gradient-to-b from-indigo-500 to-indigo-600 text-white hover:from-indigo-600 hover:to-indigo-700 transition-all"
                    >
                      {t('page.tryAgain', 'Try Again')}
                    </button>
                    <button
                      onClick={handleLoginUseLocalMode}
                      className="w-full h-12 px-4 py-2 rounded-md text-base font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all"
                    >
                      {t('page.useLocalModeInstead', 'Use Local Mode Instead')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
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
