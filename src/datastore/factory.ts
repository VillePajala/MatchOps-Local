/**
 * DataStore & AuthService Factory
 *
 * Provides singleton instances of DataStore and AuthService.
 * Supports both local (IndexedDB) and cloud (Supabase) modes.
 *
 * Cloud mode uses SyncedDataStore (local-first with background sync):
 * - Writes go to IndexedDB immediately (instant)
 * - Operations queue for background sync to Supabase
 * - Works offline, syncs when online
 *
 * @see docs/03-active-plans/local-first-sync-plan.md
 * @see docs/03-active-plans/supabase-implementation-guide.md
 */

import type { DataStore } from '@/interfaces/DataStore';
import type { AuthService } from '@/interfaces/AuthService';
import { LocalDataStore } from './LocalDataStore';
import { LocalAuthService } from '@/auth/LocalAuthService';
import { getBackendMode, isCloudAvailable } from '@/config/backendConfig';
import logger from '@/utils/logger';

// Safe logger wrapper for test environments
// Accepts optional Error object as second parameter to preserve stack traces for Sentry
const log = {
  info: (msg: string) => logger?.info?.(msg),
  warn: (msg: string, error?: Error) => error ? logger?.warn?.(msg, error) : logger?.warn?.(msg),
  error: (msg: string, error?: Error) => error ? logger?.error?.(msg, error) : logger?.error?.(msg),
};

// Singleton instances
let dataStoreInstance: DataStore | null = null;
let authServiceInstance: AuthService | null = null;

// Track the mode DataStore was created for
// Used to detect mode changes and auto-reset the DataStore singleton
let dataStoreCreatedForMode: 'local' | 'cloud' | null = null;
// Track mode at AuthService creation (for logging/debugging only)
// Issue #336: AuthService is NOT reset on mode changes - auth is mode-independent
// Prefixed with _ to indicate intentionally unused (kept for debugging/audit)
let _authServiceCreatedForMode: 'local' | 'cloud' | null = null;

// Initialization promises to prevent race conditions during concurrent calls
let dataStoreInitPromise: Promise<DataStore> | null = null;
let authServiceInitPromise: Promise<AuthService> | null = null;

/**
 * Get the DataStore singleton instance.
 *
 * Creates and initializes the DataStore on first call.
 * Subsequent calls return the same instance.
 * Handles concurrent calls safely by sharing the initialization promise.
 *
 * @returns Initialized DataStore instance
 *
 * @example
 * ```typescript
 * // In React Query queryFn
 * queryFn: async () => {
 *   const dataStore = await getDataStore();
 *   return dataStore.getPlayers();
 * }
 * ```
 */
