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

/**
 * Start a sync engine only in the tab that owns the app (review 7.19).
 * - owner / no lock support: start now;
 * - still pending: start when the answer is ours, or after `waitMs` if no guard
 *   ever answers (a page without one);
 * - blocked: never.
 * After starting, keeps listening: if the tab turns out blocked after all (the
 * fallback fired before a slow lock answer), the engine is stopped.
 * Returns a function that stops listening (and cancels a pending start).
 */
export function startSyncWhenTabOwned(
  store: { startSync: () => void; stopSync: () => void },
  waitMs: number,
): () => void {
  let started = false;
  let fallback: ReturnType<typeof setTimeout> | null = null;
  const start = () => {
    if (started) return;
    started = true;
    store.startSync();
  };
  const stopListening = onTabOwnershipChange((value) => {
    if (value === 'blocked') {
      if (fallback) clearTimeout(fallback);
      fallback = null;
      if (started) {
        started = false;
        store.stopSync();
      }
      return;
    }
    if (value === 'owner' || value === 'unsupported') {
      if (fallback) clearTimeout(fallback);
      fallback = null;
      start();
    }
  });

  const now = getTabOwnership();
  if (now === 'owner' || now === 'unsupported') start();
  else if (now === 'pending') fallback = setTimeout(() => { fallback = null; start(); }, waitMs);

  return () => {
    stopListening();
    if (fallback) clearTimeout(fallback);
    fallback = null;
  };
}

/** Test-only reset. */
export const __resetTabOwnershipForTests = (): void => {
  ownership = 'pending';
  listeners.clear();
};
