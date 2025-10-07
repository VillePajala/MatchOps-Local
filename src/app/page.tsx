'use client';

import ModalProvider from '@/contexts/ModalProvider';
import HomePage from '@/components/HomePage';
import StartScreen from '@/components/StartScreen';
import ErrorBoundary from '@/components/ErrorBoundary';
import { MigrationStatus } from '@/components/MigrationStatus';
import { useState, useEffect, useCallback } from 'react';
import { getCurrentGameIdSetting } from '@/utils/appSettings';
import { getSavedGames } from '@/utils/savedGames';
import { getMasterRoster } from '@/utils/masterRosterManager';
import { runMigration } from '@/utils/migration';
import logger from '@/utils/logger';

export default function Home() {
  const [screen, setScreen] = useState<'start' | 'home'>('start');
  const [initialAction, setInitialAction] = useState<'newGame' | 'loadGame' | 'resumeGame' | 'explore' | 'season' | 'stats' | 'roster' | 'teams' | 'settings' | null>(null);
  const [canResume, setCanResume] = useState(false);
  const [hasPlayers, setHasPlayers] = useState(false);
  const [hasSavedGames, setHasSavedGames] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isCheckingState, setIsCheckingState] = useState(true);

  // A user is considered "first time" if they haven't created a roster OR a game yet.
  // This ensures they are guided through the full setup process.
  const isFirstTimeUser = !hasPlayers || !hasSavedGames;

  const checkAppState = useCallback(async () => {
    setIsCheckingState(true);
    try {
      // This runs once to ensure legacy data is converted to IndexedDB.
      // IndexedDB is the runtime storage; this is not the focus of current work.
      await runMigration();

      // Check for resume capability
      const lastId = await getCurrentGameIdSetting();
      const games = await getSavedGames();

      if (lastId && games[lastId]) {
        setCanResume(true);
      } else {
        setCanResume(false);
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
    // Reset to start screen to let user see the updated state
    setScreen('start');
  }, []);

  useEffect(() => {
    checkAppState();
  }, [checkAppState, refreshTrigger]);

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

  return (
    <ErrorBoundary onError={(error, errorInfo) => {
      logger.error('App-level error caught:', error, errorInfo);
    }}>
      <ModalProvider>
        {isCheckingState ? (
          // Loading state while checking for data
          <div className="flex flex-col items-center justify-center h-screen bg-slate-900">
            <div className="flex flex-col items-center gap-6">
              {/* Spinner */}
              <div className="w-16 h-16 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />

              {/* Optional loading text */}
              <p className="text-slate-400 text-sm">Loading...</p>
            </div>
          </div>
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
            />
          </ErrorBoundary>
        )}

        {/* Migration status overlay */}
        <MigrationStatus />
      </ModalProvider>
    </ErrorBoundary>
  );
}
