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
    let pollIntervalId: ReturnType<typeof setInterval> | null = null;
    let healthCheckIntervalId: ReturnType<typeof setInterval> | null = null;
    let isConnected = false;
    // Store reference to the engine we subscribed to, for detecting replacement
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let subscribedEngineRef: any = null;

    // Polling interval - keeps checking until engine is available
    // This handles the case where DataStore is initialized much later
    // (e.g., when React Query hooks first run)
    const POLL_INTERVAL_MS = 1000;

    // Health check interval - slower check to detect engine replacement
    // If the SyncEngine singleton is reset (e.g., during user transitions or mode changes),
    // our subscription dies silently because dispose() clears all listeners.
    // This health check detects that scenario and re-subscribes.
    const HEALTH_CHECK_INTERVAL_MS = 2000;

    const reconnect = () => {
      logger.info('[useSyncStatus] Reconnecting to sync engine');
      isConnected = false;
      subscribedEngineRef = null;

      // Clean up old subscription (it's already dead, but clear our reference)
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }

      // Reset state
      if (mounted) {
        setStatus(null);
        setIsInitialized(false);
      }

      // Restart polling to reconnect when new engine is created
      startPolling();
    };

    const tryConnectToEngine = async (): Promise<boolean> => {
      if (!mounted) return false;

      try {
        const { getSyncEngine, isSyncEngineInitialized } = await import('@/sync');

        // Check if engine exists without throwing
        if (!isSyncEngineInitialized()) {
          logger.debug('[useSyncStatus] Engine not initialized yet, will retry');
          return false;
        }

        const engine = getSyncEngine();

        // Get initial status
        const initialStatus = await engine.getStatus();
        if (mounted) {
          setStatus(initialStatus);
          setIsInitialized(true);
        }

        // Subscribe to status changes
        // Note: onStatusChange already emits current status to new subscribers
        unsubscribe = engine.onStatusChange((newStatus) => {
          if (mounted) {
            setStatus(newStatus);
          }
        });

        // Store reference to detect if engine gets replaced
        subscribedEngineRef = engine;
        isConnected = true;
        logger.info('[useSyncStatus] Successfully connected to sync engine');
        return true;
      } catch (error) {
        // Unexpected error - log but keep trying
        logger.warn('[useSyncStatus] Error connecting to sync engine:', error);
        return false;
      }
    };

    // Health check to detect engine replacement
    // The SyncEngine singleton can be reset during:
    // - User sign-out/sign-in transitions
    // - Mode changes (cloud ↔ local)
    // - DataStore re-initialization
    // When reset, dispose() clears all listeners, leaving us subscribed to nothing.
    // CRITICAL: Must check if the SAME engine we subscribed to is still the singleton,
    // not just if AN engine exists. Engine A can be disposed and Engine B created,
    // making isSyncEngineInitialized() return true while we're subscribed to dead Engine A.
    const startHealthCheck = () => {
      healthCheckIntervalId = setInterval(async () => {
        if (!mounted || !isConnected) return;

        try {
          const { getSyncEngine, isSyncEngineInitialized } = await import('@/sync');

          if (!isSyncEngineInitialized()) {
            // Engine was disposed! Our subscription is dead.
            logger.info('[useSyncStatus] Health check: engine was disposed, re-connecting');
            reconnect();
            return;
          }

          // Engine exists - but is it the same one we subscribed to?
          const currentEngine = getSyncEngine();
          if (currentEngine !== subscribedEngineRef) {
            // Engine was replaced! Our subscription is to the old (dead) engine.
            logger.info('[useSyncStatus] Health check: engine was replaced, re-connecting');
            reconnect();
            return;
          }
        } catch (error) {
          logger.warn('[useSyncStatus] Health check error:', error);
        }
      }, HEALTH_CHECK_INTERVAL_MS);
    };

    const startPolling = async () => {
      // Stop health check while polling (will restart after connection)
      if (healthCheckIntervalId !== null) {
        clearInterval(healthCheckIntervalId);
        healthCheckIntervalId = null;
      }

      // Try immediately first
      const connected = await tryConnectToEngine();

      // If not connected, start polling interval
      if (!connected && mounted) {
        logger.debug('[useSyncStatus] Starting poll interval for sync engine');
        pollIntervalId = setInterval(async () => {
          const success = await tryConnectToEngine();
          if (success && pollIntervalId !== null) {
            // Successfully connected - stop polling, start health check
            clearInterval(pollIntervalId);
            pollIntervalId = null;
            startHealthCheck();
          }
        }, POLL_INTERVAL_MS);
      } else if (connected && mounted) {
        // Connected immediately - start health check
        startHealthCheck();
      }
    };

    startPolling();

    return () => {
      mounted = false;
      if (pollIntervalId !== null) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
      if (healthCheckIntervalId !== null) {
        clearInterval(healthCheckIntervalId);
        healthCheckIntervalId = null;
      }
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [mode, user?.id]);

  // Refresh status when app resumes from background
  // This fixes state inconsistency between multiple hook instances (e.g., field indicator vs settings modal)
  // when the app returns from background - some instances may have stale state
  useEffect(() => {
    if (mode !== 'cloud') return;

    const handleAppResume = async () => {
      logger.debug('[useSyncStatus] App resumed - refreshing sync status');
      try {
        const { getSyncEngine, isSyncEngineInitialized } = await import('@/sync');

        if (!isSyncEngineInitialized()) {
          logger.debug('[useSyncStatus] Engine not initialized on resume');
          return;
        }

        const engine = getSyncEngine();
        const currentStatus = await engine.getStatus();
        setStatus(currentStatus);
        logger.debug('[useSyncStatus] Status refreshed on app resume', { state: currentStatus.state });
      } catch (error) {
        logger.warn('[useSyncStatus] Failed to refresh status on resume:', error);
      }
    };

    // Listen for custom 'app-resume' event dispatched by useAppResume hook
    window.addEventListener('app-resume', handleAppResume);

    return () => {
      window.removeEventListener('app-resume', handleAppResume);
    };
  }, [mode]);

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
