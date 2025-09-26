/**
 * IndexedDB Migration Orchestrator
 *
 * Manages the complete migration process from localStorage to IndexedDB,
 * including backup creation, data transfer, verification, and rollback.
 *
 * @module indexedDbMigration
 */

import { createLogger } from './logger';
import {
  StorageAdapter,
  StorageError,
  StorageErrorType
} from './storageAdapter';
import {
  createStorageAdapter,
  getStorageConfig,
  updateStorageConfig
} from './storageFactory';
import { generateFullBackupJson } from './fullBackup';
import {
  SEASONS_LIST_KEY,
  TOURNAMENTS_LIST_KEY,
  SAVED_GAMES_KEY,
  APP_SETTINGS_KEY,
  MASTER_ROSTER_KEY,
  LAST_HOME_TEAM_NAME_KEY,
  TIMER_STATE_KEY,
  PLAYER_ADJUSTMENTS_KEY,
  TEAMS_INDEX_KEY,
  TEAM_ROSTERS_KEY,
  APP_DATA_VERSION_KEY
} from '@/config/storageKeys';
// Memory check removed in simplification

const logger = createLogger('indexedDbMigration');

/**
 * Migration constants
 */
const MIGRATION_CONSTANTS = {
  LARGE_PAYLOAD_THRESHOLD_BYTES: 1024 * 1024, // 1MB
  DEFAULT_BATCH_SIZE: 10,
  MAX_RETRIES: 3,
  EXPONENTIAL_BACKOFF_BASE_MS: 100,
  BACKUP_CHUNK_SIZE_BYTES: 5 * 1024 * 1024, // 5MB chunks for backup storage
  BACKUP_DB_NAME: 'migration-backup-db',
  BACKUP_STORE_NAME: 'backups',
  // Rate limiting to prevent abuse
  MAX_MIGRATIONS_PER_HOUR: 5,
  MIN_TIME_BETWEEN_MIGRATIONS_MS: 60 * 1000, // 1 minute
  RATE_LIMIT_STORAGE_KEY: 'migration_rate_limit_data',
  // Performance optimization constants
  MAX_CONCURRENT_BATCHES: 3, // Limit parallel batch processing
  DYNAMIC_BATCH_MIN_SIZE: 5,
  DYNAMIC_BATCH_MAX_SIZE: 25,
  // Dynamic connection pool sizing based on available resources
  CONNECTION_POOL_SIZE: typeof navigator !== 'undefined' && navigator.hardwareConcurrency
    ? Math.min(Math.max(navigator.hardwareConcurrency, 2), 8) // 2-8 connections based on CPU cores
    : 5 // Fallback for environments without navigator.hardwareConcurrency
} as const;

/**
 * Migration state tracking
 */
export enum MigrationState {
  NOT_STARTED = 'not-started',
  BACKING_UP = 'backing-up',
  TRANSFERRING = 'transferring',
  VERIFYING = 'verifying',
  SWITCHING = 'switching',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled-back'
}

/**
 * Migration progress information
 */
export interface MigrationProgress {
  state: MigrationState;
  currentStep: string;
  totalKeys: number;
  processedKeys: number;
  percentage: number;
  estimatedTimeRemainingMs?: number;
  estimatedTimeRemainingText?: string;
  elapsedTimeMs?: number;
  transferSpeedMBps?: number;
  errors: string[];
}

/**
 * Migration result
 */
export interface MigrationResult {
  success: boolean;
  state: MigrationState;
  errors: string[];
  backup?: string;
  duration: number;
}

/**
 * Partial migration progress for recovery
 */
interface PartialMigrationProgress {
  completedKeys: string[];
  failedKeys: string[];
  lastBatchIndex: number;
  timestamp: number;
  migrationId: string;
}

/**
 * Storage cleanup suggestion
 */
interface StorageCleanupSuggestion {
  type: 'localStorage' | 'indexedDB' | 'cache' | 'temporary';
  description: string;
  estimatedSpaceMB: number;
  action: string;
  priority: 'high' | 'medium' | 'low';
  riskLevel: 'safe' | 'moderate' | 'risky';
}

/**
 * Performance metrics for migration monitoring
 */
interface MigrationPerformanceMetrics {
  transferSpeedMBps: number;
  operationLatencies: {
    p50: number;
    p95: number;
    p99: number;
  };
  memoryUsage: {
    heapUsedMB: number;
    heapTotalMB: number;
    external: number;
  };
  batchMetrics: {
    averageBatchSizeKeys: number;
    averageBatchDurationMs: number;
    batchThroughputKeysPerSecond: number;
  };
  errorMetrics: {
    totalErrors: number;
    errorRate: number;
    retriesPerformed: number;
  };
}

/**
 * Migration health dashboard data
 */
interface MigrationHealthDashboard {
  correlationId: string;
  migrationId: string;
  startTime: number;
  currentPhase: MigrationState;
  progress: {
    completedKeys: number;
    totalKeys: number;
    percentComplete: number;
    estimatedTimeRemainingMs: number;
  };
  performance: MigrationPerformanceMetrics;
  healthStatus: 'healthy' | 'warning' | 'critical';
  alerts: Array<{
    severity: 'info' | 'warning' | 'error';
    message: string;
    timestamp: number;
  }>;
}

/**
 * Migration configuration
 */
export interface MigrationConfig {
  targetVersion: string;
  batchSize: number;
  verifyData: boolean;
  keepBackupOnSuccess: boolean;
  enablePartialRecovery: boolean;
  progressCallback?: (progress: MigrationProgress) => void;
  notificationCallback?: (message: string, type: 'success' | 'error' | 'info') => void;
}

/**
 * Default migration configuration
 */
const DEFAULT_CONFIG: MigrationConfig = {
  targetVersion: '2.0.0',
  batchSize: MIGRATION_CONSTANTS.DEFAULT_BATCH_SIZE,
  verifyData: true,
  keepBackupOnSuccess: false,
  enablePartialRecovery: true
};

/**
 * Critical storage keys that must be migrated
 */
const CRITICAL_KEYS = [
  SAVED_GAMES_KEY,
  MASTER_ROSTER_KEY,
  SEASONS_LIST_KEY,
  TOURNAMENTS_LIST_KEY,
  APP_SETTINGS_KEY,
  TEAMS_INDEX_KEY,
  TEAM_ROSTERS_KEY,
  PLAYER_ADJUSTMENTS_KEY,
  APP_DATA_VERSION_KEY,
  LAST_HOME_TEAM_NAME_KEY,
  TIMER_STATE_KEY
];

/**
 * Migration orchestrator class
 */
export class IndexedDbMigrationOrchestrator {
  private config: MigrationConfig;
  private currentState: MigrationState = MigrationState.NOT_STARTED;
  private errors: string[] = [];
  private backup: string | null = null;
  private startTime: number = 0;
  private connectionPool: Map<string, StorageAdapter> = new Map();

  // Performance monitoring properties
  private correlationId: string;
  private migrationId: string = '';
  private operationLatencies: number[] = [];
  private batchDurations: number[] = [];
  private transferredBytes: number = 0;
  private transferStartTime: number = 0;
  private retryCount: number = 0;
  private totalOperations: number = 0;
  private completedKeys: number = 0;
  private alerts: Array<{ severity: 'info' | 'warning' | 'error'; message: string; timestamp: number }> = [];

  // Performance Observer for granular timing
  private performanceObserver: PerformanceObserver | null = null;
  private performanceEntries: PerformanceEntry[] = [];

