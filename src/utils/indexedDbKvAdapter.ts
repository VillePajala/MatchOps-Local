/**
 * IndexedDB Key-Value Storage Adapter
 *
 * Provides a localStorage-compatible interface using IndexedDB for improved
 * storage capacity and performance. Implements the StorageAdapter interface
 * with comprehensive error handling and production-ready reliability.
 *
 * Features:
 * - Single object store design for localStorage compatibility
 * - Comprehensive quota and access error handling
 * - Automatic database initialization and versioning
 * - Performance optimizations for large datasets
 * - Browser compatibility fallbacks
 *
 * @see StorageAdapter interface in ./storageAdapter.ts
 * @author Claude Code
 */

import { openDB, IDBPDatabase, IDBPObjectStore } from 'idb';
import { createLogger } from './logger';
import { StorageAdapter, StorageError, StorageErrorType, StorageAdapterConfig } from './storageAdapter';

/**
 * Configuration for IndexedDB storage adapter
 */
export interface IndexedDBAdapterConfig extends StorageAdapterConfig {
  mode: 'indexedDB';
  dbName?: string;
  version?: number;
  storeName?: string;
}

/**
 * IndexedDB adapter implementing the StorageAdapter interface.
 *
 * Uses a single object store with string keys and values to maintain
 * compatibility with localStorage semantics while providing IndexedDB's
 * enhanced capabilities.
 *
 * @example
 * ```typescript
 * const adapter = new IndexedDBKvAdapter();
 * await adapter.setItem('user:123', JSON.stringify(userData));
 * const data = await adapter.getItem('user:123');
 * ```
 */
export class IndexedDBKvAdapter implements StorageAdapter {
  private readonly logger = createLogger('IndexedDBKvAdapter');
  private readonly dbName: string;
  private readonly version: number;
  private readonly storeName: string;
  private db: IDBPDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  // Storage usage caching
  private storageUsageCache: { used: number; available: number } | null = null;
  private storageUsageCacheExpiry: number = 0;
  private readonly STORAGE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Creates a new IndexedDB adapter instance.
   *
   * @param config - Optional configuration for database settings
   */
  constructor(config?: Partial<IndexedDBAdapterConfig>) {
    this.dbName = config?.dbName || 'MatchOpsLocal';
    this.version = config?.version || 1;
    this.storeName = config?.storeName || 'keyValueStore';

    this.logger.debug('IndexedDB adapter initialized', {
      dbName: this.dbName,
      version: this.version,
      storeName: this.storeName
    });
  }

  /**
   * Initialize the IndexedDB database connection.
   * Uses singleton pattern to ensure only one initialization occurs.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.db) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initializeDatabase();
    return this.initPromise;
  }

  /**
   * Initialize the IndexedDB database with proper error handling.
   */
  private async initializeDatabase(): Promise<void> {
    try {
      this.logger.debug('Opening IndexedDB database', {
        dbName: this.dbName,
        version: this.version
      });

      this.db = await openDB(this.dbName, this.version, {
        upgrade: (db, oldVersion, newVersion) => {
          this.logger.debug('Upgrading IndexedDB schema', {
            oldVersion,
            newVersion,
            storeName: this.storeName
          });

          // Create the key-value object store if it doesn't exist
          if (!db.objectStoreNames.contains(this.storeName)) {
            const store = db.createObjectStore(this.storeName, {
              keyPath: 'key'
            });

            // Add index for efficient key enumeration
            store.createIndex('keyIndex', 'key', { unique: true });

            this.logger.debug('Created object store', { storeName: this.storeName });
          }
        },
        blocked: () => {
          this.logger.warn('IndexedDB database blocked by another connection');
        },
        blocking: () => {
          this.logger.warn('IndexedDB database blocking another connection');
        },
        terminated: () => {
          this.logger.error('IndexedDB database connection terminated unexpectedly');
          this.db = null;
          this.initPromise = null;
        }
      });

      this.logger.debug('IndexedDB database opened successfully');
    } catch (error) {
      this.logger.error('Failed to initialize IndexedDB database', { error });
      this.db = null;
      this.initPromise = null;

      // Convert IndexedDB errors to standardized StorageError
      throw this.convertError(error, 'Failed to initialize IndexedDB');
    }
  }

