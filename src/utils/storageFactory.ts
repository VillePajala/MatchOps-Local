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
 * - Intelligent adapter selection with fallback logic
 * - Configuration persistence and management
 * - Browser compatibility detection
 * - Migration state awareness
 * - Development/testing overrides
 *
 * @see StorageAdapter interface in ./storageAdapter.ts
 * @author Claude Code
 */

import { StorageAdapter, StorageError, StorageErrorType } from './storageAdapter';
import { LocalStorageAdapter } from './localStorageAdapter';
import { IndexedDBKvAdapter } from './indexedDbKvAdapter';
import { createLogger } from './logger';
import { getLocalStorageItem, setLocalStorageItem } from './localStorage';

/**
 * Available storage modes for the application
 */
export type StorageMode = 'localStorage' | 'indexedDB';

/**
 * Migration states for storage infrastructure
 */
export type MigrationState =
  | 'not-started'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'rolled-back';

/**
 * Configuration for storage system behavior
 */
export interface StorageConfig {
  /** Current storage mode */
  mode: StorageMode;
  /** Storage version for migration tracking */
  version: string;
  /** Current migration state */
  migrationState: MigrationState;
  /** Whether to force a specific mode (testing/development) */
  forceMode?: StorageMode;
  /** Last successful migration timestamp */
  lastMigrationAttempt?: string;
  /** Number of migration failures */
  migrationFailureCount?: number;
}

/**
 * Configuration keys used in localStorage for storage factory settings
 */
export const STORAGE_CONFIG_KEYS = {
  MODE: 'storage-mode',
  VERSION: 'storage-version',
  MIGRATION_STATE: 'migration-state',
  FORCE_MODE: 'storage-force-mode',
  LAST_MIGRATION: 'last-migration-attempt',
  FAILURE_COUNT: 'migration-failure-count'
} as const;

/**
 * Default configuration values
 */
export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  mode: 'localStorage',
  version: '1.0.0',
  migrationState: 'not-started',
  migrationFailureCount: 0
};

/**
 * Maximum number of migration failures before permanent fallback
 */
export const MAX_MIGRATION_FAILURES = 3;

