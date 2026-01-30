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
// Supports structured data logging and optional Error objects for Sentry stack traces
const log = {
  info: (msg: string, data?: Record<string, unknown>) => data ? logger?.info?.(msg, data) : logger?.info?.(msg),
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

// Per-userId initialization promises to prevent race conditions during concurrent calls
// Map key is the userId (undefined for anonymous users)
// This ensures concurrent calls with different userIds get separate DataStores
const dataStoreInitPromises = new Map<string | undefined, Promise<DataStore>>();
let authServiceInitPromise: Promise<AuthService> | null = null;

/**
 * Result of checking if DataStore can be safely closed.
 */
export interface CloseCheckResult {
  /** Whether it's safe to close (no pending operations) */
  canClose: boolean;
  /** Number of pending sync operations (0 if not in cloud mode) */
  pendingCount: number;
  /** Human-readable message explaining the result */
  message: string;
}

/**
 * Check if DataStore can be safely closed without data loss.
 *
 * Call this BEFORE user transitions or mode changes to verify no pending
 * sync operations exist. If `canClose` is false, show user a confirmation
 * dialog before proceeding.
 *
 * @returns Check result with pending operation count
 *
 * @example
 * ```typescript
 * const check = await canCloseDataStore();
 * if (!check.canClose) {
 *   const confirmed = await showConfirmDialog(
 *     `You have ${check.pendingCount} unsaved changes. Discard them?`
 *   );
 *   if (!confirmed) return;
 * }
 * await closeDataStore({ force: true });
 * ```
 */
export async function canCloseDataStore(): Promise<CloseCheckResult> {
  if (!dataStoreInstance) {
    return { canClose: true, pendingCount: 0, message: 'No DataStore to close' };
  }

  if (dataStoreCreatedForMode !== 'cloud') {
    return { canClose: true, pendingCount: 0, message: 'Local mode - no sync operations' };
  }

  try {
    const { getSyncEngine } = await import('@/sync');
    const engine = getSyncEngine();
    const status = await engine.getStatus();

    if (status.pendingCount > 0) {
      return {
        canClose: false,
        pendingCount: status.pendingCount,
        message: `${status.pendingCount} pending sync operation(s) will be lost if you proceed`,
      };
    }

    return { canClose: true, pendingCount: 0, message: 'All changes synced' };
  } catch (e) {
    // Engine not initialized means no pending ops
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('not initialized')) {
      return { canClose: true, pendingCount: 0, message: 'Sync engine not started' };
    }
    // On unexpected errors, be conservative and allow close
    // (can't determine pending count, so don't block user)
    log.warn(`[factory] Error checking pending operations: ${msg}`);
    return { canClose: true, pendingCount: 0, message: 'Unable to check sync status' };
  }
}

/**
 * Options for closing the DataStore.
 */
export interface CloseDataStoreOptions {
  /**
   * If true, close even if there are pending sync operations (data loss).
   * If false (default), throws an error when pending operations exist.
   *
   * IMPORTANT: Only set to true after showing user confirmation dialog!
   */
  force?: boolean;
}

/**
 * Internal helper to close and clean up the current DataStore instance.
 * Used for user changes and mode changes.
 *
 * @param reason - Description of why the close is happening (for logging)
 * @param options - Close options (force flag)
 * @throws Error if pending sync operations exist and force is not true
 */
