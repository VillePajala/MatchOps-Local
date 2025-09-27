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
 * Get item from IndexedDB storage
 * @param key Storage key
 * @returns Promise resolving to stored value or null
 * @throws Error if IndexedDB is unavailable
 */
export async function getStorageItem(key: string): Promise<string | null> {
  try {
    const adapter = await getStorageAdapter();
    return adapter.getItem(key);
  } catch (error) {
    logger.error('IndexedDB storage failed - no fallback available:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Storage unavailable: ${errorMessage}. Please use a modern browser with IndexedDB support.`);
  }
}

/**
 * Set item in IndexedDB storage
 * @param key Storage key
 * @param value Value to store
 * @returns Promise resolving when storage is complete
 * @throws Error if IndexedDB is unavailable
 */
export async function setStorageItem(key: string, value: string): Promise<void> {
  try {
    const adapter = await getStorageAdapter();
    return adapter.setItem(key, value);
  } catch (error) {
    logger.error('IndexedDB storage failed - no fallback available:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Storage unavailable: ${errorMessage}. Please use a modern browser with IndexedDB support.`);
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