  constructor(config: Partial<MigrationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.correlationId = `migration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize Performance Observer for granular timing
    this.initializePerformanceObserver();

    // Validate browser compatibility on initialization
    this.validateBrowserCompatibility();
  }

  /**
   * Execute the complete migration process
   */
  async migrate(): Promise<MigrationResult> {
    this.startTime = Date.now();
    this.transferStartTime = this.startTime;
    this.migrationId = `${this.correlationId}_${Date.now()}`;

    // Mark migration start for performance tracking
    this.markPerformance('migration_start');

    // Structured logging with correlation ID
    logger.info('Starting IndexedDB migration', {
      correlationId: this.correlationId,
      migrationId: this.migrationId,
      startTime: this.startTime,
      targetVersion: this.config.targetVersion,
      enablePartialRecovery: this.config.enablePartialRecovery
    });

    // Add initial alert
    this.addAlert('info', 'Migration process initiated');

    // Send user notification for migration start
    this.sendNotification('Starting data migration to IndexedDB...', 'info');

    try {
      // Check compatibility issues first
      if (this.errors.length > 0) {
        logger.error('Migration aborted due to compatibility issues', {
          correlationId: this.correlationId,
          errors: this.errors
        });
        return this.createResult(false, MigrationState.ROLLED_BACK);
      }

      // Acquire migration lock to prevent race conditions
      const lockAcquired = await this.acquireMigrationLock();
      if (!lockAcquired) {
        logger.error('Migration aborted: could not acquire lock', {
          correlationId: this.correlationId
        });
        this.addAlert('error', 'Migration blocked by another tab');
        return this.createResult(false, MigrationState.ROLLED_BACK);
      }

      // Check rate limiting to prevent abuse
      this.checkRateLimit();

      // Check if migration is already completed
      const storageConfig = getStorageConfig();
      if (storageConfig.mode === 'indexedDB' && storageConfig.version === this.config.targetVersion) {
        logger.info('Migration already completed');
        return this.createResult(true, MigrationState.COMPLETED);
      }

      // Step 1: Create backup
      await this.createBackup();

      // Step 2: Transfer data
      await this.transferData();

      // Step 3: Verify data
      if (this.config.verifyData) {
        await this.verifyData();
      }

      // Step 4: Switch storage mode
      await this.switchToIndexedDB();

      // Clean up backup if configured
      if (!this.config.keepBackupOnSuccess) {
        this.backup = null;
      }

      logger.info('Migration completed successfully');
      return this.createResult(true, MigrationState.COMPLETED);

    } catch (error) {
      logger.error('Migration failed', { error });
      this.errors.push(error instanceof Error ? error.message : 'Unknown error');

      // Attempt rollback
      await this.rollback();

      return this.createResult(false, MigrationState.ROLLED_BACK);
    }
  }

  /**
   * Create a comprehensive backup with memory management
   */
  private async createBackup(): Promise<void> {
    this.updateState(MigrationState.BACKING_UP, 'Creating backup');
    this.markPerformance('backup_start');

    try {
      logger.debug('Creating comprehensive backup');
      const backupData = await generateFullBackupJson();

      if (!backupData) {
        throw new Error('Failed to create backup');
      }

      // Check backup size and handle large backups differently
      const backupSizeMB = backupData.length / (1024 * 1024);
      const isLargeBackup = backupSizeMB > 50; // 50MB threshold

      if (isLargeBackup) {
        logger.warn('Large backup detected, using memory-optimized storage', {
          backupSizeMB: backupSizeMB.toFixed(2)
        });
        this.addAlert('warning', `Large backup detected: ${backupSizeMB.toFixed(2)} MB`);
      }

      // Store backup using multi-location strategy for safety
      const backupKey = `migration_backup_${Date.now()}`;

      if (isLargeBackup) {
        // For large backups, use dual storage strategy
        try {
          // Primary: Store in dedicated backup IndexedDB (isolated from main migration)
          await this.storeBackupSecurely(backupKey, backupData);
          // Secondary: Store compressed backup in sessionStorage as fallback
          await this.storeBackupInSessionStorage(backupKey, backupData);
          this.backup = `<large_backup_ref:${backupKey}>`;
        } catch (error) {
          logger.warn('Failed to store backup in IndexedDB, using localStorage fallback', { error });
          // Fallback: Store in localStorage if possible, or keep in memory
          try {
            localStorage.setItem(backupKey, backupData);
            this.backup = `<localStorage_backup_ref:${backupKey}>`;
          } catch (localStorageError) {
            logger.warn('LocalStorage backup also failed, keeping in memory', { localStorageError });
            this.backup = backupData; // Keep in memory as last resort
          }
        }
      } else {
        // For small backups, store in both localStorage and sessionStorage
        try {
          localStorage.setItem(backupKey, backupData);
          sessionStorage.setItem(`${backupKey}_session`, backupData);
          this.backup = backupData;
        } catch (error) {
          logger.warn('Failed to store backup in browser storage, keeping in memory', { error });
          this.backup = backupData; // Keep in memory
        }
      }

      this.markPerformance('backup_end');
      this.measurePerformance('backup_duration', 'backup_start', 'backup_end');

      // Notify user about backup completion
      this.sendNotification(`Backup created (${backupSizeMB.toFixed(1)} MB)`, 'success');

      logger.info('Backup created successfully', {
        size: backupData.length,
        sizeMB: backupSizeMB.toFixed(2),
        key: backupKey,
        memoryOptimized: isLargeBackup
      });

      // Large backup data will be garbage collected when function scope ends
    } catch (error) {
      logger.error('Backup creation failed', { error });
      throw new StorageError(
        StorageErrorType.UNKNOWN,
        'Failed to create backup',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Store compressed backup in sessionStorage as fallback
   */
  private async storeBackupInSessionStorage(backupKey: string, backupData: string): Promise<void> {
    try {
      // Simple compression using basic techniques for sessionStorage
      const compressed = this.compressBackupData(backupData);
      sessionStorage.setItem(`${backupKey}_compressed`, compressed);
      sessionStorage.setItem(`${backupKey}_meta`, JSON.stringify({
        originalSize: backupData.length,
        compressedSize: compressed.length,
        timestamp: Date.now(),
        compressionRatio: (compressed.length / backupData.length * 100).toFixed(1)
      }));

      logger.debug('Backup stored in sessionStorage', {
        originalSize: backupData.length,
        compressedSize: compressed.length,
        compressionRatio: (compressed.length / backupData.length * 100).toFixed(1) + '%'
      });
    } catch (error) {
      logger.warn('Failed to store backup in sessionStorage', { error });
      throw error;
    }
  }

  /**
   * Simple compression for backup data
   */
  private compressBackupData(data: string): string {
    try {
      // Use simple RLE compression for JSON data (common in backups)
      return data.replace(/(.)\1{2,}/g, (match, char) => {
        return char + '%' + match.length + '%';
      });
    } catch {
      return data; // Return original if compression fails
    }
  }

  /**
   * Store backup data securely in IndexedDB to avoid localStorage quota issues
   */
  private async storeBackupSecurely(backupKey: string, backupData: string): Promise<void> {
    try {
      // Open dedicated backup database
      const db = await this.openBackupDatabase();

      // Store metadata in localStorage for quick access
      localStorage.setItem('last_migration_backup_key', backupKey);
      localStorage.setItem(`${backupKey}_metadata`, JSON.stringify({
        key: backupKey,
        size: backupData.length,
        created: Date.now(),
        chunks: Math.ceil(backupData.length / MIGRATION_CONSTANTS.BACKUP_CHUNK_SIZE_BYTES)
      }));

      // Store backup data in chunks in IndexedDB
      const chunks = Math.ceil(backupData.length / MIGRATION_CONSTANTS.BACKUP_CHUNK_SIZE_BYTES);
      const transaction = db.transaction([MIGRATION_CONSTANTS.BACKUP_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(MIGRATION_CONSTANTS.BACKUP_STORE_NAME);

      for (let i = 0; i < chunks; i++) {
        const start = i * MIGRATION_CONSTANTS.BACKUP_CHUNK_SIZE_BYTES;
        const end = Math.min(start + MIGRATION_CONSTANTS.BACKUP_CHUNK_SIZE_BYTES, backupData.length);
        const chunk = backupData.slice(start, end);

        await new Promise<void>((resolve, reject) => {
          const request = store.put({
            id: `${backupKey}_chunk_${i}`,
            data: chunk,
            chunkIndex: i,
            backupKey,
            timestamp: Date.now()
          });
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }

      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });

      logger.debug('Backup stored in chunks', {
        backupKey,
        chunks,
        sizeMB: (backupData.length / (1024 * 1024)).toFixed(2)
      });

    } catch (error) {
      logger.error('Failed to store backup securely', { error, backupKey });
      // Fallback to localStorage if IndexedDB fails
      logger.warn('Falling back to localStorage for backup storage');
      localStorage.setItem(backupKey, backupData);
      localStorage.setItem('last_migration_backup_key', backupKey);
    }
  }

  /**
   * Open dedicated backup database
   */
  private async openBackupDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(MIGRATION_CONSTANTS.BACKUP_DB_NAME, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(MIGRATION_CONSTANTS.BACKUP_STORE_NAME)) {
          const store = db.createObjectStore(MIGRATION_CONSTANTS.BACKUP_STORE_NAME, { keyPath: 'id' });
          store.createIndex('backupKey', 'backupKey', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  /**
   * Transfer data from localStorage to IndexedDB with partial recovery support
   */
  private async transferData(): Promise<void> {
    this.updateState(MigrationState.TRANSFERRING, 'Transferring data');
    this.markPerformance('transfer_start');

    const localAdapter = await this.getPooledAdapter('localStorage');
    const indexedDbAdapter = await this.getPooledAdapter('indexedDB');

    // Generate unique migration ID for this session
    const migrationId = `migration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check for existing partial progress
    const existingProgress = await this.loadPartialProgress();

    let keysToProcess = CRITICAL_KEYS;
    let completedKeys: string[] = [];
    let processedKeys = 0;
    const totalKeys = CRITICAL_KEYS.length;
    const failedKeys: string[] = [];
    const transferStats: Record<string, number> = {};

    // Resume from partial progress if available
    if (existingProgress) {
      completedKeys = existingProgress.completedKeys;
      processedKeys = completedKeys.length;
      keysToProcess = CRITICAL_KEYS.filter(key => !completedKeys.includes(key));

      logger.info('Resuming migration from partial progress', {
        completedCount: completedKeys.length,
        remainingCount: keysToProcess.length,
        lastBatch: existingProgress.lastBatchIndex
      });

      // Update progress to show resumed state
      this.updateProgress(processedKeys, totalKeys);
    } else {
      // Clear any stale progress data
      await this.clearPartialProgress();
    }

    if (keysToProcess.length === 0) {
      logger.info('All keys already transferred, skipping data transfer');
      return;
    }

    // Use dynamic batch sizing based on data characteristics
    const dynamicBatchSize = this.calculateOptimalBatchSize(keysToProcess);
    const batches = this.createBatches(keysToProcess, dynamicBatchSize);

    // Process batches with recovery checkpoints
    await this.processParallelBatchesWithRecovery(
      batches,
      localAdapter,
      indexedDbAdapter,
      completedKeys,
      migrationId,
      (key, size) => {
        processedKeys++;
        if (size) {
          transferStats[key] = size;
        }
        this.updateProgress(processedKeys, totalKeys);
      },
      (key, error) => {
        failedKeys.push(key);
        logger.error('Failed to transfer key', { key, error });
      }
    );

    // Handle failed keys with retry
    if (failedKeys.length > 0) {
      logger.warn('Retrying failed keys', { count: failedKeys.length });
      await this.retryFailedKeys(failedKeys, localAdapter, indexedDbAdapter);
    }

    // Clear progress on successful completion
    await this.clearPartialProgress();

    this.markPerformance('transfer_end');
    this.measurePerformance('transfer_duration', 'transfer_start', 'transfer_end');

    // Notify user about transfer completion
    const totalSize = Object.values(transferStats).reduce((sum, size) => sum + size, 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(1);
    this.sendNotification(`Data transfer completed (${totalSizeMB} MB)`, 'success');

    // Log transfer statistics
    logger.info('Data transfer completed', {
      processedKeys,
      totalKeys,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      largestKey: this.findLargestKey(transferStats),
      wasResumed: !!existingProgress
    });
  }

  /**
   * Process a batch of keys
   */
  private async processBatch(
    keys: string[],
    localAdapter: StorageAdapter,
    indexedDbAdapter: StorageAdapter,
    onSuccess: (key: string, size?: number) => void,
    onError: (key: string, error: unknown) => void
  ): Promise<void> {
    const batchStartTime = Date.now();

    // Emergency memory check before processing batch
    // Memory check removed in simplification
    const canContinue = true;
    if (!canContinue) {
      const error = new Error('Migration halted due to emergency memory conditions');
      keys.forEach(key => onError(key, error));
      throw error;
    }

    const promises = keys.map(async (key) => {
      const operationStartTime = Date.now();
      try {
        // Read from localStorage
        const value = await localAdapter.getItem(key);

        if (value !== null) {
          // Validate data before transfer to prevent XSS/injection attacks
          this.validateDataSecurity(key, value);

          // Handle large payloads specially
          if (this.isLargePayload(value)) {
            await this.transferLargePayload(key, value, indexedDbAdapter);
          } else {
            // Normal transfer
            await indexedDbAdapter.setItem(key, value);
          }

          // Record performance metrics
          this.recordOperationLatency(operationStartTime);
          this.transferredBytes += value.length;

          logger.debug('Key transferred successfully', {
            correlationId: this.correlationId,
            migrationId: this.migrationId,
            key,
            size: value.length,
            operationDurationMs: Date.now() - operationStartTime
          });
          onSuccess(key, value.length);
        } else {
          this.recordOperationLatency(operationStartTime);
          logger.debug('Key not found in localStorage', {
            correlationId: this.correlationId,
            migrationId: this.migrationId,
            key
          });
          onSuccess(key);
        }
      } catch (error) {
        this.recordOperationLatency(operationStartTime);
        logger.error('Key transfer failed', {
          correlationId: this.correlationId,
          migrationId: this.migrationId,
          key,
          error: error instanceof Error ? error.message : String(error),
          operationDurationMs: Date.now() - operationStartTime
        });
        onError(key, error);
      }
    });

    await Promise.allSettled(promises);

    // Record batch performance metrics
    const batchDuration = Date.now() - batchStartTime;
    this.recordBatchDuration(batchDuration, keys.length);

    logger.debug('Batch processing completed', {
      correlationId: this.correlationId,
      migrationId: this.migrationId,
      keysProcessed: keys.length,
      batchDurationMs: batchDuration,
      throughputKeysPerSecond: (keys.length / batchDuration) * 1000
    });
  }

  /**
   * Transfer large payloads with special handling
   */
  private async transferLargePayload(
    key: string,
    value: string,
    adapter: StorageAdapter
  ): Promise<void> {
    const sizeMB = value.length / (1024 * 1024);
    logger.info('Transferring large payload', {
      key,
      sizeMB: sizeMB.toFixed(2)
    });

    // For very large payloads, add a small delay to prevent blocking
    if (sizeMB > 5) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    try {
      await adapter.setItem(key, value);
    } catch (error) {
      // If quota exceeded, use enhanced handling with cleanup suggestions
      if (this.isQuotaError(error)) {
        await this.handleQuotaExceeded(key, sizeMB, error);
      }
      throw error;
    }
  }

  /**
   * Retry failed keys with exponential backoff
   */
  private async retryFailedKeys(
    keys: string[],
    localAdapter: StorageAdapter,
    indexedDbAdapter: StorageAdapter
  ): Promise<void> {
    const maxRetries = MIGRATION_CONSTANTS.MAX_RETRIES;

    for (const key of keys) {
      let retryCount = 0;
      let lastError: unknown;

      while (retryCount < maxRetries) {
        try {
          const value = await localAdapter.getItem(key);
          if (value !== null) {
            await indexedDbAdapter.setItem(key, value);
            logger.info('Retry successful for key', { key, attempt: retryCount + 1 });
            break;
          }
        } catch (error) {
          lastError = error;
          retryCount++;

          if (retryCount < maxRetries) {
            const delay = Math.pow(2, retryCount) * MIGRATION_CONSTANTS.EXPONENTIAL_BACKOFF_BASE_MS;
            logger.debug('Retrying key after delay', { key, delay, attempt: retryCount });
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      if (retryCount === maxRetries) {
        this.errors.push(`Failed to transfer ${key} after ${maxRetries} attempts`);
        throw new StorageError(
          StorageErrorType.UNKNOWN,
          `Failed to transfer key after retries: ${key}`,
          lastError instanceof Error ? lastError : undefined
        );
      }
    }
  }

  /**
   * Get pooled storage adapter with connection reuse
   */
  private async getPooledAdapter(mode: 'localStorage' | 'indexedDB'): Promise<StorageAdapter> {
    const existingAdapter = this.connectionPool.get(mode);
    if (existingAdapter) {
      return existingAdapter;
    }

    const adapter = await createStorageAdapter(mode);
    this.connectionPool.set(mode, adapter);
    return adapter;
  }

  /**
   * Clean up connection pool
   */
  private cleanupConnectionPool(): void {
    this.connectionPool.clear();
  }

  /**
   * Initialize Performance Observer for granular timing measurements
   */
  private initializePerformanceObserver(): void {
    // Skip in test environment or if Performance Observer not available
    if (typeof jest !== 'undefined' || process.env.NODE_ENV === 'test' || typeof PerformanceObserver === 'undefined') {
      logger.debug('Skipping Performance Observer initialization', {
        reason: typeof jest !== 'undefined' ? 'test_environment' : 'not_available'
      });
      return;
    }

    try {
      this.performanceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          // Filter for migration-related marks and measures
          if (entry.name.startsWith('migration_')) {
            this.performanceEntries.push(entry);

            // Log important performance milestones
            logger.debug('Performance measurement recorded', {
              correlationId: this.correlationId,
              name: entry.name,
              duration: entry.duration,
              startTime: entry.startTime,
              entryType: entry.entryType
            });
          }
        }

        // Keep only the last 200 entries to prevent memory bloat
        if (this.performanceEntries.length > 200) {
          this.performanceEntries = this.performanceEntries.slice(-200);
        }
      });

      // Observe marks and measures
      this.performanceObserver.observe({ entryTypes: ['mark', 'measure'] });

      logger.debug('Performance Observer initialized successfully', {
        correlationId: this.correlationId
      });
    } catch (error) {
      logger.warn('Failed to initialize Performance Observer', {
        correlationId: this.correlationId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Create performance mark for timing
   */
  private markPerformance(name: string): void {
    if (typeof performance !== 'undefined' && performance.mark) {
      try {
        performance.mark(`migration_${this.correlationId}_${name}`);
      } catch (error) {
        // Silently ignore performance marking errors
        logger.debug('Performance mark failed', { name, error });
      }
    }
  }

  /**
   * Create performance measure between two marks
   */
  private measurePerformance(name: string, startMark: string, endMark?: string): void {
    if (typeof performance !== 'undefined' && performance.measure) {
      try {
        const fullStartMark = `migration_${this.correlationId}_${startMark}`;
        const fullEndMark = endMark ? `migration_${this.correlationId}_${endMark}` : undefined;
        performance.measure(`migration_${this.correlationId}_${name}`, fullStartMark, fullEndMark);
      } catch (error) {
        // Silently ignore performance measuring errors
        logger.debug('Performance measure failed', { name, startMark, endMark, error });
      }
    }
  }

  /**
   * Clean up Performance Observer
   */
  private cleanupPerformanceObserver(): void {
    if (this.performanceObserver) {
      try {
        this.performanceObserver.disconnect();
        this.performanceObserver = null;
        logger.debug('Performance Observer cleaned up', {
          correlationId: this.correlationId,
          totalEntries: this.performanceEntries.length
        });
      } catch (error) {
        logger.warn('Error cleaning up Performance Observer', {
          correlationId: this.correlationId,
          error
        });
      }
    }
  }

  /**
   * Save partial migration progress for recovery
   */
  private async savePartialProgress(
    completedKeys: string[],
    failedKeys: string[],
    batchIndex: number,
    migrationId: string
  ): Promise<void> {
    if (!this.config.enablePartialRecovery) return;

    const progress: PartialMigrationProgress = {
      completedKeys,
      failedKeys,
      lastBatchIndex: batchIndex,
      timestamp: Date.now(),
      migrationId
    };

    try {
      localStorage.setItem('partial_migration_progress', JSON.stringify(progress));
      logger.debug('Partial migration progress saved', { batchIndex, completedCount: completedKeys.length });
    } catch (error) {
      logger.warn('Failed to save partial migration progress', { error });
    }
  }

  /**
   * Load partial migration progress for recovery
   */
  private async loadPartialProgress(): Promise<PartialMigrationProgress | null> {
    if (!this.config.enablePartialRecovery) return null;

    try {
      const progressData = localStorage.getItem('partial_migration_progress');
      if (!progressData) return null;

      const progress: PartialMigrationProgress = JSON.parse(progressData);

      // Check if progress is recent (within 24 hours)
      const age = Date.now() - progress.timestamp;
      if (age > 24 * 60 * 60 * 1000) {
        await this.clearPartialProgress();
        return null;
      }

      logger.info('Found partial migration progress', {
        completedCount: progress.completedKeys.length,
        lastBatch: progress.lastBatchIndex,
        age: Math.round(age / 1000 / 60) + ' minutes'
      });

      return progress;
    } catch (error) {
      logger.warn('Failed to load partial migration progress', { error });
      await this.clearPartialProgress();
      return null;
    }
  }

  /**
   * Clear partial migration progress
   */
  private async clearPartialProgress(): Promise<void> {
    try {
      localStorage.removeItem('partial_migration_progress');
      logger.debug('Partial migration progress cleared');
    } catch (error) {
      logger.warn('Failed to clear partial migration progress', { error });
    }
  }

  /**
   * Record operation latency for performance monitoring
   */
  private recordOperationLatency(startTime: number): void {
    const latency = Date.now() - startTime;
    this.operationLatencies.push(latency);
    this.totalOperations++;

    // Keep only the last 1000 latencies to prevent memory bloat
    if (this.operationLatencies.length > 1000) {
      this.operationLatencies = this.operationLatencies.slice(-1000);
    }
  }

  /**
   * Record batch duration for throughput metrics
   */
  private recordBatchDuration(duration: number, keysProcessed: number): void {
    this.batchDurations.push(duration);
    this.completedKeys += keysProcessed;

    // Keep only the last 100 batch durations
    if (this.batchDurations.length > 100) {
      this.batchDurations = this.batchDurations.slice(-100);
    }
  }

  /**
   * Calculate performance metrics
   */
  private calculatePerformanceMetrics(): MigrationPerformanceMetrics {
    const transferDuration = Date.now() - this.transferStartTime;
    const transferSpeedMBps = transferDuration > 0 ?
      (this.transferredBytes / (1024 * 1024)) / (transferDuration / 1000) : 0;

    // Calculate latency percentiles
    const sortedLatencies = [...this.operationLatencies].sort((a, b) => a - b);
    const p50 = this.calculatePercentile(sortedLatencies, 50);
    const p95 = this.calculatePercentile(sortedLatencies, 95);
    const p99 = this.calculatePercentile(sortedLatencies, 99);

    // Calculate batch metrics
    const avgBatchDuration = this.batchDurations.length > 0 ?
      this.batchDurations.reduce((sum, d) => sum + d, 0) / this.batchDurations.length : 0;
    const avgBatchSize = this.batchDurations.length > 0 ?
      this.completedKeys / this.batchDurations.length : 0;
    const batchThroughput = avgBatchDuration > 0 ?
      (avgBatchSize / avgBatchDuration) * 1000 : 0; // keys per second

    // Get memory usage
    const memoryUsage = this.getMemoryUsage();

    return {
      transferSpeedMBps,
      operationLatencies: { p50, p95, p99 },
      memoryUsage,
      batchMetrics: {
        averageBatchSizeKeys: avgBatchSize,
        averageBatchDurationMs: avgBatchDuration,
        batchThroughputKeysPerSecond: batchThroughput
      },
      errorMetrics: {
        totalErrors: this.errors.length,
        errorRate: this.totalOperations > 0 ? this.errors.length / this.totalOperations : 0,
        retriesPerformed: this.retryCount
      }
    };
  }

  /**
   * Calculate percentile from sorted array
   */
  private calculatePercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;

    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sortedArray[lower];
    }

    const weight = index - lower;
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  /**
   * Get current memory usage
   */
  private getMemoryUsage(): { heapUsedMB: number; heapTotalMB: number; external: number } {
    try {
      if (typeof performance !== 'undefined' && 'memory' in performance) {
        const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number } }).memory;
        if (memory) {
          return {
            heapUsedMB: (memory.usedJSHeapSize || 0) / (1024 * 1024),
            heapTotalMB: (memory.totalJSHeapSize || 0) / (1024 * 1024),
            external: (memory.usedJSHeapSize || 0) / (1024 * 1024)
          };
        }
      }
    } catch {
      // Fallback if performance.memory is not available
    }

    return { heapUsedMB: 0, heapTotalMB: 0, external: 0 };
  }

  /**
   * Add alert to monitoring system
   */
  private addAlert(severity: 'info' | 'warning' | 'error', message: string): void {
    this.alerts.push({
      severity,
      message,
      timestamp: Date.now()
    });

    // Keep only the last 50 alerts
    if (this.alerts.length > 50) {
      this.alerts = this.alerts.slice(-50);
    }

    // Log structured alert with correlation ID
    const logMessage = 'Migration alert';
    const logData = {
      correlationId: this.correlationId,
      migrationId: this.migrationId,
      severity,
      message,
      timestamp: Date.now()
    };

    // Map severity to correct logger method
    switch (severity) {
      case 'error':
        logger.error(logMessage, logData);
        break;
      case 'warning':
        logger.warn(logMessage, logData);
        break;
      case 'info':
        logger.info(logMessage, logData);
        break;
    }
  }

  /**
   * Generate health dashboard data
   */
  getHealthDashboard(): MigrationHealthDashboard {
    const performance = this.calculatePerformanceMetrics();
    const progress = {
      completedKeys: this.completedKeys,
      totalKeys: CRITICAL_KEYS.length,
      percentComplete: (this.completedKeys / CRITICAL_KEYS.length) * 100,
      estimatedTimeRemainingMs: this.estimateTimeRemaining()
    };

    // Determine health status
    let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (performance.errorMetrics.errorRate > 0.1) {
      healthStatus = 'critical';
    } else if (performance.errorMetrics.errorRate > 0.05 || performance.transferSpeedMBps < 0.5) {
      healthStatus = 'warning';
    }

    return {
      correlationId: this.correlationId,
      migrationId: this.migrationId,
      startTime: this.startTime,
      currentPhase: this.currentState,
      progress,
      performance,
      healthStatus,
      alerts: [...this.alerts]
    };
  }

  /**
   * Estimate time remaining for migration
   */
  private estimateTimeRemaining(): number {
    if (this.completedKeys === 0) return 0;

    const elapsed = Date.now() - this.startTime;
    const remaining = CRITICAL_KEYS.length - this.completedKeys;
    const rate = this.completedKeys / elapsed;

    return rate > 0 ? remaining / rate : 0;
  }

  /**
   * Validate browser compatibility for IndexedDB migration
   */
  private validateBrowserCompatibility(): void {
    // Skip validation in test environment
    if (typeof jest !== 'undefined' || process.env.NODE_ENV === 'test') {
      logger.debug('Skipping browser compatibility checks in test environment');
      return;
    }

    const compatibilityIssues: string[] = [];

    // Check IndexedDB availability
    if (typeof indexedDB === 'undefined') {
      compatibilityIssues.push('IndexedDB not available in this browser');
    }

    // Check if in private/incognito mode (IndexedDB may be disabled)
    try {
      if (typeof indexedDB !== 'undefined') {
        // Test IndexedDB availability with a quick operation
        const testRequest = indexedDB.open('__test_db__', 1);
        testRequest.onerror = () => {
          compatibilityIssues.push('IndexedDB disabled (possibly private browsing mode)');
        };
        testRequest.onsuccess = () => {
          // Clean up test database
          const db = testRequest.result;
          db.close();
          indexedDB.deleteDatabase('__test_db__');
        };
      }
    } catch {
      compatibilityIssues.push('IndexedDB access restricted');
    }

    // Check localStorage availability
    try {
      const testKey = '__test_storage__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
    } catch {
      compatibilityIssues.push('localStorage access restricted');
    }

    // Check Web Crypto API for secure checksums
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      logger.warn('Web Crypto API not available, falling back to basic checksums');
    }

    // Log compatibility status
    if (compatibilityIssues.length > 0) {
      logger.error('Browser compatibility issues detected', {
        correlationId: this.correlationId,
        issues: compatibilityIssues
      });

      for (const issue of compatibilityIssues) {
        this.addAlert('error', `Browser compatibility: ${issue}`);
      }

      // Don't throw error immediately, but store issues for later handling
      this.errors.push(...compatibilityIssues.map(issue => `Compatibility: ${issue}`));
    } else {
      logger.info('Browser compatibility verified', {
        correlationId: this.correlationId,
        indexedDBAvailable: typeof indexedDB !== 'undefined',
        webCryptoAvailable: typeof crypto !== 'undefined' && !!crypto.subtle
      });
    }
  }

