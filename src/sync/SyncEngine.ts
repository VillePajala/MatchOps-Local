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
import { AuthError, StorageError } from '@/interfaces/DataStoreErrors';

/**
 * Callback type for sync operations.
 * Executes the actual sync to the cloud store.
 */
export type SyncOperationExecutor = (op: SyncOperation) => Promise<void>;

/**
 * Entity type processing priority for sync operations.
 * Parent entities (seasons, tournaments, teams) must be synced before
 * child entities (games, rosters, adjustments) to satisfy FK constraints.
 * Lower number = higher priority (processed first).
 */
const ENTITY_SYNC_PRIORITY: Record<SyncEntityType, number> = {
  player: 0,
  team: 1,
  season: 1,
  tournament: 1,
  personnel: 1,
  settings: 2,
  warmupPlan: 2,
  playtimePlan: 2,      // Self-contained blob, no FK to other entities
  playtimePlanLink: 4,  // References real games conceptually - after games
  playtimeGameSubs: 4,  // Same: keyed by real game id
  game: 3,        // Games reference seasons/tournaments/teams via FK
  teamRoster: 4,  // Rosters reference teams and players
  playerAdjustment: 4, // Adjustments reference games and players
};

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
  private consecutiveAuthFailures = 0;
  private isAuthPaused = false; // True when sync is paused due to repeated auth failures (session expired)
  private consecutiveAbortFailures = 0; // Tracks persistent AbortErrors (browser killing requests)
  private consecutiveServerFailures = 0; // Tracks 503/5xx errors for circuit breaker
  private isServerPaused = false; // True when sync is paused due to server overload (503s)
  private serverPauseUntil = 0; // Timestamp when server pause expires
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isOnline = true;
  private lastSyncedAt: number | null = null;
  private isDisposing = false; // True when dispose() is in progress
  private isDisposed = false;  // True after dispose() completes - permanent, prevents reuse

  // Event listener references for cleanup
  private boundOnlineHandler: (() => void) | null = null;
  private boundOfflineHandler: (() => void) | null = null;
  private boundAppResumeHandler: (() => void) | null = null;
  private boundVisibilityChangeHandler: (() => void) | null = null;

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
    // Guard: Reject operations on disposed engine
    if (this.isDisposed) {
      logger.warn('[SyncEngine] Cannot set executor - engine is disposed');
      return;
    }
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
    // Guard: Reject starting a disposed engine
    if (this.isDisposed) {
      logger.warn('[SyncEngine] Cannot start - engine is disposed');
      return;
    }
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
      this.boundAppResumeHandler = this.handleAppResume;
      this.boundVisibilityChangeHandler = this.handleVisibilityChange;
      window.addEventListener('online', this.boundOnlineHandler);
      window.addEventListener('offline', this.boundOfflineHandler);
      window.addEventListener('app-resume', this.boundAppResumeHandler);
      document.addEventListener('visibilitychange', this.boundVisibilityChangeHandler);
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
          this.doProcessQueue().catch((e) => {
            logger.error('[SyncEngine] Unexpected error in periodic queue processing:', e);
          });
        }, this.config.syncIntervalMs);

        // Sync immediately if online AND reset succeeded
        // If stale reset failed, don't process - operations may be stuck
        if (this.isOnline && !this.staleResetFailed) {
          this.doProcessQueue().catch((e) => {
            logger.error('[SyncEngine] Error in initial queue processing:', e);
          });
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
      if (this.boundAppResumeHandler) {
        window.removeEventListener('app-resume', this.boundAppResumeHandler);
        this.boundAppResumeHandler = null;
      }
      if (this.boundVisibilityChangeHandler) {
        document.removeEventListener('visibilitychange', this.boundVisibilityChangeHandler);
        this.boundVisibilityChangeHandler = null;
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
   *
   * @param options.skipWait - If true, don't wait for in-flight sync to complete.
   *                           Use during force-close scenarios (user switch) for faster cleanup.
   */
  async dispose(options: { skipWait?: boolean } = {}): Promise<void> {
    // Promise deduplication: concurrent callers wait for the same dispose operation
    if (this.disposePromise) {
      logger.debug('[SyncEngine] Already disposing, waiting for completion');
      return this.disposePromise;
    }

    this.disposePromise = this.performDispose(options);
    try {
      return await this.disposePromise;
    } finally {
      this.disposePromise = null;
    }
  }

  /**
   * Internal dispose implementation.
   */
  private async performDispose(options: { skipWait?: boolean } = {}): Promise<void> {
    if (this.isDisposed) {
      logger.debug('[SyncEngine] Already disposed');
      return;
    }
    if (this.isDisposing) {
      logger.debug('[SyncEngine] Already in dispose process');
      return;
    }
    this.isDisposing = true;

    // Stop accepting new work
    this.stop();

    // Wait for any in-flight sync operations to complete (max 5 seconds)
    // Skip waiting during force-close scenarios (user switch) for faster UX
    if (!options.skipWait) {
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
    } else if (this.isSyncing) {
      logger.info('[SyncEngine] Force dispose - skipping wait for in-flight sync');
    }

    // Clear all listeners
    this.statusListeners.clear();
    this.completeListeners.clear();
    this.failedListeners.clear();
    this.isDisposing = false;
    this.isDisposed = true;  // Mark permanently disposed - engine cannot be reused
    logger.info('[SyncEngine] Disposed');
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

    if (this.isAuthPaused) {
      logger.debug('[SyncEngine] Auth paused, nudge ignored (status emitted)');
      return;
    }

    if (this.isServerPaused) {
      logger.debug('[SyncEngine] Server paused, nudge ignored (status emitted)');
      return;
    }

    logger.debug('[SyncEngine] Nudge received, processing queue');
    this.doProcessQueue().catch((e) => {
      logger.error('[SyncEngine] Error processing queue after nudge:', e);
    });
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
    // Clear auth/abort pause if active — user is explicitly requesting sync
    const wasAuthPaused = this.isAuthPaused;
    if (wasAuthPaused) {
      logger.info('[SyncEngine] Clearing auth pause on resume');
      this.consecutiveAuthFailures = 0;
      this.isAuthPaused = false;
    }
    this.consecutiveAbortFailures = 0;

    if (!this.isPaused && !wasAuthPaused) {
      logger.debug('[SyncEngine] Not paused');
      return;
    }

    if (this.isPaused) {
      logger.info('[SyncEngine] Resuming sync');
      this.isPaused = false;
    }
    this.emitStatusChange();

    // Process queue immediately if conditions allow
    if (this.isRunning && this.isOnline && !this.isResettingStale) {
      this.doProcessQueue().catch((e) => {
        logger.error('[SyncEngine] Error processing queue after resume:', e);
      });
    }
  }

  /**
   * Check if sync is currently paused.
   */
  getIsPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Wait for any in-flight sync operation to finish (isSyncing → false).
   *
   * pause() only stops NEW processing; a batch already running keeps going until
   * it drains. Callers that are about to clear the queue or wipe cloud data must
   * await this AFTER pause() so an in-flight write can't land in a just-cleared
   * store (the pause-isn't-a-barrier race).
   *
   * @returns true if the engine became idle, false if the timeout elapsed.
   */
  async waitForIdle(timeoutMs = 5000): Promise<boolean> {
    // Tighter poll than dispose()'s 100ms loop — this gates user-facing bulk
    // import / clear-all, so we release as soon as the in-flight op finishes.
    const POLL_INTERVAL_MS = 50;
    let waited = 0;
    while (this.isSyncing && waited < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      waited += POLL_INTERVAL_MS;
    }
    if (this.isSyncing) {
      logger.warn('[SyncEngine] waitForIdle timed out - sync operation still in progress');
      return false;
    }
    return true;
  }

  /**
   * Get the current sync status.
   * Returns a safe default if queue is not yet initialized.
   */
  async getStatus(): Promise<SyncStatusInfo> {
    // Check if queue is initialized to avoid throwing during early lifecycle
    // (e.g., when doEmitStatus is called via queueMicrotask during engine creation)
    if (!this.queue.isInitialized()) {
      logger.debug('[SyncEngine] getStatus called before queue initialized, returning initializing state');
      return {
        state: 'synced', // Safe default - no operations yet
        pendingCount: 0,
        failedCount: 0,
        lastSyncedAt: this.lastSyncedAt,
        isOnline: this.isOnline,
        hasStaleResetFailure: false,
        cloudConnected: this.executor !== null,
        isPaused: this.isPaused,
        hasAuthFailure: this.isAuthPaused,
        hasServerFailure: this.isServerPaused,
      };
    }

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
      hasAuthFailure: this.isAuthPaused,
      hasServerFailure: this.isServerPaused,
    };
  }

  /**
   * Subscribe to status changes.
   * Immediately emits current status to new subscriber to prevent stale state.
   */
  onStatusChange(listener: StatusChangeListener): () => void {
    this.statusListeners.add(listener);

    // Emit current status immediately to new subscriber
    // This prevents race condition where subscriber gets initial status via getStatus(),
    // then status changes before subscription is active, leaving subscriber with stale state
    this.getStatus()
      .then((status) => {
        // Check listener is still subscribed (might have unsubscribed synchronously)
        if (this.statusListeners.has(listener)) {
          listener(status);
        }
      })
      .catch((e) => {
        logger.warn('[SyncEngine] Failed to emit initial status to new subscriber:', e);
      });

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
    // Clear all pause states — user is explicitly requesting sync
    if (this.isAuthPaused) {
      logger.info('[SyncEngine] Clearing auth pause on force retry');
      this.consecutiveAuthFailures = 0;
      this.isAuthPaused = false;
    }
    if (this.isServerPaused) {
      logger.info('[SyncEngine] Clearing server pause on force retry');
      this.consecutiveServerFailures = 0;
      this.isServerPaused = false;
      this.serverPauseUntil = 0;
    }
    this.consecutiveAbortFailures = 0;

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

  /**
   * Handle any foreground transition (visibilitychange → visible).
   * Resets abort counter on EVERY foreground transition, not just long backgrounds.
   * Chrome Mobile kills in-flight requests even on brief app switches (<30s),
   * so the abort counter must reset on every return to prevent accumulation
   * toward the persistent-abort failure threshold.
   */
  private handleVisibilityChange = (): void => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') {
      return;
    }

    // Reset abort counter — Chrome kills requests on ANY background transition,
    // not just long ones. Without this, quick app switches accumulate abort
    // failures and eventually mark operations as permanently failed.
    if (this.consecutiveAbortFailures > 0) {
      logger.info(`[SyncEngine] Visibility restored, resetting abort counter from ${this.consecutiveAbortFailures}`);
      this.consecutiveAbortFailures = 0;
    }
  };

  /**
   * Handle app resume from extended background (app-resume event, >30s).
   * Performs heavier recovery: clears server pause, refreshes online state,
   * and nudges the sync engine to retry pending operations immediately.
   * Without the nudge, the engine waits up to 30s for the next interval.
   */
  private handleAppResume = (): void => {
    logger.info('[SyncEngine] App resumed from extended background', {
      consecutiveAbortFailures: this.consecutiveAbortFailures,
      consecutiveServerFailures: this.consecutiveServerFailures,
      isServerPaused: this.isServerPaused,
    });

    // Abort counter already reset by handleVisibilityChange (fires first).
    // Safety net: also clear here for browsers where visibilitychange doesn't fire
    // before app-resume (e.g., Safari bfcache restore via pageshow without
    // preceding visibilitychange, or edge cases in WebView containers).
    if (this.consecutiveAbortFailures > 0) {
      this.consecutiveAbortFailures = 0;
    }

    // Clear server pause flags — the server may have recovered while app was backgrounded.
    // consecutiveServerFailures intentionally preserved so backoff continues from where
    // it left off if the server is still failing. Only reset on genuine success.
    if (this.isServerPaused) {
      logger.info('[SyncEngine] Clearing server pause on app resume');
      this.isServerPaused = false;
      this.serverPauseUntil = 0;
    }

    // Refresh online state from navigator (might have changed while backgrounded)
    if (typeof navigator !== 'undefined') {
      const wasOnline = this.isOnline;
      this.isOnline = navigator.onLine;
      if (!wasOnline && this.isOnline) {
        logger.info('[SyncEngine] Connectivity restored during background');
      }
    }

    this.emitStatusChange();

    // Nudge immediately to retry pending operations.
    // isServerPaused is cleared above, but check it explicitly so this guard
    // stays correct if the clearing logic changes (e.g., min-pause-on-resume).
    if (this.isRunning && this.isOnline && !this.isPaused && !this.isAuthPaused && !this.isServerPaused) {
      this.nudge();
    }
  };

  private async doProcessQueue(): Promise<void> {
    // DIAGNOSTIC: Log entry point to track why processing might not happen
    logger.debug('[SyncEngine] doProcessQueue called', {
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

    // Check auth pause
    if (this.isAuthPaused) {
      logger.debug('[SyncEngine] Auth paused (session expired), skipping sync');
      return;
    }

    // Circuit breaker: pause sync when server is overloaded (503s).
    // Prevents self-DDoS where aggressive retries exhaust PostgREST connection pool.
    if (this.isServerPaused) {
      const now = Date.now();
      if (now < this.serverPauseUntil) {
        const remainingSec = Math.ceil((this.serverPauseUntil - now) / 1000);
        logger.debug(`[SyncEngine] Server pause active, ${remainingSec}s remaining`);
        return;
      }
      // Pause expired — allow retry.
      // consecutiveServerFailures intentionally preserved — only reset on success.
      // This ensures backoff accumulates across pause cycles until the server genuinely recovers.
      logger.info('[SyncEngine] Server pause expired, resuming sync');
      this.isServerPaused = false;
      this.serverPauseUntil = 0;
      this.emitStatusChange();
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
        // DIAGNOSTIC: Check why no operations are ready when we expected some
        // This helps debug "sync spinning but nothing happens" issues
        const stats = await this.queue.getStats();
        if (stats.total > 0) {
          // There ARE operations, but none are ready - check why
          const allOps = await this.queue.getAllOperations();
          const now = Date.now();
          logger.debug('[SyncEngine] No pending operations ready, but queue is not empty', {
            total: stats.total,
            pending: stats.pending,
            syncing: stats.syncing,
            failed: stats.failed,
            operations: allOps.map(op => ({
              id: op.id.slice(0, 8),
              entityType: op.entityType,
              status: op.status,
              retryCount: op.retryCount,
              lastAttempt: op.lastAttempt,
              // Show time until ready if in backoff
              ...(op.status === 'pending' && op.retryCount > 0 && op.lastAttempt ? {
                backoffRemaining: Math.max(0, Math.round((op.lastAttempt + Math.min(1000 * Math.pow(2, op.retryCount - 1), 300000) - now) / 1000)) + 's',
              } : {}),
            })),
          });
        } else {
          logger.debug('[SyncEngine] No pending operations (queue empty)');
        }
        this.lastSyncedAt = Date.now();
        return;
      }

      // Sort by entity type priority: parent entities before children (FK constraints)
      pending.sort((a, b) =>
        (ENTITY_SYNC_PRIORITY[a.entityType] ?? 5) - (ENTITY_SYNC_PRIORITY[b.entityType] ?? 5)
      );

      logger.debug('[SyncEngine] Processing batch', {
        count: pending.length,
        operations: pending.map(op => ({
          id: op.id.slice(0, 8),
          entityType: op.entityType,
          operation: op.operation,
        })),
      });

      // Process each operation - executor is guaranteed non-null by guard above
      const executor = this.executor;
      for (const op of pending) {
        logger.debug('[SyncEngine] Starting operation', {
          id: op.id.slice(0, 8),
          entityType: op.entityType,
          entityId: op.entityId.slice(0, 8),
          operation: op.operation,
        });
        await this.processOperation(op, executor);

        // Emit status change after each operation
        this.emitStatusChange();

        // Check if we should stop processing the current batch
        if (!this.isOnline) {
          logger.info('[SyncEngine] Went offline during sync, pausing');
          break;
        }
        if (this.isServerPaused) {
          logger.info('[SyncEngine] Server circuit breaker tripped, stopping batch');
          break;
        }
        if (this.isPaused) {
          // User paused mid-batch (e.g. bulk push / clear-all). Stop now so the
          // barrier (waitForIdle) can release quickly without finishing the batch.
          logger.info('[SyncEngine] Paused mid-batch, stopping');
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

      // Check if new operations were queued during processing.
      // This handles the case where nudge() was called while isSyncing=true,
      // which would have been skipped. Without this, those operations would
      // wait for the next interval (up to 30 seconds).
      if (
        this.isRunning &&
        this.isOnline &&
        !this.isPaused &&
        !this.isDisposing &&
        !this.isResettingStale &&
        !this.staleResetFailed
      ) {
        // Use queueMicrotask to:
        // 1. Avoid deep recursion / stack overflow
        // 2. Allow event loop to process other tasks
        // 3. Ensure isSyncing=false is visible before re-check
        queueMicrotask(() => {
          // Use getPending(1) instead of getStats() for the re-check.
          // getStats() may return cached results that don't reflect operations
          // queued during processing, while getPending(1) always reads from the DB.
          this.queue
            .getPending(1)
            .then((pending) => {
              if (pending.length > 0) {
                logger.debug('[SyncEngine] Operations queued during processing, re-processing');
                this.doProcessQueue().catch((e) => {
                  logger.error('[SyncEngine] Error re-processing queue:', e);
                });
              }
            })
            .catch(() => {
              // Ignore errors in re-check - not critical
            });
        });
      }
    }
  }

  private async processOperation(
    op: SyncOperation,
    executor: SyncOperationExecutor
  ): Promise<void> {
    const opInfo = `${op.operation} ${op.entityType}/${op.entityId}`;
    let markedSyncing = false;

    try {
      // Mark as syncing — returns false if operation was already completed/removed
      markedSyncing = await this.queue.markSyncing(op.id);
      if (!markedSyncing) {
        logger.debug(`[SyncEngine] Operation ${opInfo} already completed/removed, skipping`);
        return;
      }

      // CR-H1: re-read after markSyncing — a concurrent enqueue can dedup-replace a
      // still-'pending' op's data under the same id between getPending() and here;
      // execute the fresh copy so markCompleted() can't drop the newer write.
      const freshOp = await this.queue.getById(op.id);
      const opToExecute = freshOp ?? op;

      // Execute the sync with timeout to prevent hung operations blocking all syncing
      // Note: 90 seconds needed for large games with many events/players/related data
      // and to account for potential cold starts on first request after inactivity.
      //
      // AbortController is used to signal timeout. While the underlying HTTP request
      // may not be directly abortable (the Supabase client doesn't accept external signals),
      // the AbortController ensures:
      // 1. The timeout produces a proper AbortError (consistent with navigation aborts)
      // 2. The operation is reset to pending (not counted as a failure) via abort handling
      // 3. If the orphaned request completes after timeout, data is saved (upsert behavior)
      //    and the retry succeeds quickly because data already exists
      const SYNC_TIMEOUT_MS = 90000; // 90 seconds per operation
      const execStartTime = Date.now();
      logger.info(`[SyncEngine] Marked syncing, executing: ${opInfo}`, {
        operationId: op.id.slice(0, 8),
        hasData: !!opToExecute.data,
      });

      // Use AbortController for timeout so the error is a proper AbortError,
      // which triggers the existing abort-handling path (reset to pending without retry penalty)
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        const elapsed = Date.now() - execStartTime;
        logger.warn(`[SyncEngine] Aborting operation after ${elapsed}ms timeout: ${opInfo}`);
        abortController.abort(new Error(`Sync operation timed out after ${elapsed}ms (limit: ${SYNC_TIMEOUT_MS}ms)`));
      }, SYNC_TIMEOUT_MS);

      try {
        // Race the executor against the abort signal
        await Promise.race([
          executor(opToExecute),
          new Promise<never>((_resolve, reject) => {
            // If already aborted (shouldn't happen, but defensive)
            if (abortController.signal.aborted) {
              reject(abortController.signal.reason);
              return;
            }
            abortController.signal.addEventListener('abort', () => {
              reject(abortController.signal.reason);
            }, { once: true });
          }),
        ]);
        const execDuration = Date.now() - execStartTime;
        logger.info(`[SyncEngine] Executor completed in ${execDuration}ms: ${opInfo}`);
      } finally {
        // Clear timeout to prevent memory leak when executor completes before timeout
        clearTimeout(timeoutId);
      }

      // Mark as completed (removes from queue)
      await this.queue.markCompleted(op.id);
      logger.info(`[SyncEngine] Completed successfully: ${opInfo}`);

      // Reset failure counters on success
      if (this.consecutiveAuthFailures > 0 || this.isAuthPaused) {
        logger.info(`[SyncEngine] Auth recovered after ${this.consecutiveAuthFailures} failures`);
        this.consecutiveAuthFailures = 0;
        this.isAuthPaused = false;
        this.emitStatusChange();
      }
      if (this.consecutiveServerFailures > 0 || this.isServerPaused) {
        logger.info(`[SyncEngine] Server recovered after ${this.consecutiveServerFailures} failures`);
        this.consecutiveServerFailures = 0;
        this.isServerPaused = false;
        this.serverPauseUntil = 0;
        this.emitStatusChange();
      }
      this.consecutiveAbortFailures = 0;

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
      // Detect AbortError or timeout: either directly thrown or wrapped in NetworkError
      // When fetch is aborted, Supabase client throws AbortError, but SupabaseDataStore
      // may wrap it in NetworkError with message "Failed to X: AbortError: signal is aborted..."
      // Timeouts from the SyncEngine AbortController also produce errors with "timed out" in the message.
      // See Sentry MATCHOPS-LOCAL-35, MATCHOPS-LOCAL-7G, MATCHOPS-LOCAL-7F
      const isAbortError = (error instanceof Error && error.name === 'AbortError') ||
        errorMessage.includes('AbortError') ||
        errorMessage.includes('signal is aborted') ||
        errorMessage.includes('Sync operation timed out');

      // If we never marked as syncing, the operation wasn't ours to process
      // This can happen if another tab/process completed it, or it was deleted
      if (!markedSyncing) {
        logger.info(`[SyncEngine] Skipping ${opInfo} - could not mark as syncing (may be processed elsewhere): ${errorMessage}`);
        return; // Don't emit failure events for operations we never owned
      }

      // AbortError/timeout handling: distinguish transient aborts (page navigation, hot reload)
      // from persistent aborts (browser killing requests due to battery saver, Doze mode, etc.).
      // First few aborts: reset to pending without retry penalty (handles navigation/reload).
      // After 5 consecutive aborts: increment retry count so the operation eventually fails
      // and stops looping. See Sentry MATCHOPS-LOCAL-87, MATCHOPS-LOCAL-24.
      if (isAbortError) {
        this.consecutiveAbortFailures++;
        const reason = errorMessage.includes('timed out') ? 'timeout' : 'abort';
        const isPersistent = this.consecutiveAbortFailures >= 5;

        if (isPersistent) {
          logger.warn(`[SyncEngine] Persistent abort (${this.consecutiveAbortFailures}x): ${opInfo} (${reason}) - incrementing retry count`);
        } else {
          logger.info(`[SyncEngine] Aborted (${this.consecutiveAbortFailures}/5): ${opInfo} (${reason}) - resetting to pending`);
        }

        try {
          // After 5 consecutive aborts, increment retry count so the operation
          // eventually hits maxRetries and gets marked as failed
          const reset = await this.queue.resetOperationToPending(op.id, { incrementRetry: isPersistent });
          if (reset) {
            logger.info(`[SyncEngine] Reset aborted operation ${opInfo} to pending (incrementRetry: ${isPersistent})`);
          } else {
            logger.info(`[SyncEngine] Aborted operation ${opInfo} not found (may be already processed)`);
          }
        } catch (resetError) {
          logger.info(`[SyncEngine] Could not reset aborted operation ${opInfo}:`, resetError);
        }
        return;
      }

      // AuthError handling: distinguish startup timing from session expiry.
      // During startup, auth may not be ready yet (1-2 failures then success).
      // A truly expired session produces 3+ consecutive auth failures.
      const isAuthError = error instanceof AuthError ||
        (error instanceof Error && error.name === 'AuthError');
      if (isAuthError) {
        this.consecutiveAuthFailures++;

        // After 3 consecutive auth failures, pause sync — session is likely expired
        if (this.consecutiveAuthFailures >= 3) {
          if (!this.isAuthPaused) {
            logger.warn(`[SyncEngine] Auth failed ${this.consecutiveAuthFailures} consecutive times — pausing sync (session likely expired)`);
            this.isAuthPaused = true;
            try {
              Sentry.captureMessage('SyncEngine paused: session expired after repeated auth failures', {
                tags: { component: 'SyncEngine', action: 'authPause' },
                level: 'warning',
                extra: { consecutiveFailures: this.consecutiveAuthFailures },
              });
            } catch {
              // Sentry failure is acceptable
            }
            this.emitStatusChange();
          }
          // Reset to pending but don't process more — wait for re-auth
          try {
            await this.queue.resetOperationToPending(op.id, { incrementRetry: false });
          } catch (resetError) {
            logger.info(`[SyncEngine] Could not reset auth-paused operation ${opInfo}:`, resetError);
          }
          return;
        }

        // First few failures: startup timing — reset to pending without penalty
        logger.info(`[SyncEngine] Auth not ready (${this.consecutiveAuthFailures}/3): ${opInfo} - resetting to pending`);
        try {
          const reset = await this.queue.resetOperationToPending(op.id, { incrementRetry: false });
          if (reset) {
            logger.info(`[SyncEngine] Successfully reset auth-blocked operation ${opInfo} to pending`);
          } else {
            logger.info(`[SyncEngine] Auth-blocked operation ${opInfo} not found (may be already processed)`);
          }
        } catch (resetError) {
          logger.info(`[SyncEngine] Could not reset auth-blocked operation ${opInfo}:`, resetError);
        }
        return;
      }

      // StorageError (server 5xx) handling: circuit breaker to prevent self-DDoS.
      // When PostgREST returns 503, aggressive retries exhaust the connection pool,
      // making the situation worse. Instead, pause sync with exponential backoff.
      // Detection relies on typed StorageError from SupabaseDataStore.classifyAndThrowError
      // (which maps all 5xx + PostgreSQL internal error codes to StorageError).
      // Fallback: name check handles cross-realm instanceof failures
      // (e.g. different module instances in test environments or code splitting)
      const isServerError = error instanceof StorageError ||
        (error instanceof Error && error.name === 'StorageError');
      if (isServerError) {
        this.consecutiveServerFailures++;

        // Exponential backoff: 30s, 60s, 120s, 240s, cap at 300s (5 min)
        const pauseDurationMs = Math.min(30000 * Math.pow(2, this.consecutiveServerFailures - 1), 300000);
        const pauseDurationSec = Math.round(pauseDurationMs / 1000);

        logger.warn(
          `[SyncEngine] Server error (${this.consecutiveServerFailures}x): ${opInfo} — ` +
          `pausing sync for ${pauseDurationSec}s to prevent overload`
        );

        this.isServerPaused = true;
        this.serverPauseUntil = Date.now() + pauseDurationMs;

        try {
          if (this.consecutiveServerFailures >= 3) {
            Sentry.captureMessage('SyncEngine: server circuit breaker activated', {
              tags: { component: 'SyncEngine', action: 'serverCircuitBreaker' },
              level: 'warning',
              extra: {
                consecutiveFailures: this.consecutiveServerFailures,
                pauseDurationMs,
                operationInfo: opInfo,
              },
            });
          }
        } catch {
          // Sentry failure is acceptable
        }

        // Reset to pending — will retry after pause expires.
        // incrementRetry: false — server errors are infrastructure failures, not operation
        // failures. The circuit breaker's pause/backoff provides throttling; the retry
        // budget should only be burned for genuine operation failures (bad data, conflicts).
        try {
          await this.queue.resetOperationToPending(op.id, { incrementRetry: false });
        } catch (resetError) {
          logger.info(`[SyncEngine] Could not reset server-error operation ${opInfo}:`, resetError);
        }

        this.emitStatusChange();
        return;
      }

      // All other errors are real failures
      {
        logger.warn(`[SyncEngine] Failed: ${opInfo} - ${errorMessage}`);

        // DIAGNOSTIC: Log full operation details to help identify why specific operations fail
        // This helps diagnose the "one item stuck" issue where most ops succeed but one fails
        // Using warn (not error) to avoid flooding Sentry — failures are already retried
        logger.warn('[SyncEngine] SYNC FAILURE DETAILS', {
          operationId: op.id,
          entityType: op.entityType,
          entityId: op.entityId,
          operation: op.operation,
          retryCount: op.retryCount,
          timestamp: op.timestamp,
          error: errorMessage,
          // Estimate data size without expensive JSON.stringify on mobile
          dataSize: op.data ? (typeof op.data === 'object' ? Object.keys(op.data as object).length + ' keys' : 'primitive') : 'none',
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

      // Check if will retry (wrap in try-catch so failure listeners are always notified)
      let willRetry = false;
      try {
        const updatedOp = await this.queue.getById(op.id);
        willRetry = updatedOp?.status === 'pending'; // Back to pending = will retry
      } catch (getError) {
        logger.warn(`[SyncEngine] Could not check retry status for ${opInfo}:`, getError);
      }

      // Emit failure event (always, even if getById failed above)
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
 * Check if the SyncEngine singleton has been initialized.
 * Use this to guard operations that require the engine without throwing.
 */
export function isSyncEngineInitialized(): boolean {
  return syncEngineInstance !== null;
}

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
 * Reset the SyncEngine singleton (for testing and user transitions). Calls
 * dispose() to stop the engine and clear listeners, preventing memory leaks.
 *
 * @param options.skipWait - If true, don't wait for in-flight sync to complete.
 *                           Use during force-close scenarios (user switch) for faster cleanup.
 * @param options.engine - Ownership guard (CR-H2): if provided, only reset when the
 *                         current singleton IS this engine. A stale store's late close()
 *                         must not dispose a newer user's live engine (sync dead until
 *                         reload). Omit for a deliberate unconditional teardown.
 */
export async function resetSyncEngine(options: { skipWait?: boolean; engine?: SyncEngine } = {}): Promise<void> {
  if (options.engine && syncEngineInstance !== options.engine) {
    // The current singleton belongs to someone else (e.g. the next user after an
    // account switch) — do not dispose it.
    logger.debug('[SyncEngine] resetSyncEngine skipped: current singleton is not the owned engine');
    return;
  }
  if (syncEngineInstance) {
    // CRITICAL: Null the singleton FIRST, then dispose.
    // This prevents race conditions where getSyncEngine() is called during disposal
    // and returns the old (disposing) engine with a closed queue.
    const engineToDispose = syncEngineInstance;
    syncEngineInstance = null;
    await engineToDispose.dispose(options);
  }
}