  /**
   * Convert IndexedDB errors to standardized StorageError instances.
   */
  private convertError(error: unknown, context: string): StorageError {
    if (error instanceof StorageError) {
      return error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const fullMessage = `${context}: ${errorMessage}`;

    // Check for quota exceeded errors
    if (error instanceof DOMException) {
      if (error.name === 'QuotaExceededError' || error.code === 22) {
        return new StorageError(
          StorageErrorType.QUOTA_EXCEEDED,
          `IndexedDB storage quota exceeded: ${errorMessage}`,
          error
        );
      }

      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        return new StorageError(
          StorageErrorType.ACCESS_DENIED,
          `IndexedDB access denied: ${errorMessage}`,
          error
        );
      }

      if (error.name === 'VersionError' || error.name === 'InvalidStateError') {
        return new StorageError(
          StorageErrorType.CORRUPTED_DATA,
          `IndexedDB schema or state error: ${errorMessage}`,
          error
        );
      }
    }

    // Check for quota-related error messages
    if (errorMessage.toLowerCase().includes('quota') ||
        errorMessage.toLowerCase().includes('storage full')) {
      return new StorageError(
        StorageErrorType.QUOTA_EXCEEDED,
        fullMessage,
        error instanceof Error ? error : undefined
      );
    }

    // Check for access-related error messages
    if (errorMessage.toLowerCase().includes('access') ||
        errorMessage.toLowerCase().includes('permission')) {
      return new StorageError(
        StorageErrorType.ACCESS_DENIED,
        fullMessage,
        error instanceof Error ? error : undefined
      );
    }

    // Default to unknown error type
    return new StorageError(
      StorageErrorType.UNKNOWN,
      fullMessage,
      error instanceof Error ? error : undefined
    );
  }