/**
 * Storage Factory for creating appropriate storage adapters
 *
 * Handles adapter selection, configuration management, and fallback logic
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
  private readonly logger = createLogger('StorageFactory');
  private cachedAdapter: StorageAdapter | null = null;
  private cachedConfig: StorageConfig | null = null;

  /**
   * Create and return the appropriate storage adapter based on configuration
   *
   * @param forceMode - Force a specific storage mode (for testing)
   * @returns Promise resolving to the configured storage adapter
   *
   * @throws {StorageError} If no suitable storage adapter can be created
   */
  async createAdapter(forceMode?: StorageMode): Promise<StorageAdapter> {
    try {
      this.logger.debug('Creating storage adapter', { forceMode });

      // Return cached adapter if available and mode hasn't changed
      if (this.cachedAdapter && !forceMode) {
        const currentConfig = this.getStorageConfig();
        if (this.cachedConfig && currentConfig.mode === this.cachedConfig.mode) {
          this.logger.debug('Returning cached adapter', { mode: currentConfig.mode });
          return this.cachedAdapter;
        }
      }

      const config = this.getStorageConfig();
      const targetMode = forceMode || config.mode;

      this.logger.debug('Determining storage adapter', {
        targetMode,
        configMode: config.mode,
        migrationState: config.migrationState,
        forceMode
      });

      let adapter: StorageAdapter;

      if (targetMode === 'indexedDB') {
        // Attempt to create IndexedDB adapter with fallback
        adapter = await this.createIndexedDBAdapter(config);
      } else {
        // Create localStorage adapter
        adapter = await this.createLocalStorageAdapter();
      }

      // Cache the successful adapter and config
      this.cachedAdapter = adapter;
      this.cachedConfig = { ...config, mode: targetMode };

      this.logger.debug('Storage adapter created successfully', {
        backend: adapter.getBackendName(),
        mode: targetMode
      });

      return adapter;

    } catch (error) {
      this.logger.error('Failed to create storage adapter', { error, forceMode });
      throw new StorageError(
        StorageErrorType.ACCESS_DENIED,
        `Failed to create storage adapter: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get current storage configuration from localStorage
   *
   * @returns Current storage configuration with defaults applied
   */
  getStorageConfig(): StorageConfig {
    try {
      const mode = (getLocalStorageItem(STORAGE_CONFIG_KEYS.MODE) as StorageMode) || DEFAULT_STORAGE_CONFIG.mode;
      const version = getLocalStorageItem(STORAGE_CONFIG_KEYS.VERSION) || DEFAULT_STORAGE_CONFIG.version;
      const migrationState = (getLocalStorageItem(STORAGE_CONFIG_KEYS.MIGRATION_STATE) as MigrationState) || DEFAULT_STORAGE_CONFIG.migrationState;
      const forceMode = getLocalStorageItem(STORAGE_CONFIG_KEYS.FORCE_MODE) as StorageMode | undefined;
      const lastMigrationAttempt = getLocalStorageItem(STORAGE_CONFIG_KEYS.LAST_MIGRATION) || undefined;
      const migrationFailureCount = parseInt(getLocalStorageItem(STORAGE_CONFIG_KEYS.FAILURE_COUNT) || '0', 10);

      const config: StorageConfig = {
        mode,
        version,
        migrationState,
        forceMode,
        lastMigrationAttempt,
        migrationFailureCount
      };

      this.logger.debug('Retrieved storage configuration', config);
      return config;

    } catch (error) {
      this.logger.warn('Failed to retrieve storage configuration, using defaults', { error });
      return { ...DEFAULT_STORAGE_CONFIG };
    }
  }

  /**
   * Update storage configuration in localStorage
   *
   * @param updates - Partial configuration updates to apply
   * @returns Promise resolving when configuration is updated
   */
  async updateStorageConfig(updates: Partial<StorageConfig>): Promise<void> {
    try {
      const currentConfig = this.getStorageConfig();
      const newConfig = { ...currentConfig, ...updates };

      this.logger.debug('Updating storage configuration', {
        updates,
        previousConfig: currentConfig,
        newConfig
      });

      // Update individual configuration values
      if (updates.mode !== undefined) {
        setLocalStorageItem(STORAGE_CONFIG_KEYS.MODE, updates.mode);
      }
      if (updates.version !== undefined) {
        setLocalStorageItem(STORAGE_CONFIG_KEYS.VERSION, updates.version);
      }
      if (updates.migrationState !== undefined) {
        setLocalStorageItem(STORAGE_CONFIG_KEYS.MIGRATION_STATE, updates.migrationState);
      }
      if (updates.forceMode !== undefined) {
        if (updates.forceMode === null) {
          // Remove force mode override
          try {
            localStorage.removeItem(STORAGE_CONFIG_KEYS.FORCE_MODE);
          } catch (error) {
            this.logger.warn('Could not remove force mode override', { error });
          }
        } else {
          setLocalStorageItem(STORAGE_CONFIG_KEYS.FORCE_MODE, updates.forceMode);
        }
      }
      if (updates.lastMigrationAttempt !== undefined) {
        setLocalStorageItem(STORAGE_CONFIG_KEYS.LAST_MIGRATION, updates.lastMigrationAttempt);
      }
      if (updates.migrationFailureCount !== undefined) {
        setLocalStorageItem(STORAGE_CONFIG_KEYS.FAILURE_COUNT, updates.migrationFailureCount.toString());
      }

      // Invalidate cached adapter if mode changed
      if (updates.mode && updates.mode !== currentConfig.mode) {
        this.logger.debug('Storage mode changed, invalidating cached adapter');
        this.cachedAdapter = null;
        this.cachedConfig = null;
      }

      this.logger.debug('Storage configuration updated successfully');

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
        }, 2000);

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
   * Reset storage configuration to defaults
   * Useful for testing and error recovery scenarios
   */
  async resetToDefaults(): Promise<void> {
    this.logger.warn('Resetting storage configuration to defaults');

    try {
      // Clear all configuration keys
      Object.values(STORAGE_CONFIG_KEYS).forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          this.logger.debug(`Could not remove config key ${key}`, { error });
        }
      });

      // Clear cached adapter
      this.cachedAdapter = null;
      this.cachedConfig = null;

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
   * Create IndexedDB adapter with intelligent fallback logic
   */
  private async createIndexedDBAdapter(config: StorageConfig): Promise<StorageAdapter> {
    // Check if too many migration failures occurred
    if (config.migrationFailureCount && config.migrationFailureCount >= MAX_MIGRATION_FAILURES) {
      this.logger.warn('Too many migration failures, falling back to localStorage', {
        failureCount: config.migrationFailureCount,
        maxFailures: MAX_MIGRATION_FAILURES
      });
      return this.createLocalStorageAdapter();
    }

    // Check IndexedDB support
    const isSupported = await this.isIndexedDBSupported();
    if (!isSupported) {
      this.logger.warn('IndexedDB not supported, falling back to localStorage');
      // Update config to reflect fallback
      await this.updateStorageConfig({ mode: 'localStorage' });
      return this.createLocalStorageAdapter();
    }

    try {
      // Attempt to create IndexedDB adapter
      this.logger.debug('Creating IndexedDB adapter');
      const adapter = new IndexedDBKvAdapter();

      // Test the adapter with a simple operation
      await this.testAdapter(adapter);

      this.logger.debug('IndexedDB adapter created and tested successfully');
      return adapter;

    } catch (error) {
      this.logger.error('Failed to create IndexedDB adapter, falling back to localStorage', { error });

      // Increment failure count
      const newFailureCount = (config.migrationFailureCount || 0) + 1;
      await this.updateStorageConfig({
        mode: 'localStorage',
        migrationState: 'failed',
        migrationFailureCount: newFailureCount,
        lastMigrationAttempt: new Date().toISOString()
      });

      return this.createLocalStorageAdapter();
    }
  }

  /**
   * Create localStorage adapter
   */
  private async createLocalStorageAdapter(): Promise<StorageAdapter> {
    this.logger.debug('Creating localStorage adapter');
    const adapter = new LocalStorageAdapter();

    // Test the adapter
    await this.testAdapter(adapter);

    this.logger.debug('LocalStorage adapter created and tested successfully');
    return adapter;
  }

  /**
   * Test an adapter with basic operations to ensure it's working
   */
  private async testAdapter(adapter: StorageAdapter): Promise<void> {
    const testKey = `storage_test_${Date.now()}`;
    const testValue = 'test_value';

    try {
      // Test write
      await adapter.setItem(testKey, testValue);

      // Test read
      const retrieved = await adapter.getItem(testKey);
      if (retrieved !== testValue) {
        throw new Error('Retrieved value does not match stored value');
      }

      // Test delete
      await adapter.removeItem(testKey);

      // Verify deletion
      const afterDelete = await adapter.getItem(testKey);
      if (afterDelete !== null) {
        throw new Error('Value not properly deleted');
      }

      this.logger.debug('Adapter test passed', { backend: adapter.getBackendName() });

    } catch (error) {
      this.logger.error('Adapter test failed', {
        backend: adapter.getBackendName(),
        error
      });
      throw new StorageError(
        StorageErrorType.ACCESS_DENIED,
        `Storage adapter test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
 * @returns Current storage configuration
 */
export function getStorageConfig(): StorageConfig {
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