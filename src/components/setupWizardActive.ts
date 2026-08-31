'use client';

import { useSyncExternalStore } from 'react';

/**
 * Wizard-active store (module level, dependency-free).
 *
 * The marketing-consent prompt lives in layout.tsx OUTSIDE the page tree, so it
 * can't read page state; this tiny external store lets it defer while the
 * setup wizard is on screen (same role the guided tour's isActive plays for
 * it). Kept in its own module so importing it does NOT pull the wizard's
 * data-layer dependencies into the layout bundle (review #725).
 */
let wizardActive = false;
const listeners = new Set<() => void>();

/** Set by SetupWizard on mount/unmount. */
export const setSetupWizardActive = (value: boolean): void => {
  if (wizardActive === value) return;
  wizardActive = value;
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => wizardActive;
const getServerSnapshot = () => false;

/** True while the setup wizard is mounted - the marketing prompt defers on it. */
export function useSetupWizardActive(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// --- Onboarding user id (review #728 round 2) --------------------------------
// FirstVisitIntro must not depend on React contexts: host-modal test suites
// partially mock AuthProvider/GuidedTourProvider and every context import
// became a breakage vector (useAuth crash round 1, missing useAuthOptional in
// partial mock factories round 2). page.tsx publishes the SETTLED user id here
// instead: undefined = auth still resolving (banners render nothing, so a
// dismissal can never be misfiled under the 'local' key), null = settled
// local/no-account, string = signed-in user.
let onboardingUserId: string | null | undefined = undefined;
const userListeners = new Set<() => void>();

export const setOnboardingUserId = (value: string | null | undefined): void => {
  if (onboardingUserId === value) return;
  onboardingUserId = value;
  userListeners.forEach((l) => l());
};

const subscribeUser = (listener: () => void) => {
  userListeners.add(listener);
  return () => {
    userListeners.delete(listener);
  };
};
const getUserSnapshot = () => onboardingUserId;
const getUserServerSnapshot = () => undefined;

export function useOnboardingUserId(): string | null | undefined {
  return useSyncExternalStore(subscribeUser, getUserSnapshot, getUserServerSnapshot);
}

// --- Guided-tour-active mirror ----------------------------------------------
// Published by GuidedTourProvider so FirstVisitIntro can yield to an active
// tour without importing the context (same partial-mock rationale as above).
let guidedTourActive = false;
const tourListeners = new Set<() => void>();

export const setGuidedTourActive = (value: boolean): void => {
  if (guidedTourActive === value) return;
  guidedTourActive = value;
  tourListeners.forEach((l) => l());
};

const subscribeTour = (listener: () => void) => {
  tourListeners.add(listener);
  return () => {
    tourListeners.delete(listener);
  };
};
const getTourSnapshot = () => guidedTourActive;
const getTourServerSnapshot = () => false;

export function useGuidedTourActive(): boolean {
  return useSyncExternalStore(subscribeTour, getTourSnapshot, getTourServerSnapshot);
}
