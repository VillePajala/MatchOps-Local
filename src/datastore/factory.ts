/**
 * DataStore & AuthService Factory
 *
 * Provides singleton instances of DataStore and AuthService.
 * Supports both local (IndexedDB) and cloud (Supabase) modes.
 *
 * Phase 3: Backend abstraction (PR #137) - LocalDataStore
 * Phase 4: Supabase cloud backend - SupabaseDataStore (in progress)
 *
 * @see docs/03-active-plans/supabase-implementation-guide.md
 */

import type { DataStore } from '@/interfaces/DataStore';
import type { AuthService } from '@/interfaces/AuthService';
import { LocalDataStore } from './LocalDataStore';
import { LocalAuthService } from '@/auth/LocalAuthService';
import { getBackendMode, isCloudAvailable } from '@/config/backendConfig';
import logger from '@/utils/logger';

// Safe logger wrapper for test environments
const log = {
  info: (msg: string) => logger?.info?.(msg),
  warn: (msg: string) => logger?.warn?.(msg),
};

// Singleton instances
let dataStoreInstance: DataStore | null = null;
let authServiceInstance: AuthService | null = null;

// Track the mode each singleton was created for
// Used to detect mode changes and auto-reset the factory
let dataStoreCreatedForMode: 'local' | 'cloud' | null = null;
let authServiceCreatedForMode: 'local' | 'cloud' | null = null;

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

    // If switching FROM cloud mode, clean up Supabase resources
    // This prevents stale auth subscriptions and memory leaks
    if (dataStoreCreatedForMode === 'cloud') {
      try {
        const { cleanupSupabaseClient } = await import('./supabase/client');
        await cleanupSupabaseClient();
      } catch (e) {
        log.warn('[factory] Error cleaning up Supabase client during mode change');
      }
    }

    // Close the old instance
    try {
      await dataStoreInstance.close();
    } catch (e) {
      log.warn('[factory] Error closing old DataStore during mode change');
    }
    dataStoreInstance = null;
    dataStoreCreatedForMode = null;
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
      // Lazy load SupabaseDataStore to avoid bundling Supabase in local mode
      const { SupabaseDataStore } = await import('./SupabaseDataStore');
      instance = new SupabaseDataStore();
      log.info('[factory] Using SupabaseDataStore (cloud mode)');
    } else if (mode === 'cloud') {
      log.warn(
        '[factory] Cloud mode requested but Supabase not configured - using LocalDataStore'
      );
      instance = new LocalDataStore();
    } else {
      instance = new LocalDataStore();
    }

    await instance.initialize();
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
 * In cloud mode, returns SupabaseAuthService.
 * In local mode, returns LocalAuthService (no-op authentication).
 *
 * @returns Initialized AuthService instance
 */
export async function getAuthService(): Promise<AuthService> {
  const currentMode = getBackendMode();

  // Check if mode changed since the AuthService was created
  // This handles the case where user enables/disables cloud sync
  if (authServiceInstance && authServiceCreatedForMode !== currentMode) {
    log.info(`[factory] Mode changed from ${authServiceCreatedForMode} to ${currentMode} - resetting AuthService`);
    authServiceInstance = null;
    authServiceCreatedForMode = null;
  }

  // Already initialized for current mode - return immediately
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
    log.info(`[factory] Initializing AuthService in ${mode} mode`);

    let instance: AuthService;

    if (mode === 'cloud' && isCloudAvailable()) {
      // Lazy load SupabaseAuthService to avoid bundling Supabase in local mode
      const { SupabaseAuthService } = await import('@/auth/SupabaseAuthService');
      instance = new SupabaseAuthService();
      log.info('[factory] Using SupabaseAuthService (cloud mode)');
    } else if (mode === 'cloud') {
      log.warn(
        '[factory] Cloud mode requested but Supabase not configured - using LocalAuthService'
      );
      instance = new LocalAuthService();
    } else {
      instance = new LocalAuthService();
    }

    await instance.initialize();
    authServiceInstance = instance;
    authServiceCreatedForMode = mode;
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
    } catch {
      // Best-effort cleanup: ignore init errors.
    }
  }

  if (dataStoreInstance) {
    await dataStoreInstance.close();
    dataStoreInstance = null;
  }

  if (authServiceInitPromise) {
    try {
      await authServiceInitPromise;
    } catch {
      // Best-effort cleanup: ignore init errors.
    }
  }

  authServiceInstance = null;
  dataStoreInitPromise = null;
  authServiceInitPromise = null;
  dataStoreCreatedForMode = null;
  authServiceCreatedForMode = null;
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
