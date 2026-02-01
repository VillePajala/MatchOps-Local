/**
 * SyncEngine - Background Sync Processor
 *
 * Processes the SyncQueue in the background, syncing operations to the cloud
 * when online. Handles retry logic, online/offline detection, and status updates.
 *
 * @see docs/03-active-plans/local-first-sync-plan.md
 */

import logger from '@/utils/logger';
import * as Sentry from '@sentry/nextjs';
import { SyncQueue } from './SyncQueue';
import {
  SyncOperation,
  SyncStatusState,
  SyncStatusInfo,
  SyncEngineConfig,
  SyncEntityType,
  DEFAULT_SYNC_CONFIG,
  SyncError,
  SyncErrorCode,
} from './types';
import { AuthError } from '@/interfaces/DataStoreErrors';

/**
 * Callback type for sync operations.
 * Executes the actual sync to the cloud store.
 */
export type SyncOperationExecutor = (op: SyncOperation) => Promise<void>;

/**
 * Event listener callback types.
 */
type StatusChangeListener = (info: SyncStatusInfo) => void;
type OperationCompleteListener = (opId: string, entityType: SyncEntityType, entityId: string) => void;
type OperationFailedListener = (opId: string, error: string, willRetry: boolean) => void;

/**
 * SyncEngine - Manages background synchronization of queued operations.
 *
 * Features:
 * - Processes queue when online
 * - Pauses automatically when offline
 * - Emits status events for UI
 * - Configurable sync interval
 * - Nudge for immediate sync after local write
 */
export class SyncEngine {
  private queue: SyncQueue;
  private executor: SyncOperationExecutor | null = null;
  private config: SyncEngineConfig;

  private isRunning = false;
  private isSyncing = false;
  private isPaused = false; // User-initiated pause - operations queued but not processed
  private isResettingStale = false; // Blocks processing until stale reset completes
  private staleResetFailed = false; // True if stale reset failed - operations may be stuck
  private staleResetRetryCount = 0; // Counter for periodic retry attempts
  private pendingStatusEmit = false; // Coalesces rapid status change emissions
  private statusEmitRequested = false; // Tracks if another status change occurred during emission
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isOnline = true;
  private lastSyncedAt: number | null = null;
  private isDisposing = false; // True when dispose() is in progress

  // Event listener references for cleanup
  private boundOnlineHandler: (() => void) | null = null;
  private boundOfflineHandler: (() => void) | null = null;

  // Event listeners
  private statusListeners: Set<StatusChangeListener> = new Set();
  private completeListeners: Set<OperationCompleteListener> = new Set();
  private failedListeners: Set<OperationFailedListener> = new Set();

  constructor(queue: SyncQueue, config: Partial<SyncEngineConfig> = {}) {
    this.queue = queue;
    this.config = { ...DEFAULT_SYNC_CONFIG, ...config };

    // Initialize online state
    if (typeof navigator !== 'undefined') {
      this.isOnline = navigator.onLine;
    }
  }

  /**
   * Set the executor function that performs actual cloud sync.
   * Can be called before or after start().
   * If engine is already running, triggers immediate queue processing.
   */
  setExecutor(executor: SyncOperationExecutor): void {
    const hadExecutor = this.executor !== null;
    this.executor = executor;
    logger.info('[SyncEngine] Executor set', { hadExecutor, isRunning: this.isRunning });

    // If engine is already running and we just got an executor, process queue immediately
    // This handles the case where start() was called before setExecutor() (background cloud init)
    if (this.isRunning && !hadExecutor) {
      logger.info('[SyncEngine] Executor now available, triggering queue processing');
      this.doProcessQueue().catch((e) => {
        logger.error('[SyncEngine] Error processing queue after executor set:', e);
      });
    }
  }

