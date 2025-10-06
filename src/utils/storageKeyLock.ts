/**
 * Storage Key Locking Utility
 *
 * Prevents race conditions in read-modify-write operations on storage keys.
 * Serializes concurrent writes to the same storage key within a single tab.
 *
 * Usage:
 * ```typescript
 * export async function saveGames(games: GameData[]): Promise<boolean> {
 *   return withKeyLock(SAVED_GAMES_KEY, async () => {
 *     // ... existing save logic ...
 *   });
 * }
 * ```
 */

import { lockManager } from './lockManager';

/**
 * Execute a storage operation with exclusive access to a storage key
 *
 * @param key - Storage key to lock (e.g., 'savedSoccerGames')
 * @param operation - Async operation to execute with exclusive access
 * @param timeout - Optional timeout in milliseconds (default: 10 seconds)
 * @returns Result of the operation
 *
 * @example
 * // Prevent concurrent modifications to saved games
 * await withKeyLock(SAVED_GAMES_KEY, async () => {
 *   const games = await getStorageJSON(SAVED_GAMES_KEY);
 *   games.push(newGame);
 *   await setStorageItem(SAVED_GAMES_KEY, JSON.stringify(games));
 * });
 */
export async function withKeyLock<T>(
  key: string,
  operation: () => Promise<T>,
  timeout = 10000
): Promise<T> {
  const resource = `storage_key::${key}`;
  return lockManager.withLock(resource, operation, { timeout });
}

/**
 * Check if a storage key is currently locked
 *
 * @param key - Storage key to check
 * @returns True if the key is locked
 */
export function isKeyLocked(key: string): boolean {
  const resource = `storage_key::${key}`;
  return lockManager.isLocked(resource);
}

/**
 * Get the number of operations waiting for a storage key lock
 *
 * @param key - Storage key to check
 * @returns Number of operations in queue
 */
export function getKeyLockQueueSize(key: string): number {
  const resource = `storage_key::${key}`;
  return lockManager.getQueueSize(resource);
}
