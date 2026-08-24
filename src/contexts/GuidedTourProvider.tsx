'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import logger from '@/utils/logger';
import GuidedTourOverlay from '@/components/GuidedTour/GuidedTourOverlay';
import type { TourSignals, TourStep } from '@/components/GuidedTour/tourTypes';

const TOUR_COMPLETED_PREFIX = 'matchops_tour_completed_';

function completedKey(tourId: string, userId: string | null): string {
  return `${TOUR_COMPLETED_PREFIX}${tourId}_${userId ?? 'local'}`;
}

interface GuidedTourContextValue {
  /** True while a tour is running. */
  isActive: boolean;
  /** The step currently shown, or null when inactive. */
  currentStep: TourStep | null;
  /** Zero-based index of the current step. */
  currentStepIndex: number;
  /** Total steps in the running tour. */
  stepCount: number;
  /** Begin a tour (no-op if the step list is empty). */
  startTour: (tourId: string, steps: TourStep[]) => void;
  /** Advance to the next step, or finish (and mark completed) on the last. */
  next: () => void;
  /** Abandon the tour and mark it completed so it never re-triggers. */
  skip: () => void;
  /**
   * Merge in the latest app-state signals (a partial update - callers own
   * different slices: the page owns Home signals, the match view owns
   * timer/goal). If the current step's `advanceWhen` predicate is now satisfied
   * by the merged signals, the tour auto-advances.
   */
  reportSignals: (signals: Partial<TourSignals>) => void;
  /** Whether the given tour was already completed/skipped for the current user. */
  isTourCompleted: (tourId: string) => boolean;
}

const GuidedTourContext = createContext<GuidedTourContextValue | undefined>(undefined);

export const GuidedTourProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // Keep the latest userId reachable from stable callbacks without re-creating
  // them. Synced in an effect (never mutate a ref during render).
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const [tourId, setTourId] = useState<string | null>(null);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  // Merged latest signals across all reporters (page + match view + roster).
  // Kept in BOTH a ref (synchronous merge base for advance checks) and state
  // (so the overlay re-renders live progress like "3 / 8 players added").
  const initialSignals: TourSignals = {
    hasPlayers: false,
    hasTeam: false,
    hasTeamLinkedGame: false,
    screen: 'start',
    isTimerRunning: false,
    hasLoggedGoal: false,
    playersCount: 0,
    targetPlayers: 8, // default format goal; the step's chips override (5/8/11)
    teamsCount: 0,
    hasAppliedFormation: false,
  };
  const signalsRef = useRef<TourSignals>(initialSignals);
  const [signals, setSignals] = useState<TourSignals>(initialSignals);

  const isTourCompleted = useCallback((id: string): boolean => {
    try {
      // eslint-disable-next-line no-restricted-globals -- one-time onboarding flag, not app data
      return localStorage.getItem(completedKey(id, userIdRef.current)) === '1';
    } catch {
      return false;
    }
  }, []);

  const markCompleted = useCallback((id: string): void => {
    try {
      // eslint-disable-next-line no-restricted-globals -- one-time onboarding flag, not app data
      localStorage.setItem(completedKey(id, userIdRef.current), '1');
    } catch {
      // localStorage unavailable - completion won't persist, acceptable.
    }
  }, []);

  const endTour = useCallback(
    (id: string | null) => {
      if (id) markCompleted(id);
      setTourId(null);
      setSteps([]);
      setIndex(0);
    },
    [markCompleted],
  );

  const startTour = useCallback((id: string, tourSteps: TourStep[]) => {
    if (tourSteps.length === 0) return;
    logger.info('[GuidedTour] starting tour', { tourId: id, steps: tourSteps.length });
    setTourId(id);
    setSteps(tourSteps);
    setIndex(0);
  }, []);

  const advance = useCallback(() => {
    if (index + 1 >= steps.length) {
      endTour(tourId);
    } else {
      setIndex(index + 1);
    }
  }, [index, steps.length, tourId, endTour]);

  const skip = useCallback(() => {
    logger.info('[GuidedTour] skipped', { tourId });
    endTour(tourId);
  }, [tourId, endTour]);

  const reportSignals = useCallback(
    (partial: Partial<TourSignals>) => {
      const merged = { ...signalsRef.current, ...partial };
      // Skip no-op reports entirely - reporters fire on every render of their
      // hosts, and a state write per report would churn.
      const changed = (Object.keys(merged) as Array<keyof TourSignals>).some(
        (k) => merged[k] !== signalsRef.current[k],
      );
      signalsRef.current = merged;
      if (changed) setSignals(merged);
      if (tourId === null) return;
      const step = steps[index];
      if (step?.advanceWhen?.(merged)) {
        advance();
      }
    },
    [tourId, steps, index, advance],
  );

  const value = useMemo<GuidedTourContextValue>(
    () => ({
      isActive: tourId !== null,
      currentStep: tourId !== null ? steps[index] ?? null : null,
      currentStepIndex: index,
      stepCount: steps.length,
      startTour,
      next: advance,
      skip,
      reportSignals,
      isTourCompleted,
    }),
    [tourId, steps, index, startTour, advance, skip, reportSignals, isTourCompleted],
  );

  const activeStep = tourId !== null ? steps[index] : undefined;

  return (
    <GuidedTourContext.Provider value={value}>
      {children}
      {activeStep && (
        <GuidedTourOverlay
          key={activeStep.id}
          step={activeStep}
          signals={signals}
          onApplyChoice={reportSignals}
          stepIndex={index}
          stepCount={steps.length}
          isFinal={index + 1 >= steps.length}
          onNext={advance}
          onSkip={skip}
        />
      )}
    </GuidedTourContext.Provider>
  );
};

export function useGuidedTour(): GuidedTourContextValue {
  const ctx = useContext(GuidedTourContext);
  if (!ctx) {
    throw new Error('useGuidedTour must be used within GuidedTourProvider');
  }
  return ctx;
}

/**
 * Non-throwing variant for components that may render outside the provider (e.g.
 * the match-view reporter, which is also mounted in HomePage's own tests). Returns
 * undefined when there is no GuidedTourProvider above.
 */
export function useGuidedTourOptional(): GuidedTourContextValue | undefined {
  return useContext(GuidedTourContext);
}

export default GuidedTourProvider;
