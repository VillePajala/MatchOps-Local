'use client';

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PendingSyncWarningModal from '@/components/PendingSyncWarningModal';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { useToast } from '@/contexts/ToastProvider';
import logger from '@/utils/logger';

/** Unsent changes as the sync engine sees them right now, or null if it is not running. */
export async function readUnsyncedCounts(): Promise<{ pendingCount: number; failedCount: number } | null> {
  try {
    const { getSyncEngine, isSyncEngineInitialized } = await import('@/sync');
    if (!isSyncEngineInitialized()) return null;
    const status = await getSyncEngine().getStatus();
    return { pendingCount: status.pendingCount, failedCount: status.failedCount };
  } catch (error) {
    logger.warn('[PendingSyncWarning] Could not read sync status', { error });
    return null;
  }
}

const SYNC_FIRST_TIMEOUT_MS = 20000;
const SYNC_FIRST_POLL_MS = 300;

/**
 * "Sync first": start the sync and wait until the queue is actually empty.
 * `syncNow` only kicks off processing (and never throws), so returning after it would
 * let the caller sign out / switch mode while the push is still running - and closing
 * the store aborts it (review 3.13). Resolves true when nothing is left unsent; false
 * when changes remain (offline, failures backing off, or the time limit).
 */
export async function syncUntilEmpty(syncNow: () => Promise<unknown>): Promise<boolean> {
  await syncNow();
  const deadline = Date.now() + SYNC_FIRST_TIMEOUT_MS;
  for (;;) {
    let status;
    try {
      const { getSyncEngine, isSyncEngineInitialized } = await import('@/sync');
      if (!isSyncEngineInitialized()) return false;
      status = await getSyncEngine().getStatus();
    } catch (error) {
      logger.warn('[PendingSyncWarning] Could not read sync status', { error });
      return false;
    }
    if (status.pendingCount + status.failedCount === 0) return true;
    // Nothing more will happen soon: offline, a broken queue, or only failed changes
    // left once processing stopped (they are in backoff).
    if (!status.isOnline || status.state === 'error'
      || (status.state !== 'syncing' && status.pendingCount === 0)) return false;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, SYNC_FIRST_POLL_MS));
  }
}

/**
 * Sign out, but first warn when this account has changes not yet in the cloud
 * (review 3.13). Signing out does not lose them - they stay on this device - but a
 * coach who will not be back on this device should sync first.
 * Returns the guarded sign-out and the warning element to render.
 */
export function useSignOutWithPendingSyncWarning(signOut: () => unknown) {
  const syncStatus = useSyncStatus();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [counts, setCounts] = useState<{ pendingCount: number; failedCount: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const requestSignOut = useCallback(async () => {
    if (syncStatus.mode !== 'cloud') {
      void signOut();
      return;
    }
    // Ask the engine now: the hook's own counts read 0 until it has connected (the
    // first second after a sign-in, when this account's kept changes are queued).
    const fresh = (await readUnsyncedCounts())
      ?? { pendingCount: syncStatus.pendingCount, failedCount: syncStatus.failedCount };
    if (fresh.pendingCount + fresh.failedCount > 0) {
      setCounts(fresh);
      return;
    }
    void signOut();
  }, [syncStatus.mode, syncStatus.pendingCount, syncStatus.failedCount, signOut]);

  const onAction = useCallback(async (action: 'sync' | 'discard' | 'cancel') => {
    if (busy) return;
    if (action === 'cancel') {
      setCounts(null);
      return;
    }
    if (action === 'sync') {
      setBusy(true);
      let empty = false;
      try {
        empty = await syncUntilEmpty(syncStatus.syncNow);
      } finally {
        setBusy(false);
      }
      if (!empty) {
        // Keep the warning open: the coach can retry or sign out anyway.
        setCounts((await readUnsyncedCounts()) ?? counts);
        showToast(t('cloudSync.pendingSync.signOutSyncFailed', 'Sync failed. You can still sign out - the changes stay on this device.'), 'error');
        return;
      }
    }
    setCounts(null);
    void signOut();
  }, [busy, counts, syncStatus.syncNow, signOut, showToast, t]);

  const signOutWarning = counts ? (
    <PendingSyncWarningModal
      purpose="signOut"
      pendingCount={counts.pendingCount}
      failedCount={counts.failedCount}
      isSyncing={busy || syncStatus.isSyncing}
      isOnline={syncStatus.isOnline}
      onAction={onAction}
    />
  ) : null;

  return { requestSignOut, signOutWarning };
}
