import { createStorageAdapter } from './storageFactory';
import { StorageAdapter } from './storageAdapter';
import logger from './logger';

let adapterPromise: Promise<StorageAdapter> | null = null;
let adapterCreatedAt: number | null = null;
let adapterRetryCount: number = 0;
let lastFailureTime: number | null = null;

// Configurable TTL for adapter caching (default: 5 minutes)
const ADAPTER_TTL = parseInt(process.env.NEXT_PUBLIC_STORAGE_ADAPTER_TTL_MS || '300000', 10);
// Retry configuration
const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 10000; // 10 seconds

/**
 * Check if cached adapter has expired based on TTL
 */
function isAdapterExpired(): boolean {
  if (!adapterCreatedAt) return true;
  return Date.now() - adapterCreatedAt > ADAPTER_TTL;
}

/**
 * Calculate exponential backoff delay for retry attempts
 */
function calculateRetryDelay(retryCount: number): number {
  const exponentialDelay = BASE_RETRY_DELAY * Math.pow(2, retryCount);
  return Math.min(exponentialDelay, MAX_RETRY_DELAY);
}

/**
 * Check if enough time has passed since last failure to allow retry
 */
function canRetryNow(): boolean {
  if (!lastFailureTime) return true;
  if (adapterRetryCount >= MAX_RETRY_ATTEMPTS) return false;

  const requiredDelay = calculateRetryDelay(adapterRetryCount);
  return Date.now() - lastFailureTime >= requiredDelay;
}

/**
 * Get IndexedDB storage adapter (IndexedDB-only, no localStorage fallback)
 * Implements TTL-based caching to prevent memory leaks and ensure fresh connections
 * @returns Promise resolving to IndexedDB storage adapter
 * @throws Error if IndexedDB is unavailable
 */
export async function getStorageAdapter(): Promise<StorageAdapter> {
  // Check if we need to refresh the adapter due to TTL expiration
  if (!adapterPromise || isAdapterExpired()) {
    // Clear expired adapter
    if (adapterPromise && isAdapterExpired()) {
      logger.debug('Storage adapter TTL expired, creating fresh adapter');
      adapterPromise = null;
      adapterCreatedAt = null;
      // Reset retry state on TTL expiration
      adapterRetryCount = 0;
      lastFailureTime = null;
    }

    // Check if we can retry now (respects exponential backoff)
    if (!canRetryNow()) {
      const nextRetryDelay = calculateRetryDelay(adapterRetryCount);
      const timeUntilRetry = lastFailureTime ? (lastFailureTime + nextRetryDelay - Date.now()) : 0;

      logger.warn(`Storage adapter creation still in backoff period. Next retry in ${Math.max(0, timeUntilRetry)}ms`);
      throw new Error(`Storage adapter unavailable. Retry in ${Math.ceil(Math.max(0, timeUntilRetry) / 1000)} seconds.`);
    }

    // Force IndexedDB only - no localStorage fallback with retry logic
    adapterPromise = createStorageAdapter('indexedDB').then(adapter => {
      // Success: reset retry state
      adapterRetryCount = 0;
      lastFailureTime = null;
      logger.debug('Storage adapter created successfully after retries');
      return adapter;
    }).catch(error => {
      // Failure: update retry state and clear promise
      adapterRetryCount++;
      lastFailureTime = Date.now();
      adapterPromise = null;
      adapterCreatedAt = null;

      const nextDelay = calculateRetryDelay(adapterRetryCount);
      logger.error(`Storage adapter creation failed (attempt ${adapterRetryCount}/${MAX_RETRY_ATTEMPTS}). Next retry in ${nextDelay}ms`, error);

      // Include retry information in error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Storage unavailable: ${errorMessage}. Retry ${adapterRetryCount}/${MAX_RETRY_ATTEMPTS} in ${Math.ceil(nextDelay / 1000)}s.`);
    });

    // Record creation time for TTL tracking
    adapterCreatedAt = Date.now();
  }
  return adapterPromise;
}

/**
 * Get item from IndexedDB storage with graceful error handling
 * @param key Storage key
 * @param options Configuration for error handling
 * @returns Promise resolving to stored value or null
 * @throws Error only for critical failures when throwOnError is true
 */
