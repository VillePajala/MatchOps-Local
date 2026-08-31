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

// --- First-game signal (Onboarding v2 PR 22) --------------------------------
// The marketing-consent prompt waits until the coach has actually arrived
// (first game saved) instead of popping mid-onboarding. page.tsx publishes
// hasSavedGames here; existing users with games are unaffected (true at once).
let firstGameExists = false;
const gameListeners = new Set<() => void>();

/** Published by page.tsx whenever hasSavedGames changes. */
export const setFirstGameExists = (value: boolean): void => {
  if (firstGameExists === value) return;
  firstGameExists = value;
  gameListeners.forEach((l) => l());
};

const subscribeGame = (listener: () => void) => {
  gameListeners.add(listener);
  return () => {
    gameListeners.delete(listener);
  };
};
const getGameSnapshot = () => firstGameExists;
const getGameServerSnapshot = () => false;

/** True once the account has at least one saved game. */
export function useFirstGameExists(): boolean {
  return useSyncExternalStore(subscribeGame, getGameSnapshot, getGameServerSnapshot);
}
