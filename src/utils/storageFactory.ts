/**
 * INDEXEDDB BRANCH CONTEXT (Branch 1/4):
 * - Current: IndexedDB storage foundation implementation
 * - Migration: Completed separately (not main focus)
 * - Review Focus: Storage architecture quality, async patterns, type safety
 * - Next: Branches 2-4 will build advanced features on this foundation
 */

/**
 * Storage Factory for Adapter Selection and Configuration Management
 *
 * Provides centralized adapter selection between localStorage and IndexedDB based on:
 * - User preferences and configuration flags
 * - Browser capability detection
 * - Migration state and fallback scenarios
 * - Environment-specific overrides
 *
 * Features:
 * - IndexedDB-only adapter selection (no localStorage fallbacks)
 * - Configuration persistence and management
 * - Browser compatibility detection
 * - Migration state awareness
 * - Development/testing overrides
 *
 * FUTURE ENHANCEMENTS (Phase 1):
 *
 * 🔗 IndexedDB Connection Pool:
 * - Implement connection reuse across adapter instances
 * - Add connection health checks and automatic reconnection
 * - Reduce browser connection overhead for frequent operations
 * - Monitor connection state and implement graceful degradation
 *
 * ⚡ Performance Optimizations:
 * - Batch operations for multiple key-value pairs
 * - Transaction support for atomic operations
 * - Lazy loading for large datasets
 * - Compression for large values
 * - Background sync and prefetching strategies
 *
 * 🧪 Enhanced Testing:
 * - Stress tests for concurrent adapter creation
 * - Integration tests with real browser APIs
 * - Performance benchmarks for large datasets
 * - Browser-specific edge case testing
 *
 * @see StorageAdapter interface in ./storageAdapter.ts
 * @author Claude Code
 */

import { StorageAdapter, StorageError, StorageErrorType } from './storageAdapter';
import { IndexedDBKvAdapter } from './indexedDbKvAdapter';
import { createLogger } from './logger';
import { storageConfigManager, type StorageConfig, type StorageMode, DEFAULT_STORAGE_CONFIG } from './storageConfigManager';
import { MutexManager } from './storageMutex';
import { storageMetrics, OperationType } from './storageMetrics';
import { storageRecovery } from './storageRecovery';
import { getUserDatabaseName, LEGACY_DATABASE_NAME } from '@/datastore/userDatabase';

/**
 * Extended interface for storage adapters that support connection disposal
 * Used for type-safe cleanup of IndexedDB connections and other resources
 */
interface DisposableAdapter extends StorageAdapter {
  close?: () => Promise<void>;
}

// Types re-exported from storageConfigManager
export type { StorageMode, StorageConfig } from './storageConfigManager';
export type { MigrationState } from './storageConfigManager';

// Configuration constants re-exported from storageConfigManager
export { DEFAULT_STORAGE_CONFIG } from './storageConfigManager';
export { MAX_MIGRATION_FAILURES } from './storageConfigManager';

/**
 * Storage Factory for creating appropriate storage adapters
 *
 * Handles IndexedDB adapter selection and configuration management (IndexedDB-only)
 * to provide the best available storage solution for the current environment.
 *
 * @example
 * ```typescript
 * const factory = new StorageFactory();
 * const adapter = await factory.createAdapter();
 *
 * // Use adapter for storage operations
 * await adapter.setItem('key', 'value');
 * const value = await adapter.getItem('key');
 * ```
 */
export class StorageFactory {
  // Default configuration constants
  private static readonly DEFAULT_INDEXEDDB_TIMEOUT_MS = 1000;
  private static readonly DEFAULT_MAX_KEY_SIZE = 1024; // 1KB
  private static readonly DEFAULT_MAX_VALUE_SIZE = 10485760; // 10MB
  private static readonly DEFAULT_BACKOFF_BASE_DELAY_MS = 1000; // 1 second
  private static readonly DEFAULT_BACKOFF_MAX_DELAY_MS = 30000; // 30 seconds
  private static readonly DEFAULT_MUTEX_TIMEOUT_MS = 5000; // 5 seconds