export async function getStorageItem(
  key: string,
  options: { throwOnError?: boolean; retryCount?: number } = {}
): Promise<string | null> {
  const { throwOnError = false, retryCount = 2 } = options;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const adapter = await getStorageAdapter();
      return adapter.getItem(key);
    } catch (error) {
      logger.error(`IndexedDB read failed for key "${key}" (attempt ${attempt + 1}/${retryCount + 1}):`, error);

      // If this is the last attempt or throwOnError is enabled
      if (attempt === retryCount) {
        if (throwOnError) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          throw new Error(`Storage unavailable: ${errorMessage}. Please use a modern browser with IndexedDB support.`);
        } else {
          // Graceful degradation: return null for non-critical reads
          logger.warn(`Graceful degradation: returning null for key "${key}" after ${retryCount + 1} attempts`);
          return null;
        }
      }

      // Wait before retry with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return null; // Should never reach here
}

/**
 * Set item in IndexedDB storage with retry logic
 * @param key Storage key
 * @param value Value to store
 * @param options Configuration for error handling
 * @returns Promise resolving when storage is complete
 * @throws Error if IndexedDB is unavailable after retries
 */
export async function setStorageItem(
  key: string,
  value: string,
  options: { retryCount?: number } = {}
): Promise<void> {
  const { retryCount = 2 } = options;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const adapter = await getStorageAdapter();
      return adapter.setItem(key, value);
    } catch (error) {
      logger.error(`IndexedDB write failed for key "${key}" (attempt ${attempt + 1}/${retryCount + 1}):`, error);

      // If this is the last attempt, throw the error
      if (attempt === retryCount) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Storage write failed: ${errorMessage}. Data could not be saved.`);
      }

      // Wait before retry with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Remove item from IndexedDB storage
 * @param key Storage key to remove
 * @returns Promise resolving when removal is complete
 * @throws Error if IndexedDB is unavailable
 */
export async function removeStorageItem(key: string): Promise<void> {
  try {
    const adapter = await getStorageAdapter();
    return adapter.removeItem(key);
  } catch (error) {
    logger.error('IndexedDB storage failed - no fallback available:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Storage unavailable: ${errorMessage}. Please use a modern browser with IndexedDB support.`);
  }
}

/**
 * Clear all items from IndexedDB storage
 * @returns Promise resolving when clear is complete
 * @throws Error if IndexedDB is unavailable
 */
export async function clearStorage(): Promise<void> {
  try {
    const adapter = await getStorageAdapter();
    return adapter.clear();
  } catch (error) {
    logger.error('IndexedDB storage failed - no fallback available:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Storage unavailable: ${errorMessage}. Please use a modern browser with IndexedDB support.`);
  }
}

/**
 * Batch read multiple keys in parallel for improved performance
 * @param keys Array of storage keys to read
 * @param options Configuration for error handling and parallelism
 * @returns Promise resolving to map of key-value pairs
 */
export async function getStorageItems(
  keys: string[],
  options: { batchSize?: number; throwOnError?: boolean } = {}
): Promise<Record<string, string | null>> {
  const { batchSize = 10, throwOnError = false } = options;
  const results: Record<string, string | null> = {};

  // Process keys in batches to avoid overwhelming IndexedDB
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);

    // Read batch in parallel
    const batchPromises = batch.map(async (key) => {
      try {
        const value = await getStorageItem(key, { throwOnError });
        return { key, value };
      } catch (error) {
        logger.error(`Failed to read key "${key}" in batch:`, error);
        return { key, value: null };
      }
    });

    const batchResults = await Promise.all(batchPromises);

    // Merge results
    for (const { key, value } of batchResults) {
      results[key] = value;
    }

    // Small delay between batches to prevent overwhelming IndexedDB
    if (i + batchSize < keys.length) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  return results;
}

/**
 * Batch write multiple key-value pairs for improved performance
 * @param items Record of key-value pairs to write
 * @param options Configuration for error handling and parallelism
 * @returns Promise resolving when all writes complete
 */
export async function setStorageItems(
  items: Record<string, string>,
  options: { batchSize?: number } = {}
): Promise<void> {
  const { batchSize = 10 } = options;
  const entries = Object.entries(items);

  // Process entries in batches
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);

    // Write batch in parallel
    const batchPromises = batch.map(async ([key, value]) => {
      try {
        await setStorageItem(key, value);
        return { key, success: true };
      } catch (error) {
        logger.error(`Failed to write key "${key}" in batch:`, error);
        return { key, success: false, error };
      }
    });

    const batchResults = await Promise.all(batchPromises);

    // Check for failures
    const failures = batchResults.filter(result => !result.success);
    if (failures.length > 0) {
      const failedKeys = failures.map(f => f.key).join(', ');
      logger.warn(`Batch write had ${failures.length} failures for keys: ${failedKeys}`);
    }

    // Small delay between batches
    if (i + batchSize < entries.length) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}

