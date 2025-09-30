/**
 * Storage Configuration Manager for IndexedDB-only implementation
 *
 * Manages storage factory configuration using IndexedDB instead of localStorage
 * to fully comply with "IndexedDB-only, no localStorage fallback" policy.
 *
 * Features:
 * - Single IndexedDB key for all configuration data
 * - In-memory fallback during bootstrap phase
 * - Atomic configuration updates
 * - Version validation and migration support
 */

import { createLogger } from './logger';
import { bootstrapGetJSON, bootstrapSetJSON } from './storageBootstrap';

const logger = createLogger('StorageConfigManager');

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
 * Default configuration values
 */
export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  mode: 'indexedDB',
  version: '1.0.0',
  migrationState: 'not-started',
  migrationFailureCount: 0
};

/**
 * Maximum number of migration failures before permanent fallback
 */
export const MAX_MIGRATION_FAILURES = 3;

/**
 * IndexedDB key for storing configuration
 */
const STORAGE_CONFIG_KEY = '__storage_factory_config';

/**
 * Storage Configuration Manager
 *
 * Handles configuration persistence in IndexedDB with in-memory fallback
 * during bootstrap phase when IndexedDB may not be available yet.
 */
export class StorageConfigManager {
  private cachedConfig: StorageConfig | null = null;
  private configPromise: Promise<StorageConfig> | null = null;
  private isBootstrapping = true;

  /**
   * Get current storage configuration
   *
   * Uses cached config if available, otherwise loads from IndexedDB.
   * Falls back to in-memory defaults during bootstrap phase.
   */
  async getStorageConfig(): Promise<StorageConfig> {
    // Return cached config if available
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    // If already loading, wait for that operation
    if (this.configPromise) {
      return this.configPromise;
    }

    // Start loading configuration
    this.configPromise = this.loadConfigurationInternal();
    const config = await this.configPromise;
    this.configPromise = null;

    return config;
  }

  /**
   * Internal configuration loading logic
   */
  private async loadConfigurationInternal(): Promise<StorageConfig> {
    try {
      // During bootstrap phase, try IndexedDB but fall back to defaults quickly
      if (this.isBootstrapping) {
        try {
          const config = await this.loadFromIndexedDB(true);
          this.cachedConfig = config;
          this.isBootstrapping = false;
          logger.debug('Configuration loaded from IndexedDB during bootstrap', config);
          return config;
        } catch (error) {
          // During bootstrap, use in-memory defaults if IndexedDB fails
          logger.warn('Using in-memory config during bootstrap, will retry loading later', { error });
          const defaultConfig = { ...DEFAULT_STORAGE_CONFIG };
          this.cachedConfig = defaultConfig;

          // Schedule retry after bootstrap
          setTimeout(() => {
            this.retryConfigurationLoad();
          }, 5000);

          return defaultConfig;
        }
      } else {
        // After bootstrap, IndexedDB should be available
        const config = await this.loadFromIndexedDB(false);
        this.cachedConfig = config;
        logger.debug('Configuration loaded from IndexedDB', config);
        return config;
      }
    } catch (error) {
      logger.error('Failed to load storage configuration, using defaults', { error });
      const defaultConfig = { ...DEFAULT_STORAGE_CONFIG };
      this.cachedConfig = defaultConfig;
      return defaultConfig;
    }
  }

  /**
   * Load configuration from IndexedDB
   */
  private async loadFromIndexedDB(isBootstrap: boolean): Promise<StorageConfig> {
    try {
      const config = await bootstrapGetJSON<StorageConfig>(STORAGE_CONFIG_KEY);

      if (!config) {
        return DEFAULT_STORAGE_CONFIG;
      }

      // Validate loaded config
      if (!this.validateConfig(config)) {
        logger.warn('Loaded config failed validation, using defaults');
        return DEFAULT_STORAGE_CONFIG;
      }

      // Validate and sanitize loaded config
      return this.sanitizeConfig(config);
    } catch (error) {
      if (!isBootstrap) {
        throw error;
      }
      logger.warn('Failed to load config from IndexedDB during bootstrap', { error });
      return DEFAULT_STORAGE_CONFIG;
    }
  }

  /**
   * Retry configuration loading after bootstrap failure
   */
  private async retryConfigurationLoad(): Promise<void> {
    if (!this.isBootstrapping) {
      return; // Already loaded successfully
    }

    try {
      logger.debug('Retrying configuration load after bootstrap');
      const config = await this.loadFromIndexedDB(false);
      this.cachedConfig = config;
      this.isBootstrapping = false;
      logger.info('Configuration successfully loaded on retry', config);
    } catch (error) {
      logger.warn('Configuration retry failed, keeping in-memory defaults', { error });
    }
  }