async function closeDataStoreInternal(
  reason: string,
  options: CloseDataStoreOptions = {}
): Promise<void> {
  const { force = false } = options;

  if (!dataStoreInstance) {
    return;
  }

  log.info(`[factory] Closing DataStore due to: ${reason}`);

  // Save references for cleanup, then immediately null to prevent race conditions
  const oldDataStore = dataStoreInstance;
  const oldMode = dataStoreCreatedForMode;
  const oldUserId = dataStoreCreatedForUserId;

  // CRITICAL: Check for pending sync operations BEFORE nulling references
  // If not forced and there are pending ops, throw to prevent data loss
  if (oldMode === 'cloud' && !force) {
    const check = await canCloseDataStore();
    if (!check.canClose) {
      throw new Error(
        `Cannot close DataStore: ${check.pendingCount} pending sync operation(s). ` +
        `Either wait for sync to complete, or call closeDataStore({ force: true }) ` +
        `after showing user confirmation.`
      );
    }
  }

  // Now safe to null references
  dataStoreInstance = null;
  dataStoreCreatedForMode = null;
  dataStoreCreatedForUserId = undefined;

  // If closing from cloud mode, clean up sync engine and Supabase resources
  if (oldMode === 'cloud') {
    // Log if force-closing with pending ops (for monitoring/debugging)
    if (force) {
      try {
        const { getSyncEngine } = await import('@/sync');
        const engine = getSyncEngine();
        const status = await engine.getStatus();
        if (status.pendingCount > 0) {
          log.warn(`[factory] Force-closing DataStore with ${status.pendingCount} pending sync operations (user confirmed data loss).`);
        }
      } catch (e) {
        // Check for "not initialized" error using SyncError type and error code
        // This is expected during early close (before sync engine was set up)
        const { SyncError, SyncErrorCode } = await import('@/sync');
        const isSyncError = e instanceof SyncError;
        const isNotInitialized = isSyncError && e.code === SyncErrorCode.NOT_INITIALIZED;

        if (!isNotInitialized) {
          const msg = e instanceof Error ? e.message : String(e);
          const err = e instanceof Error ? e : new Error(msg);
          log.warn(`[factory] Unexpected error checking pending operations: ${msg}`, err);
        }
        // "not initialized" is expected - sync engine wasn't started yet, no pending ops
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
 * ## User-Scoped Storage
 *
 * - If userId is provided, the DataStore uses a user-specific IndexedDB database
 *   (`matchops_user_{userId}`) for complete data isolation between users.
 * - If userId is undefined, uses the legacy global database (`MatchOpsLocal`).
 * - When userId changes (user sign-in/sign-out), the DataStore is automatically
 *   closed and re-created for the new user.
 *
 * ## User/Mode Transitions and Data Loss Prevention
 *
 * When switching users or modes, this function throws an error if there are
 * pending sync operations. This prevents silent data loss. To handle transitions:
 *
 * ```typescript
 * // Check if safe to switch
 * const check = await canCloseDataStore();
 * if (!check.canClose) {
 *   const confirmed = await showConfirmDialog(
 *     `You have ${check.pendingCount} unsaved changes. Discard them?`
 *   );
 *   if (!confirmed) return; // User cancelled - don't switch
 *   await closeDataStore({ force: true }); // User confirmed - force close
 * }
 * // Now safe to get DataStore for new user
 * const dataStore = await getDataStore(newUserId);
 * ```
 *
 * @throws Error if transitioning users/modes with pending sync operations
 *
 * ## Implementation Status
 *
 * This is part of Steps 1-4 of the user-scoped storage plan.
 * **Step 6 (updating ~36 callers to pass userId) is required** for user isolation
 * to work. Until then, all users share the legacy `MatchOpsLocal` database.
 *
 * ## CRITICAL SECURITY: userId Source (Step 6)
 *
 * When updating callers to pass userId, NEVER pass:
 * - ❌ User-provided input directly (form fields, text inputs)
 * - ❌ URL parameters or query strings
 * - ❌ Unvalidated form data
 * - ❌ Data from localStorage/cookies without validation
 *
 * ONLY pass:
 * - ✅ `user.id` from authenticated Supabase session
 * - ✅ `session.user.id` from auth callback
 * - ✅ Values from `useAuth()` hook that originated from Supabase Auth
 *
 * @see docs/03-active-plans/user-scoped-storage-plan-v2.md
 *
 * @param userId - Optional user ID for user-scoped storage. Pass the authenticated
 *                 user's ID to enable user-scoped storage, or undefined for legacy mode.
 *                 **MUST be from Supabase Auth - never user input!**
 * @returns Initialized DataStore instance
 *
 * @example
 * ```typescript
 * // CORRECT: Get userId from Supabase Auth
 * const { data: { user } } = await supabase.auth.getUser();
 * const dataStore = await getDataStore(user?.id);
 *
 * // CORRECT: In React component with useAuth hook
 * const { user } = useAuth();
 * const dataStore = await getDataStore(user?.id);
 *
 * // WRONG: Never pass URL params or user input!
 * // const userId = searchParams.get('userId'); // ❌ SECURITY RISK
 * // const dataStore = await getDataStore(userId);
 * ```
 */
export async function getDataStore(userId?: string): Promise<DataStore> {
  const currentMode = getBackendMode();

  // Check if userId changed since the DataStore was created
  // This handles user sign-in/sign-out transitions by:
  // 1. Comparing the requested userId with the userId used when creating the current instance
  // 2. If different, closing the old instance (which also closes the user's IndexedDB adapter)
  // 3. Clearing any pending init promises to prevent stale promises from completing
  // 4. Allowing a new instance to be created for the new user below
  // This check only runs when an instance EXISTS - if null, we skip to creation
  if (dataStoreInstance && dataStoreCreatedForUserId !== userId) {
    // Capture metrics BEFORE close for production diagnostics
    const closeCheck = await canCloseDataStore();
    log.info(`[factory] User switch`, {
      previousUserId: dataStoreCreatedForUserId || '(anonymous)',
      newUserId: userId || '(anonymous)',
      previousMode: dataStoreCreatedForMode,
      hadPendingOps: closeCheck.pendingCount > 0,
      pendingCount: closeCheck.pendingCount,
    });
    // Clear pending init promises to prevent stale completions from interfering
    dataStoreInitPromises.clear();
    await closeDataStoreInternal('user change');
  }

  // Check if mode changed since the DataStore was created
  // This handles the case where user enables/disables cloud sync
  if (dataStoreInstance && dataStoreCreatedForMode !== currentMode) {
    // Capture metrics BEFORE close for production diagnostics
    const closeCheck = await canCloseDataStore();
    log.info(`[factory] Mode switch`, {
      previousMode: dataStoreCreatedForMode,
      newMode: currentMode,
      userId: userId || '(anonymous)',
      hadPendingOps: closeCheck.pendingCount > 0,
      pendingCount: closeCheck.pendingCount,
    });
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

  // Initialization in progress for this specific userId - wait for it
  // Per-userId promise tracking ensures concurrent calls with different userIds
  // get separate DataStores (prevents cross-user data access)
  const existingPromise = dataStoreInitPromises.get(userId);
  if (existingPromise) {
    return existingPromise;
  }

  // Capture userId for the initialization closure
  const initUserId = userId;

  // Start initialization and store the promise for this userId
  const initPromise = (async () => {
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

    // CRITICAL: Double-check for concurrent initialization race condition
    // If another concurrent call finished first with a DIFFERENT userId,
    // we must NOT return that instance as it would leak data between users.
    // This can happen if User A and User B both call getDataStore() before
    // either completes.
    if (dataStoreInstance && dataStoreCreatedForUserId !== initUserId) {
      // SECURITY: Log as error for monitoring - this indicates a potential race condition
      // attack or bug in calling code.
      log.error(`[factory] SECURITY: Concurrent initialization conflict detected: ` +
        `initialized for '${initUserId}' but singleton is for '${dataStoreCreatedForUserId}'. ` +
        `Rejecting to prevent cross-user data access.`);
      await instance.close();
      // Close the user adapter we created to prevent resource leak
      if (initUserId) {
        try {
          const { closeUserStorageAdapter } = await import('@/utils/storage');
          await closeUserStorageAdapter(initUserId);
        } catch {
          // Best effort cleanup - ignore errors
        }
      }
      // SECURITY FIX: Throw error instead of returning wrong user's instance
      // Caller must retry - returning dataStoreInstance would leak User A's data to User B
      throw new Error(
        `DataStore initialization conflict: Multiple users tried to initialize simultaneously. ` +
        `This is a bug in the calling code - getDataStore() should only be called for one user at a time. ` +
        `Current user: '${dataStoreCreatedForUserId ?? '(anonymous)'}', Requested user: '${initUserId ?? '(anonymous)'}'.`
      );
    }

    dataStoreInstance = instance;
    dataStoreCreatedForMode = mode;
    dataStoreCreatedForUserId = initUserId;
    return instance;
  })().finally(() => {
    // Allow retry on failure, and keep the steady state as `dataStoreInstance !== null`.
    // Remove this specific userId's promise (not all promises)
    dataStoreInitPromises.delete(initUserId);
  });

  // Store promise for this specific userId
  dataStoreInitPromises.set(initUserId, initPromise);
  return initPromise;
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
  // IMPORTANT: Capture and clear tracking variables FIRST to prevent
  // inconsistent state if cleanup operations fail or take a long time.
  // This ensures new getDataStore() calls don't use stale state.
  const pendingPromises = Array.from(dataStoreInitPromises.values());
  const wasCloudMode = dataStoreCreatedForMode === 'cloud';
  const oldDataStoreInstance = dataStoreInstance;
  const oldAuthServiceInitPromise = authServiceInitPromise;

  // Clear all tracking state immediately
  dataStoreInstance = null;
  authServiceInstance = null;
  dataStoreInitPromises.clear();
  authServiceInitPromise = null;
  dataStoreCreatedForMode = null;
  dataStoreCreatedForUserId = undefined;
  authServiceCreatedWithCloudAvailable = null;

  // Now perform cleanup operations (best-effort, failures logged but not thrown)

  // Await any in-flight initialization promises
  for (const promise of pendingPromises) {
    try {
      await promise;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const err = e instanceof Error ? e : new Error(msg);
      log.warn(`[factory] Error awaiting dataStoreInitPromise during reset: ${msg}`, err);
    }
  }

  // Reset sync engine if cloud mode was active (prevents memory leaks in tests)
  if (wasCloudMode) {
    try {
      const { resetSyncEngine } = await import('@/sync');
      await resetSyncEngine();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const err = e instanceof Error ? e : new Error(msg);
      log.warn(`[factory] Error resetting sync engine during factory reset: ${msg}`, err);
    }
  }

  // Close the old DataStore instance
  if (oldDataStoreInstance) {
    try {
      await oldDataStoreInstance.close();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const err = e instanceof Error ? e : new Error(msg);
      log.warn(`[factory] Error closing DataStore during reset: ${msg}`, err);
    }
  }

  // Close all user storage adapters to release IndexedDB connections
  try {
    const { closeAllUserStorageAdapters } = await import('@/utils/storage');
    await closeAllUserStorageAdapters();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const err = e instanceof Error ? e : new Error(msg);
    log.warn(`[factory] Error closing user storage adapters during reset: ${msg}`, err);
  }

  // Await auth service init promise
  if (oldAuthServiceInitPromise) {
    try {
      await oldAuthServiceInitPromise;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const err = e instanceof Error ? e : new Error(msg);
      log.warn(`[factory] Error awaiting authServiceInitPromise during reset: ${msg}`, err);
    }
  }
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
 * ## Data Loss Prevention
 *
 * By default, this function throws an error if there are pending sync
 * operations. This prevents silent data loss. To handle user transitions:
 *
 * 1. Check if close is safe: `await canCloseDataStore()`
 * 2. If not safe, show confirmation dialog
 * 3. If user confirms, close with force: `await closeDataStore({ force: true })`
 *
 * @param options - Close options. Set `force: true` to close even with pending operations.
 * @throws Error if there are pending sync operations and force is not true
 *
 * @example
 * ```typescript
 * // Safe close (throws if pending operations)
 * await closeDataStore();
 *
 * // Force close after user confirmation
 * const check = await canCloseDataStore();
 * if (!check.canClose) {
 *   const confirmed = confirm(`Discard ${check.pendingCount} pending changes?`);
 *   if (!confirmed) return;
 * }
 * await closeDataStore({ force: true });
 * ```
 */
export async function closeDataStore(options?: CloseDataStoreOptions): Promise<void> {
  await closeDataStoreInternal('explicit close', options);
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