export async function getDataStore(): Promise<DataStore> {
  const currentMode = getBackendMode();

  // Check if mode changed since the DataStore was created
  // This handles the case where user enables/disables cloud sync
  if (dataStoreInstance && dataStoreCreatedForMode !== currentMode) {
    log.info(`[factory] Mode changed from ${dataStoreCreatedForMode} to ${currentMode} - resetting DataStore`);

    // Save reference for cleanup, then immediately null to prevent race conditions
    // (other callers see null and wait for re-initialization via the init promise)
    const oldDataStore = dataStoreInstance;
    const oldMode = dataStoreCreatedForMode;
    dataStoreInstance = null;
    dataStoreCreatedForMode = null;

    // If switching FROM cloud mode, clean up sync engine and Supabase resources
    // This prevents stale auth subscriptions and memory leaks
    // Cleanup order: check pending → stop engine → cleanup Supabase → close DataStore
    // (check first to capture what will be lost before engine stops processing)
    if (oldMode === 'cloud') {
      // Step 1: Check for pending sync operations (before stopping engine)
      // WARNING: This is a safety net - proper protection should happen in the UI layer
      // BEFORE calling setBackendMode(). The UI should call getPendingSyncCount() and
      // either block the switch, wait for sync, or show a confirmation dialog.
      // See: CloudSyncSection toggle handler
      try {
        const { getSyncEngine } = await import('@/sync');
        const engine = getSyncEngine();
        const status = await engine.getStatus();
        if (status.pendingCount > 0) {
          // Use error level because this indicates data loss
          log.error(`[factory] DATA LOSS: Mode switch with ${status.pendingCount} pending sync operations that will be lost. UI layer should have blocked this.`);
        }
      } catch (e) {
        // Expected: engine not initialized. Unexpected errors logged for debugging.
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('not initialized')) {
          const err = e instanceof Error ? e : new Error(msg);
          log.warn(`[factory] Unexpected error checking pending operations: ${msg}`, err);
        }
      }

      // Step 2: Stop the sync engine singleton
      try {
        const { resetSyncEngine } = await import('@/sync');
        await resetSyncEngine();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const err = e instanceof Error ? e : new Error(msg);
        log.warn(`[factory] Error resetting sync engine during mode change: ${msg}`, err);
      }

      // Step 3: Clean up Supabase client
      try {
        const { cleanupSupabaseClient } = await import('./supabase/client');
        await cleanupSupabaseClient();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const err = e instanceof Error ? e : new Error(msg);
        log.warn(`[factory] Error cleaning up Supabase client during mode change: ${msg}`, err);
      }
    }

    // Close the old instance (reference saved before nulling)
    try {
      await oldDataStore.close();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const err = e instanceof Error ? e : new Error(msg);
      log.warn(`[factory] Error closing old DataStore during mode change: ${msg}`, err);
    }
  }

  // Already initialized for current mode - return immediately
  if (dataStoreInstance) {
    // Defensive check: verify the cached instance is actually initialized
    // This should always be true, but catches edge cases after resetFactory()
    if (!dataStoreInstance.isInitialized()) {
      log.warn('[factory] Cached DataStore not initialized - re-initializing');
      await dataStoreInstance.initialize();
    }
    return dataStoreInstance;
  }

  // Initialization in progress - wait for it
  if (dataStoreInitPromise) {
    return dataStoreInitPromise;
  }

  // Start initialization and store the promise
  dataStoreInitPromise = (async () => {
    const mode = getBackendMode();
    log.info(`[factory] Initializing DataStore in ${mode} mode`);

    let instance: DataStore;

    if (mode === 'cloud' && isCloudAvailable()) {
      // Cloud mode uses SyncedDataStore (local-first with background sync)
      // - SyncedDataStore wraps LocalDataStore for instant local writes
      // - Operations queue and sync to SupabaseDataStore in background
      const { SyncedDataStore } = await import('./SyncedDataStore');
      const syncedStore = new SyncedDataStore();
      await syncedStore.initialize();

      try {
        // Set up the sync executor to sync to Supabase
        const { SupabaseDataStore } = await import('./SupabaseDataStore');
        const cloudStore = new SupabaseDataStore();
        await cloudStore.initialize();
        // Note: If initialize() succeeds, isInitialized() should return true.
        // If not, that's a bug in SupabaseDataStore to fix, not work around here.

        const { createSyncExecutor } = await import('@/sync');
        const executor = createSyncExecutor(cloudStore);
        syncedStore.setExecutor(executor);
        syncedStore.startSync();

        instance = syncedStore;
        log.info('[factory] Using SyncedDataStore (local-first cloud mode)');
      } catch (error) {
        // Clean up syncedStore if cloud setup fails
        const errorMessage = error instanceof Error ? error.message : String(error);
        const err = error instanceof Error ? error : new Error(errorMessage);
        log.warn(`[factory] Cloud setup failed: ${errorMessage}, cleaning up SyncedDataStore`, err);
        await syncedStore.close();
        // SECURITY: Throw generic message to prevent technical detail exposure
        // Full details already logged above for debugging
        throw new Error('Cloud mode initialization failed. Please try again or switch to local mode.');
      }
    } else if (mode === 'cloud') {
      log.warn(
        '[factory] Cloud mode requested but Supabase not configured - using LocalDataStore'
      );
      instance = new LocalDataStore();
      await instance.initialize();
    } else {
      instance = new LocalDataStore();
      await instance.initialize();
    }

    // Defensive verification: ensure initialization actually completed
    if (!instance.isInitialized()) {
      log.warn('[factory] Instance not initialized after initialize() - retrying');
      await instance.initialize();
    }
    dataStoreInstance = instance;
    dataStoreCreatedForMode = mode;
    return instance;
  })().finally(() => {
    // Allow retry on failure, and keep the steady state as `dataStoreInstance !== null`.
    dataStoreInitPromise = null;
  });

  return dataStoreInitPromise;
}

/**
 * Get the AuthService singleton instance.
 *
 * Creates and initializes the AuthService on first call.
 * Subsequent calls return the same instance.
 * Handles concurrent calls safely by sharing the initialization promise.
 *
 * Issue #336: Auth service is based on cloud AVAILABILITY, not current mode.
 * This allows users to sign in while in local mode (authentication ≠ sync).
 * - If Supabase is configured: use SupabaseAuthService (works in any mode)
 * - If Supabase is not configured: use LocalAuthService (no-op)
 *
 * @returns Initialized AuthService instance
 */
