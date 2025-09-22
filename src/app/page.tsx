'use client';

import ModalProvider from '@/contexts/ModalProvider';
import HomePage from '@/components/HomePage';
import StartScreen from '@/components/StartScreen';
import ErrorBoundary from '@/components/ErrorBoundary';
import { MigrationStatus } from '@/components/MigrationStatus';
import { useState, useEffect } from 'react';
import { getCurrentGameIdSetting } from '@/utils/appSettings';
import { getSavedGames } from '@/utils/savedGames';
import { getMasterRoster } from '@/utils/masterRosterManager';
import { getSeasons } from '@/utils/seasons';
import { getTournaments } from '@/utils/tournaments';
import { runMigration } from '@/utils/migration';
import logger from '@/utils/logger';

export default function Home() {
  const [screen, setScreen] = useState<'start' | 'home'>('start');
  const [initialAction, setInitialAction] = useState<'newGame' | 'loadGame' | 'resumeGame' | 'explore' | 'season' | 'stats' | 'roster' | 'teams' | null>(null);
  const [canResume, setCanResume] = useState(false);
  const [hasPlayers, setHasPlayers] = useState(false);
  const [hasSavedGames, setHasSavedGames] = useState(false);
  const [hasSeasonsTournaments, setHasSeasonsTournaments] = useState(false);
  
  // A user is considered "first time" if they haven't created a roster OR a game yet.
  // This ensures they are guided through the full setup process.
  const isFirstTimeUser = !hasPlayers || !hasSavedGames;

  useEffect(() => {
    const checkAppState = async () => {
      try {
        // Run migration first (idempotent - safe to run multiple times)
        await runMigration();
        
        // Check for resume capability
        const lastId = await getCurrentGameIdSetting();
        const games = await getSavedGames();
        
        if (lastId && games[lastId]) {
          setCanResume(true);
        }
        
        // Check if user has any saved games
        setHasSavedGames(Object.keys(games).length > 0);
        
        // Check if user has any players in roster
        const roster = await getMasterRoster();
        setHasPlayers(roster.length > 0);
        
        // Check if user has any seasons or tournaments
        const seasons = await getSeasons();
        const tournaments = await getTournaments();
        setHasSeasonsTournaments(seasons.length > 0 || tournaments.length > 0);
      } catch {
        setCanResume(false);
        setHasSavedGames(false);
        setHasPlayers(false);
        setHasSeasonsTournaments(false);
      }
    };
    checkAppState();
  }, []);

  const handleAction = (
    action: 'newGame' | 'loadGame' | 'resumeGame' | 'explore' | 'getStarted' | 'season' | 'stats' | 'roster' | 'teams'
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
        {screen === 'start' ? (
          <ErrorBoundary>
            <StartScreen
              onStartNewGame={() => handleAction('newGame')}
              onLoadGame={() => handleAction('loadGame')}
              onResumeGame={() => handleAction('resumeGame')}
              onGetStarted={() => handleAction('getStarted')}
              canResume={canResume}
              onCreateSeason={() => handleAction('season')}
              onViewStats={() => handleAction('stats')}
              onSetupRoster={() => handleAction('roster')}
              onManageTeams={() => handleAction('teams')}
              hasPlayers={hasPlayers}
              hasSavedGames={hasSavedGames}
              hasSeasonsTournaments={hasSeasonsTournaments}
              isFirstTimeUser={isFirstTimeUser}
            />
          </ErrorBoundary>
        ) : (
          <ErrorBoundary>
            <HomePage initialAction={initialAction ?? undefined} skipInitialSetup />
          </ErrorBoundary>
        )}

        {/* Migration status overlay */}
        <MigrationStatus />
      </ModalProvider>
    </ErrorBoundary>
  );
}