/**
 * Get all storage data in parallel for bulk operations (e.g., backup/export)
 * @param options Configuration for filtering and performance
 * @returns Promise resolving to all key-value pairs
 */
export async function getAllStorageData(
  options: { keyPrefix?: string; batchSize?: number } = {}
): Promise<Record<string, string | null>> {
  const { keyPrefix, batchSize = 20 } = options;

  try {
    const adapter = await getStorageAdapter();
    const allKeys = await adapter.getKeys();

    // Filter keys if prefix specified
    const filteredKeys = keyPrefix
      ? allKeys.filter(key => key.startsWith(keyPrefix))
      : allKeys;

    logger.debug(`Reading ${filteredKeys.length} keys in parallel batches of ${batchSize}`);

    return await getStorageItems(filteredKeys, { batchSize });
  } catch (error) {
    logger.error('Failed to get all storage data:', error);
    throw new Error('Failed to retrieve storage data for bulk operation');
  }
}

/**
 * Type-safe JSON operations with validation
 */

/**
 * Get and parse JSON data with type safety
 * @param key Storage key
 * @param options Configuration for error handling and validation
 * @returns Promise resolving to parsed JSON data or null
 */
export async function getStorageJSON<T = unknown>(
  key: string,
  options: {
    throwOnError?: boolean;
    validator?: (data: unknown) => data is T;
    defaultValue?: T;
  } = {}
): Promise<T | null> {
  const { throwOnError = false, validator, defaultValue } = options;

  try {
    const value = await getStorageItem(key, { throwOnError });
    if (value === null) {
      return defaultValue ?? null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch (parseError) {
      logger.warn(`Failed to parse JSON for key "${key}":`, parseError);
      if (throwOnError) {
        throw new Error(`Invalid JSON data for key "${key}"`);
      }
      return defaultValue ?? null;
    }

    // Type validation if validator provided
    if (validator) {
      if (validator(parsed)) {
        return parsed;
      } else {
        logger.warn(`Type validation failed for key "${key}"`);
        if (throwOnError) {
          throw new Error(`Type validation failed for key "${key}"`);
        }
        return defaultValue ?? null;
      }
    }

    return parsed as T;
  } catch (error) {
    logger.error(`Failed to get JSON for key "${key}":`, error);
    if (throwOnError) {
      throw error;
    }
    return defaultValue ?? null;
  }
}

/**
 * Set JSON data with type safety
 * @param key Storage key
 * @param value Value to store (will be JSON.stringify'd)
 * @param options Configuration for error handling
 * @returns Promise resolving when storage is complete
 */
export async function setStorageJSON<T>(
  key: string,
  value: T,
  options: { retryCount?: number } = {}
): Promise<void> {
  try {
    const jsonString = JSON.stringify(value);
    await setStorageItem(key, jsonString, options);
  } catch (error) {
    logger.error(`Failed to set JSON for key "${key}":`, error);
    throw new Error(`Failed to store JSON data for key "${key}"`);
  }
}

/**
 * Type guards for common data types
 */
export const typeGuards = {
  isString: (value: unknown): value is string => typeof value === 'string',
  isNumber: (value: unknown): value is number => typeof value === 'number' && !isNaN(value),
  isBoolean: (value: unknown): value is boolean => typeof value === 'boolean',
  isArray: (value: unknown): value is unknown[] => Array.isArray(value),
  isObject: (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value),

  // App-specific type guards
  isPlayer: (value: unknown): value is { id: string; name: string; jerseyNumber: string } => {
    return typeGuards.isObject(value) &&
           typeGuards.isString((value as Record<string, unknown>).id) &&
           typeGuards.isString((value as Record<string, unknown>).name) &&
           typeGuards.isString((value as Record<string, unknown>).jerseyNumber);
  },

  isGameSession: (value: unknown): value is {
    id: string;
    teamName: string;
    periods: number;
    periodDuration: number;
  } => {
    return typeGuards.isObject(value) &&
           typeGuards.isString((value as Record<string, unknown>).id) &&
           typeGuards.isString((value as Record<string, unknown>).teamName) &&
           typeGuards.isNumber((value as Record<string, unknown>).periods) &&
           typeGuards.isNumber((value as Record<string, unknown>).periodDuration);
  }
};

/**
 * Clear cached adapter to force fresh connection on next access
 * Useful for testing, error recovery, or manual refresh scenarios
 */
export function clearAdapterCache(): void {
  logger.debug('Manually clearing storage adapter cache');
  adapterPromise = null;
  adapterCreatedAt = null;
  // Also reset retry state to allow immediate retry
  adapterRetryCount = 0;
  lastFailureTime = null;
}