  /**
   * Acquire migration lock to prevent race conditions between tabs
   */
  private async acquireMigrationLock(): Promise<boolean> {
    const lockKey = 'indexeddb_migration_internal_lock';
    const lockTimeout = 5 * 60 * 1000; // 5 minutes
    const developmentTimeout = 30 * 1000; // 30 seconds in development
    const currentTime = Date.now();
    const isDevelopment = process.env.NODE_ENV === 'development';

    // In development, aggressively clear any existing locks older than 5 seconds
    if (isDevelopment) {
      const existingLock = localStorage.getItem(lockKey);
      if (existingLock) {
        try {
          const lockData = JSON.parse(existingLock);
          if (currentTime - lockData.timestamp > 5000) { // 5 seconds
            logger.log('Development mode: clearing old migration lock on startup', {
              lockAge: currentTime - lockData.timestamp,
              lockData
            });
            localStorage.removeItem(lockKey);
          }
        } catch {
          // Invalid lock data, clear it
          logger.log('Development mode: clearing invalid migration lock');
          localStorage.removeItem(lockKey);
        }
      }
    }

    try {
      // Check for existing lock
      const existingLock = localStorage.getItem(lockKey);
      if (existingLock) {
        const lockData = JSON.parse(existingLock);

        // Check if lock is still valid (shorter timeout in development)
        const effectiveTimeout = isDevelopment ? developmentTimeout : lockTimeout;
        if (currentTime - lockData.timestamp < effectiveTimeout) {
          // Check if it's the same tab/session
          if (lockData.correlationId === this.correlationId) {
            logger.debug('Migration lock already held by this session');
            return true;
          }

          // In development mode, be more aggressive about clearing stale locks
          if (isDevelopment && currentTime - lockData.timestamp > 10000) { // 10 seconds
            logger.warn('Development mode: clearing stale migration lock', {
              correlationId: this.correlationId,
              existingLock: lockData,
              lockAge: currentTime - lockData.timestamp
            });
            localStorage.removeItem(lockKey);
            // Continue to acquire new lock below
          } else {
            logger.warn('Migration already in progress in another tab', {
              correlationId: this.correlationId,
              existingLock: lockData
            });
            this.addAlert('warning', 'Migration blocked: another tab is running migration');
            return false;
          }
        } else {
          // Lock expired, remove it
          logger.info('Removing expired migration lock');
          localStorage.removeItem(lockKey);
        }
      }

      // Acquire new lock
      const lockData = {
        correlationId: this.correlationId,
        migrationId: this.migrationId,
        timestamp: currentTime,
        tabId: this.generateTabId()
      };

      localStorage.setItem(lockKey, JSON.stringify(lockData));

      // Double-check lock wasn't overwritten by race condition
      await new Promise(resolve => setTimeout(resolve, 100));
      const verifyLock = localStorage.getItem(lockKey);
      if (verifyLock && JSON.parse(verifyLock).correlationId === this.correlationId) {
        logger.info('Migration lock acquired successfully', {
          correlationId: this.correlationId,
          lockData
        });
        return true;
      } else {
        logger.warn('Failed to acquire migration lock due to race condition');
        this.addAlert('warning', 'Failed to acquire migration lock');
        return false;
      }
    } catch (error) {
      logger.error('Error acquiring migration lock', {
        correlationId: this.correlationId,
        error
      });
      return false;
    }
  }