  /**
   * Start the background sync engine.
   * Begins periodic sync and listens for online/offline events.
   */
  start(): void {
    if (this.isRunning) {
      logger.debug('[SyncEngine] Already running');
      return;
    }

    logger.info('[SyncEngine] Starting sync engine', {
      hasExecutor: this.executor !== null,
      isOnline: this.isOnline,
      queueInitialized: this.queue?.isInitialized() ?? false,
    });
    this.isRunning = true;

    // Refresh online state - browser may have come online after construction
    // but before event listeners are attached. See test 'should refresh online state on start'
    if (typeof navigator !== 'undefined') {
      this.isOnline = navigator.onLine;
    }

    // Set up online/offline listeners with stored references for cleanup
    if (typeof window !== 'undefined') {
      this.boundOnlineHandler = this.handleOnline;
      this.boundOfflineHandler = this.handleOffline;
      window.addEventListener('online', this.boundOnlineHandler);
      window.addEventListener('offline', this.boundOfflineHandler);
    }

    // Reset any operations stuck in 'syncing' state from previous crash/close
    // CRITICAL: Block processing AND interval setup until reset completes
    // This prevents race conditions between reset and queue processing
    this.isResettingStale = true;
    this.staleResetFailed = false;
    this.queue
      .resetStaleSyncing()
      .catch((e) => {
        logger.error('[SyncEngine] Failed to reset stale syncing operations:', e);
        // Report to Sentry - stale reset failure may leave operations stuck
        try {
          Sentry.captureException(e, {
            tags: { component: 'SyncEngine', action: 'resetStaleSyncing' },
            level: 'error',
          });
        } catch {
          // Sentry failure must not prevent engine startup
        }
        // Track that reset failed - operations may be stuck in 'syncing' state
        this.staleResetFailed = true;
        // Emit status change so UI can show warning about potential sync issues
        this.emitStatusChange();
      })
      .finally(() => {
        this.isResettingStale = false;

        // Check if stop() was called while stale reset was pending
        // If so, don't create interval - prevents interval leak
        if (!this.isRunning) {
          logger.debug('[SyncEngine] stop() called during stale reset, skipping interval setup');
          return;
        }

        // Start periodic sync AFTER stale reset completes (or fails)
        // This prevents race conditions between reset and interval processing
        this.intervalId = setInterval(() => {
          this.doProcessQueue();
        }, this.config.syncIntervalMs);

        // Sync immediately if online AND reset succeeded
        // If stale reset failed, don't process - operations may be stuck
        if (this.isOnline && !this.staleResetFailed) {
          this.doProcessQueue();
        }
      });

    this.emitStatusChange();
  }

  /**
   * Stop the background sync engine.
   */
  stop(): void {
    if (!this.isRunning) {
      logger.debug('[SyncEngine] Not running');
      return;
    }

    logger.info('[SyncEngine] Stopping sync engine');
    this.isRunning = false;

    // Clear interval
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Remove listeners - handle each independently in case one is null
    if (typeof window !== 'undefined') {
      if (this.boundOnlineHandler) {
        window.removeEventListener('online', this.boundOnlineHandler);
        this.boundOnlineHandler = null;
      }
      if (this.boundOfflineHandler) {
        window.removeEventListener('offline', this.boundOfflineHandler);
        this.boundOfflineHandler = null;
      }
    }

    this.emitStatusChange();
  }

  /** Promise deduplication for dispose() to handle concurrent callers */
  private disposePromise: Promise<void> | null = null;

  /**
   * Clean up all resources. Call this before discarding the engine instance.
   * Stops the engine, waits for in-flight operations, and clears all listeners.
   *
   * Uses promise deduplication to ensure concurrent dispose() calls wait for
   * the same disposal operation rather than returning immediately.
   */
  async dispose(): Promise<void> {
    // Promise deduplication: concurrent callers wait for the same dispose operation
    if (this.disposePromise) {
      logger.debug('[SyncEngine] Already disposing, waiting for completion');
      return this.disposePromise;
    }

    this.disposePromise = this.performDispose();
    try {
      return await this.disposePromise;
    } finally {
      this.disposePromise = null;
    }
  }

