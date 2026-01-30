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
// Track cloud availability at AuthService creation
// Issue #336: AuthService resets if cloud availability changes (not mode changes)
let authServiceCreatedWithCloudAvailable: boolean | null = null;

// Track the userId the DataStore was created for
// Used to detect user changes (sign-in/sign-out) and auto-reset the DataStore singleton
let dataStoreCreatedForUserId: string | undefined = undefined;

// Initialization promises to prevent race conditions during concurrent calls
let dataStoreInitPromise: Promise<DataStore> | null = null;
let authServiceInitPromise: Promise<AuthService> | null = null;

/**
 * Internal helper to close and clean up the current DataStore instance.
 * Used for user changes and mode changes.
 *
 * @param reason - Description of why the close is happening (for logging)
 */
async function closeDataStoreInternal(reason: string): Promise<void> {
  if (!dataStoreInstance) {
    return;
  }

  log.info(`[factory] Closing DataStore due to: ${reason}`);

  // Save references for cleanup, then immediately null to prevent race conditions
  const oldDataStore = dataStoreInstance;
  const oldMode = dataStoreCreatedForMode;
  const oldUserId = dataStoreCreatedForUserId;
  dataStoreInstance = null;
  dataStoreCreatedForMode = null;
  dataStoreCreatedForUserId = undefined;

  // If closing from cloud mode, clean up sync engine and Supabase resources
  if (oldMode === 'cloud') {
    // Check for pending sync operations
    try {
      const { getSyncEngine } = await import('@/sync');
      const engine = getSyncEngine();
      const status = await engine.getStatus();
      if (status.pendingCount > 0) {
        log.error(`[factory] DATA LOSS: Closing DataStore with ${status.pendingCount} pending sync operations.`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('not initialized')) {
        const err = e instanceof Error ? e : new Error(msg);
        log.warn(`[factory] Error checking pending operations: ${msg}`, err);
      }
    }

    // Stop the sync engine singleton
    try {
      const { resetSyncEngine } = await import('@/sync');
      await resetSyncEngine();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const err = e instanceof Error ? e : new Error(msg);
      log.warn(`[factory] Error resetting sync engine: ${msg}`, err);
    }

    // Clean up Supabase client
    try {
      const { cleanupSupabaseClient } = await import('./supabase/client');
      await cleanupSupabaseClient();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const err = e instanceof Error ? e : new Error(msg);
      log.warn(`[factory] Error cleaning up Supabase client: ${msg}`, err);
    }
  }

  // Close the old instance
  try {
    await oldDataStore.close();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const err = e instanceof Error ? e : new Error(msg);
    log.warn(`[factory] Error closing DataStore: ${msg}`, err);
  }

  // Close the user storage adapter to release IndexedDB connection
  // This prevents memory leaks when switching users
  if (oldUserId) {
    try {
      const { closeUserStorageAdapter } = await import('@/utils/storage');
      await closeUserStorageAdapter(oldUserId);
      log.info(`[factory] Closed user storage adapter for: ${oldUserId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const err = e instanceof Error ? e : new Error(msg);
      log.warn(`[factory] Error closing user storage adapter: ${msg}`, err);
    }
  }
}

/**
 * Get the DataStore singleton instance.
 *
 * Creates and initializes the DataStore on first call.
 * Subsequent calls return the same instance.
 * Handles concurrent calls safely by sharing the initialization promise.
 *
 * User-Scoped Storage:
 * - If userId is provided, the DataStore uses a user-specific IndexedDB database
 *   (`matchops_user_{userId}`) for complete data isolation between users.
 * - If userId is undefined, uses the legacy global database (`MatchOpsLocal`).
 * - When userId changes (user sign-in/sign-out), the DataStore is automatically
 *   closed and re-created for the new user.
 *
 * @param userId - Optional user ID for user-scoped storage. Pass the authenticated
 *                 user's ID to enable user-scoped storage, or undefined for legacy mode.
 * @returns Initialized DataStore instance
 *
 * @example
 * ```typescript
 * // In React Query queryFn with authenticated user
 * queryFn: async () => {
 *   const dataStore = await getDataStore(user?.id);
 *   return dataStore.getPlayers();
 * }
 * ```
 */
export async function getDataStore(userId?: string): Promise<DataStore> {
  const currentMode = getBackendMode();

  // Check if userId changed since the DataStore was created
  // This handles user sign-in/sign-out transitions by:
  // 1. Comparing the requested userId with the userId used when creating the current instance
  // 2. If different, closing the old instance (which also closes the user's IndexedDB adapter)
  // 3. Allowing a new instance to be created for the new user below
  // This check only runs when an instance EXISTS - if null, we skip to creation
  if (dataStoreInstance && dataStoreCreatedForUserId !== userId) {
    log.info(`[factory] User changed from ${dataStoreCreatedForUserId || '(anonymous)'} to ${userId || '(anonymous)'} - resetting DataStore`);
    await closeDataStoreInternal('user change');
  }

  // Check if mode changed since the DataStore was created
  // This handles the case where user enables/disables cloud sync
  if (dataStoreInstance && dataStoreCreatedForMode !== currentMode) {
    log.info(`[factory] Mode changed from ${dataStoreCreatedForMode} to ${currentMode} - resetting DataStore`);
    await closeDataStoreInternal('mode change');
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
  // Note: If concurrent calls come in with different userIds during initialization,
  // all callers will get the first caller's DataStore. This is acceptable because:
  // 1. User changes during initialization are rare (sign-in/out is usually sequential)
  // 2. The next call after initialization will detect the userId mismatch and reset
  // 3. This avoids complex per-userId promise tracking
  if (dataStoreInitPromise) {
    return dataStoreInitPromise;
  }

  // Capture userId for the initialization closure
  const initUserId = userId;

  // Start initialization and store the promise
  dataStoreInitPromise = (async () => {
    const mode = getBackendMode();
    log.info(`[factory] Initializing DataStore in ${mode} mode for user: ${initUserId || '(anonymous)'}`);

    let instance: DataStore;

    if (mode === 'cloud' && isCloudAvailable()) {
      // Cloud mode uses SyncedDataStore (local-first with background sync)
      // - SyncedDataStore wraps LocalDataStore for instant local writes
      // - Operations queue and sync to SupabaseDataStore in background
      const { SyncedDataStore } = await import('./SyncedDataStore');
      const syncedStore = new SyncedDataStore(initUserId);
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
      instance = new LocalDataStore(initUserId);
      await instance.initialize();
    } else {
      instance = new LocalDataStore(initUserId);
      await instance.initialize();
    }

    // Defensive verification: ensure initialization actually completed
    if (!instance.isInitialized()) {
      log.warn('[factory] Instance not initialized after initialize() - retrying');
      await instance.initialize();
    }
    dataStoreInstance = instance;
    dataStoreCreatedForMode = mode;
    dataStoreCreatedForUserId = initUserId;
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
  // Only reset if cloud availability changes (service type would change).

  const currentCloudAvailable = isCloudAvailable();

  // Check if cloud availability changed since AuthService was created
  // This handles edge cases like env vars changing at runtime
  if (authServiceInstance && authServiceCreatedWithCloudAvailable !== currentCloudAvailable) {
    log.info(`[factory] Cloud availability changed from ${authServiceCreatedWithCloudAvailable} to ${currentCloudAvailable} - resetting AuthService`);

    // Sign out from old service to clean up subscriptions
    try {
      await authServiceInstance.signOut();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const err = e instanceof Error ? e : new Error(msg);
      log.warn(`[factory] Error signing out during AuthService reset: ${msg}`, err);
    }

    authServiceInstance = null;
    authServiceCreatedWithCloudAvailable = null;
  }

  // Already initialized for current cloud availability - return immediately
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
    // Use isCloudAvailable() at completion time, not the captured value from line 240
    // This prevents issues if cloud availability changed during async initialization
    authServiceCreatedWithCloudAvailable = isCloudAvailable();
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

  // Close all user storage adapters to release IndexedDB connections
  // This prevents memory leaks in tests and when switching between users
  try {
    const { closeAllUserStorageAdapters } = await import('@/utils/storage');
    await closeAllUserStorageAdapters();
  } catch (e) {
    // Best-effort cleanup: log but don't throw
    const msg = e instanceof Error ? e.message : String(e);
    const err = e instanceof Error ? e : new Error(msg);
    log.warn(`[factory] Error closing user storage adapters during reset: ${msg}`, err);
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
  dataStoreCreatedForUserId = undefined;
  authServiceCreatedWithCloudAvailable = null;
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
 * Close the current DataStore instance.
 *
 * Call this when the user signs out to ensure their data is properly
 * cleaned up before another user can sign in. This closes the user's
 * IndexedDB connection and clears the singleton.
 *
 * @example
 * ```typescript
 * // In sign-out handler
 * await closeDataStore();
 * await authService.signOut();
 * ```
 */
export async function closeDataStore(): Promise<void> {
  await closeDataStoreInternal('explicit close');
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