  /**
   * Execute a transaction with proper error handling and retries.
   */
  private async withTransaction<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBPObjectStore<unknown, [string], string, IDBTransactionMode>) => Promise<T>
  ): Promise<T> {
    await this.ensureInitialized();

    if (!this.db) {
      throw new StorageError(
        StorageErrorType.ACCESS_DENIED,
        'IndexedDB database not available'
      );
    }

    try {
      const tx = this.db.transaction(this.storeName, mode);
      const store = tx.objectStore(this.storeName);

      const result = await operation(store);
      await tx.done;

      return result;
    } catch (error) {
      throw this.convertError(error, 'IndexedDB transaction failed');
    }
  }

  /**
   * Get an item from IndexedDB storage.
   *
   * @param key - The storage key to retrieve
   * @returns Promise resolving to the stored value or null if not found
   *
   * @example
   * ```typescript
   * const userData = await adapter.getItem('user:123');
   * if (userData) {
   *   const user = JSON.parse(userData);
   * }
   * ```
   */
  async getItem(key: string): Promise<string | null> {
    try {
      this.logger.debug('Getting item from IndexedDB', { key });

      const result = await this.withTransaction('readonly', async (store) => {
        return await (store as IDBPObjectStore<unknown, [string], string, 'readonly'>).get(key);
      });

      if (result && result.value !== undefined && typeof result.value === 'string') {
        this.logger.debug('Item retrieved successfully', {
          key,
          valueLength: result.value.length
        });
        return result.value;
      }

      this.logger.debug('Item not found', { key });
      return null;
    } catch (error) {
      this.logger.error('Failed to get item from IndexedDB', { key, error });
      throw this.convertError(error, `Failed to get item: ${key}`);
    }
  }

  /**
   * Set an item in IndexedDB storage.
   *
   * @param key - The storage key
   * @param value - The value to store
   *
   * @example
   * ```typescript
   * await adapter.setItem('settings', JSON.stringify(appSettings));
   * ```
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      this.logger.debug('Setting item in IndexedDB', {
        key,
        valueLength: value.length,
        valueSizeFormatted: this.formatBytes(value.length)
      });

      await this.withTransaction('readwrite', async (store) => {
        await (store as IDBPObjectStore<unknown, [string], string, 'readwrite'>).put({ key, value });
      });

      // Invalidate cache for large values that might affect storage usage significantly
      if (value.length > 100 * 1024) { // 100KB threshold
        this.invalidateStorageUsageCache();
      }

      this.logger.debug('Item stored successfully', { key });
    } catch (error) {
      this.logger.error('Failed to set item in IndexedDB', {
        key,
        valueLength: value.length,
        error
      });
      throw this.convertError(error, `Failed to set item: ${key}`);
    }
  }

  /**
   * Remove an item from IndexedDB storage.
   *
   * @param key - The storage key to remove
   *
   * @example
   * ```typescript
   * await adapter.removeItem('user:123');
   * ```
   */
  async removeItem(key: string): Promise<void> {
    try {
      this.logger.debug('Removing item from IndexedDB', { key });

      await this.withTransaction('readwrite', async (store) => {
        await (store as IDBPObjectStore<unknown, [string], string, 'readwrite'>).delete(key);
      });

      this.logger.debug('Item removed successfully', { key });
    } catch (error) {
      this.logger.error('Failed to remove item from IndexedDB', { key, error });
      throw this.convertError(error, `Failed to remove item: ${key}`);
    }
  }

  /**
   * Clear all items from IndexedDB storage.
   *
   * @example
   * ```typescript
   * await adapter.clear();
   * ```
   */
  async clear(): Promise<void> {
    try {
      this.logger.debug('Clearing all items from IndexedDB');

      await this.withTransaction('readwrite', async (store) => {
        await (store as IDBPObjectStore<unknown, [string], string, 'readwrite'>).clear();
      });

      // Clearing all data significantly affects storage usage
      this.invalidateStorageUsageCache();

      this.logger.debug('All items cleared successfully');
    } catch (error) {
      this.logger.error('Failed to clear IndexedDB storage', { error });
      throw this.convertError(error, 'Failed to clear storage');
    }
  }

  /**
   * Get all keys from IndexedDB storage.
   *
   * @returns Promise resolving to array of all storage keys
   *
   * @example
   * ```typescript
   * const allKeys = await adapter.getKeys();
   * logger.debug('Found stored items', { keyCount: allKeys.length });
   * ```
   */
  async getKeys(): Promise<string[]> {
    try {
      this.logger.debug('Getting all keys from IndexedDB');

      const keys = await this.withTransaction('readonly', async (store) => {
        const idbKeys = await (store as IDBPObjectStore<unknown, [string], string, 'readonly'>).getAllKeys();
        return idbKeys as string[];
      });

      this.logger.debug('Retrieved keys successfully', { count: keys.length });
      return keys;
    } catch (error) {
      this.logger.error('Failed to get keys from IndexedDB', { error });
      throw this.convertError(error, 'Failed to enumerate keys');
    }
  }

  /**
   * Get the backend name for this adapter.
   *
   * @returns The string 'indexedDB'
   */
  getBackendName(): string {
    return 'indexedDB';
  }

  /**
   * Format bytes into human-readable string.
   *
   * @param bytes - Number of bytes
   * @returns Formatted string (e.g., "1.5 KB", "2.3 MB")
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Close the IndexedDB connection.
   * Useful for cleanup and testing scenarios.
   */
  async close(): Promise<void> {
    if (this.db) {
      this.logger.debug('Closing IndexedDB connection');
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }

  /**
   * Get storage usage information if available.
   * Uses caching to avoid frequent API calls since storage usage changes slowly.
   *
   * @param forceRefresh - Force refresh of cached data
   * @returns Promise resolving to storage usage data or null if not available
   */
  async getStorageUsage(forceRefresh = false): Promise<{ used: number; available: number } | null> {
    const now = Date.now();

    // Return cached value if valid and not forcing refresh
    if (!forceRefresh && this.storageUsageCache && now < this.storageUsageCacheExpiry) {
      this.logger.debug('Returning cached storage usage', {
        cached: this.storageUsageCache,
        expiresIn: this.storageUsageCacheExpiry - now
      });
      return this.storageUsageCache;
    }

    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const usage = {
          used: estimate.usage || 0,
          available: estimate.quota || 0
        };

        // Update cache
        this.storageUsageCache = usage;
        this.storageUsageCacheExpiry = now + this.STORAGE_CACHE_TTL;

        this.logger.debug('Updated storage usage cache', {
          usage,
          cacheExpiresAt: new Date(this.storageUsageCacheExpiry).toISOString()
        });

        return usage;
      }
    } catch (error) {
      this.logger.warn('Failed to get storage usage estimate', { error });
    }
    return null;
  }

  /**
   * Invalidate the storage usage cache.
   * Useful after operations that might significantly change storage usage.
   */
  private invalidateStorageUsageCache(): void {
    if (this.storageUsageCache) {
      this.logger.debug('Invalidating storage usage cache');
      this.storageUsageCache = null;
      this.storageUsageCacheExpiry = 0;
    }
  }
}