  /**
   * Internal dispose implementation.
   */
  private async performDispose(): Promise<void> {
    if (this.isDisposing) {
      logger.debug('[SyncEngine] Already in dispose process');
      return;
    }
    this.isDisposing = true;

    // Stop accepting new work
    this.stop();

    // Wait for any in-flight sync operations to complete (max 5 seconds)
    const MAX_WAIT_MS = 5000;
    const POLL_INTERVAL_MS = 100;
    let waited = 0;
    while (this.isSyncing && waited < MAX_WAIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      waited += POLL_INTERVAL_MS;
    }

    if (this.isSyncing) {
      logger.warn('[SyncEngine] Dispose timeout - sync operation still in progress');
      // Track in Sentry - timeout during dispose could indicate hung operations
      try {
        Sentry.captureMessage('SyncEngine dispose timeout - sync still in progress', {
          tags: { component: 'SyncEngine', action: 'dispose-timeout' },
          level: 'warning',
        });
      } catch {
        // Sentry failure must not prevent dispose completion
      }
    }

    // Clear all listeners
    this.statusListeners.clear();
    this.completeListeners.clear();
    this.failedListeners.clear();
    this.isDisposing = false;
  }

  /**
   * Trigger an immediate sync attempt.
   * Use this after enqueuing an operation to sync sooner than the next interval.
   * Always emits status change so UI reflects pending operations immediately.
   */
  nudge(): void {
    // ALWAYS emit status change when nudged - this ensures UI shows pending
    // operations immediately, even if we can't process them right now
    this.emitStatusChange();

    if (!this.isRunning) {
      logger.debug('[SyncEngine] Not running, nudge ignored (status emitted)');
      return;
    }

    if (this.isPaused) {
      logger.debug('[SyncEngine] Paused, nudge ignored (status emitted)');
      return;
    }

    if (this.isResettingStale) {
      logger.debug('[SyncEngine] Stale reset in progress, nudge ignored (status emitted)');
      return;
    }

    if (!this.isOnline) {
      logger.debug('[SyncEngine] Offline, nudge ignored (status emitted)');
      return;
    }

    logger.debug('[SyncEngine] Nudge received, processing queue');
    this.doProcessQueue();
  }

  /**
   * Pause sync processing. Operations continue to be queued but won't be
   * processed until resume() is called. Use for user-initiated pause.
   */
  pause(): void {
    if (this.isPaused) {
      logger.debug('[SyncEngine] Already paused');
      return;
    }

    logger.info('[SyncEngine] Pausing sync');
    this.isPaused = true;
    this.emitStatusChange();
  }

  /**
   * Resume sync processing after a pause.
   * Immediately processes any queued operations.
   */
  resume(): void {
    if (!this.isPaused) {
      logger.debug('[SyncEngine] Not paused');
      return;
    }

    logger.info('[SyncEngine] Resuming sync');
    this.isPaused = false;
    this.emitStatusChange();

    // Process queue immediately if conditions allow
    if (this.isRunning && this.isOnline && !this.isResettingStale) {
      this.doProcessQueue();
    }
  }

  /**
   * Check if sync is currently paused.
   */
  getIsPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Get the current sync status.
   */
  async getStatus(): Promise<SyncStatusInfo> {
    const stats = await this.queue.getStats();

    let state: SyncStatusState;
    if (!this.isOnline) {
      state = 'offline';
    } else if (this.isSyncing) {
      state = 'syncing';
    } else if (stats.failed > 0) {
      state = 'error';
    } else if (stats.pending > 0 || stats.syncing > 0) {
      state = 'pending';
    } else {
      state = 'synced';
    }

    return {
      state,
      pendingCount: stats.pending + stats.syncing,
      failedCount: stats.failed,
      lastSyncedAt: this.lastSyncedAt,
      isOnline: this.isOnline,
      hasStaleResetFailure: this.staleResetFailed,
      cloudConnected: this.executor !== null,
      isPaused: this.isPaused,
    };
  }

