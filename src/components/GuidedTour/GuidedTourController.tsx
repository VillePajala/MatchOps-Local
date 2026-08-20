'use client';

import { useEffect, useRef, type FC } from 'react';
import { useGuidedTour } from '@/contexts/GuidedTourProvider';
import { FIRST_RUN_TOUR_ID, firstRunTourSteps } from './firstRunTour';

interface GuidedTourControllerProps {
  /**
   * True only when the real Start Screen is showing and app state has finished
   * loading (not on a loading / auth / migration / welcome screen). Gating on
   * this avoids triggering the tour before `hasPlayers`/`hasSavedGames` are known
   * (which would misread a returning user as first-time mid-load).
   */
  ready: boolean;
  /** Truly-empty account: no roster and no saved games. */
  isFirstTimeUser: boolean;
  // Live app-state signals that drive auto-advancing steps. Optional so tests and
  // the first-run trigger work without threading every signal.
  hasPlayers?: boolean;
  hasTeam?: boolean;
  hasTeamLinkedGame?: boolean;
  screen?: 'start' | 'home';
  isTimerRunning?: boolean;
  hasLoggedGoal?: boolean;
}

/**
 * Headless controller: starts the post-signup first-run tour once for a
 * brand-new account, and feeds live app-state signals into the tour so
 * action steps auto-advance as the coach makes real progress. Renders nothing.
 */
const GuidedTourController: FC<GuidedTourControllerProps> = ({
  ready,
  isFirstTimeUser,
  hasPlayers = false,
  hasTeam = false,
  hasTeamLinkedGame = false,
  screen = 'start',
  isTimerRunning = false,
  hasLoggedGoal = false,
}) => {
  const { startTour, isTourCompleted, reportSignals } = useGuidedTour();
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (triggeredRef.current) return;
    if (!ready || !isFirstTimeUser) return;
    if (isTourCompleted(FIRST_RUN_TOUR_ID)) return;
    triggeredRef.current = true;
    startTour(FIRST_RUN_TOUR_ID, firstRunTourSteps);
  }, [ready, isFirstTimeUser, isTourCompleted, startTour]);

  // Report signals whenever one changes; the tour advances the current step if
  // its predicate is now satisfied (no-op when no tour is running).
  useEffect(() => {
    reportSignals({ hasPlayers, hasTeam, hasTeamLinkedGame, screen, isTimerRunning, hasLoggedGoal });
  }, [hasPlayers, hasTeam, hasTeamLinkedGame, screen, isTimerRunning, hasLoggedGoal, reportSignals]);

  return null;
};

export default GuidedTourController;
