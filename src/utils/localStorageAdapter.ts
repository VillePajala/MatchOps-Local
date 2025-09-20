/**
 * LocalStorage Adapter Implementation
 *
 * Implements the StorageAdapter interface using localStorage as the backend.
 * Wraps existing localStorage utilities with structured error handling and logging.
 */

import {
  getStorage,
  getLocalStorageItem,
  setLocalStorageItem,
  removeLocalStorageItem,
  clearLocalStorage
} from './localStorage';
import { createLogger } from './logger';
import { StorageAdapter, StorageError, StorageErrorType } from './storageAdapter';

/**
 * LocalStorage implementation of the StorageAdapter interface
 *
 * Features:
 * - Wraps existing localStorage utilities for stability
 * - Comprehensive error handling with structured error types
 * - Integrated logging for debugging and monitoring
 * - Performance-optimized getKeys() implementation
 */
export class LocalStorageAdapter implements StorageAdapter {
  private logger = createLogger('LocalStorageAdapter');

  /**
   * Formats byte size into human-readable format
   * @param bytes - Size in bytes
   * @returns Formatted string (e.g., "150B", "10.5KB", "2.3MB")
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  /**
   * Retrieves a value from localStorage
   * @param key - The storage key to retrieve
   * @returns The stored value or null if not found
   * @throws {StorageError} With ACCESS_DENIED type if localStorage is unavailable
   */
  async getItem(key: string): Promise<string | null> {
    try {
      this.logger.debug('Getting item from localStorage', { key });
      const result = getLocalStorageItem(key);
      this.logger.debug('Retrieved item from localStorage', { key, hasValue: result !== null });
      return result;
    } catch (error) {
      this.logger.error('Failed to get item from localStorage', { key, error });
      throw new StorageError(
        StorageErrorType.ACCESS_DENIED,
        `Failed to get localStorage item: ${key}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Stores a value in localStorage
   * @param key - The storage key to use
   * @param value - The string value to store
   * @throws {StorageError} With QUOTA_EXCEEDED type if storage limit reached
   * @throws {StorageError} With ACCESS_DENIED type if localStorage is unavailable
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      this.logger.debug('Setting item in localStorage', {
        key,
        valueSize: this.formatSize(value.length)
      });
      setLocalStorageItem(key, value);
      this.logger.debug('Successfully set item in localStorage', { key });
    } catch (error) {
      // Handle quota exceeded (most common localStorage error)
      if (this.isQuotaExceededError(error)) {
        this.logger.error('localStorage quota exceeded', {
          key,
          valueSize: this.formatSize(value.length),
          error
        });
        throw new StorageError(
          StorageErrorType.QUOTA_EXCEEDED,
          `localStorage quota exceeded (key: ${key}, size: ${this.formatSize(value.length)})`,
          error instanceof Error ? error : new Error(String(error))
        );
      }

      // Handle other access errors
      this.logger.error('Failed to set item in localStorage', { key, error });
      throw new StorageError(
        StorageErrorType.ACCESS_DENIED,
        `Failed to set localStorage item: ${key}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Removes a value from localStorage
   * @param key - The storage key to remove
   * @throws {StorageError} With ACCESS_DENIED type if localStorage is unavailable
   */
  async removeItem(key: string): Promise<void> {
    try {
      this.logger.debug('Removing item from localStorage', { key });
      removeLocalStorageItem(key);
      this.logger.debug('Successfully removed item from localStorage', { key });
    } catch (error) {
      this.logger.error('Failed to remove item from localStorage', { key, error });
      throw new StorageError(
        StorageErrorType.ACCESS_DENIED,
        `Failed to remove localStorage item: ${key}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Clears all values from localStorage
   * @throws {StorageError} With ACCESS_DENIED type if localStorage is unavailable
   */
  async clear(): Promise<void> {
    try {
      this.logger.debug('Clearing localStorage');
      clearLocalStorage();
      this.logger.debug('Successfully cleared localStorage');
    } catch (error) {
      this.logger.error('Failed to clear localStorage', { error });
      throw new StorageError(
        StorageErrorType.ACCESS_DENIED,
        'Failed to clear localStorage',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Returns the name of the storage backend
   * @returns The string 'localStorage'
   */
  getBackendName(): string {
    return 'localStorage';
  }

  /**
   * Retrieves all keys currently stored in localStorage
   * @returns Array of storage keys, filtered to exclude null values
   * @throws {StorageError} With ACCESS_DENIED type if localStorage is unavailable
   */
  async getKeys(): Promise<string[]> {
    try {
      this.logger.debug('Getting localStorage keys');
      const storage = getStorage();

      if (!storage) {
        this.logger.error('localStorage not available');
        throw new StorageError(
          StorageErrorType.ACCESS_DENIED,
          'localStorage not available (getKeys operation failed)'
        );
      }

      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key) {
          keys.push(key);
        }
      }

      this.logger.debug('Successfully retrieved localStorage keys', { keyCount: keys.length });
      return keys;
    } catch (error) {
      this.logger.error('Failed to get localStorage keys', { error });

      // Re-throw StorageError as-is
      if (error instanceof StorageError) {
        throw error;
      }

      throw new StorageError(
        StorageErrorType.ACCESS_DENIED,
        'Failed to get localStorage keys',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Checks if an error is a quota exceeded error
   * Handles various browser implementations of quota exceeded errors
   */
  private isQuotaExceededError(error: unknown): boolean {
    if (!error) return false;

    // Handle DOMException
    if (error instanceof DOMException) {
      return error.name === 'QuotaExceededError' ||
             error.code === 22; // QUOTA_EXCEEDED_ERR
    }

    // Handle Error objects with quota-related messages
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('quota') ||
             message.includes('exceeded') ||
             message.includes('storage') && message.includes('full');
    }

    // Handle string errors
    if (typeof error === 'string') {
      const message = error.toLowerCase();
      return message.includes('quota') || message.includes('exceeded');
    }

    return false;
  }
}