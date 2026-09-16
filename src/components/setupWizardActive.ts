'use client';

import { useSyncExternalStore } from 'react';
import { AGE_GROUPS } from '@/config/gameOptions';

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

// --- Wizard format preference (review #742 issue 4) ---------------------------
// Lives here, not in SetupWizard.tsx, for the same reason as everything else in
// this module: consumers (NewGameSetupModal) must not pull the wizard's
// data-layer imports just to read one localStorage hint.
const FORMAT_PREFIX = 'matchops_setup_format_';
export type SetupFormat = '5v5' | '8v8' | '11v11';

/** Written by the wizard when the coach answers Pelimuoto. */
export function storeSetupFormat(userId: string | null | undefined, format: SetupFormat): void {
  try {
    // eslint-disable-next-line no-restricted-globals -- per-user UI default hint, not app data
    localStorage.setItem(`${FORMAT_PREFIX}${userId ?? 'local'}`, format);
  } catch {
    // Non-critical preference - ignore.
  }
}

/**
 * The coach's own Pelimuoto answer; New Game Setup prefers this size for its
 * DEFAULT formation. undefined userId = auth unsettled (or no publisher, e.g.
 * tests) -> null, so callers fall back to the player-count guess.
 */
export function getStoredSetupFormat(userId: string | null | undefined): SetupFormat | null {
  if (typeof window === 'undefined' || userId === undefined) return null;
  try {
    // eslint-disable-next-line no-restricted-globals -- per-user UI default hint, not app data
    const value = localStorage.getItem(`${FORMAT_PREFIX}${userId ?? 'local'}`);
    return value === '5v5' || value === '8v8' || value === '11v11' ? value : null;
  } catch {
    return null;
  }
}

// --- Wizard age-group preference ---------------------------------------------
// The SAME shape as the format above, and for the same reason: the wizard asks
// a question, and the answer has to reach a game or it changes nothing a coach
// can see. Writing it only onto the team would leave it unread - nothing in
// new-game setup or the Rules screen looks at teams.ageGroup.
const AGE_GROUP_PREFIX = 'matchops_setup_age_group_';

/** Written by the wizard when the coach answers Ikäluokka. */
export function storeSetupAgeGroup(userId: string | null | undefined, ageGroup: string): void {
  try {
    // eslint-disable-next-line no-restricted-globals -- per-user UI default hint, not app data
    localStorage.setItem(`${AGE_GROUP_PREFIX}${userId ?? 'local'}`, ageGroup);
  } catch {
    // Non-critical preference - ignore.
  }
}

/**
 * The coach's own Ikäluokka answer, used as the DEFAULT age group for a new
 * game. Validated against AGE_GROUPS on the way out rather than trusted: this
 * is localStorage, and an unrecognised value would otherwise be written onto a
 * game and then into the stats filters.
 *
 * Ranks BELOW a season or tournament setting (see NewGameSetupModal): an
 * explicit competition value is a statement about this fixture, while this is
 * a guess about the coach.
 */
export function getStoredSetupAgeGroup(userId: string | null | undefined): string | null {
  if (typeof window === 'undefined' || userId === undefined) return null;
  try {
    // eslint-disable-next-line no-restricted-globals -- per-user UI default hint, not app data
    const value = localStorage.getItem(`${AGE_GROUP_PREFIX}${userId ?? 'local'}`);
    return value && AGE_GROUPS.includes(value) ? value : null;
  } catch {
    return null;
  }
}
