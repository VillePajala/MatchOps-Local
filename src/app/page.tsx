'use client';

import ModalProvider from '@/contexts/ModalProvider';
import HomePage from '@/components/HomePage';
import StartScreen from '@/components/StartScreen';
import LoginScreen from '@/components/LoginScreen';
import MigrationWizard from '@/components/MigrationWizard';
import WelcomeScreen from '@/components/WelcomeScreen';
import ErrorBoundary from '@/components/ErrorBoundary';
import UpgradePromptModal from '@/components/UpgradePromptModal';
import { MigrationStatus } from '@/components/MigrationStatus';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppResume } from '@/hooks/useAppResume';
import { useCloudUpgradeGate } from '@/hooks/useCloudUpgradeGate';
import { usePremium } from '@/hooks/usePremium';
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
import { hasLocalDataToMigrate, type MigrationCounts } from '@/services/migrationService';
import { hasCloudData, getCloudDataSummary } from '@/services/reverseMigrationService';
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
  const [cloudCounts, setCloudCounts] = useState<MigrationCounts | null>(null);
  const [isLoadingCloudCounts, setIsLoadingCloudCounts] = useState(false);
  // Welcome screen state (first-install onboarding)
  const [showWelcome, setShowWelcome] = useState(false);
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  // Post-login upgrade modal state (shown when user signs in without premium subscription)
  const [showPostLoginUpgradeModal, setShowPostLoginUpgradeModal] = useState(false);
  // Ref to track if migration check has been initiated (prevents race conditions)
  const migrationCheckInitiatedRef = useRef(false);
  const { showToast } = useToast();
  const { isAuthenticated, isLoading: isAuthLoading, mode, user } = useAuth();
  const { isPremium, isLoading: isPremiumLoading } = usePremium();
  const queryClient = useQueryClient();

  // Cloud upgrade gate - shows upgrade modal when enabling cloud without premium
  const {
    showModal: showCloudUpgradeModal,
    gateCloudAction,
    handleUpgradeSuccess: handleCloudUpgradeSuccess,
    handleCancel: handleCloudUpgradeCancel,
  } = useCloudUpgradeGate();

  // Extract userId to avoid effect re-runs when user object reference changes
  const userId = user?.id;

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
      const lastId = await getCurrentGameIdSetting();
      const games = await getSavedGames();

      if (lastId && games[lastId]) {
        setCanResume(true);
      } else {
        // Fallback: if currentGameId is missing or stale but there are games, select the latest game
        const ids = Object.keys(games || {}).filter(id => id !== 'unsaved_game');
        if (ids.length > 0) {
          const latestId = getLatestGameId(games);
          if (latestId) {
            await utilSaveCurrentGameIdSetting(latestId);
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
      const roster = await getMasterRoster();
      setHasPlayers(roster.length > 0);
    } catch (error) {
      logger.warn('Failed to check initial game state', { error });
      setCanResume(false);
      setHasSavedGames(false);
      setHasPlayers(false);
    } finally {
      setIsCheckingState(false);
    }
  }, []);

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
      showToast('Starting in local mode...', 'info');
      setTimeout(() => {
        try {
          window.location.reload();
        } catch (error) {
          logger.error('[page.tsx] Reload blocked', error);
          showToast('Please refresh the page manually', 'error');
        }
      }, FORCE_RELOAD_NOTIFICATION_DELAY_MS);
    } else {
      setShowWelcome(false);
      // Mode is already 'local', proceed to app state check
      setRefreshTrigger(prev => prev + 1);
    }
  }, [mode, showToast]);

  // Actually enable cloud mode (called after premium check passes)
  const executeEnableCloudFromWelcome = useCallback(() => {
    logger.info('[page.tsx] Welcome: Enabling cloud mode');
    const success = enableCloudMode();
    if (success) {
      // Cloud mode enabled - reload to re-initialize AuthProvider in cloud mode
      // (AuthProvider reads getBackendMode() once on mount, so we need a full reload)
      showToast('Cloud mode enabled. Reloading...', 'info');
      setTimeout(() => {
        try {
          // Set welcome flag just before reload - if reload fails, we'll clear it
          setWelcomeSeen();
          window.location.reload();
        } catch (error) {
          // Reload blocked (e.g., by browser extension or security policy)
          // Clear welcome flag so user can retry after manual refresh
          clearWelcomeSeen();
          logger.error('[page.tsx] Reload blocked', error);
          showToast('Please refresh the page manually to continue', 'error');
        }
      }, 500);
    } else {
      // Cloud not available (shouldn't happen since button is hidden)
      showToast('Cloud sync is not available', 'error');
    }
  }, [showToast]);

  // Handle "Sign In to Cloud" from welcome screen
  // Note: Premium check happens AFTER login, not before (see post-login check effect)
  const handleWelcomeSignInCloud = useCallback(() => {
    logger.info('[page.tsx] Welcome: User chose cloud mode - setting pending post-login check');
    // Set flag so we know to check premium after authentication
    setPendingPostLoginCheck();
    // Proceed to enable cloud mode (this will reload and show LoginScreen)
    executeEnableCloudFromWelcome();
  }, [executeEnableCloudFromWelcome]);

  // Handle "Import Backup" from welcome screen
  const handleWelcomeImportBackup = useCallback(async () => {
    logger.info('[page.tsx] Welcome: User chose to import backup');
    setIsImportingBackup(true);

    try {
      const result = await importFromFilePicker(showToast);

      if (result.success) {
        logger.info('[page.tsx] Welcome: Backup import succeeded');
        // Set welcome flag and hide screen before reload
        setWelcomeSeen();
        setShowWelcome(false);
        // Trigger full page reload to ensure all caches are fresh
        // This is the safest way to ensure imported data is properly loaded
        try {
          window.location.reload();
        } catch (reloadError) {
          // Reload blocked - clear flag so user can retry after manual refresh
          clearWelcomeSeen();
          setShowWelcome(true);
          logger.error('[page.tsx] Reload blocked after import', reloadError);
          showToast('Import succeeded. Please refresh the page manually.', 'info');
        }
      } else if (result.cancelled) {
        logger.info('[page.tsx] Welcome: User cancelled import');
        // Stay on welcome screen - user can try again or choose different option
      } else {
        logger.warn('[page.tsx] Welcome: Import failed:', result.error);
        showToast(result.error || 'Failed to import backup', 'error');
        // Stay on welcome screen
      }
    } catch (error) {
      logger.error('[page.tsx] Welcome: Import error:', error);
      showToast('Failed to import backup', 'error');
    } finally {
      setIsImportingBackup(false);
    }
  }, [showToast]);

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
      showToast('Local mode enabled. Reloading...', 'info');
      setTimeout(() => {
        try {
          window.location.reload();
        } catch (error) {
          clearWelcomeSeen();
          logger.error('[page.tsx] Reload blocked', error);
          showToast('Please refresh the page manually to continue', 'error');
        }
      }, FORCE_RELOAD_NOTIFICATION_DELAY_MS);
    } else {
      logger.error('[page.tsx] Failed to switch to local mode:', result.message);
      showToast('Failed to switch to local mode', 'error');
    }
  }, [showToast]);

  // Actually enable cloud sync (called after premium check passes)
  const executeEnableCloudSync = useCallback(() => {
    logger.info('[page.tsx] StartScreen: Enabling cloud sync');
    const success = enableCloudMode();
    if (success) {
      showToast('Cloud mode enabled. Reloading...', 'info');
      setTimeout(() => {
        try {
          window.location.reload();
        } catch (error) {
          logger.error('[page.tsx] Reload blocked', error);
          showToast('Please refresh the page manually to continue', 'error');
        }
      }, FORCE_RELOAD_NOTIFICATION_DELAY_MS);
    } else {
      showToast('Cloud sync is not available', 'error');
    }
  }, [showToast]);

  // Handle "Enable Cloud Sync" from StartScreen (local mode users) - gated behind premium
  const handleEnableCloudSync = useCallback(() => {
    logger.info('[page.tsx] StartScreen: User chose to enable cloud sync');
    gateCloudAction(executeEnableCloudSync);
  }, [gateCloudAction, executeEnableCloudSync]);

  // Re-run checkAppState when:
  // - Component mounts (initial load)
  // - refreshTrigger changes (data import, app resume)
  // - isAuthenticated changes (user signs in/out in cloud mode)
  // In cloud mode, checkAppState() needs auth to access DataStore, so we gate on isAuthenticated
  useEffect(() => {
    // Skip if auth is still loading
    if (isAuthLoading) return;

    // In cloud mode, only check state when authenticated (DataStore requires auth)
    // In local mode, always check (no auth required)
    if (mode === 'cloud' && !isAuthenticated) {
      // Clear loading state so LoginScreen can render instead of spinner
      setIsCheckingState(false);
      return;
    }

    checkAppState();
  }, [checkAppState, refreshTrigger, isAuthenticated, isAuthLoading, mode]);

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

    // Wait for premium status to load before checking migration
    // This ensures the post-login premium check runs first
    if (isPremiumLoading) {
      return;
    }

    // Skip if there's a pending post-login check (premium check hasn't passed yet)
    // This ensures we don't show migration wizard until user has verified subscription
    if (hasPendingPostLoginCheck()) {
      logger.info('[page.tsx] Migration check: waiting for post-login premium check to complete');
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
          return;
        }

        // Check if there's local data to migrate
        const result = await hasLocalDataToMigrate();
        if (result.checkFailed) {
          // Storage check failed - log warning but don't show wizard
          // User can trigger migration manually from settings if needed
          logger.warn('[page.tsx] Failed to check local data:', result.error);
        } else if (result.hasData) {
          logger.info('[page.tsx] Local data found, fetching cloud counts for migration wizard');
          // Fetch cloud counts to determine migration scenario
          setIsLoadingCloudCounts(true);
          try {
            const counts = await getCloudDataSummary();
            setCloudCounts(counts);
          } catch (cloudError) {
            // Cloud fetch failed - wizard will assume cloud is empty
            logger.warn('[page.tsx] Failed to fetch cloud counts:', cloudError);
            setCloudCounts(null);
          } finally {
            setIsLoadingCloudCounts(false);
          }
          setShowMigrationWizard(true);
        } else {
          // No local data - check if cloud has data that needs to be loaded
          logger.info('[page.tsx] No local data, checking if cloud has data...');

          const cloudResult = await hasCloudData();
          if (cloudResult.checkFailed) {
            // Cloud check failed - log warning but don't block user
            // They can use the app, data will load when queries run
            logger.warn('[page.tsx] Failed to check cloud data:', cloudResult.error);
            setMigrationCompleted(userId);
          } else if (cloudResult.hasData) {
            // Cloud has data - trigger refetch to load it into the app
            // This handles the "new device login" scenario where user has
            // cloud data but empty local device
            logger.info('[page.tsx] Cloud has data, triggering refetch to load data');
            await queryClient.refetchQueries();
            setRefreshTrigger(prev => prev + 1);
            setMigrationCompleted(userId);
          } else {
            // Both local and cloud are empty - nothing to migrate now
            // Don't mark complete: if local data appears later (via backup import),
            // migration check should run again and show the wizard
            logger.info('[page.tsx] No local or cloud data to migrate currently');
          }
        }
      } catch (error) {
        logger.warn('[page.tsx] Failed to check migration status', { error });
        // Don't show wizard on error - user can trigger migration manually if needed
        // Reset ref to allow retry on next effect run
        migrationCheckInitiatedRef.current = false;
      }
    };

    checkMigrationNeeded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isAuthenticated, userId, isPremiumLoading]);

  // ============================================================================
  // POST-LOGIN PREMIUM CHECK (Cloud Mode Only)
  // ============================================================================
  // When user signs in to cloud from WelcomeScreen, we need to verify they have
  // a premium subscription AFTER authentication succeeds. This is because:
  // 1. In local mode, isPremium is always true (no subscription check)
  // 2. We can't verify subscription status before authentication
  // 3. The gate must happen after login, not before
  //
  // This effect triggers when:
  // - User is in cloud mode AND authenticated
  // - Premium status is loaded (not loading)
  // - There's a pending post-login check flag set
  //
  // If user doesn't have premium:
  // - Show upgrade modal
  // - User must subscribe OR cancel (returns to local mode)
  useEffect(() => {
    // Skip if not in cloud mode, not authenticated, or still loading
    if (mode !== 'cloud' || !isAuthenticated || isAuthLoading || isPremiumLoading) {
      return;
    }

    // Check if there's a pending post-login check
    if (!hasPendingPostLoginCheck()) {
      return; // No pending check - user is returning to the app, not newly signing in
    }

    logger.info('[page.tsx] Post-login check: verifying premium status');

    // Check premium status
    if (isPremium) {
      // User has premium - clear flag and proceed
      logger.info('[page.tsx] Post-login check: user has premium, proceeding');
      clearPendingPostLoginCheck();
      // Migration check will run (if needed) via the other effect
    } else {
      // User doesn't have premium - show upgrade modal
      logger.info('[page.tsx] Post-login check: user needs premium subscription');
      setShowPostLoginUpgradeModal(true);
    }
  }, [mode, isAuthenticated, isAuthLoading, isPremiumLoading, isPremium]);

  // Handle post-login upgrade success - user subscribed
  const handlePostLoginUpgradeSuccess = useCallback(() => {
    logger.info('[page.tsx] Post-login upgrade success - proceeding to cloud mode');
    setShowPostLoginUpgradeModal(false);
    clearPendingPostLoginCheck();
    // Migration check will run (if needed) via the other effect on next render
    // Trigger a refresh to ensure proper state
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // Handle post-login upgrade cancel - user chose not to subscribe
  const handlePostLoginUpgradeCancel = useCallback(() => {
    logger.info('[page.tsx] Post-login upgrade cancelled - returning to local mode');
    setShowPostLoginUpgradeModal(false);
    clearPendingPostLoginCheck();

    // Disable cloud mode and reload to local mode
    const result = disableCloudMode();
    if (result.success) {
      showToast('Returning to local mode...', 'info');
      setTimeout(() => {
        try {
          window.location.reload();
        } catch (error) {
          logger.error('[page.tsx] Reload blocked', error);
          showToast('Please refresh the page manually', 'error');
        }
      }, FORCE_RELOAD_NOTIFICATION_DELAY_MS);
    } else {
      logger.error('[page.tsx] Failed to switch to local mode:', result.message);
      showToast('Failed to switch to local mode. Please try again.', 'error');
    }
  }, [showToast]);

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

    // CRITICAL: Refetch ALL React Query queries to load fresh data from cloud
    // invalidateQueries() only marks as stale; refetchQueries() forces immediate refetch
    // Without this, the app shows stale/empty data until user manually reloads
    await queryClient.refetchQueries();
    // Also trigger state refresh
    setRefreshTrigger(prev => prev + 1);
  }, [userId, queryClient]);

  // Handle migration wizard cancel - return to local mode
  const handleMigrationCancel = useCallback(() => {
    logger.info('[page.tsx] Migration cancelled, switching to local mode');
    setShowMigrationWizard(false);
    setCloudCounts(null);

    // Disable cloud mode and reload to reinitialize in local mode
    const result = disableCloudMode();
    if (result.success) {
      showToast('Returning to local mode...', 'info');
      setTimeout(() => {
        try {
          window.location.reload();
        } catch (error) {
          logger.error('[page.tsx] Reload blocked', error);
          showToast('Please refresh the page manually', 'error');
        }
      }, FORCE_RELOAD_NOTIFICATION_DELAY_MS);
    } else {
      logger.error('[page.tsx] Failed to switch to local mode:', result.message);
      showToast('Failed to switch to local mode. Please try again.', 'error');
    }
  }, [showToast]);

  // Handle app resume from background (Android TWA blank screen fix)
  // Triggers refreshTrigger to re-run checkAppState when returning from extended background
  useAppResume({
    onResume: () => {
      logger.log('[page.tsx] App resumed - triggering state refresh');
      setRefreshTrigger((prev) => prev + 1);
    },
    onBeforeForceReload: () => {
      // Show notification before force reload (5+ minute background)
      showToast('Refreshing app after extended background period...', 'info');
      return new Promise(resolve => setTimeout(resolve, FORCE_RELOAD_NOTIFICATION_DELAY_MS));
    },
    minBackgroundTime: 30000, // 30 seconds
    forceReloadTime: 300000,  // 5 minutes - force full page reload
  });

  // Listen for reload failure events from useAppResume
  // This handles the rare case where window.location.reload() fails
  useEffect(() => {
    const handleReloadFailed = () => {
      showToast('Unable to refresh app. Please close and reopen.', 'error');
    };
    window.addEventListener('app-resume-reload-failed', handleReloadFailed);
    return () => window.removeEventListener('app-resume-reload-failed', handleReloadFailed);
  }, [showToast]);

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

  return (
    <ErrorBoundary onError={(error, errorInfo) => {
      logger.error('App-level error caught:', error, errorInfo);
    }}>
      <ModalProvider>
        {isAuthLoading || isCheckingState ? (
          // Loading state while checking auth or data
          <div className="flex flex-col items-center justify-center h-screen bg-slate-900">
            <div className="flex flex-col items-center gap-6">
              {/* Spinner */}
              <div className="w-16 h-16 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />

              {/* Optional loading text */}
              <p className="text-slate-400 text-sm">Loading...</p>
            </div>
          </div>
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
          </ErrorBoundary>
        ) : needsAuth ? (
          // Cloud mode: show login screen when not authenticated
          <ErrorBoundary>
            <LoginScreen
              onBack={handleLoginBack}
              onUseLocalMode={handleLoginUseLocalMode}
            />
          </ErrorBoundary>
        ) : showMigrationWizard ? (
          // Cloud mode: show migration wizard when local data needs to be migrated
          <ErrorBoundary>
            <MigrationWizard
              onComplete={handleMigrationComplete}
              onCancel={handleMigrationCancel}
              cloudCounts={cloudCounts}
              isLoadingCloudCounts={isLoadingCloudCounts}
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

        {/* Cloud upgrade modal - shown when enabling cloud from Settings without premium */}
        <UpgradePromptModal
          isOpen={showCloudUpgradeModal}
          onClose={handleCloudUpgradeCancel}
          variant="cloudUpgrade"
          onUpgradeSuccess={handleCloudUpgradeSuccess}
        />

        {/* Post-login upgrade modal - shown after signing in to cloud without premium subscription */}
        <UpgradePromptModal
          isOpen={showPostLoginUpgradeModal}
          onClose={handlePostLoginUpgradeCancel}
          variant="cloudUpgrade"
          onUpgradeSuccess={handlePostLoginUpgradeSuccess}
        />
      </ModalProvider>
    </ErrorBoundary>
  );
}