  private readonly logger = createLogger('StorageFactory');
  private cachedAdapter: StorageAdapter | null = null;
  private cachedConfig: StorageConfig | null = null;
  private cacheVersion: number = 0;
  private cachedAdapterVersion: number = -1; // Version when adapter was cached
  // Mutex for preventing concurrent adapter creation
  private readonly mutex = new MutexManager({
    defaultTimeout: StorageFactory.DEFAULT_MUTEX_TIMEOUT_MS,
    enableDebugLogging: false
  });

  // Configuration for IndexedDB timeout (configurable via environment)
  private readonly indexedDBTimeout = parseInt(
    process.env.NEXT_PUBLIC_INDEXEDDB_TIMEOUT_MS || String(StorageFactory.DEFAULT_INDEXEDDB_TIMEOUT_MS),
    10
  );

  // Storage size limits for security
  private readonly maxKeySize = parseInt(
    process.env.NEXT_PUBLIC_STORAGE_MAX_KEY_SIZE || String(StorageFactory.DEFAULT_MAX_KEY_SIZE),
    10
  );
  private readonly maxValueSize = parseInt(
    process.env.NEXT_PUBLIC_STORAGE_MAX_VALUE_SIZE || String(StorageFactory.DEFAULT_MAX_VALUE_SIZE),
    10
  );


  // Maximum recovery attempts to prevent infinite recursion
  private static readonly MAX_RECOVERY_ATTEMPTS = 3;
  private recoveryAttemptCount = 0;

