/**
 * Whether this tab owns the app (review 7.19).
 *
 * useMultiTabPrevention holds the 'matchops-active-tab' Web Lock. A second tab
 * on the same origin (an email link opened in Chrome while the installed app runs)
 * shows "Already open" - but it used to boot the whole data layer anyway,
 * including a second SyncEngine draining the same IndexedDB sync queue as the
 * first tab, with only per-tab in-memory locks between them.
 *
 * A module store, so the data-store factory (outside React) can read it too.
 * - 'pending'     the lock request has not answered yet
 * - 'owner'       this tab holds the lock
 * - 'blocked'     another tab holds it: stay passive
 * - 'unsupported' no Web Locks API: behave as before (owner)
 */

export type TabOwnership = 'pending' | 'owner' | 'blocked' | 'unsupported';

let ownership: TabOwnership = 'pending';
const listeners = new Set<(value: TabOwnership) => void>();

export const getTabOwnership = (): TabOwnership => ownership;

/** True when this tab may run the data layer (it owns the app, or locks are unavailable). */
export const tabMayRunDataLayer = (): boolean => ownership === 'owner' || ownership === 'unsupported';

export const setTabOwnership = (value: TabOwnership): void => {
  if (ownership === value) return;
  ownership = value;
  listeners.forEach((listener) => listener(value));
};

export const onTabOwnershipChange = (listener: (value: TabOwnership) => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Test-only reset. */
export const __resetTabOwnershipForTests = (): void => {
  ownership = 'pending';
  listeners.clear();
};
