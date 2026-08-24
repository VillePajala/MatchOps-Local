'use client';

import { useEffect, type FC } from 'react';
import { useGuidedTourOptional } from '@/contexts/GuidedTourProvider';

interface GuidedTourMatchReporterProps {
  /** The match clock is currently running. */
  isTimerRunning: boolean;
  /** At least one goal has been logged in the current game. */
  hasLoggedGoal: boolean;
  /** A formation template was applied in this match view. */
  hasAppliedFormation: boolean;
}

/**
 * Headless reporter mounted inside the match view (HomePage). It feeds the
 * match-only tour signals (timer running, goal logged) into the page-level tour
 * so the start-timer and log-goal steps auto-advance. Renders nothing. The Home
 * signals are owned by GuidedTourController; `reportSignals` merges both.
 */
const GuidedTourMatchReporter: FC<GuidedTourMatchReporterProps> = ({ isTimerRunning, hasLoggedGoal, hasAppliedFormation }) => {
  // Optional: the reporter is also mounted in HomePage's own tests, which render
  // without a GuidedTourProvider. No provider -> no-op.
  const reportSignals = useGuidedTourOptional()?.reportSignals;

  useEffect(() => {
    reportSignals?.({ isTimerRunning, hasLoggedGoal, hasAppliedFormation });
  }, [isTimerRunning, hasLoggedGoal, hasAppliedFormation, reportSignals]);

  return null;
};

export default GuidedTourMatchReporter;