  /**
   * Subscribe to status changes.
   */
  onStatusChange(listener: StatusChangeListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /**
   * Subscribe to operation completion events.
   */
  onOperationComplete(listener: OperationCompleteListener): () => void {
    this.completeListeners.add(listener);
    return () => this.completeListeners.delete(listener);
  }

  /**
   * Subscribe to operation failure events.
   */
  onOperationFailed(listener: OperationFailedListener): () => void {
    this.failedListeners.add(listener);
    return () => this.failedListeners.delete(listener);
  }

  /**
   * Check if the engine is currently running.
   * @returns true if start() has been called and stop() has not
   */
  isEngineRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Check if the engine is currently processing operations.
   * @returns true if actively syncing a batch of operations
   */
  isEngineSyncing(): boolean {
    return this.isSyncing;
  }

  /**
   * Check if the device is currently online.
   * @returns true if navigator.onLine is true and no offline event received
   */
  isCurrentlyOnline(): boolean {
    return this.isOnline;
  }

  /**
   * Manually trigger a sync.
   * Processes pending operations in the queue.
   */
  async processQueue(): Promise<void> {
    return this.doProcessQueue();
  }

  /**
   * Retry all failed operations.
   * Resets failed operations to pending status and triggers sync.
   */
  async retryFailed(): Promise<void> {
    const count = await this.queue.retryFailed();
    logger.info('[SyncEngine] Retrying failed operations', { count });
    this.emitStatusChange();
    if (count > 0 && this.isRunning) {
      // Fire-and-forget: don't await to avoid blocking the UI, but catch errors
      this.doProcessQueue().catch((e) => {
        logger.error('[SyncEngine] Error processing queue after retry:', e);
        // Track in Sentry - retry processing errors need production visibility
        try {
          Sentry.captureException(e, {
            tags: { component: 'SyncEngine', action: 'retryFailed-doProcessQueue' },
            level: 'error',
          });
        } catch {
          // Sentry failure is acceptable - error is already logged
        }
      });
    }
  }

  /**
   * Clear all failed operations from the queue.
   */
  async clearFailed(): Promise<void> {
    await this.queue.discardFailed();
    logger.info('[SyncEngine] Cleared failed operations');
    this.emitStatusChange();
  }

  /**
   * Force retry ALL stuck operations (both failed and pending in backoff).
   * Use this when user wants immediate sync without waiting for backoff.
   */
  async forceRetryAll(): Promise<void> {
    // DIAGNOSTIC: Log full engine state to help diagnose sync issues
    logger.info('[SyncEngine] Force retry all - ENGINE STATE', {
      isRunning: this.isRunning,
      isSyncing: this.isSyncing,
      isPaused: this.isPaused,
      isResettingStale: this.isResettingStale,
      staleResetFailed: this.staleResetFailed,
      isDisposing: this.isDisposing,
      isOnline: this.isOnline,
      hasExecutor: this.executor !== null,
      hasQueue: this.queue !== null,
      queueInitialized: this.queue?.isInitialized() ?? false,
      hasInterval: this.intervalId !== null,
    });

    // First, get all operations for diagnostics
    const allOps = await this.queue.getAllOperations();
    logger.info('[SyncEngine] Force retry all - current queue state', {
      total: allOps.length,
      pending: allOps.filter(o => o.status === 'pending').length,
      syncing: allOps.filter(o => o.status === 'syncing').length,
      failed: allOps.filter(o => o.status === 'failed').length,
    });

    // Reset failed operations to pending
    const failedCount = await this.queue.retryFailed();

    // Reset backoff on pending operations
    const pendingCount = await this.queue.forceRetryPending();

    logger.info('[SyncEngine] Force retry all complete', {
      failedReset: failedCount,
      pendingReset: pendingCount,
    });

    this.emitStatusChange();

    // Trigger immediate processing
    // ALWAYS call doProcessQueue when user clicks "Sync Now", not just when resets happen.
    // New operations have retryCount=0 and don't get counted by forceRetryPending(),
    // but they still need to be processed.
    if (this.isRunning) {
      this.doProcessQueue().catch((e) => {
        logger.error('[SyncEngine] Error processing queue after force retry:', e);
        try {
          Sentry.captureException(e, {
            tags: { component: 'SyncEngine', action: 'forceRetryAll-doProcessQueue' },
            level: 'error',
          });
        } catch {
          // Sentry failure is acceptable
        }
      });
    }
  }

  // ---- Private Methods ----

  private handleOnline = (): void => {
    logger.info('[SyncEngine] Online');
    this.isOnline = true;
    this.emitStatusChange();

    // Trigger sync when coming back online
    if (this.isRunning) {
      // CRITICAL: Must have .catch() to prevent unhandled rejection
      this.doProcessQueue().catch((e) => {
        logger.error('[SyncEngine] Error processing queue after coming online:', e);
        try {
          Sentry.captureException(e, {
            tags: { component: 'SyncEngine', action: 'handleOnline-processQueue' },
            level: 'error',
          });
        } catch {
          // Sentry failure is acceptable - error is already logged
        }
      });
    }
  };

  private handleOffline = (): void => {
    logger.info('[SyncEngine] Offline');
    this.isOnline = false;
    this.emitStatusChange();
  };

  private async doProcessQueue(): Promise<void> {
    // DIAGNOSTIC: Log entry point to track why processing might not happen
    // INFO level logging for production visibility - helps diagnose sync issues
    logger.info('[SyncEngine] doProcessQueue called', {
      isRunning: this.isRunning,
      isDisposing: this.isDisposing,
      isPaused: this.isPaused,
      isResettingStale: this.isResettingStale,
      staleResetFailed: this.staleResetFailed,
      isSyncing: this.isSyncing,
      isOnline: this.isOnline,
      hasExecutor: this.executor !== null,
      queueInitialized: this.queue?.isInitialized() ?? false,
    });

    // Block processing if engine is being disposed (prevents race with interval)
    if (this.isDisposing) {
      logger.debug('[SyncEngine] Disposing, skipping queue processing');
      return;
    }

    // Block processing if user has paused sync
    if (this.isPaused) {
      logger.debug('[SyncEngine] Paused by user, skipping queue processing');
      return;
    }

    // Block processing until stale reset completes (prevents race with interval)
    if (this.isResettingStale) {
      logger.debug('[SyncEngine] Waiting for stale reset to complete, skipping');
      return;
    }

    // CRITICAL: Block processing if stale reset failed, but periodically retry recovery
    // Operations stuck in 'syncing' status will never be picked up by getPending()
    // which only returns 'pending' operations. This would cause silent data loss.
    if (this.staleResetFailed) {
      this.staleResetRetryCount++;
      // Retry stale reset every 10 processing attempts (roughly every 10 * syncIntervalMs)
      if (this.staleResetRetryCount % 10 === 0) {
        logger.info('[SyncEngine] Attempting stale reset recovery...');
        try {
          await this.queue.resetStaleSyncing();
          this.staleResetFailed = false;
          this.staleResetRetryCount = 0;
          logger.info('[SyncEngine] Stale reset recovery succeeded');
          this.emitStatusChange();
          // Continue with processing below
        } catch (e) {
          logger.warn('[SyncEngine] Stale reset recovery failed:', e);
          // Track in Sentry - persistent stale reset failures could indicate IndexedDB issues
          try {
            Sentry.captureException(e, {
              tags: { component: 'SyncEngine', action: 'staleResetRecovery' },
              level: 'warning',
              extra: { retryCount: this.staleResetRetryCount },
            });
          } catch {
            // Sentry failure is acceptable - warning is already logged
          }
          return;
        }
      } else {
        logger.debug('[SyncEngine] Stale reset failed, blocking queue processing');
        return;
      }
    }

    // Guard against concurrent processing
    if (this.isSyncing) {
      logger.debug('[SyncEngine] Already syncing, skipping');
      return;
    }

    // Check online status
    if (!this.isOnline) {
      logger.debug('[SyncEngine] Offline, skipping sync');
      return;
    }

    // Check executor
    if (!this.executor) {
      logger.warn('[SyncEngine] No executor set, skipping sync');
      return;
    }

    // Check queue is initialized (guards against race condition during dispose)
    if (!this.queue.isInitialized()) {
      logger.warn('[SyncEngine] Queue not initialized, skipping sync');
      return;
    }

    this.isSyncing = true;
    this.emitStatusChange();

    try {
      // Get batch of pending operations
      const pending = await this.queue.getPending(this.config.batchSize);

      if (pending.length === 0) {
        logger.debug('[SyncEngine] No pending operations');
        this.lastSyncedAt = Date.now();
        return;
      }

      logger.debug('[SyncEngine] Processing batch', { count: pending.length });

      // Process each operation - executor is guaranteed non-null by guard above
      const executor = this.executor;
      for (const op of pending) {
        await this.processOperation(op, executor);

        // Emit status change after each operation
        this.emitStatusChange();

        // Check if we went offline during processing
        if (!this.isOnline) {
          logger.info('[SyncEngine] Went offline during sync, pausing');
          break;
        }
      }

      this.lastSyncedAt = Date.now();
    } catch (error) {
      logger.error('[SyncEngine] Error processing queue:', error);
      // Track in Sentry - unexpected queue processing errors need visibility
      try {
        Sentry.captureException(error, {
          tags: { component: 'SyncEngine', action: 'doProcessQueue' },
          level: 'error',
        });
      } catch {
        // Sentry failure is acceptable - error is already logged
      }
    } finally {
      this.isSyncing = false;
      this.emitStatusChange();
    }
  }

  private async processOperation(
    op: SyncOperation,
    executor: SyncOperationExecutor
  ): Promise<void> {
    const opInfo = `${op.operation} ${op.entityType}/${op.entityId}`;
    let markedSyncing = false;

    try {
      // Mark as syncing
      await this.queue.markSyncing(op.id);
      markedSyncing = true;

      // Execute the sync with timeout to prevent hung operations blocking all syncing
      const SYNC_TIMEOUT_MS = 30000; // 30 seconds per operation
      logger.debug(`[SyncEngine] Syncing: ${opInfo}`);

      // Use a timer ID to clear the timeout after executor completes (prevents memory leak)
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Sync operation timed out after ${SYNC_TIMEOUT_MS}ms`)), SYNC_TIMEOUT_MS);
      });

      try {
        await Promise.race([executor(op), timeoutPromise]);
      } finally {
        // Clear timeout to prevent memory leak when executor completes before timeout
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
      }

      // Mark as completed (removes from queue)
      await this.queue.markCompleted(op.id);
      logger.debug(`[SyncEngine] Completed: ${opInfo}`);

      // Emit completion event
      for (const listener of this.completeListeners) {
        try {
          listener(op.id, op.entityType, op.entityId);
        } catch (e) {
          logger.error('[SyncEngine] Error in complete listener:', e);
          // Track in Sentry - listener bugs could cause UI inconsistencies
          try {
            Sentry.captureException(e, {
              tags: { component: 'SyncEngine', action: 'completeListener' },
              level: 'error',
            });
          } catch {
            // Sentry failure is acceptable - error is already logged
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isAbortError = error instanceof Error && error.name === 'AbortError';

      // If we never marked as syncing, the operation wasn't ours to process
      // This can happen if another tab/process completed it, or it was deleted
      if (!markedSyncing) {
        logger.debug(`[SyncEngine] Skipping ${opInfo} - could not mark as syncing (may be processed elsewhere): ${errorMessage}`);
        return; // Don't emit failure events for operations we never owned
      }

      // AbortError is expected during page navigation, hot reload, or user-initiated cancellation
      // CRITICAL FIX: Don't count AbortError as a retry failure - just reset to pending.
      // The request was cancelled before completion, so it should be retried fresh.
      // This prevents operations from getting stuck when users navigate/refresh.
      // See Sentry MATCHOPS-LOCAL-24, MATCHOPS-LOCAL-1E
      if (isAbortError) {
        logger.debug(`[SyncEngine] Aborted: ${opInfo} (expected during navigation/reload) - resetting to pending`);
        try {
          // Reset to pending WITHOUT incrementing retry count
          // AbortError means the request was cancelled, not that it failed
          // Use incrementRetry: false so the operation gets a fresh retry
          const reset = await this.queue.resetOperationToPending(op.id, { incrementRetry: false });
          if (reset) {
            logger.debug(`[SyncEngine] Successfully reset aborted operation ${opInfo} to pending`);
          } else {
            // Operation not found - may have been deleted during abort, that's fine
            logger.debug(`[SyncEngine] Aborted operation ${opInfo} not found (may be already processed)`);
          }
        } catch (resetError) {
          // Best effort - if reset fails, the stale syncing recovery will catch it on next start
          logger.debug(`[SyncEngine] Could not reset aborted operation ${opInfo}:`, resetError);
        }
        // Don't emit failure events for aborts - they're not real failures
        return;
      }

      // AuthError is expected during app startup when sync engine starts before auth is ready
      // CRITICAL FIX: Don't count AuthError as a retry failure - reset to pending without penalty.
      // The session will be established soon, so the operation should retry fresh.
      // This prevents operations from failing permanently due to auth timing issues.
      // See Sentry MATCHOPS-LOCAL-3J
      const isAuthError = error instanceof AuthError ||
        (error instanceof Error && error.name === 'AuthError');
      if (isAuthError) {
        logger.debug(`[SyncEngine] Auth not ready: ${opInfo} - resetting to pending (will retry when auth is available)`);
        try {
          // Reset to pending WITHOUT incrementing retry count
          // Auth timing issues are not real failures - session just isn't ready yet
          const reset = await this.queue.resetOperationToPending(op.id, { incrementRetry: false });
          if (reset) {
            logger.debug(`[SyncEngine] Successfully reset auth-blocked operation ${opInfo} to pending`);
          } else {
            logger.debug(`[SyncEngine] Auth-blocked operation ${opInfo} not found (may be already processed)`);
          }
        } catch (resetError) {
          logger.debug(`[SyncEngine] Could not reset auth-blocked operation ${opInfo}:`, resetError);
        }
        // Don't emit failure events for auth timing issues - they're temporary
        return;
      }

      // All other errors are real failures
      {
        logger.warn(`[SyncEngine] Failed: ${opInfo} - ${errorMessage}`);

        // DIAGNOSTIC: Log full operation details to help identify why specific operations fail
        // This helps diagnose the "one item stuck" issue where most ops succeed but one fails
        logger.error('[SyncEngine] SYNC FAILURE DETAILS', {
          operationId: op.id,
          entityType: op.entityType,
          entityId: op.entityId,
          operation: op.operation,
          retryCount: op.retryCount,
          timestamp: op.timestamp,
          error: errorMessage,
          // Include data size to check for timeout issues with large entities
          dataSize: op.data ? JSON.stringify(op.data).length : 0,
        });
      }

      try {
        // Mark as failed
        await this.queue.markFailed(op.id, errorMessage);
      } catch (markError) {
        // CRITICAL: markFailed itself failed - operation is stuck in 'syncing' state
        // Attempt emergency reset to 'pending' to prevent data loss
        logger.error(`[SyncEngine] markFailed threw for ${opInfo}, attempting emergency reset:`, markError);
        try {
          const reset = await this.queue.resetOperationToPending(op.id);
          if (reset) {
            logger.info(`[SyncEngine] Emergency reset succeeded for ${opInfo}`);
          } else {
            logger.error(`[SyncEngine] Emergency reset failed - operation ${op.id} may be stuck`);
          }
        } catch (resetError) {
          // At this point, the operation is likely stuck. Log prominently.
          logger.error(`[SyncEngine] CRITICAL: Operation ${op.id} stuck in syncing state - manual intervention may be required:`, resetError);
          // Report to Sentry - stuck operation is critical and requires attention
          try {
            Sentry.captureException(resetError, {
              tags: { component: 'SyncEngine', action: 'emergencyReset', severity: 'critical' },
              extra: {
                operationId: op.id,
                entityType: op.entityType,
                entityId: op.entityId,
                operation: op.operation,
              },
              level: 'fatal',
            });
          } catch {
            // Sentry failure is acceptable - critical error is already logged
          }
        }
      }

      // Check if will retry
      const updatedOp = await this.queue.getById(op.id);
      const willRetry = updatedOp?.status === 'pending'; // Back to pending = will retry

      // Emit failure event
      for (const listener of this.failedListeners) {
        try {
          listener(op.id, errorMessage, willRetry);
        } catch (e) {
          logger.error('[SyncEngine] Error in failed listener:', e);
          // Track in Sentry - listener bugs could cause UI inconsistencies
          try {
            Sentry.captureException(e, {
              tags: { component: 'SyncEngine', action: 'failedListener' },
              level: 'error',
            });
          } catch {
            // Sentry failure is acceptable - error is already logged
          }
        }
      }
    }
  }

  private emitStatusChange(): void {
    // Track that a status change was requested
    this.statusEmitRequested = true;

    // If already emitting, the current emission will check statusEmitRequested and re-emit
    if (this.pendingStatusEmit) {
      return;
    }

    this.doEmitStatus();
  }

  private doEmitStatus(): void {
    this.pendingStatusEmit = true;
    this.statusEmitRequested = false;

    // Fire and forget - don't block callers, handle errors gracefully
    this.getStatus()
      .then((status) => {
        for (const listener of this.statusListeners) {
          try {
            listener(status);
          } catch (e) {
            logger.error('[SyncEngine] Error in status listener:', e);
            // Track in Sentry - listener bugs could cause UI inconsistencies
            try {
              Sentry.captureException(e, {
                tags: { component: 'SyncEngine', action: 'statusListener' },
                level: 'error',
              });
            } catch {
              // Sentry failure is acceptable - error is already logged
            }
          }
        }
      })
      .catch((e) => {
        // Unexpected - queue should be initialized when engine is running
        logger.warn('[SyncEngine] Could not emit status change:', e);
        // Track in Sentry - this is unexpected and could cause stale UI state
        try {
          Sentry.captureException(e, {
            tags: { component: 'SyncEngine', action: 'doEmitStatus' },
            level: 'warning',
          });
        } catch {
          // Sentry failure is acceptable - warning is already logged
        }
      })
      .finally(() => {
        this.pendingStatusEmit = false;
        // If another status change occurred during emission, re-emit with latest status
        // Use queueMicrotask to break potential recursion and prevent stack overflow
        if (this.statusEmitRequested) {
          queueMicrotask(() => this.doEmitStatus());
        }
      });
  }
}

/**
 * Singleton instance for the application.
 * Initialize with queue before use.
 */
let syncEngineInstance: SyncEngine | null = null;

/**
 * Get or create the singleton SyncEngine instance.
 */
export function getSyncEngine(queue?: SyncQueue): SyncEngine {
  if (!syncEngineInstance) {
    if (!queue) {
      throw new SyncError(
        SyncErrorCode.NOT_INITIALIZED,
        'SyncEngine not initialized. Provide SyncQueue on first call.'
      );
    }
    syncEngineInstance = new SyncEngine(queue);
  }
  return syncEngineInstance;
}

/**
 * Reset the singleton (for testing and user transitions).
 * Calls dispose() to stop engine AND clear all listeners, preventing memory leaks.
 */
export async function resetSyncEngine(): Promise<void> {
  if (syncEngineInstance) {
    // CRITICAL: Null the singleton FIRST, then dispose.
    // This prevents race conditions where getSyncEngine() is called during disposal
    // and returns the old (disposing) engine with a closed queue.
    const engineToDispose = syncEngineInstance;
    syncEngineInstance = null;
    await engineToDispose.dispose();
  }
}
