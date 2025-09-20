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
 * - Enterprise-grade security and performance optimizations
 *
 * FUTURE ENHANCEMENTS (Phase 1):
 *
 * 🔗 IndexedDB Connection Pool:
 * - Implement connection reuse across adapter instances
 * - Add connection health checks and automatic reconnection
 * - Reduce browser connection overhead for frequent operations
 * - Monitor connection state and implement graceful degradation
 *
 * 🔒 Advanced Security Features:
 * - ✅ Rate limiting for storage operations (100 ops/min, 10 burst/5sec)
 * - ✅ Audit logging for critical storage operations with session tracking
 * - Content validation and XSS prevention for stored data
 * - Optional encryption for sensitive data at rest (AES-256-GCM recommended)
 * - Access control and permission validation
 *
 * 🛡️ Production Security Requirements:
 * - Content Security Policy (CSP) headers for IndexedDB operations:
 *   * Add 'unsafe-eval' only if required for IndexedDB in specific browsers
 *   * Consider 'strict-dynamic' for script loading
 *   * Monitor CSP violation reports for unauthorized access attempts
 * - Data encryption strategy:
 *   * Implement client-side encryption using Web Crypto API
 *   * Use AES-256-GCM with per-session keys derived from user credentials
 *   * Consider key derivation using PBKDF2 or Argon2id for password-based encryption
 *   * Implement secure key rotation and secure deletion of sensitive data
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
import { LocalStorageAdapter } from './localStorageAdapter';
import { IndexedDBKvAdapter } from './indexedDbKvAdapter';
import { createLogger } from './logger';
import { getLocalStorageItem, setLocalStorageItem, removeLocalStorageItem } from './localStorage';

/**
 * Extended interface for storage adapters that support connection disposal
 * Used for type-safe cleanup of IndexedDB connections and other resources
 */
interface DisposableAdapter extends StorageAdapter {
  close?: () => Promise<void>;
}

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
 * Telemetry events for monitoring storage adapter selection and usage
 */
