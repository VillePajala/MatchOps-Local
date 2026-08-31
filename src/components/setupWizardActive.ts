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
