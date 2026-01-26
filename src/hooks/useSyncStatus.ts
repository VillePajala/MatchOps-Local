/**
 * Hook for monitoring sync status
 *
 * Provides real-time sync status information for cloud mode.
 * In local mode, returns a static "local" status.
 *
 * @see docs/03-active-plans/local-first-sync-plan.md
 */

import { useState, useEffect, useCallback } from 'react';
import { getBackendMode } from '@/config/backendConfig';
import type { SyncStatusInfo, SyncStatusState } from '@/sync/types';
import logger from '@/utils/logger';

/**
 * Extended sync status for UI components
 */
export interface UseSyncStatusResult {
  /** Current backend mode */
  mode: 'local' | 'cloud';

  /** Sync status state */
  state: SyncStatusState | 'local';

  /** Number of pending operations */
  pendingCount: number;

  /** Number of failed operations */
  failedCount: number;

  /** Timestamp of last successful sync */
  lastSyncedAt: number | null;

  /** Whether device is online */
  isOnline: boolean;

  /** Whether sync is currently in progress */
  isSyncing: boolean;

  /** Trigger a manual sync */
  syncNow: () => Promise<void>;

  /** Retry failed operations */
  retryFailed: () => Promise<void>;

  /** Clear failed operations */
  clearFailed: () => Promise<void>;
}

// Default status for local mode
const LOCAL_MODE_STATUS: UseSyncStatusResult = {
  mode: 'local',
  state: 'local',
  pendingCount: 0,
  failedCount: 0,
  lastSyncedAt: null,
  isOnline: true,
  isSyncing: false,
  syncNow: async () => {},
  retryFailed: async () => {},
  clearFailed: async () => {},
};

/**
 * Hook to monitor and control sync status
 *
 * @returns Sync status information and control functions
 */
export function useSyncStatus(): UseSyncStatusResult {
  const [mode] = useState(() => getBackendMode());
  const [status, setStatus] = useState<SyncStatusInfo | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize and subscribe to status changes
  useEffect(() => {
    // Only subscribe in cloud mode
    if (mode !== 'cloud') {
      setIsInitialized(true);
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let mounted = true;

    const initSync = async () => {
      try {
        const { getSyncEngine } = await import('@/sync');
        const engine = getSyncEngine();

        // Get initial status
        const initialStatus = await engine.getStatus();
        if (mounted) {
          setStatus(initialStatus);
          setIsInitialized(true);
        }

        // Subscribe to status changes
        unsubscribe = engine.onStatusChange((newStatus) => {
          if (mounted) {
            setStatus(newStatus);
          }
        });
      } catch (error) {
        logger.warn('[useSyncStatus] Failed to initialize sync status:', error);
        if (mounted) {
          setIsInitialized(true);
        }
      }
    };

    initSync();

    return () => {
      mounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [mode]);

  // Sync now action
  const syncNow = useCallback(async () => {
    if (mode !== 'cloud') return;

    try {
      const { getSyncEngine } = await import('@/sync');
      const engine = getSyncEngine();
      await engine.processQueue();
    } catch (error) {
      logger.error('[useSyncStatus] Sync now failed:', error);
    }
  }, [mode]);

  // Retry failed operations
  const retryFailed = useCallback(async () => {
    if (mode !== 'cloud') return;

    try {
      const { getSyncEngine } = await import('@/sync');
      const engine = getSyncEngine();
      await engine.retryFailed();
    } catch (error) {
      logger.error('[useSyncStatus] Retry failed:', error);
    }
  }, [mode]);

  // Clear failed operations
  const clearFailed = useCallback(async () => {
    if (mode !== 'cloud') return;

    try {
      const { getSyncEngine } = await import('@/sync');
      const engine = getSyncEngine();
      await engine.clearFailed();
    } catch (error) {
      logger.error('[useSyncStatus] Clear failed:', error);
    }
  }, [mode]);

  // Return local mode status
  if (mode !== 'cloud') {
    return LOCAL_MODE_STATUS;
  }

  // Return loading state while initializing
  if (!isInitialized || !status) {
    return {
      mode: 'cloud',
      state: 'synced',
      pendingCount: 0,
      failedCount: 0,
      lastSyncedAt: null,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      isSyncing: false,
      syncNow,
      retryFailed,
      clearFailed,
    };
  }

  return {
    mode: 'cloud',
    state: status.state,
    pendingCount: status.pendingCount,
    failedCount: status.failedCount,
    lastSyncedAt: status.lastSyncedAt,
    isOnline: status.isOnline,
    isSyncing: status.state === 'syncing',
    syncNow,
    retryFailed,
    clearFailed,
  };
}
