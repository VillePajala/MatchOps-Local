import { createStorageAdapter } from './storageFactory';
import { StorageAdapter } from './storageAdapter';
import logger from './logger';

let adapterPromise: Promise<StorageAdapter> | null = null;

/**
 * Get IndexedDB storage adapter (IndexedDB-only, no localStorage fallback)
 * @returns Promise resolving to IndexedDB storage adapter
 * @throws Error if IndexedDB is unavailable
 */
export async function getStorageAdapter(): Promise<StorageAdapter> {
  if (!adapterPromise) {
    // Force IndexedDB only - no localStorage fallback
    adapterPromise = createStorageAdapter('indexedDB').catch(error => {
      // Clear failed promise to allow retry
      adapterPromise = null;
      throw error;
    });
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
    throw new Error('Storage unavailable. Please use a modern browser with IndexedDB support.');
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
    throw new Error('Storage unavailable. Please use a modern browser with IndexedDB support.');
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
    throw new Error('Storage unavailable. Please use a modern browser with IndexedDB support.');
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
    throw new Error('Storage unavailable. Please use a modern browser with IndexedDB support.');
  }
}