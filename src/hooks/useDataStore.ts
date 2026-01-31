/**
 * useDataStore - React hook for accessing the DataStore with user-scoped storage.
 *
 * Provides the current user's ID and a helper function to get the DataStore.
 * Automatically uses user-scoped storage when authenticated, or falls back
 * to legacy storage when cloud is not available or user is not signed in.
 *
 * ## Usage in Hooks
 *
 * ```typescript
 * function useMyFeature() {
 *   const { userId, getStore } = useDataStore();
 *
 *   const { data } = useQuery({
 *     queryKey: ['myFeature', userId],  // Include userId in cache key
 *     queryFn: async () => {
 *       const store = await getStore();
 *       return store.getSomething();
 *     },
 *   });
 * }
 * ```
 *
 * ## Usage in Mutations
 *
 * ```typescript
 * function useMyMutation() {
 *   const { getStore } = useDataStore();
 *
 *   return useMutation({
 *     mutationFn: async (data) => {
 *       const store = await getStore();
 *       return store.saveSomething(data);
 *     },
 *   });
 * }
 * ```
 *
 * ## User-Scoped Storage
 *
 * - When cloud is available AND user is authenticated: Uses `matchops_user_{userId}` database
 * - When cloud is not available OR user is not signed in: Uses legacy `MatchOpsLocal` database
 *
 * This ensures:
 * - Local-only users (no cloud config) can use the app without authentication
 * - Cloud users get complete data isolation per-user
 * - Seamless fallback to legacy storage when appropriate
 *
 * @see docs/03-active-plans/user-scoped-storage-plan-v2.md
 */

import { useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { isCloudAvailable } from '@/config/backendConfig';
import { getDataStore } from '@/datastore/factory';
import type { DataStore } from '@/interfaces/DataStore';

/**
 * Return value from useDataStore hook.
 */
export interface UseDataStoreResult {
  /**
   * The current user's ID for user-scoped storage.
   *
   * - `string`: User is authenticated, use for user-scoped queries
   * - `undefined`: Not authenticated or cloud not available, uses legacy storage
   *
   * Include this in React Query cache keys to ensure proper cache isolation:
   * `queryKey: ['teams', userId]`
   */
  userId: string | undefined;

  /**
   * Get the DataStore instance for the current user.
   *
   * Automatically passes the correct userId to getDataStore():
   * - If cloud available and user authenticated: passes user.id
   * - Otherwise: passes undefined (legacy storage)
   *
   * @returns Promise resolving to the DataStore instance
   */
  getStore: () => Promise<DataStore>;

  /**
   * Whether user-scoped storage is active.
   *
   * true = using user-specific database (`matchops_user_{userId}`)
   * false = using legacy shared database (`MatchOpsLocal`)
   */
  isUserScoped: boolean;
}

/**
 * Hook for accessing the DataStore with automatic user-scoped storage.
 *
 * Combines authentication state with DataStore access to ensure data
 * is stored in the correct user-scoped or legacy database.
 *
 * @returns Object with userId, getStore function, and isUserScoped flag
 *
 * @example
 * ```typescript
 * // In a React Query hook
 * function useTeams() {
 *   const { userId, getStore } = useDataStore();
 *
 *   return useQuery({
 *     queryKey: ['teams', userId],
 *     queryFn: async () => {
 *       const store = await getStore();
 *       return store.getTeams();
 *     },
 *   });
 * }
 *
 * // In a mutation
 * function useCreateTeam() {
 *   const { getStore } = useDataStore();
 *
 *   return useMutation({
 *     mutationFn: async (teamData) => {
 *       const store = await getStore();
 *       return store.createTeam(teamData);
 *     },
 *   });
 * }
 * ```
 */
export function useDataStore(): UseDataStoreResult {
  const { user } = useAuth();

  // Determine the userId for user-scoped storage:
  // - Cloud available AND authenticated: use user.id for user-scoped database
  // - Cloud not available OR not authenticated: use undefined for legacy database
  //
  // Note: isCloudAvailable() checks env vars, not runtime connectivity.
  // We use user-scoped storage whenever:
  // 1. Supabase is configured (env vars present), AND
  // 2. User is authenticated
  //
  // This applies regardless of the current backend mode (local vs cloud).
  // Rationale: When a user switches between local and cloud modes, their data
  // should remain in the same user-specific database. Using user-scoped storage
  // consistently ensures data persists correctly across mode switches.
  // The mode only controls whether sync happens, not where local data is stored.
  const cloudAvailable = isCloudAvailable();
  const userId = cloudAvailable && user?.id ? user.id : undefined;

  // Memoize getStore to prevent unnecessary re-renders
  const getStore = useCallback(async (): Promise<DataStore> => {
    return getDataStore(userId);
  }, [userId]);

  // Memoize the result object
  return useMemo(
    () => ({
      userId,
      getStore,
      isUserScoped: !!userId,
    }),
    [userId, getStore]
  );
}