  /**
   * Release migration lock
   */
  private releaseMigrationLock(): void {
    const lockKey = 'indexeddb_migration_internal_lock';
    try {
      const existingLock = localStorage.getItem(lockKey);
      if (existingLock) {
        const lockData = JSON.parse(existingLock);
        if (lockData.correlationId === this.correlationId) {
          localStorage.removeItem(lockKey);
          logger.info('Migration lock released', {
            correlationId: this.correlationId
          });
        }
      }
    } catch (error) {
      logger.warn('Error releasing migration lock', {
        correlationId: this.correlationId,
        error
      });
    }
  }

  /**
   * Generate unique tab identifier
   */
  private generateTabId(): string {
    return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Calculate optimal batch size based on data characteristics
   */
  private calculateOptimalBatchSize(keys: string[]): number {
    // Base batch size
    let batchSize = this.config.batchSize;

    // Adjust based on number of keys
    if (keys.length > 20) {
      batchSize = Math.min(MIGRATION_CONSTANTS.DYNAMIC_BATCH_MAX_SIZE, batchSize + 5);
    } else if (keys.length < 10) {
      batchSize = Math.max(MIGRATION_CONSTANTS.DYNAMIC_BATCH_MIN_SIZE, batchSize - 2);
    }

    // Consider known large payload keys
    const largePayloadKeys = [SAVED_GAMES_KEY, MASTER_ROSTER_KEY];
    const hasLargePayloads = keys.some(key => largePayloadKeys.includes(key));

    if (hasLargePayloads) {
      batchSize = Math.max(MIGRATION_CONSTANTS.DYNAMIC_BATCH_MIN_SIZE, Math.floor(batchSize * 0.7));
    }

    logger.debug('Calculated optimal batch size', {
      originalSize: this.config.batchSize,
      optimizedSize: batchSize,
      keyCount: keys.length,
      hasLargePayloads
    });

    return batchSize;
  }

  /**
   * Process batches in parallel with concurrency control
   */
  private async processParallelBatches(
    batches: string[][],
    localAdapter: StorageAdapter,
    indexedDbAdapter: StorageAdapter,
    onSuccess: (key: string, size?: number) => void,
    onError: (key: string, error: unknown) => void
  ): Promise<void> {
    const semaphore = new Array(MIGRATION_CONSTANTS.MAX_CONCURRENT_BATCHES).fill(null);
    let batchIndex = 0;

    const processBatch = async (batch: string[], semaphoreIndex: number): Promise<void> => {
      try {
        await this.processBatch(batch, localAdapter, indexedDbAdapter, onSuccess, onError);
      } finally {
        // Release semaphore slot
        semaphore[semaphoreIndex] = null;
      }
    };

    // Process batches with controlled concurrency
    const promises: Promise<void>[] = [];

    while (batchIndex < batches.length) {
      // Find available semaphore slot
      const availableSlot = semaphore.findIndex(slot => slot === null);

      if (availableSlot !== -1) {
        // Claim semaphore slot
        const currentBatch = batches[batchIndex++];
        const promise = processBatch(currentBatch, availableSlot);
        semaphore[availableSlot] = promise;
        promises.push(promise);
      } else {
        // Wait for any batch to complete
        await Promise.race(semaphore.filter(p => p !== null));
      }
    }

    // Wait for all remaining batches to complete
    await Promise.allSettled(promises);

    logger.info('Parallel batch processing completed', {
      totalBatches: batches.length,
      maxConcurrency: MIGRATION_CONSTANTS.MAX_CONCURRENT_BATCHES
    });
  }

  /**
   * Process batches in parallel with recovery checkpoints
   */
  private async processParallelBatchesWithRecovery(
    batches: string[][],
    localAdapter: StorageAdapter,
    indexedDbAdapter: StorageAdapter,
    completedKeys: string[],
    migrationId: string,
    onSuccess: (key: string, size?: number) => void,
    onError: (key: string, error: unknown) => void
  ): Promise<void> {
    const semaphore = new Array(MIGRATION_CONSTANTS.MAX_CONCURRENT_BATCHES).fill(null);
    let batchIndex = 0;
    const totalBatches = batches.length;

    const processBatchWithRecovery = async (batch: string[], currentBatchIndex: number, semaphoreIndex: number): Promise<void> => {
      try {
        await this.processBatch(batch, localAdapter, indexedDbAdapter,
          (key, size) => {
            completedKeys.push(key);
            onSuccess(key, size);
          },
          onError
        );

        // Save progress checkpoint every few batches
        if (currentBatchIndex % 3 === 0 || currentBatchIndex === totalBatches - 1) {
          await this.savePartialProgress(completedKeys, [], currentBatchIndex, migrationId);
        }

        logger.debug('Batch completed with recovery checkpoint', {
          batchIndex: currentBatchIndex,
          completedKeys: completedKeys.length
        });
      } catch (error) {
        logger.error('Batch failed in recovery mode', { batchIndex: currentBatchIndex, error });
        throw error;
      } finally {
        // Release semaphore slot
        semaphore[semaphoreIndex] = null;
      }
    };

    // Process batches with controlled concurrency and recovery
    const promises: Promise<void>[] = [];

    while (batchIndex < batches.length) {
      // Find available semaphore slot
      const availableSlot = semaphore.findIndex(slot => slot === null);

      if (availableSlot !== -1) {
        // Claim semaphore slot
        const currentBatch = batches[batchIndex];
        const currentBatchIndex = batchIndex++;
        const promise = processBatchWithRecovery(currentBatch, currentBatchIndex, availableSlot);
        semaphore[availableSlot] = promise;
        promises.push(promise);
      } else {
        // Wait for any batch to complete
        await Promise.race(semaphore.filter(p => p !== null));
      }
    }

    // Wait for all remaining batches to complete
    await Promise.allSettled(promises);

    logger.info('Parallel batch processing with recovery completed', {
      totalBatches: batches.length,
      maxConcurrency: MIGRATION_CONSTANTS.MAX_CONCURRENT_BATCHES,
      completedKeys: completedKeys.length
    });
  }

  /**
   * Create batches from array
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Check if payload is considered large
   */
  private isLargePayload(value: string): boolean {
    return value.length > MIGRATION_CONSTANTS.LARGE_PAYLOAD_THRESHOLD_BYTES;
  }

  /**
   * Generate storage cleanup suggestions when quota is exceeded
   */
  private async generateCleanupSuggestions(): Promise<StorageCleanupSuggestion[]> {
    const suggestions: StorageCleanupSuggestion[] = [];

    try {
      // Check localStorage usage
      const localStorageSize = this.estimateLocalStorageSize();
      if (localStorageSize > 5) { // More than 5MB
        suggestions.push({
          type: 'localStorage',
          description: 'Clear old localStorage data and temporary files',
          estimatedSpaceMB: localStorageSize * 0.7, // Conservative estimate
          action: 'Remove non-critical localStorage entries',
          priority: 'high',
          riskLevel: 'safe'
        });
      }

      // Check for old migration backups
      const backupSize = await this.estimateBackupStorageSize();
      if (backupSize > 1) {
        suggestions.push({
          type: 'indexedDB',
          description: 'Remove old migration backups and temporary data',
          estimatedSpaceMB: backupSize,
          action: 'Clear expired backup data from IndexedDB',
          priority: 'medium',
          riskLevel: 'safe'
        });
      }

      // Browser cache suggestions
      suggestions.push({
        type: 'cache',
        description: 'Clear browser cache and temporary internet files',
        estimatedSpaceMB: 50, // Typical cache size
        action: 'Clear browser cache through settings',
        priority: 'medium',
        riskLevel: 'safe'
      });

      // Application-specific suggestions
      suggestions.push({
        type: 'temporary',
        description: 'Clear application temporary data and logs',
        estimatedSpaceMB: 10,
        action: 'Remove temporary application files',
        priority: 'low',
        riskLevel: 'safe'
      });

    } catch (error) {
      logger.warn('Failed to generate cleanup suggestions', { error });
    }

    // Sort by priority and estimated space savings
    return suggestions.sort((a, b) => {
      const priorityWeight = { high: 3, medium: 2, low: 1 };
      const aPriority = priorityWeight[a.priority];
      const bPriority = priorityWeight[b.priority];

      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }

      return b.estimatedSpaceMB - a.estimatedSpaceMB; // Larger space savings first
    });
  }

