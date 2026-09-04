'use client';

import { useEffect, type FC } from 'react';
import { useGuidedTour } from '@/contexts/GuidedTourProvider';

interface GuidedTourControllerProps {
  // Live Home-screen signals that drive the tour's Home-half steps. Optional so
  // tests work without threading every signal. The match-view signals
  // (timer/goal/formation) are owned by GuidedTourMatchReporter, not this
  // component.
  hasPlayers?: boolean;
  hasTeam?: boolean;
  hasTeamLinkedGame?: boolean;
  screen?: 'start' | 'home';
}

/**
 * Headless signal feed for the guided tour. Onboarding v2: the tour no longer
 * AUTO-STARTS for new accounts - first-run onboarding is the SetupWizard plus
 * the start screen's empty-state composition, and the tour is opt-in only
 * (gear -> "Aloitusopastus", which calls startTour directly on the provider).
 * This component just keeps the running tour's action steps auto-advancing as
 * the coach makes real progress. Renders nothing.
 */
const GuidedTourController: FC<GuidedTourControllerProps> = ({
  hasPlayers = false,
  hasTeam = false,
  hasTeamLinkedGame = false,
  screen = 'start',
}) => {
  const { reportSignals } = useGuidedTour();

  // Report Home-screen signals whenever one changes; the tour advances the
  // current step if its predicate is now satisfied (no-op when no tour is running).
  useEffect(() => {
    reportSignals({ hasPlayers, hasTeam, hasTeamLinkedGame, screen });
  }, [hasPlayers, hasTeam, hasTeamLinkedGame, screen, reportSignals]);

  return null;
};

export default GuidedTourController;
