/**
 * DataStore & AuthService Factory
 *
 * Provides singleton instances of DataStore and AuthService.
 * Currently only supports local mode; cloud mode will be added in Phase 4.
 *
 * Part of Phase 3 backend abstraction (PR #8).
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

/**
 * Get the DataStore singleton instance.
 *
 * Creates and initializes the DataStore on first call.
 * Subsequent calls return the same instance.
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
  if (!dataStoreInstance) {
    dataStoreInstance = new LocalDataStore();
    await dataStoreInstance.initialize();
  }
  return dataStoreInstance;
}

/**
 * Get the AuthService singleton instance.
 *
 * Creates and initializes the AuthService on first call.
 * Subsequent calls return the same instance.
 *
 * @returns Initialized AuthService instance
 */
export async function getAuthService(): Promise<AuthService> {
  if (!authServiceInstance) {
    authServiceInstance = new LocalAuthService();
    await authServiceInstance.initialize();
  }
  return authServiceInstance;
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
  if (dataStoreInstance) {
    await dataStoreInstance.close();
    dataStoreInstance = null;
  }
  authServiceInstance = null;
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