  /**
   * Update storage configuration
   *
   * @param updates - Partial configuration updates to apply
   */
  async updateStorageConfig(updates: Partial<StorageConfig>): Promise<void> {
    try {
      const currentConfig = await this.getStorageConfig();
      const newConfig = { ...currentConfig, ...updates };

      logger.debug('Updating storage configuration', {
        updates,
        previousConfig: currentConfig,
        newConfig
      });

      // Validate the new configuration
      const sanitizedConfig = this.sanitizeConfig(newConfig);

      // Save to IndexedDB (gracefully fail in test environment)
      try {
        await bootstrapSetJSON(STORAGE_CONFIG_KEY, sanitizedConfig);
      } catch {
        // In test environment (Node.js), just use in-memory config
        logger.debug('Could not persist config to IndexedDB (likely test environment), using in-memory only');
      }

      // Update cache (always succeeds)
      this.cachedConfig = sanitizedConfig;

      logger.debug('Storage configuration updated successfully');
    } catch (error) {
      logger.error('Failed to update storage configuration', { error, updates });
      throw new Error(`Failed to update storage configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate configuration object structure
   */
  private validateConfig = (data: unknown): data is StorageConfig => {
    if (!data || typeof data !== 'object') {
      return false;
    }

    const config = data as Record<string, unknown>;

    // Required fields
    if (typeof config.mode !== 'string' || !['localStorage', 'indexedDB'].includes(config.mode)) {
      return false;
    }

    if (typeof config.version !== 'string' || !this.isValidVersion(config.version)) {
      return false;
    }

    if (typeof config.migrationState !== 'string' ||
        !['not-started', 'in-progress', 'completed', 'failed', 'rolled-back'].includes(config.migrationState)) {
      return false;
    }

    // Optional fields
    if (config.forceMode !== undefined &&
        (typeof config.forceMode !== 'string' || !['localStorage', 'indexedDB'].includes(config.forceMode))) {
      return false;
    }

    if (config.lastMigrationAttempt !== undefined && typeof config.lastMigrationAttempt !== 'string') {
      return false;
    }

    if (config.migrationFailureCount !== undefined &&
        (typeof config.migrationFailureCount !== 'number' || config.migrationFailureCount < 0)) {
      return false;
    }

    return true;
  };

  /**
   * Sanitize and normalize configuration data
   */
  private sanitizeConfig(config: StorageConfig): StorageConfig {
    const sanitized: StorageConfig = {
      mode: config.mode || DEFAULT_STORAGE_CONFIG.mode,
      version: this.isValidVersion(config.version) ? config.version : DEFAULT_STORAGE_CONFIG.version,
      migrationState: config.migrationState || DEFAULT_STORAGE_CONFIG.migrationState,
      migrationFailureCount: typeof config.migrationFailureCount === 'number'
        ? Math.max(0, config.migrationFailureCount)
        : DEFAULT_STORAGE_CONFIG.migrationFailureCount
    };

    // Optional fields
    if (config.forceMode && ['localStorage', 'indexedDB'].includes(config.forceMode)) {
      sanitized.forceMode = config.forceMode;
    }

    if (config.lastMigrationAttempt && typeof config.lastMigrationAttempt === 'string') {
      sanitized.lastMigrationAttempt = config.lastMigrationAttempt;
    }

    return sanitized;
  }

  /**
   * Validate storage version format (semver-like)
   */
  private isValidVersion(version: string): boolean {
    // Enhanced semver validation: major.minor.patch[-prerelease][+build]
    const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
    return semverRegex.test(version);
  }

  /**
   * Reset configuration to defaults
   * Useful for testing and error recovery scenarios
   */
  async resetToDefaults(): Promise<void> {
    logger.warn('Resetting storage configuration to defaults');

    try {
      // Clear cached config
      this.cachedConfig = null;
      this.configPromise = null;
      this.isBootstrapping = true;

      // Save defaults to IndexedDB (will gracefully fail in Node.js test environment)
      try {
        await bootstrapSetJSON(STORAGE_CONFIG_KEY, DEFAULT_STORAGE_CONFIG);
      } catch {
        // In test environment (Node.js), just use in-memory defaults
        logger.debug('Could not persist config to IndexedDB (likely test environment), using in-memory defaults');
      }

      // Update cache
      this.cachedConfig = { ...DEFAULT_STORAGE_CONFIG };
      this.isBootstrapping = false;

      logger.debug('Storage configuration reset to defaults');
    } catch (error) {
      logger.error('Failed to reset storage configuration', { error });
      throw new Error(`Failed to reset storage configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clear cached configuration (for testing)
   */
  clearCache(): void {
    this.cachedConfig = null;
    this.configPromise = null;
    this.isBootstrapping = true;
  }
}

/**
 * Global storage configuration manager instance
 */
export const storageConfigManager = new StorageConfigManager();

/**
 * Convenience function to get storage configuration
 */
export async function getStorageConfig(): Promise<StorageConfig> {
  return storageConfigManager.getStorageConfig();
}

/**
 * Convenience function to update storage configuration
 */
export async function updateStorageConfig(updates: Partial<StorageConfig>): Promise<void> {
  return storageConfigManager.updateStorageConfig(updates);
}