/**
 * DataStore & AuthService Factory
 *
 * Provides singleton instances of DataStore and AuthService.
 * Currently only supports local mode; cloud mode will be added in Phase 4.
 *
 * Part of Phase 3 backend abstraction (PR #137).
 *
 * @see docs/03-active-plans/backend-evolution/REALISTIC-IMPLEMENTATION-PLAN.md
 */

import type { DataStore } from '@/interfaces/DataStore';
import type { AuthService } from '@/interfaces/AuthService';
import { LocalDataStore } from './LocalDataStore';
import { LocalAuthService } from '@/auth/LocalAuthService';

// Singleton instances
let dataStoreInstance: DataStore | null = null;
let authServiceInstance: AuthService | null = null;

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
  // Already initialized - return immediately
  if (dataStoreInstance) {
    return dataStoreInstance;
  }

  // Initialization in progress - wait for it
  if (dataStoreInitPromise) {
    return dataStoreInitPromise;
  }

  // Start initialization and store the promise
  dataStoreInitPromise = (async () => {
    const instance = new LocalDataStore();
    await instance.initialize();
    dataStoreInstance = instance;
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
 * @returns Initialized AuthService instance
 */
export async function getAuthService(): Promise<AuthService> {
  // Already initialized - return immediately
  if (authServiceInstance) {
    return authServiceInstance;
  }

  // Initialization in progress - wait for it
  if (authServiceInitPromise) {
    return authServiceInitPromise;
  }

  // Start initialization and store the promise
  authServiceInitPromise = (async () => {
    const instance = new LocalAuthService();
    await instance.initialize();
    authServiceInstance = instance;
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
