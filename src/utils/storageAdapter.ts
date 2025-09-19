/**
 * Storage Adapter Interface
 *
 * Defines a unified interface for different storage backends (localStorage, IndexedDB, etc.)
 * All methods are async to support both synchronous (localStorage) and asynchronous (IndexedDB) implementations.
 */

/**
 * Standardized error types for storage operations
 */
export enum StorageErrorType {
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  ACCESS_DENIED = 'ACCESS_DENIED',
  CORRUPTED_DATA = 'CORRUPTED_DATA',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Standardized storage error with type classification and original error preservation
 */
export class StorageError extends Error {
  constructor(
    public type: StorageErrorType,
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Generic storage adapter interface that can be implemented by different storage backends
 */
export interface StorageAdapter {
  /**
   * Retrieves an item from storage
   * @param key - The storage key
   * @returns Promise resolving to the stored value or null if not found
   */
  getItem(key: string): Promise<string | null>;

  /**
   * Stores an item in storage
   * @param key - The storage key
   * @param value - The value to store (must be a string)
   * @returns Promise that resolves when the item is stored
   * @throws Error if storage operation fails
   */
  setItem(key: string, value: string): Promise<void>;

  /**
   * Removes an item from storage
   * @param key - The storage key to remove
   * @returns Promise that resolves when the item is removed
   */
  removeItem(key: string): Promise<void>;

  /**
   * Clears all items from storage
   * @returns Promise that resolves when storage is cleared
   */
  clear(): Promise<void>;

  /**
   * Gets the storage backend name for debugging/logging purposes
   * @returns The name of the storage backend
   */
  getBackendName(): string;

  /**
   * Retrieves all keys currently stored in the storage backend
   * Essential for backup/restore functionality and storage diagnostics
   * @returns Promise resolving to array of all storage keys
   */
  getKeys(): Promise<string[]>;
}

/**
 * Type for storage mode configuration
 */
export type StorageMode = 'localStorage' | 'indexedDB';

/**
 * Configuration interface for storage adapter creation
 */
export interface StorageAdapterConfig {
  mode: StorageMode;
  dbName?: string;
  version?: number;
}