export interface StorageTelemetryEvent {
  event: 'adapter_created' | 'adapter_failed' | 'fallback_triggered' | 'config_updated' | 'adapter_disposed';
  mode: StorageMode;
  timestamp: number;
  details?: {
    fallbackReason?: string;
    failureCount?: number;
    duration?: number;
    error?: string;
    backoffDelayMs?: number;
    auditAction?: string;
    [key: string]: unknown; // Allow additional audit properties
  };
}

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
  // Default configuration constants
  private static readonly DEFAULT_INDEXEDDB_TIMEOUT_MS = 1000;
  private static readonly DEFAULT_MAX_KEY_SIZE = 1024; // 1KB
  private static readonly DEFAULT_MAX_VALUE_SIZE = 10485760; // 10MB
  private static readonly DEFAULT_BACKOFF_BASE_DELAY_MS = 1000; // 1 second
  private static readonly DEFAULT_BACKOFF_MAX_DELAY_MS = 30000; // 30 seconds
  private static readonly DEFAULT_MUTEX_TIMEOUT_MS = 5000; // 5 seconds

  // Security and rate limiting constants
  private static readonly DEFAULT_RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
  private static readonly DEFAULT_RATE_LIMIT_MAX_OPERATIONS = 100; // Max operations per window
  private static readonly DEFAULT_RATE_LIMIT_BURST_SIZE = 10; // Burst allowance

  private readonly logger = createLogger('StorageFactory');
  private cachedAdapter: StorageAdapter | null = null;
  private cachedConfig: StorageConfig | null = null;
  private cacheVersion: number = 0;
  private telemetryCallback?: (event: StorageTelemetryEvent) => void;

  // Mutex for preventing concurrent adapter creation
  private adapterCreationMutex: Promise<StorageAdapter> | null = null;

  // Rate limiting state
  private operationHistory: number[] = [];
  private lastRateLimitReset = Date.now();

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

  /**
   * Wait for mutex to be released with timeout protection
   *
   * @param timeout - Maximum time to wait in milliseconds
   * @throws {StorageError} If mutex timeout is exceeded
   */
  private async waitForMutex(timeout = StorageFactory.DEFAULT_MUTEX_TIMEOUT_MS): Promise<void> {
    const startTime = Date.now();
    while (this.adapterCreationMutex && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (this.adapterCreationMutex) {
      throw new StorageError(
        StorageErrorType.ACCESS_DENIED,
        `Adapter creation mutex timeout after ${timeout}ms`,
        new Error('Mutex timeout')
      );
    }
  }

  /**
   * Create and return the appropriate storage adapter based on configuration
   *
   * @param forceMode - Force a specific storage mode (for testing)
   * @returns Promise resolving to the configured storage adapter
   *
   * @throws {StorageError} If no suitable storage adapter can be created
   */
  async createAdapter(forceMode?: StorageMode): Promise<StorageAdapter> {
    const startTime = Date.now();
    try {
      // Rate limiting and audit logging for security
      this.checkRateLimit('create_adapter');
      this.auditLog('adapter_creation_requested', { forceMode, timestamp: startTime });

      this.logger.debug('Creating storage adapter', { forceMode });

      // Check if another creation is in progress (mutex pattern with timeout)
      if (this.adapterCreationMutex) {
        this.logger.debug('Adapter creation in progress, waiting for completion');
        try {
          await this.waitForMutex();
          // After waiting, check if we now have a cached adapter
          if (this.cachedAdapter && !forceMode) {
            const currentConfig = this.getStorageConfig();
            if (this.cachedConfig && currentConfig.mode === this.cachedConfig.mode) {
              return this.cachedAdapter;
            }
          }
        } catch (error) {
          this.logger.warn('Mutex timeout occurred, proceeding with adapter creation', { error });

          // Send telemetry for mutex timeout
          this.sendTelemetry({
            event: 'adapter_failed',
            mode: forceMode || this.getStorageConfig().mode,
            timestamp: Date.now(),
            details: {
              error: 'mutex_timeout',
              duration: Date.now() - startTime
            }
          });

          // Reset mutex and proceed - this handles stuck mutex scenarios
          this.adapterCreationMutex = null;
        }
      }

      // Return cached adapter if available and mode hasn't changed
      if (this.cachedAdapter && !forceMode) {
        const currentConfig = this.getStorageConfig();
        const currentCacheVersion = this.cacheVersion;
        if (this.cachedConfig &&
            currentConfig.mode === this.cachedConfig.mode &&
            currentCacheVersion === this.cacheVersion) {
          this.logger.debug('Returning cached adapter', { mode: currentConfig.mode });
          return this.cachedAdapter;
        }
      }

      // Start mutex-protected adapter creation
      this.adapterCreationMutex = this.createAdapterInternal(forceMode, startTime);
      const adapter = await this.adapterCreationMutex;
      this.adapterCreationMutex = null; // Release mutex
      return adapter;

    } catch (error) {
      this.adapterCreationMutex = null; // Release mutex on error
      this.logger.error('Failed to create storage adapter', { error, forceMode });
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
  private async createAdapterInternal(forceMode?: StorageMode, startTime: number = Date.now()): Promise<StorageAdapter> {
    const config = this.getStorageConfig();
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
      // Attempt to create IndexedDB adapter with fallback
      adapter = await this.createIndexedDBAdapter(config);
    } else {
      // Create localStorage adapter
      adapter = await this.createLocalStorageAdapter();
    }

    // Cache the successful adapter and config with version
    const newCacheVersion = this.cacheVersion + 1;
    this.cachedAdapter = adapter;
    this.cachedConfig = { ...config, mode: targetMode };
    this.cacheVersion = newCacheVersion;

    const duration = Date.now() - startTime;
    this.logger.debug('Storage adapter created successfully', {
      backend: adapter.getBackendName(),
      mode: targetMode,
      duration
    });

    // Send telemetry
    this.sendTelemetry({
      event: 'adapter_created',
      mode: targetMode,
      timestamp: Date.now(),
      details: { duration }
    });

    return adapter;
  }

  /**
   * Check if operation is within rate limits
   *
   * @param operationType - Type of operation for audit logging
   * @throws {StorageError} If rate limit is exceeded
   */
  private checkRateLimit(operationType: string): void {
    const now = Date.now();

    // Clean old entries (outside the time window)
    if (now - this.lastRateLimitReset > StorageFactory.DEFAULT_RATE_LIMIT_WINDOW_MS) {
      this.operationHistory = [];
      this.lastRateLimitReset = now;
    }

    // Remove operations outside the current window
    this.operationHistory = this.operationHistory.filter(
      timestamp => now - timestamp < StorageFactory.DEFAULT_RATE_LIMIT_WINDOW_MS
    );

    // Check burst limit (rapid operations)
    const recentOperations = this.operationHistory.filter(
      timestamp => now - timestamp < 5000 // Last 5 seconds
    );

    if (recentOperations.length >= StorageFactory.DEFAULT_RATE_LIMIT_BURST_SIZE) {
      this.auditLog('rate_limit_exceeded', {
        operationType,
        burstOperations: recentOperations.length,
        reason: 'burst_limit'
      });

      throw new StorageError(
        StorageErrorType.QUOTA_EXCEEDED,
        `Rate limit exceeded: Too many rapid operations (${recentOperations.length}/${StorageFactory.DEFAULT_RATE_LIMIT_BURST_SIZE})`,
        new Error('Burst rate limit exceeded')
      );
    }

    // Check overall rate limit
    if (this.operationHistory.length >= StorageFactory.DEFAULT_RATE_LIMIT_MAX_OPERATIONS) {
      this.auditLog('rate_limit_exceeded', {
        operationType,
        totalOperations: this.operationHistory.length,
        reason: 'rate_limit'
      });

      throw new StorageError(
        StorageErrorType.QUOTA_EXCEEDED,
        `Rate limit exceeded: Too many operations (${this.operationHistory.length}/${StorageFactory.DEFAULT_RATE_LIMIT_MAX_OPERATIONS} per minute)`,
        new Error('Rate limit exceeded')
      );
    }

    // Record this operation
    this.operationHistory.push(now);
    this.auditLog('operation_allowed', { operationType, operationCount: this.operationHistory.length });
  }

  /**
   * Audit log for security-critical operations
   *
   * @param action - The action being performed
   * @param details - Additional details for the audit log
   */
  private auditLog(action: string, details: Record<string, unknown>): void {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      action,
      details,
      sessionId: this.getSessionId()
    };

    // Log to console in development, would integrate with security logging in production
    this.logger.info('Security audit log', auditEntry);

    // Send to telemetry system for monitoring
    this.sendTelemetry({
      event: 'adapter_failed', // Reusing existing event type, could extend for audit events
      mode: (this.cachedConfig?.mode || 'localStorage') as StorageMode,
      timestamp: Date.now(),
      details: {
        auditAction: action,
        ...details
      }
    });
  }

  /**
   * Get or generate session ID for audit tracking
   */
  private getSessionId(): string {
    const sessionKey = '__storage_factory_session_id';
    let sessionId = sessionStorage.getItem(sessionKey);

    if (!sessionId) {
      sessionId = `sf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      try {
        sessionStorage.setItem(sessionKey, sessionId);
      } catch {
        // If sessionStorage fails, use in-memory session
      }
    }

    return sessionId;
  }

  /**
   * Validate storage key and value sizes for security
   *
   * @param key - Storage key to validate
   * @param value - Storage value to validate
   * @throws {StorageError} If key or value exceeds size limits
   */
  validateStorageSize(key: string, value: string): void {
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
   * Get current storage configuration from localStorage
   *
   * @returns Current storage configuration with defaults applied
   */
  getStorageConfig(): StorageConfig {
    try {
      const mode = (getLocalStorageItem(STORAGE_CONFIG_KEYS.MODE) as StorageMode) || DEFAULT_STORAGE_CONFIG.mode;
      const rawVersion = getLocalStorageItem(STORAGE_CONFIG_KEYS.VERSION) || DEFAULT_STORAGE_CONFIG.version;
      // Validate version format
      const version = this.isValidVersion(rawVersion) ? rawVersion : DEFAULT_STORAGE_CONFIG.version;
      if (rawVersion !== version) {
        this.logger.warn('Invalid version format, using default', { rawVersion, version });
      }
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
            removeLocalStorageItem(STORAGE_CONFIG_KEYS.FORCE_MODE);
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

      // Invalidate cached adapter if mode changed (thread-safe)
      if (updates.mode && updates.mode !== currentConfig.mode) {
        this.logger.debug('Storage mode changed, invalidating cached adapter');
        // Increment version to invalidate cache safely
        this.cacheVersion++;
        // Dispose old adapter
        if (this.cachedAdapter) {
          await this.disposeAdapter();
        }
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

      // Send telemetry
      this.sendTelemetry({
        event: 'adapter_disposed',
        mode: this.cachedConfig?.mode || 'localStorage',
        timestamp: Date.now()
      });

      this.cachedAdapter = null;
      this.cachedConfig = null;
    } catch (error) {
      this.logger.error('Error disposing adapter', { error });
    }
  }

  /**
   * Set telemetry callback for monitoring adapter events
   *
   * @param callback - Function to receive telemetry events
   *
   * @example
   * ```typescript
   * factory.setTelemetryCallback((event) => {
   *   console.log('Storage event:', event);
   *   analytics.track('storage_event', event);
   * });
   * ```
   */
  setTelemetryCallback(callback: (event: StorageTelemetryEvent) => void): void {
    this.telemetryCallback = callback;
  }

  /**
   * Send telemetry event if callback is configured
   */
  private sendTelemetry(event: StorageTelemetryEvent): void {
    if (this.telemetryCallback) {
      try {
        this.telemetryCallback(event);
      } catch (error) {
        this.logger.debug('Telemetry callback error', { error });
      }
    }
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
    } catch {
      this.logger.debug('Could not parse last attempt time, allowing retry', { lastAttempt });
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
      // Clear all configuration keys
      Object.values(STORAGE_CONFIG_KEYS).forEach(key => {
        try {
          removeLocalStorageItem(key);
        } catch (error) {
          this.logger.debug(`Could not remove config key ${key}`, { error });
        }
      });

      // Dispose and clear cached adapter
      if (this.cachedAdapter) {
        await this.disposeAdapter();
      }
      this.cacheVersion = 0;

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
    const failureCount = config.migrationFailureCount || 0;

    // Check if too many migration failures occurred
    if (failureCount >= MAX_MIGRATION_FAILURES) {
      this.logger.warn('Too many migration failures, falling back to localStorage', {
        failureCount,
        maxFailures: MAX_MIGRATION_FAILURES
      });
      return this.createLocalStorageAdapter();
    }

    // Check if enough time has passed since last failure (exponential backoff)
    if (failureCount > 0 && !this.canRetryAfterBackoff(config.lastMigrationAttempt, failureCount)) {
      const backoffDelay = this.calculateBackoffDelay(failureCount);
      const nextRetryTime = config.lastMigrationAttempt ?
        new Date(new Date(config.lastMigrationAttempt).getTime() + backoffDelay).toISOString() :
        'unknown';

      this.logger.warn('IndexedDB retry blocked by exponential backoff, falling back to localStorage', {
        failureCount,
        nextRetryTime,
        backoffDelayMs: backoffDelay
      });

      this.sendTelemetry({
        event: 'fallback_triggered',
        mode: 'localStorage',
        timestamp: Date.now(),
        details: { fallbackReason: 'exponential_backoff', failureCount, backoffDelayMs: backoffDelay }
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

      // Send fallback telemetry
      this.sendTelemetry({
        event: 'fallback_triggered',
        mode: 'localStorage',
        timestamp: Date.now(),
        details: {
          fallbackReason: 'IndexedDB creation failed',
          failureCount: newFailureCount,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
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