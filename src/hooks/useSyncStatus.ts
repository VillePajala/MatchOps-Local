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
import { useAuth } from '@/contexts/AuthProvider';
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

  /** Whether sync is manually paused by user */
  isPaused: boolean;

  /** Whether sync status is still initializing (state may not reflect actual status yet) */
  isLoading: boolean;

  /** Whether cloud backend is connected (executor set). If false, sync won't work. */
  cloudConnected: boolean;

  /** Trigger a manual sync */
  syncNow: () => Promise<void>;

  /** Retry failed operations */
  retryFailed: () => Promise<void>;

  /** Clear failed operations */
  clearFailed: () => Promise<void>;

  /** Force retry ALL stuck operations (ignores backoff) */
  forceRetryAll: () => Promise<void>;

  /** Pause sync processing (operations still queued but not processed) */
  pause: () => Promise<void>;

  /** Resume sync processing after pause */
  resume: () => Promise<void>;
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
  isPaused: false,
  isLoading: false,
  cloudConnected: true, // N/A for local mode, but true to avoid warnings
  syncNow: async () => {},
  retryFailed: async () => {},
  clearFailed: async () => {},
  forceRetryAll: async () => {},
  pause: async () => {},
  resume: async () => {},
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
  const { user } = useAuth();

  // Initialize and subscribe to status changes
  // Re-initialize when user changes to connect to the new SyncEngine
  useEffect(() => {
    // Only subscribe in cloud mode
    if (mode !== 'cloud') {
      setIsInitialized(true);
      return;
    }

    // Reset state when user changes
    setStatus(null);
    setIsInitialized(false);

    let unsubscribe: (() => void) | null = null;
    let mounted = true;

    const initSync = async () => {
      // Retry logic: engine may not exist yet if DataStore hasn't been initialized
      const MAX_RETRIES = 10;
      const RETRY_DELAY_MS = 500;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (!mounted) return;

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

          // Success - exit retry loop
          return;
        } catch (error) {
          // Engine not ready yet - retry after delay
          if (attempt < MAX_RETRIES - 1) {
            logger.debug('[useSyncStatus] Engine not ready, retrying...', { attempt: attempt + 1 });
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          } else {
            logger.warn('[useSyncStatus] Failed to initialize sync status after retries:', error);
            if (mounted) {
              setIsInitialized(true);
            }
          }
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
  }, [mode, user?.id]);

  // Sync now action - forces immediate sync, ignoring backoff delays
  // When user clicks "Sync Now", they expect it to happen NOW
  const syncNow = useCallback(async () => {
    if (mode !== 'cloud') return;

    logger.info('[useSyncStatus] Sync Now clicked');
    try {
      const { getSyncEngine } = await import('@/sync');
      const engine = getSyncEngine();
      logger.info('[useSyncStatus] Calling forceRetryAll on engine');
      await engine.forceRetryAll();
      logger.info('[useSyncStatus] forceRetryAll completed');
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

  // Force retry ALL stuck operations (ignores backoff)
  const forceRetryAll = useCallback(async () => {
    if (mode !== 'cloud') return;

    try {
      const { getSyncEngine } = await import('@/sync');
      const engine = getSyncEngine();
      await engine.forceRetryAll();
    } catch (error) {
      logger.error('[useSyncStatus] Force retry all failed:', error);
    }
  }, [mode]);

  // Pause sync processing
  const pause = useCallback(async () => {
    if (mode !== 'cloud') return;

    try {
      const { getSyncEngine, isSyncEngineInitialized } = await import('@/sync');
      // Guard: Only pause if engine is initialized (prevents error during startup)
      if (!isSyncEngineInitialized()) {
        logger.debug('[useSyncStatus] Pause skipped - engine not initialized yet');
        return;
      }
      const engine = getSyncEngine();
      engine.pause();
    } catch (error) {
      logger.error('[useSyncStatus] Pause failed:', error);
    }
  }, [mode]);

  // Resume sync processing
  const resume = useCallback(async () => {
    if (mode !== 'cloud') return;

    try {
      const { getSyncEngine, isSyncEngineInitialized } = await import('@/sync');
      // Guard: Only resume if engine is initialized (prevents error during startup)
      if (!isSyncEngineInitialized()) {
        logger.debug('[useSyncStatus] Resume skipped - engine not initialized yet');
        return;
      }
      const engine = getSyncEngine();
      engine.resume();
    } catch (error) {
      logger.error('[useSyncStatus] Resume failed:', error);
    }
  }, [mode]);

  // Return local mode status
  if (mode !== 'cloud') {
    return LOCAL_MODE_STATUS;
  }

  // Return loading state while initializing
  // Note: state defaults to 'synced' but isLoading=true indicates actual status is unknown
  if (!isInitialized || !status) {
    return {
      mode: 'cloud',
      state: 'synced',
      pendingCount: 0,
      failedCount: 0,
      lastSyncedAt: null,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      isSyncing: false,
      isPaused: false,
      isLoading: true,
      cloudConnected: false, // Unknown while loading
      syncNow,
      retryFailed,
      clearFailed,
      forceRetryAll,
      pause,
      resume,
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
    isPaused: status.isPaused ?? false,
    isLoading: false,
    cloudConnected: status.cloudConnected ?? false,
    syncNow,
    retryFailed,
    clearFailed,
    forceRetryAll,
    pause,
    resume,
  };
}