export async function getAuthService(): Promise<AuthService> {
  // Issue #336: AuthService should NOT be reset when mode changes.
  // Auth is independent of data storage mode - user stays signed in
  // regardless of whether they're using local or cloud data storage.
  // Only reset if the underlying service type would change (cloud availability changed).

  // Already initialized - return immediately
  // Note: We no longer reset based on mode changes (auth is mode-independent)
  if (authServiceInstance) {
    return authServiceInstance;
  }

  // Initialization in progress - wait for it
  if (authServiceInitPromise) {
    return authServiceInitPromise;
  }

  // Start initialization and store the promise
  authServiceInitPromise = (async () => {
    const mode = getBackendMode();
    log.info(`[factory] Initializing AuthService (mode: ${mode}, cloudAvailable: ${isCloudAvailable()})`);

    let instance: AuthService;

    // Issue #336: Auth service is based on cloud AVAILABILITY, not current mode.
    // This allows users to sign in while in local mode (auth ≠ sync).
    if (isCloudAvailable()) {
      // Lazy load SupabaseAuthService to avoid bundling Supabase in local mode
      const { SupabaseAuthService } = await import('@/auth/SupabaseAuthService');
      instance = new SupabaseAuthService();
      log.info('[factory] Using SupabaseAuthService (cloud available)');
    } else {
      instance = new LocalAuthService();
      log.info('[factory] Using LocalAuthService (cloud not available)');
    }

    await instance.initialize();
    authServiceInstance = instance;
    _authServiceCreatedForMode = mode;
    return instance;
  })().finally(() => {
    authServiceInitPromise = null;
  });

  return authServiceInitPromise;
}

/**
 * Reset factory instances.
 *
 * Used for testing purposes to reset singleton state.
 * Closes the DataStore if it was initialized.
 *
 * @internal
 */
export async function resetFactory(): Promise<void> {
  // If initialization is in-flight, await it to avoid leaving an initialized instance around
  // after clearing the promise references.
  if (dataStoreInitPromise) {
    try {
      await dataStoreInitPromise;
    } catch (e) {
      // Best-effort cleanup: log but don't throw
      const msg = e instanceof Error ? e.message : String(e);
      const err = e instanceof Error ? e : new Error(msg);
      log.warn(`[factory] Error awaiting dataStoreInitPromise during reset: ${msg}`, err);
    }
  }

  // Reset sync engine if cloud mode was active (prevents memory leaks in tests)
  if (dataStoreCreatedForMode === 'cloud') {
    try {
      const { resetSyncEngine } = await import('@/sync');
      await resetSyncEngine();
    } catch (e) {
      // Best-effort cleanup: log but don't throw (engine may not be initialized)
      const msg = e instanceof Error ? e.message : String(e);
      const err = e instanceof Error ? e : new Error(msg);
      log.warn(`[factory] Error resetting sync engine during factory reset: ${msg}`, err);
    }
  }

  if (dataStoreInstance) {
    try {
      await dataStoreInstance.close();
    } catch (e) {
      // Best-effort cleanup: log but don't throw
      const msg = e instanceof Error ? e.message : String(e);
      const err = e instanceof Error ? e : new Error(msg);
      log.warn(`[factory] Error closing DataStore during reset: ${msg}`, err);
    }
    dataStoreInstance = null;
  }

  if (authServiceInitPromise) {
    try {
      await authServiceInitPromise;
    } catch (e) {
      // Best-effort cleanup: log but don't throw
      const msg = e instanceof Error ? e.message : String(e);
      const err = e instanceof Error ? e : new Error(msg);
      log.warn(`[factory] Error awaiting authServiceInitPromise during reset: ${msg}`, err);
    }
  }

  authServiceInstance = null;
  dataStoreInitPromise = null;
  authServiceInitPromise = null;
  dataStoreCreatedForMode = null;
  _authServiceCreatedForMode = null;
}

/**
 * Check if DataStore is initialized.
 *
 * @returns true if DataStore singleton exists
 */
export function isDataStoreInitialized(): boolean {
  return dataStoreInstance !== null;
}

/**
 * Check if AuthService is initialized.
 *
 * @returns true if AuthService singleton exists
 */
export function isAuthServiceInitialized(): boolean {
  return authServiceInstance !== null;
}

/**
 * Get the count of pending sync operations.
 *
 * IMPORTANT: Call this BEFORE changing backend mode (cloud → local) to check
 * if it's safe to switch. If count > 0, either:
 * 1. Block the switch until queue is empty
 * 2. Wait for sync to complete
 * 3. Show user confirmation dialog explaining data will be lost
 *
 * @returns Number of pending operations, or 0 if not in cloud mode or engine not initialized
 * @throws Error if an unexpected error occurs (to prevent masking potential data loss)
 */
export async function getPendingSyncCount(): Promise<number> {
  if (dataStoreCreatedForMode !== 'cloud') {
    return 0;
  }

  try {
    const { getSyncEngine } = await import('@/sync');
    const engine = getSyncEngine();
    const status = await engine.getStatus();
    return status.pendingCount;
  } catch (e) {
    // Engine not initialized is expected - return 0 (no pending operations if engine not running)
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('not initialized')) {
      return 0;
    }
    // Unexpected errors: throw to prevent UI from assuming it's safe to switch modes
    // Returning 0 here could mask data loss if there are actually pending operations
    const err = e instanceof Error ? e : new Error(msg);
    log.error(`[factory] Unexpected error getting pending sync count: ${msg}`, err);
    throw err;
  }
}
