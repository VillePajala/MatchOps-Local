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
}

/**
 * Headless controller that starts the post-signup first-run tour exactly once
 * for a brand-new account. It lives inside GuidedTourProvider (so it can call the
 * tour API) and renders nothing. Later PRs extend it to also feed live app-state
 * signals into `reportSignals` for auto-advancing steps.
 */
const GuidedTourController: FC<GuidedTourControllerProps> = ({ ready, isFirstTimeUser }) => {
  const { startTour, isTourCompleted } = useGuidedTour();
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (triggeredRef.current) return;
    if (!ready || !isFirstTimeUser) return;
    if (isTourCompleted(FIRST_RUN_TOUR_ID)) return;
    triggeredRef.current = true;
    startTour(FIRST_RUN_TOUR_ID, firstRunTourSteps);
  }, [ready, isFirstTimeUser, isTourCompleted, startTour]);

  return null;
};

export default GuidedTourController;
