'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
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
   * Report the latest app-state signals. If the current step declares an
   * `advanceWhen` predicate that these signals satisfy, the tour auto-advances.
   */
  reportSignals: (signals: TourSignals) => void;
  /** Whether the given tour was already completed/skipped for the current user. */
  isTourCompleted: (tourId: string) => boolean;
}

const GuidedTourContext = createContext<GuidedTourContextValue | undefined>(undefined);

export const GuidedTourProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // Keep the latest userId reachable from stable callbacks without re-creating them.
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const [tourId, setTourId] = useState<string | null>(null);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);

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
    (signals: TourSignals) => {
      if (tourId === null) return;
      const step = steps[index];
      if (step?.advanceWhen?.(signals)) {
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
          step={activeStep}
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

export default GuidedTourProvider;