  /**
   * Estimate localStorage usage in MB
   */
  private estimateLocalStorageSize(): number {
    try {
      let totalSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value) {
            totalSize += key.length + value.length;
          }
        }
      }
      return totalSize / (1024 * 1024); // Convert to MB
    } catch {
      return 0;
    }
  }

  /**
   * Estimate backup storage size in IndexedDB
   */
  private async estimateBackupStorageSize(): Promise<number> {
    try {
      // Estimate based on typical backup patterns
      const backupKeys = Object.keys(localStorage).filter(key =>
        key.includes('backup') || key.includes('migration')
      );

      let totalSize = 0;
      for (const key of backupKeys) {
        const value = localStorage.getItem(key);
        if (value) {
          totalSize += value.length;
        }
      }

      return totalSize / (1024 * 1024); // Convert to MB
    } catch {
      return 0;
    }
  }

  /**
   * Handle quota exceeded error with enhanced recovery options
   */
  private async handleQuotaExceeded(key: string, sizeMB: number, error: unknown): Promise<void> {
    logger.error('Storage quota exceeded', { key, sizeMB, error });

    // Generate cleanup suggestions
    const suggestions = await this.generateCleanupSuggestions();

    const totalPotentialSavings = suggestions.reduce((sum, s) => sum + s.estimatedSpaceMB, 0);

    logger.info('Storage cleanup suggestions generated', {
      totalSuggestions: suggestions.length,
      potentialSavingsMB: totalPotentialSavings.toFixed(1),
      suggestions: suggestions.map(s => ({
        type: s.type,
        description: s.description,
        spaceMB: s.estimatedSpaceMB.toFixed(1),
        priority: s.priority,
        risk: s.riskLevel
      }))
    });

    // Try automatic cleanup for safe, high-priority items
    let spaceFreed = 0;
    for (const suggestion of suggestions) {
      if (suggestion.riskLevel === 'safe' && suggestion.priority === 'high') {
        try {
          if (suggestion.type === 'localStorage') {
            spaceFreed += await this.performSafeLocalStorageCleanup();
          } else if (suggestion.type === 'indexedDB') {
            spaceFreed += await this.performSafeIndexedDBCleanup();
          }
        } catch (cleanupError) {
          logger.warn('Failed to perform automatic cleanup', {
            type: suggestion.type,
            error: cleanupError
          });
        }
      }
    }

    if (spaceFreed > 0) {
      logger.info('Automatic cleanup completed', { spaceMbFreed: spaceFreed.toFixed(1) });
    }

    // Throw enhanced error with cleanup suggestions
    const enhancedError = new StorageError(
      StorageErrorType.QUOTA_EXCEEDED,
      `Storage quota exceeded for ${key} (${sizeMB.toFixed(2)} MB). ` +
      `${suggestions.length} cleanup suggestions available. ` +
      `Potential space savings: ${totalPotentialSavings.toFixed(1)} MB.`,
      error instanceof Error ? error : undefined
    );

    // Add suggestions to error for UI consumption
    (enhancedError as StorageError & { cleanupSuggestions?: StorageCleanupSuggestion[] }).cleanupSuggestions = suggestions;
    throw enhancedError;
  }

  /**
   * Perform safe localStorage cleanup
   */
  private async performSafeLocalStorageCleanup(): Promise<number> {
    let spaceFreed = 0;

    try {
      // Remove old migration backups
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('migration_backup_')) {
          const item = localStorage.getItem(key);
          if (item) {
            spaceFreed += item.length;
            keysToRemove.push(key);
          }
        }
      }

      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }

      logger.debug('Safe localStorage cleanup completed', {
        itemsRemoved: keysToRemove.length,
        spaceMbFreed: (spaceFreed / (1024 * 1024)).toFixed(1)
      });

    } catch (error) {
      logger.warn('Safe localStorage cleanup failed', { error });
    }

    return spaceFreed / (1024 * 1024); // Return MB
  }

  /**
   * Perform safe IndexedDB cleanup
   */
  private async performSafeIndexedDBCleanup(): Promise<number> {
    // This would involve cleaning up old backup chunks in IndexedDB
    // For now, return estimated cleanup without actual implementation
    // to avoid complexity in this enhancement
    logger.debug('Safe IndexedDB cleanup initiated');
    return 0; // Placeholder - would implement actual cleanup logic
  }

  /**
   * Check if error is quota exceeded
   */
  private isQuotaError(error: unknown): boolean {
    if (error instanceof StorageError) {
      return error.type === StorageErrorType.QUOTA_EXCEEDED;
    }
    if (error instanceof Error) {
      return error.message.toLowerCase().includes('quota');
    }
    return false;
  }

  /**
   * Find the largest transferred key
   */
  private findLargestKey(stats: Record<string, number>): { key: string; sizeMB: string } | null {
    const entries = Object.entries(stats);
    if (entries.length === 0) return null;

    const [key, size] = entries.reduce((max, current) =>
      current[1] > max[1] ? current : max
    );

    return {
      key,
      sizeMB: (size / (1024 * 1024)).toFixed(2)
    };
  }

  /**
   * Verify transferred data integrity
   */
  private async verifyData(): Promise<void> {
    this.updateState(MigrationState.VERIFYING, 'Verifying data');

    const localAdapter = await this.getPooledAdapter('localStorage');
    const indexedDbAdapter = await this.getPooledAdapter('indexedDB');

    const verificationResults: {
      key: string;
      status: 'verified' | 'failed' | 'skipped';
      details?: string;
    }[] = [];

    let verifiedCount = 0;
    let failedCount = 0;

    for (const key of CRITICAL_KEYS) {
      try {
        logger.debug('Verifying key', { key });

        // Read from both sources
        const localValue = await localAdapter.getItem(key);
        const indexedDbValue = await indexedDbAdapter.getItem(key);

        // Skip verification if key doesn't exist in localStorage
        if (localValue === null && indexedDbValue === null) {
          logger.debug('Key not present in either storage', { key });
          verificationResults.push({ key, status: 'skipped', details: 'Not present' });
          continue;
        }

        // Verify existence
        if ((localValue === null) !== (indexedDbValue === null)) {
          throw new Error(`Existence mismatch: localStorage has ${localValue !== null}, IndexedDB has ${indexedDbValue !== null}`);
        }

        // Verify content
        if (localValue !== null && indexedDbValue !== null) {
          // Basic equality check
          if (localValue !== indexedDbValue) {
            // Try parsing as JSON for structured comparison
            if (this.isJsonData(key)) {
              this.verifyJsonContent(key, localValue, indexedDbValue);
            } else {
              throw new Error('Content mismatch');
            }
          }

          // Verify size
          const localSize = localValue.length;
          const indexedDbSize = indexedDbValue.length;
          if (localSize !== indexedDbSize) {
            throw new Error(`Size mismatch: ${localSize} vs ${indexedDbSize} bytes`);
          }

          // Calculate checksum for large data
          if (this.isLargePayload(localValue)) {
            const localChecksum = await this.calculateChecksum(localValue);
            const indexedDbChecksum = await this.calculateChecksum(indexedDbValue);

            if (localChecksum !== indexedDbChecksum) {
              throw new Error(`Checksum mismatch: ${localChecksum} vs ${indexedDbChecksum}`);
            }
          }
        }

        verifiedCount++;
        verificationResults.push({ key, status: 'verified' });
        logger.debug('Key verified successfully', { key });

      } catch (error) {
        failedCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        logger.error('Verification failed for key', { key, error: errorMessage });
        verificationResults.push({
          key,
          status: 'failed',
          details: errorMessage
        });

        this.errors.push(`Verification failed for ${key}: ${errorMessage}`);

        // Don't throw immediately - collect all verification results first
      }
    }

    // Log verification summary
    logger.info('Data verification completed', {
      total: CRITICAL_KEYS.length,
      verified: verifiedCount,
      failed: failedCount,
      skipped: CRITICAL_KEYS.length - verifiedCount - failedCount
    });

    // If any critical keys failed, throw error
    if (failedCount > 0) {
      const failedKeys = verificationResults
        .filter(r => r.status === 'failed')
        .map(r => `${r.key}: ${r.details}`)
        .join(', ');

      throw new StorageError(
        StorageErrorType.CORRUPTED_DATA,
        `Data verification failed for ${failedCount} keys: ${failedKeys}`
      );
    }
  }

  /**
   * Check if key typically contains JSON data
   */
  private isJsonData(key: string): boolean {
    const jsonKeys = [
      SAVED_GAMES_KEY,
      SEASONS_LIST_KEY,
      TOURNAMENTS_LIST_KEY,
      MASTER_ROSTER_KEY,
      APP_SETTINGS_KEY,
      TEAMS_INDEX_KEY,
      TEAM_ROSTERS_KEY,
      PLAYER_ADJUSTMENTS_KEY
    ];
    return jsonKeys.includes(key);
  }

  /**
   * Verify JSON content with structural comparison
   */
  private verifyJsonContent(key: string, localValue: string, indexedDbValue: string): void {
    try {
      const localData = JSON.parse(localValue);
      const indexedDbData = JSON.parse(indexedDbValue);

      // Deep equality check for JSON data
      if (!this.deepEqual(localData, indexedDbData)) {
        throw new Error('JSON structure mismatch');
      }
    } catch {
      // If parsing fails, fall back to string comparison
      if (localValue !== indexedDbValue) {
        throw new Error('JSON content mismatch');
      }
    }
  }

  /**
   * Deep equality check for objects with circular reference protection and max depth
   */
  private deepEqual(obj1: unknown, obj2: unknown): boolean {
    const MAX_DEPTH = 50; // Prevent deep object traversal attacks
    return this.deepEqualWithVisited(obj1, obj2, new WeakMap(), 0, MAX_DEPTH);
  }

  /**
   * Deep equality implementation with circular reference protection and depth limiting
   */
  private deepEqualWithVisited(
    obj1: unknown,
    obj2: unknown,
    visited: WeakMap<object, object>,
    depth: number,
    maxDepth: number
  ): boolean {
    // Depth protection
    if (depth > maxDepth) {
      logger.warn('Deep equality check exceeded max depth', { depth, maxDepth });
      return false;
    }

    // Primitive equality
    if (obj1 === obj2) return true;
    if (obj1 === null || obj2 === null) return false;
    if (typeof obj1 !== typeof obj2) return false;
    if (typeof obj1 !== 'object') return obj1 === obj2;

    // Type-specific checks
    if (obj1 instanceof Date && obj2 instanceof Date) {
      return obj1.getTime() === obj2.getTime();
    }
    if (obj1 instanceof RegExp && obj2 instanceof RegExp) {
      return obj1.toString() === obj2.toString();
    }

    // Circular reference protection
    const obj1AsObject = obj1 as object;
    const obj2AsObject = obj2 as object;

    if (visited.has(obj1AsObject)) {
      // If obj1 is already being compared, check if it's with the same obj2
      return visited.get(obj1AsObject) === obj2AsObject;
    }

    // Mark this comparison to detect cycles
    visited.set(obj1AsObject, obj2AsObject);

    try {
      // Array handling
      if (Array.isArray(obj1) && Array.isArray(obj2)) {
        if (obj1.length !== obj2.length) return false;

        for (let i = 0; i < obj1.length; i++) {
          if (!this.deepEqualWithVisited(obj1[i], obj2[i], visited, depth + 1, maxDepth)) {
            return false;
          }
        }
        return true;
      }

      // Object handling
      if (Array.isArray(obj1) || Array.isArray(obj2)) return false;

      const keys1 = Object.keys(obj1 as object);
      const keys2 = Object.keys(obj2 as object);

      if (keys1.length !== keys2.length) return false;

      for (const key of keys1) {
        if (!keys2.includes(key)) return false;
        if (!this.deepEqualWithVisited(
          (obj1 as Record<string, unknown>)[key],
          (obj2 as Record<string, unknown>)[key],
          visited,
          depth + 1,
          maxDepth
        )) {
          return false;
        }
      }

      return true;
    } finally {
      // Clean up visited map for this object to allow different comparison paths
      visited.delete(obj1AsObject);
    }
  }

  /**
   * Calculate secure checksum using Web Crypto API for data integrity
   */
  private async calculateChecksum(data: string): Promise<string> {
    try {
      // Use Web Crypto API for secure SHA-256 hash
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Include length for additional verification
        return `sha256-${hashHex}-${data.length}`;
      } else {
        // Fallback to simple hash if Web Crypto API not available
        logger.warn('Web Crypto API not available, using fallback checksum');
        return this.calculateFallbackChecksum(data);
      }
    } catch (error) {
      logger.warn('Web Crypto API failed, using fallback checksum', { error });
      return this.calculateFallbackChecksum(data);
    }
  }

  /**
   * Check rate limiting to prevent migration abuse
   */
  private checkRateLimit(): void {
    const now = Date.now();
    const rateLimitData = this.getRateLimitData();

    // Check minimum time between migrations
    if (rateLimitData.lastMigration &&
        (now - rateLimitData.lastMigration) < MIGRATION_CONSTANTS.MIN_TIME_BETWEEN_MIGRATIONS_MS) {
      const remainingTime = Math.ceil(
        (MIGRATION_CONSTANTS.MIN_TIME_BETWEEN_MIGRATIONS_MS - (now - rateLimitData.lastMigration)) / 1000
      );
      throw new StorageError(
        StorageErrorType.ACCESS_DENIED,
        `Migration rate limit exceeded. Please wait ${remainingTime} seconds before trying again.`
      );
    }

    // Clean up old attempts (older than 1 hour)
    const oneHourAgo = now - (60 * 60 * 1000);
    rateLimitData.attempts = rateLimitData.attempts.filter(attempt => attempt > oneHourAgo);

    // Check hourly limit
    if (rateLimitData.attempts.length >= MIGRATION_CONSTANTS.MAX_MIGRATIONS_PER_HOUR) {
      const oldestAttempt = Math.min(...rateLimitData.attempts);
      const resetTime = Math.ceil((oldestAttempt + (60 * 60 * 1000) - now) / 1000 / 60);
      throw new StorageError(
        StorageErrorType.ACCESS_DENIED,
        `Migration rate limit exceeded. Maximum ${MIGRATION_CONSTANTS.MAX_MIGRATIONS_PER_HOUR} attempts per hour. Reset in ${resetTime} minutes.`
      );
    }

    // Record this attempt
    rateLimitData.attempts.push(now);
    rateLimitData.lastMigration = now;
    this.saveRateLimitData(rateLimitData);

    logger.info('Rate limit check passed', {
      attemptsInLastHour: rateLimitData.attempts.length,
      maxAllowed: MIGRATION_CONSTANTS.MAX_MIGRATIONS_PER_HOUR
    });
  }

  /**
   * Get rate limit data from localStorage
   */
  private getRateLimitData(): { attempts: number[]; lastMigration?: number } {
    try {
      const data = localStorage.getItem(MIGRATION_CONSTANTS.RATE_LIMIT_STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      logger.warn('Failed to parse rate limit data', { error });
    }
    return { attempts: [] };
  }

  /**
   * Save rate limit data to localStorage
   */
  private saveRateLimitData(data: { attempts: number[]; lastMigration?: number }): void {
    try {
      localStorage.setItem(MIGRATION_CONSTANTS.RATE_LIMIT_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      logger.warn('Failed to save rate limit data', { error });
    }
  }

  /**
   * Validate data security to prevent XSS/injection attacks during migration
   */
  private validateDataSecurity(key: string, value: string): void {
    // Check for data size limits to prevent DoS attacks
    if (value.length > 50 * 1024 * 1024) { // 50MB limit
      throw new StorageError(
        StorageErrorType.UNKNOWN,
        `Data size exceeds security limit for key: ${key} (${(value.length / (1024 * 1024)).toFixed(2)}MB)`
      );
    }

    // Validate that the value is a valid string (no binary data injection)
    try {
      // Ensure the string can be properly encoded/decoded
      const encoded = new TextEncoder().encode(value);
      const decoded = new TextDecoder().decode(encoded);
      if (decoded !== value) {
        throw new Error('String encoding mismatch');
      }
    } catch (error) {
      logger.warn('Data encoding validation failed', { key, error });
      throw new StorageError(
        StorageErrorType.CORRUPTED_DATA,
        `Invalid data encoding detected for key: ${key}`
      );
    }

    // For JSON data, validate structure to prevent injection
    if (this.isJsonData(key)) {
      try {
        const parsed = JSON.parse(value);

        // Check for suspicious patterns that could indicate injection attempts
        const stringified = JSON.stringify(parsed);

        // Detect potential script injection in JSON
        const suspiciousPatterns = [
          /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
          /javascript:/gi,
          /on\w+\s*=/gi, // Event handlers like onclick=
          /<iframe[\s\S]*?>/gi,
          /data:text\/html/gi
        ];

        for (const pattern of suspiciousPatterns) {
          if (pattern.test(stringified)) {
            logger.warn('Suspicious content detected in JSON data', { key, pattern: pattern.source });
            throw new StorageError(
              StorageErrorType.CORRUPTED_DATA,
              `Potentially malicious content detected in key: ${key}`
            );
          }
        }
      } catch (jsonError) {
        if (jsonError instanceof StorageError) {
          throw jsonError;
        }
        // If JSON parsing fails, that's suspicious for keys that should contain JSON
        logger.warn('JSON validation failed for expected JSON key', { key, error: jsonError });
        throw new StorageError(
          StorageErrorType.CORRUPTED_DATA,
          `Invalid JSON structure for key: ${key}`
        );
      }
    }

    // Additional validation for specific key patterns
    if (key.includes('script') || key.includes('eval') || key.includes('function')) {
      logger.warn('Suspicious key name detected', { key });
      throw new StorageError(
        StorageErrorType.CORRUPTED_DATA,
        `Suspicious key name: ${key}`
      );
    }
  }

  /**
   * Enhanced fallback checksum implementation using CRC32-like algorithm
   * Significantly stronger than simple hash while avoiding Web Crypto dependency
   */
  private calculateFallbackChecksum(data: string): string {
    // CRC32-like polynomial for better distribution
    const POLYNOMIAL = 0xEDB88320;
    let crc = 0xFFFFFFFF;

    // Process data as UTF-8 bytes for consistent cross-platform behavior
    const utf8Bytes = new TextEncoder().encode(data);

    for (let i = 0; i < utf8Bytes.length; i++) {
      crc ^= utf8Bytes[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? POLYNOMIAL : 0);
      }
    }

    // Finalize CRC and add multiple integrity checks
    crc = (crc ^ 0xFFFFFFFF) >>> 0;

    // Additional integrity measures:
    // 1. Include data length to detect truncation
    // 2. Include simple XOR checksum as secondary verification
    // 3. Include character frequency hash to detect substitution
    let xorSum = 0;
    let freqHash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      xorSum ^= char;
      freqHash = ((freqHash << 3) + char) % 0x7FFFFFFF;
    }

    return `crc32-${crc.toString(16)}-${data.length}-${xorSum.toString(16)}-${freqHash.toString(16)}`;
  }

  /**
   * Switch storage mode to IndexedDB
   */
  private async switchToIndexedDB(): Promise<void> {
    this.updateState(MigrationState.SWITCHING, 'Switching to IndexedDB');

    try {
      // Update storage configuration
      await updateStorageConfig({
        mode: 'indexedDB',
        version: this.config.targetVersion,
        migrationState: 'completed',
        lastMigrationAttempt: new Date().toISOString()
      });

      logger.info('Storage mode switched to IndexedDB');

    } catch (error) {
      logger.error('Failed to switch storage mode', { error });
      throw new StorageError(
        StorageErrorType.UNKNOWN,
        'Failed to switch storage mode',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Rollback migration on failure
   */
  private async rollback(): Promise<void> {
    logger.warn('Attempting rollback with IndexedDB cleanup', {
      correlationId: this.correlationId,
      migrationId: this.migrationId
    });

    try {
      // Clean up orphaned IndexedDB data first
      await this.cleanupIndexedDBData();

      // Reset storage mode to localStorage
      await updateStorageConfig({
        mode: 'localStorage',
        migrationState: 'failed',
        migrationFailureCount: (getStorageConfig().migrationFailureCount || 0) + 1
      });

      // If we have a backup, offer to restore it
      if (this.backup) {
        const backupSize = this.backup.startsWith('<large_backup_ref:')
          ? 'large backup (stored in IndexedDB)'
          : `${this.backup.length} bytes`;

        logger.info('Backup available for restoration', {
          correlationId: this.correlationId,
          backupSize
        });
        // Note: Actual restoration would be triggered by user action
      }

      // Clear partial migration progress
      await this.clearPartialProgress();

      // Add rollback alert
      this.addAlert('info', 'Migration rolled back successfully');

      this.currentState = MigrationState.ROLLED_BACK;
      logger.info('Rollback completed with cleanup', {
        correlationId: this.correlationId,
        indexedDBCleaned: true
      });

    } catch (error) {
      logger.error('Rollback failed', {
        correlationId: this.correlationId,
        error
      });
      this.errors.push('Rollback failed: ' + error);
      this.addAlert('error', `Rollback failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clean up orphaned IndexedDB data during rollback
   */
  private async cleanupIndexedDBData(): Promise<void> {
    try {
      logger.debug('Cleaning up IndexedDB data during rollback', {
        correlationId: this.correlationId
      });

      // Get IndexedDB adapter for cleanup
      const indexedDbAdapter = await this.getPooledAdapter('indexedDB');

      // Remove any partially transferred data
      const keysToCleanup = CRITICAL_KEYS;
      let cleanedCount = 0;

      for (const key of keysToCleanup) {
        try {
          await indexedDbAdapter.removeItem(key);
          cleanedCount++;
        } catch (error) {
          // Log but don't fail rollback for cleanup errors
          logger.warn('Failed to cleanup IndexedDB key during rollback', {
            correlationId: this.correlationId,
            key,
            error
          });
        }
      }

      // Clean up migration-specific data
      try {
        await indexedDbAdapter.removeItem('migration_state');
        await indexedDbAdapter.removeItem('migration_progress');
      } catch (error) {
        logger.warn('Failed to cleanup migration metadata', {
          correlationId: this.correlationId,
          error
        });
      }

      logger.info('IndexedDB cleanup completed during rollback', {
        correlationId: this.correlationId,
        keysProcessed: keysToCleanup.length,
        keysCleaned: cleanedCount
      });

    } catch (error) {
      logger.warn('IndexedDB cleanup failed during rollback', {
        correlationId: this.correlationId,
        error
      });
      // Don't throw - rollback should continue even if cleanup fails
    }
  }

  /**
   * Update migration state and notify progress
   */
  private updateState(state: MigrationState, step: string): void {
    this.currentState = state;

    if (this.config.progressCallback) {
      try {
        this.config.progressCallback({
          state,
          currentStep: step,
          totalKeys: CRITICAL_KEYS.length,
          processedKeys: 0,
          percentage: 0,
          errors: [...this.errors]
        });
      } catch (callbackError) {
        logger.warn('Progress callback threw an error', {
          correlationId: this.correlationId,
          error: callbackError
        });
        // Don't let user callback errors crash the migration
      }
    }
  }

  /**
   * Update progress percentage
   */
  private updateProgress(processed: number, total: number): void {
    const percentage = Math.round((processed / total) * 100);
    const elapsed = Date.now() - this.startTime;

    // Calculate estimated time remaining
    let estimatedTimeRemainingMs = 0;
    if (processed > 0 && processed < total) {
      const rate = processed / elapsed; // keys per millisecond
      const remaining = total - processed;
      estimatedTimeRemainingMs = Math.round(remaining / rate);
    }

    // Format time remaining
    const formatTimeRemaining = (ms: number): string => {
      if (ms <= 0) return '0s';
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      if (hours > 0) return `${hours}h ${minutes % 60}m`;
      if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
      return `${seconds}s`;
    };

    if (this.config.progressCallback) {
      try {
        this.config.progressCallback({
          state: this.currentState,
          currentStep: `Processing key ${processed} of ${total} (${percentage}% complete)`,
          totalKeys: total,
          processedKeys: processed,
          percentage,
          estimatedTimeRemainingMs,
          estimatedTimeRemainingText: formatTimeRemaining(estimatedTimeRemainingMs),
          elapsedTimeMs: elapsed,
          transferSpeedMBps: this.calculateCurrentTransferSpeed(),
          errors: [...this.errors]
        });
      } catch (callbackError) {
        logger.warn('Progress callback threw an error during progress update', {
          correlationId: this.correlationId,
          error: callbackError
        });
        // Don't let user callback errors crash the migration
      }
    }

    // Log progress milestones
    if (percentage > 0 && percentage % 25 === 0 && processed > 0) {
      logger.info('Migration progress milestone', {
        correlationId: this.correlationId,
        migrationId: this.migrationId,
        percentage,
        processedKeys: processed,
        totalKeys: total,
        elapsedMs: elapsed,
        estimatedRemainingMs: estimatedTimeRemainingMs,
        state: this.currentState
      });
    }
  }

  /**
   * Calculate current transfer speed
   */
  private calculateCurrentTransferSpeed(): number {
    const elapsed = Date.now() - this.transferStartTime;
    if (elapsed <= 0 || this.transferredBytes <= 0) return 0;

    return (this.transferredBytes / (1024 * 1024)) / (elapsed / 1000); // MB/s
  }

  /**
   * Send user notification if callback is provided
   */
  private sendNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    if (this.config.notificationCallback) {
      try {
        this.config.notificationCallback(message, type);
        logger.debug('User notification sent', {
          correlationId: this.correlationId,
          message,
          type
        });
      } catch (error) {
        logger.warn('Failed to send user notification', {
          correlationId: this.correlationId,
          message,
          type,
          error
        });
      }
    }
  }

  /**
   * Create migration result with proper cleanup
   */
  private createResult(success: boolean, state: MigrationState): MigrationResult {
    const duration = Math.max(0, Date.now() - this.startTime);

    // Mark migration end and create final measurement
    this.markPerformance('migration_end');
    this.measurePerformance('total_migration_duration', 'migration_start', 'migration_end');

    // Send final user notification
    if (success) {
      const durationText = duration > 60000
        ? `${(duration / 60000).toFixed(1)} minutes`
        : `${(duration / 1000).toFixed(1)} seconds`;
      this.sendNotification(`Migration completed successfully in ${durationText}`, 'success');
    } else {
      this.sendNotification('Migration failed. Data has been preserved.', 'error');
    }

    // Log migration duration for baseline tracking
    logger.info('Migration completed', {
      correlationId: this.correlationId,
      migrationId: this.migrationId,
      success,
      state,
      durationMs: duration,
      durationMinutes: (duration / 60000).toFixed(2),
      errorCount: this.errors.length,
      transferredBytes: this.transferredBytes,
      transferredMB: (this.transferredBytes / (1024 * 1024)).toFixed(2),
      keysProcessed: this.completedKeys,
      totalOperations: this.totalOperations,
      averageOperationLatency: this.operationLatencies.length > 0
        ? (this.operationLatencies.reduce((sum, lat) => sum + lat, 0) / this.operationLatencies.length).toFixed(2) + 'ms'
        : 'N/A'
    });

    // Clean up resources
    this.cleanupConnectionPool();
    this.cleanupPerformanceObserver();

    // Always release migration lock
    this.releaseMigrationLock();

    return {
      success,
      state,
      errors: [...this.errors],
      backup: this.backup || undefined,
      duration
    };
  }

  /**
   * Get current migration state
   */
  getState(): MigrationState {
    return this.currentState;
  }

  /**
   * Get migration errors
   */
  getErrors(): string[] {
    return [...this.errors];
  }
}

/**
 * Convenience function to run migration
 */
export async function runIndexedDbMigration(
  config?: Partial<MigrationConfig>
): Promise<MigrationResult> {
  const orchestrator = new IndexedDbMigrationOrchestrator(config);
  return orchestrator.migrate();
}

/**
 * Check if IndexedDB migration is needed
 */
export function isIndexedDbMigrationNeeded(): boolean {
  const config = getStorageConfig();
  return config.mode === 'localStorage' && config.migrationState !== 'completed';
}

/**
 * Get last migration backup (supports both old localStorage and new chunked storage)
 */
export async function getLastMigrationBackup(): Promise<string | null> {
  const backupKey = localStorage.getItem('last_migration_backup_key');
  if (!backupKey) {
    return null;
  }

  // Try to get metadata for chunked backup
  const metadataStr = localStorage.getItem(`${backupKey}_metadata`);
  if (metadataStr) {
    try {
      const metadata = JSON.parse(metadataStr);
      // Reconstruct backup from chunks
      return await reconstructBackupFromChunks(backupKey, metadata.chunks);
    } catch (error) {
      logger.warn('Failed to reconstruct backup from chunks', { error, backupKey });
    }
  }

  // Fallback to simple localStorage backup
  return localStorage.getItem(backupKey);
}

/**
 * Reconstruct backup data from IndexedDB chunks
 */
async function reconstructBackupFromChunks(backupKey: string, chunkCount: number): Promise<string> {
  const db = await openBackupDatabase();
  const transaction = db.transaction([MIGRATION_CONSTANTS.BACKUP_STORE_NAME], 'readonly');
  const store = transaction.objectStore(MIGRATION_CONSTANTS.BACKUP_STORE_NAME);

  const chunks: string[] = new Array(chunkCount);

  for (let i = 0; i < chunkCount; i++) {
    const chunk = await new Promise<string>((resolve, reject) => {
      const request = store.get(`${backupKey}_chunk_${i}`);
      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.data);
        } else {
          reject(new Error(`Chunk ${i} not found`));
        }
      };
      request.onerror = () => reject(request.error);
    });
    chunks[i] = chunk;
  }

  return chunks.join('');
}

/**
 * Open backup database (shared utility)
 */
async function openBackupDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MIGRATION_CONSTANTS.BACKUP_DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(MIGRATION_CONSTANTS.BACKUP_STORE_NAME)) {
        const store = db.createObjectStore(MIGRATION_CONSTANTS.BACKUP_STORE_NAME, { keyPath: 'id' });
        store.createIndex('backupKey', 'backupKey', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

/**
 * Clear migration backup (supports both localStorage and chunked storage)
 */
export async function clearMigrationBackup(): Promise<void> {
  const backupKey = localStorage.getItem('last_migration_backup_key');
  if (!backupKey) {
    return;
  }

  // Clear metadata
  localStorage.removeItem('last_migration_backup_key');
  localStorage.removeItem(`${backupKey}_metadata`);

  // Clear simple localStorage backup
  localStorage.removeItem(backupKey);

  // Clear chunked backup from IndexedDB
  try {
    const db = await openBackupDatabase();
    const transaction = db.transaction([MIGRATION_CONSTANTS.BACKUP_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(MIGRATION_CONSTANTS.BACKUP_STORE_NAME);

    // Use index to find all chunks for this backup
    const index = store.index('backupKey');
    const request = index.openCursor(IDBKeyRange.only(backupKey));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    logger.warn('Failed to clear chunked backup', { error, backupKey });
  }
}