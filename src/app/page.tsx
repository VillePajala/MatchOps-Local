'use client';

import ModalProvider from '@/contexts/ModalProvider';
import HomePage from '@/components/HomePage';
import StartScreen from '@/components/StartScreen';
import LoginScreen from '@/components/LoginScreen';
import MigrationWizard from '@/components/MigrationWizard';
import ErrorBoundary from '@/components/ErrorBoundary';
import { MigrationStatus } from '@/components/MigrationStatus';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppResume } from '@/hooks/useAppResume';
import { useToast } from '@/contexts/ToastProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { getCurrentGameIdSetting, saveCurrentGameIdSetting as utilSaveCurrentGameIdSetting } from '@/utils/appSettings';
import { getSavedGames, getLatestGameId } from '@/utils/savedGames';
import { getMasterRoster } from '@/utils/masterRosterManager';
import { runMigration } from '@/utils/migration';
import { hasMigrationCompleted, setMigrationCompleted } from '@/config/backendConfig';
import { hasLocalDataToMigrate } from '@/services/migrationService';
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
  const [hasSkippedMigration, setHasSkippedMigration] = useState(false);
  // Ref to track if migration check has been initiated (prevents race conditions)
  const migrationCheckInitiatedRef = useRef(false);
  const { showToast } = useToast();
  const { isAuthenticated, isLoading: isAuthLoading, mode, user } = useAuth();
  const queryClient = useQueryClient();

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

    // Skip if check already initiated this session (ref prevents race conditions)
    if (migrationCheckInitiatedRef.current) return;

    // Skip if user already skipped migration this session (read state but don't depend on it)
    if (hasSkippedMigration) return;

    // Mark as initiated before async work
    migrationCheckInitiatedRef.current = true;

    const checkMigrationNeeded = async () => {
      try {
        // Skip if migration already completed for this user
        if (hasMigrationCompleted(userId)) {
          logger.info('[page.tsx] Migration already completed for this user');
          return;
        }

        // Check if there's local data to migrate
        const hasData = await hasLocalDataToMigrate();
        if (hasData) {
          logger.info('[page.tsx] Local data found, showing migration wizard');
          setShowMigrationWizard(true);
        } else {
          // No local data - mark migration as complete so we don't check again
          logger.info('[page.tsx] No local data to migrate, marking as complete');
          setMigrationCompleted(userId);
        }
      } catch (error) {
        logger.warn('[page.tsx] Failed to check migration status', { error });
        // Don't show wizard on error - user can trigger migration manually if needed
        // Reset ref to allow retry on next effect run
        migrationCheckInitiatedRef.current = false;
      }
    };

    checkMigrationNeeded();
    // Note: hasSkippedMigration is intentionally read inside but not in deps
    // to prevent re-triggering. The ref handles race condition prevention.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isAuthenticated, userId]);

  // Handle migration wizard completion
  const handleMigrationComplete = useCallback(() => {
    if (userId) {
      setMigrationCompleted(userId);
    }
    setShowMigrationWizard(false);
    // CRITICAL: Invalidate ALL React Query cache to force refetch from cloud
    // Without this, the app shows stale/empty data from the old local cache
    queryClient.invalidateQueries();
    // Also trigger state refresh
    setRefreshTrigger(prev => prev + 1);
  }, [userId, queryClient]);

  // Handle migration wizard skip
  const handleMigrationSkip = useCallback(() => {
    // Don't mark as completed - allow user to migrate later via settings
    // But do mark as skipped for this session so the wizard doesn't reopen immediately
    setHasSkippedMigration(true);
    setShowMigrationWizard(false);
  }, []);

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
        ) : needsAuth ? (
          // Cloud mode: show login screen when not authenticated
          <ErrorBoundary>
            <LoginScreen />
          </ErrorBoundary>
        ) : showMigrationWizard ? (
          // Cloud mode: show migration wizard when local data needs to be migrated
          <ErrorBoundary>
            <MigrationWizard
              onComplete={handleMigrationComplete}
              onSkip={handleMigrationSkip}
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
            />
          </ErrorBoundary>
        ) : (
          <ErrorBoundary>
            <HomePage
              initialAction={initialAction ?? undefined}
              skipInitialSetup
              onDataImportSuccess={handleDataImportSuccess}
              isFirstTimeUser={isFirstTimeUser}
            />
          </ErrorBoundary>
        )}

        {/* Migration status overlay */}
        <MigrationStatus />
      </ModalProvider>
    </ErrorBoundary>
  );
}