  /**
   * Create and return the appropriate storage adapter based on configuration
   *
   * @param forceMode - Force a specific storage mode (for testing)
   * @returns Promise resolving to the configured storage adapter
   *
   * @throws {StorageError} If no suitable storage adapter can be created
   */
  async createAdapter(forceMode?: StorageMode): Promise<StorageAdapter> {
    // Start performance tracking
    const timer = storageMetrics.startOperation(OperationType.ADAPTER_CREATE);

    try {
      this.logger.debug('Creating storage adapter', { forceMode });

      // Use simplified mutex from MutexManager
      if (this.mutex.isLocked()) {
        this.logger.debug('Adapter creation in progress, waiting for mutex');
        try {
          await this.mutex.acquire();
        } catch (error) {
          this.logger.warn('Mutex acquisition failed', { error });
          timer.failure('Mutex timeout', StorageErrorType.ACCESS_DENIED);

          throw error;
        }
      } else {
        await this.mutex.acquire();
      }

      try {
        // Return cached adapter if available and mode hasn't changed
        if (this.cachedAdapter && !forceMode) {
          const currentConfig = await this.getStorageConfig();
          if (this.cachedConfig &&
              currentConfig.mode === this.cachedConfig.mode &&
              this.cachedAdapterVersion === this.cacheVersion) {
            this.logger.debug('Returning cached adapter', {
              mode: currentConfig.mode,
              cacheVersion: this.cacheVersion,
              adapterVersion: this.cachedAdapterVersion
            });

            storageMetrics.recordCacheHit();
            timer.success({ cached: true });
            return this.cachedAdapter;
          }
        }

        storageMetrics.recordCacheMiss();

        // Create new adapter
        const adapter = await this.createAdapterInternal(forceMode);
        // Reset recovery counter on successful creation
        this.recoveryAttemptCount = 0;
        timer.success({ cached: false, mode: adapter.getBackendName() });
        return adapter;

      } finally {
        this.mutex.release();
      }

    } catch (error) {
      timer.failure(
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof StorageError ? error.type : StorageErrorType.ACCESS_DENIED
      );

      this.logger.error('Failed to create storage adapter', { error, forceMode });

      // Attempt recovery for corruption errors (with retry limit to prevent infinite loops)
      if (error instanceof StorageError && error.type === StorageErrorType.CORRUPTED_DATA) {
        if (this.recoveryAttemptCount < StorageFactory.MAX_RECOVERY_ATTEMPTS) {
          this.recoveryAttemptCount++;
          this.logger.info('Attempting automatic recovery from corruption', {
            attempt: this.recoveryAttemptCount,
            maxAttempts: StorageFactory.MAX_RECOVERY_ATTEMPTS
          });
          try {
            const recoveryResult = await storageRecovery.repairCorruption(error, this.cachedAdapter || new IndexedDBKvAdapter());
            if (recoveryResult.success) {
              this.logger.info('Recovery successful', recoveryResult);
              // Retry adapter creation after recovery
              return this.createAdapter(forceMode);
            }
          } catch (recoveryError) {
            this.logger.error('Recovery failed', { recoveryError });
          }
        } else {
          this.logger.error('Max recovery attempts reached, giving up', {
            attempts: this.recoveryAttemptCount
          });
          // Reset counter for future attempts (e.g., after page reload)
          this.recoveryAttemptCount = 0;
        }
      }

      throw new StorageError(
        StorageErrorType.ACCESS_DENIED,
        `Failed to create storage adapter: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Internal adapter creation method (mutex-protected)
   */
  private async createAdapterInternal(forceMode?: StorageMode): Promise<StorageAdapter> {
    const timer = storageMetrics.startOperation(OperationType.DB_CONNECT);
    const config = await this.getStorageConfig();
    const targetMode = forceMode || config.mode;

    this.logger.debug('Determining storage adapter', {
      targetMode,
      configMode: config.mode,
      migrationState: config.migrationState,
      forceMode
    });

    // Dispose old adapter before creating new one
    if (this.cachedAdapter && this.cachedAdapter !== null) {
      await this.disposeAdapter();
    }

    let adapter: StorageAdapter;

    if (targetMode === 'indexedDB') {
      // Create IndexedDB adapter (IndexedDB-only mode)
      adapter = await this.createIndexedDBAdapter();
    } else {
      // localStorage mode not supported in IndexedDB-only architecture
      const error = new Error('localStorage mode not supported. This application requires IndexedDB to function.');
      this.logger.error('localStorage mode requested but not supported in IndexedDB-only architecture');

      throw error;
    }

    // Cache the successful adapter and config with version
    const newCacheVersion = this.cacheVersion + 1;
    this.cachedAdapter = adapter;
    this.cachedConfig = { ...config, mode: targetMode };
    this.cacheVersion = newCacheVersion;
    this.cachedAdapterVersion = newCacheVersion; // Store version when adapter was cached

    timer.success({ mode: targetMode });

    this.logger.debug('Storage adapter created successfully', {
      backend: adapter.getBackendName(),
      mode: targetMode,
      duration: timer.getElapsedTime()
    });

    return adapter;
  }

  /**
   * Validate storage key and value sizes (XSS validation removed)
   *
   * IMPORTANT: XSS validation removed - not needed for local-first app
   *
   * Rationale:
   * - All data is application-generated JSON (game stats, player data)
   * - Browser origin isolation is the security boundary
   * - No HTML rendering = no XSS risk
   * - Local-first PWA with single user = no injection attack vector
   * - See CLAUDE.md "Security & Privacy Context" for architecture details
   *
   * @param key - Storage key to validate
   * @param value - Storage value to validate
   * @throws {StorageError} If key or value exceeds size limits
   */
  validateStorageSize(key: string, value: string): void {
    // Size validation only (no XSS validation needed for local-first app)
    if (key.length > this.maxKeySize) {
      throw new StorageError(
        StorageErrorType.QUOTA_EXCEEDED,
        `Key size (${key.length} bytes) exceeds maximum allowed size (${this.maxKeySize} bytes)`,
        new Error('Key too large')
      );
    }

    const valueSize = new Blob([value]).size;
    if (valueSize > this.maxValueSize) {
      throw new StorageError(
        StorageErrorType.QUOTA_EXCEEDED,
        `Value size (${valueSize} bytes) exceeds maximum allowed size (${this.maxValueSize} bytes)`,
        new Error('Value too large')
      );
    }
  }

  /**
   * Check available storage quota and warn if approaching limits
   */
  async checkStorageQuota(): Promise<{ available: number; used: number; percentage: number }> {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const used = estimate.usage || 0;
        const available = estimate.quota || 0;
        const percentage = available > 0 ? (used / available) * 100 : 0;

        if (percentage > 90) {
          this.logger.warn('Storage quota approaching limit', {
            used,
            available,
            percentage: percentage.toFixed(1)
          });
        }

        return { available, used, percentage };
      }
    } catch (error) {
      this.logger.debug('Could not check storage quota', { error });
    }

    return { available: 0, used: 0, percentage: 0 };
  }

  /**
   * Get current storage configuration from IndexedDB
   *
   * @returns Current storage configuration with defaults applied
   */
  async getStorageConfig(): Promise<StorageConfig> {
    try {
      const config = await storageConfigManager.getStorageConfig();
      this.logger.debug('Retrieved storage configuration from IndexedDB', config);
      return config;
    } catch (error) {
      this.logger.warn('Failed to retrieve storage configuration, using defaults', { error });
      return { ...DEFAULT_STORAGE_CONFIG };
    }
  }

  /**
   * Update storage configuration in IndexedDB
   *
   * @param updates - Partial configuration updates to apply
   * @returns Promise resolving when configuration is updated
   */
  async updateStorageConfig(updates: Partial<StorageConfig>): Promise<void> {
    try {
      const currentConfig = await this.getStorageConfig();
      const newConfig = { ...currentConfig, ...updates };

      this.logger.debug('Updating storage configuration in IndexedDB', {
        updates,
        previousConfig: currentConfig,
        newConfig
      });

      // Update configuration via IndexedDB-based manager
      await storageConfigManager.updateStorageConfig(updates);

      // Invalidate cached adapter if mode changed (thread-safe)
      if (updates.mode && updates.mode !== currentConfig.mode) {
        this.logger.debug('Storage mode changed, invalidating cached adapter');

        // Atomic cache invalidation: capture current state before any changes
        const currentAdapter = this.cachedAdapter;
        const currentVersion = this.cacheVersion;

        // Increment version first to invalidate cache for new requests
        this.cacheVersion++;

        // Clear cached adapter reference atomically
        this.cachedAdapter = null;
        this.cachedAdapterVersion = -1;

        // Dispose old adapter after cache is cleared (use captured reference)
        if (currentAdapter) {
          try {
            this.logger.debug('Disposing old adapter during mode change', {
              backend: currentAdapter.getBackendName()
            });

            // Close the captured adapter directly (not this.cachedAdapter which is now null)
            const disposableAdapter = currentAdapter as DisposableAdapter;
            if (disposableAdapter.close) {
              await disposableAdapter.close();
            }
          } catch (disposeError) {
            this.logger.warn('Failed to dispose old adapter during mode change', { disposeError });
            // Continue execution - disposal failure shouldn't block configuration update
          }
        }

        this.logger.debug(`Cache invalidated: version ${currentVersion} → ${this.cacheVersion}`);
      }

      this.logger.debug('Storage configuration updated successfully in IndexedDB');

    } catch (error) {
      this.logger.error('Failed to update storage configuration', { error, updates });
      throw new StorageError(
        StorageErrorType.ACCESS_DENIED,
        `Failed to update storage configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if IndexedDB is supported and available in the current environment
   *
   * @returns Promise resolving to true if IndexedDB is available
   */
  async isIndexedDBSupported(): Promise<boolean> {
    try {
      // Check for IndexedDB availability
      if (typeof window === 'undefined' || !window.indexedDB) {
        this.logger.debug('IndexedDB not available: missing window.indexedDB');
        return false;
      }

      // Test basic IndexedDB functionality
      const testDbName = `test_${Date.now()}_${Math.random()}`;

      return new Promise<boolean>((resolve) => {
        const request = window.indexedDB.open(testDbName, 1);

        const cleanup = () => {
          try {
            if (request.result) {
              request.result.close();
              window.indexedDB.deleteDatabase(testDbName);
            }
          } catch (error) {
            this.logger.debug('Cleanup error during IndexedDB test', { error });
          }
        };

        const timeout = setTimeout(() => {
          this.logger.debug('IndexedDB support test timed out');
          cleanup();
          resolve(false);
        }, this.indexedDBTimeout); // Configurable timeout via NEXT_PUBLIC_INDEXEDDB_TIMEOUT_MS

        request.onerror = () => {
          this.logger.debug('IndexedDB support test failed', { error: request.error });
          clearTimeout(timeout);
          cleanup();
          resolve(false);
        };

        request.onsuccess = () => {
          this.logger.debug('IndexedDB support test passed');
          clearTimeout(timeout);
          cleanup();
          resolve(true);
        };

        request.onblocked = () => {
          this.logger.debug('IndexedDB support test blocked');
          clearTimeout(timeout);
          cleanup();
          resolve(false);
        };
      });

    } catch (error) {
      this.logger.debug('IndexedDB support check failed', { error });
      return false;
    }
  }

  /**
   * Dispose of the current cached adapter and clean up resources
   * Prevents memory leaks when switching adapters
   */
  async disposeAdapter(): Promise<void> {
    if (!this.cachedAdapter) return;

    try {
      this.logger.debug('Disposing cached adapter', {
        backend: this.cachedAdapter.getBackendName()
      });

      // If adapter has a close method (like IndexedDB), call it
      const disposableAdapter = this.cachedAdapter as DisposableAdapter;
      if (disposableAdapter.close) {
        await disposableAdapter.close();
      }

      this.cachedAdapter = null;
      this.cachedConfig = null;
    } catch (error) {
      this.logger.error('Error disposing adapter', { error });
    }
  }

  /**
   * Get current performance metrics
   *
   * @returns Current metrics snapshot
   */
  getPerformanceMetrics() {
    return storageMetrics.getMetrics();
  }

  /**
   * Log performance metrics summary to console
   */
  logPerformanceMetrics(): void {
    storageMetrics.logSummary();
  }

  /**
   * Get mutex statistics
   *
   * @returns Object containing mutex usage statistics
   */
  getMutexStats() {
    return this.mutex.getStats();
  }

  /**
   * Calculate exponential backoff delay for retry attempts
   *
   * @param failureCount - Number of consecutive failures
   * @returns Delay in milliseconds before next retry attempt
   */
  private calculateBackoffDelay(failureCount: number): number {
    // Exponential backoff: base delay multiplied by 2^failureCount
    // Max delay capped at configured maximum
    const exponentialDelay = StorageFactory.DEFAULT_BACKOFF_BASE_DELAY_MS * Math.pow(2, failureCount);
    return Math.min(exponentialDelay, StorageFactory.DEFAULT_BACKOFF_MAX_DELAY_MS);
  }

  /**
   * Check if enough time has passed since last failure to allow retry
   *
   * @param lastAttempt - ISO timestamp of last attempt
   * @param failureCount - Number of consecutive failures
   * @returns True if enough time has passed for retry
   */
  private canRetryAfterBackoff(lastAttempt: string | undefined, failureCount: number): boolean {
    if (!lastAttempt) return true;

    try {
      const lastAttemptTime = new Date(lastAttempt).getTime();
      const now = Date.now();
      const backoffDelay = this.calculateBackoffDelay(failureCount);

      return (now - lastAttemptTime) >= backoffDelay;
    } catch (error) {
      this.logger.debug('Could not parse last attempt time, allowing retry', { lastAttempt, error });
      return true;
    }
  }

  /**
   * Validate storage version format (semver-like)
   */
  private isValidVersion(version: string): boolean {
    // Enhanced semver validation: major.minor.patch[-prerelease][+build]
    // Supports: 1.2.3, 1.2.3-alpha, 1.2.3-alpha.1, 1.2.3+build, 1.2.3-alpha+build
    const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
    return semverRegex.test(version);
  }

  /**
   * Reset storage configuration to defaults
   * Useful for testing and error recovery scenarios
   */
  async resetToDefaults(): Promise<void> {
    this.logger.warn('Resetting storage configuration to defaults');

    try {
      // Reset configuration via IndexedDB-based manager
      await storageConfigManager.resetToDefaults();

      // Dispose and clear cached adapter
      if (this.cachedAdapter) {
        await this.disposeAdapter();
      }
      this.cacheVersion = 0;
      this.cachedAdapterVersion = -1; // Reset adapter version

      this.logger.debug('Storage configuration reset to defaults');

    } catch (error) {
      this.logger.error('Failed to reset storage configuration', { error });
      throw new StorageError(
        StorageErrorType.ACCESS_DENIED,
        'Failed to reset storage configuration',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Create IndexedDB adapter (IndexedDB-only, no localStorage fallbacks)
   */
  private async createIndexedDBAdapter(): Promise<StorageAdapter> {
    // IndexedDB-only mode: no localStorage fallbacks
    this.logger.debug('Creating IndexedDB adapter (IndexedDB-only mode)');

    // Check IndexedDB support
    const isSupported = await this.isIndexedDBSupported();
    if (!isSupported) {
      const error = new Error('IndexedDB not supported. This application requires IndexedDB to function. Please disable private mode or use a modern browser.');
      this.logger.error('IndexedDB not supported - no fallback available', { error });

      throw error;
    }

    try {
      // Attempt to create IndexedDB adapter
      const adapter = new IndexedDBKvAdapter();

      // Test the adapter with a simple operation
      await this.testAdapter(adapter);

      this.logger.debug('IndexedDB adapter created and tested successfully');
      return adapter;

    } catch (error) {
      const errorMessage = `IndexedDB adapter creation failed. This application requires IndexedDB to function. ${error instanceof Error ? error.message : 'Unknown error'}`;
      const indexedDBError = new Error(errorMessage);

      this.logger.error('Failed to create IndexedDB adapter - no fallback available', { error });

      throw indexedDBError;
    }
  }

  /**
   * Create localStorage adapter (DISABLED - IndexedDB-only architecture)
   */
  private async createLocalStorageAdapter(): Promise<StorageAdapter> {
    throw new Error('localStorage adapter creation disabled. This application requires IndexedDB to function.');
  }

  /**
   * Test an adapter with basic operations to ensure it's working
   */
  private async testAdapter(adapter: StorageAdapter): Promise<void> {
    const testKey = `storage_test_${Date.now()}`;
    const testValue = 'test_value';
    const timer = storageMetrics.startOperation(OperationType.DB_TRANSACTION);

    try {
      // Test write
      await adapter.setItem(testKey, testValue);

      // Test read
      const retrieved = await adapter.getItem(testKey);
      if (retrieved !== testValue) {
        // Check if this is a corruption issue
        const validation = await storageRecovery.validateData(testKey, retrieved);
        if (!validation.isValid) {
          throw new StorageError(
            StorageErrorType.CORRUPTED_DATA,
            `Test data corrupted: ${validation.errors.join(', ')}`,
            new Error('Data corruption detected')
          );
        }
        throw new Error('Retrieved value does not match stored value');
      }

      // Test delete
      await adapter.removeItem(testKey);

      // Verify deletion
      const afterDelete = await adapter.getItem(testKey);
      if (afterDelete !== null) {
        throw new Error('Value not properly deleted');
      }

      timer.success({ backend: adapter.getBackendName() });
      this.logger.debug('Adapter test passed', { backend: adapter.getBackendName() });

    } catch (error) {
      timer.failure(
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof StorageError ? error.type : StorageErrorType.ACCESS_DENIED
      );

      this.logger.error('Adapter test failed', {
        backend: adapter.getBackendName(),
        error
      });

      // Try recovery if corruption detected
      if (error instanceof StorageError && error.type === StorageErrorType.CORRUPTED_DATA) {
        this.logger.info('Attempting recovery during adapter test');
        const recoveryResult = await storageRecovery.repairCorruption(error, adapter);
        if (!recoveryResult.success) {
          throw error;
        }
        // Retry test after recovery
        return this.testAdapter(adapter);
      }

      throw new StorageError(
        StorageErrorType.ACCESS_DENIED,
        `Storage adapter test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Create a user-scoped IndexedDB adapter.
   *
   * Each user gets their own IndexedDB database for complete data isolation.
   * The database name format is: `matchops_user_{userId}`
   *
   * @param userId - The authenticated user's ID
   * @returns Promise resolving to a user-scoped storage adapter
   * @throws {Error} If userId is invalid or IndexedDB is not available
   *
   * @example
   * ```typescript
   * const adapter = await storageFactory.createUserAdapter('user123');
   * await adapter.setItem('settings', JSON.stringify({ theme: 'dark' }));
   * ```
   */
  async createUserAdapter(userId: string): Promise<StorageAdapter> {
    const timer = storageMetrics.startOperation(OperationType.ADAPTER_CREATE);

    try {
      this.logger.debug('Creating user-scoped adapter', { userId });

      // Validate userId and get database name
      const dbName = getUserDatabaseName(userId);

      // Check IndexedDB support
      const isSupported = await this.isIndexedDBSupported();
      if (!isSupported) {
        throw new Error('IndexedDB not supported. This application requires IndexedDB to function.');
      }

      // Create IndexedDB adapter with user-specific database name
      const adapter = new IndexedDBKvAdapter({ dbName });

      // Test the adapter
      await this.testAdapter(adapter);

      timer.success({ userId, dbName });
      this.logger.debug('User-scoped adapter created successfully', { userId, dbName });

      return adapter;
    } catch (error) {
      timer.failure(
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof StorageError ? error.type : StorageErrorType.ACCESS_DENIED
      );

      this.logger.error('Failed to create user-scoped adapter', { userId, error });

      throw new StorageError(
        StorageErrorType.ACCESS_DENIED,
        `Failed to create user-scoped storage: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Create a legacy (anonymous) IndexedDB adapter.
   *
   * Uses the global `MatchOpsLocal` database for backward compatibility
   * and anonymous/local-only mode.
   *
   * @returns Promise resolving to the legacy storage adapter
   */
  async createLegacyAdapter(): Promise<StorageAdapter> {
    const timer = storageMetrics.startOperation(OperationType.ADAPTER_CREATE);

    try {
      this.logger.debug('Creating legacy adapter', { dbName: LEGACY_DATABASE_NAME });

      // Check IndexedDB support
      const isSupported = await this.isIndexedDBSupported();
      if (!isSupported) {
        throw new Error('IndexedDB not supported. This application requires IndexedDB to function.');
      }

      // Create IndexedDB adapter with legacy database name
      const adapter = new IndexedDBKvAdapter({ dbName: LEGACY_DATABASE_NAME });

      // Test the adapter
      await this.testAdapter(adapter);

      timer.success({ dbName: LEGACY_DATABASE_NAME });
      this.logger.debug('Legacy adapter created successfully', { dbName: LEGACY_DATABASE_NAME });

      return adapter;
    } catch (error) {
      timer.failure(
        error instanceof Error ? error.message : 'Unknown error',
        error instanceof StorageError ? error.type : StorageErrorType.ACCESS_DENIED
      );

      this.logger.error('Failed to create legacy adapter', { error });

      throw new StorageError(
        StorageErrorType.ACCESS_DENIED,
        `Failed to create legacy storage: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }
}

/**
 * Global storage factory instance for application use
 * Provides consistent adapter creation across the application
 */
export const storageFactory = new StorageFactory();

/**
 * Convenience function to create a storage adapter
 *
 * @param forceMode - Optional mode to force for testing
 * @returns Promise resolving to storage adapter
 *
 * @example
 * ```typescript
 * // Get adapter based on current configuration
 * const adapter = await createStorageAdapter();
 *
 * // Force specific adapter for testing
 * const testAdapter = await createStorageAdapter('localStorage');
 * ```
 */
export async function createStorageAdapter(forceMode?: StorageMode): Promise<StorageAdapter> {
  return storageFactory.createAdapter(forceMode);
}

/**
 * Get current storage configuration
 *
 * @returns Promise resolving to current storage configuration
 */
export async function getStorageConfig(): Promise<StorageConfig> {
  return storageFactory.getStorageConfig();
}

/**
 * Update storage configuration
 *
 * @param updates - Configuration updates to apply
 * @returns Promise resolving when update is complete
 */
export async function updateStorageConfig(updates: Partial<StorageConfig>): Promise<void> {
  return storageFactory.updateStorageConfig(updates);
}

/**
 * Create a user-scoped storage adapter.
 *
 * Each user gets their own IndexedDB database (`matchops_user_{userId}`)
 * for complete data isolation between users.
 *
 * @param userId - The authenticated user's ID
 * @returns Promise resolving to user-scoped storage adapter
 *
 * @example
 * ```typescript
 * const adapter = await createUserAdapter('user123');
 * await adapter.setItem('settings', JSON.stringify({ theme: 'dark' }));
 * ```
 */
export async function createUserAdapter(userId: string): Promise<StorageAdapter> {
  return storageFactory.createUserAdapter(userId);
}

/**
 * Create a legacy (anonymous) storage adapter.
 *
 * Uses the global `MatchOpsLocal` database for backward compatibility
 * and anonymous/local-only mode.
 *
 * @returns Promise resolving to legacy storage adapter
 */
export async function createLegacyAdapter(): Promise<StorageAdapter> {
  return storageFactory.createLegacyAdapter();
}