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
  RATE_LIMIT_STORAGE_KEY: 'migration_rate_limit_data'
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
 * Migration configuration
 */
export interface MigrationConfig {
  targetVersion: string;
  batchSize: number;
  verifyData: boolean;
  keepBackupOnSuccess: boolean;
  progressCallback?: (progress: MigrationProgress) => void;
}

/**
 * Default migration configuration
 */
const DEFAULT_CONFIG: MigrationConfig = {
  targetVersion: '2.0.0',
  batchSize: MIGRATION_CONSTANTS.DEFAULT_BATCH_SIZE,
  verifyData: true,
  keepBackupOnSuccess: false
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

  constructor(config: Partial<MigrationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute the complete migration process
   */
  async migrate(): Promise<MigrationResult> {
    this.startTime = Date.now();
    logger.info('Starting IndexedDB migration');

    try {
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
   * Create a comprehensive backup
   */
  private async createBackup(): Promise<void> {
    this.updateState(MigrationState.BACKING_UP, 'Creating backup');

    try {
      logger.debug('Creating comprehensive backup');
      this.backup = await generateFullBackupJson();

      if (!this.backup) {
        throw new Error('Failed to create backup');
      }

      // Store backup securely using IndexedDB to avoid localStorage quota issues
      const backupKey = `migration_backup_${Date.now()}`;
      await this.storeBackupSecurely(backupKey, this.backup);

      logger.info('Backup created successfully', {
        size: this.backup.length,
        sizeMB: (this.backup.length / (1024 * 1024)).toFixed(2),
        key: backupKey
      });
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
   * Transfer data from localStorage to IndexedDB
   */
  private async transferData(): Promise<void> {
    this.updateState(MigrationState.TRANSFERRING, 'Transferring data');

    const localAdapter = await createStorageAdapter('localStorage');
    const indexedDbAdapter = await createStorageAdapter('indexedDB');

    let processedKeys = 0;
    const totalKeys = CRITICAL_KEYS.length;
    const failedKeys: string[] = [];
    const transferStats: Record<string, number> = {};

    // Process keys in batches for better performance
    const batches = this.createBatches(CRITICAL_KEYS, this.config.batchSize);

    for (const batch of batches) {
      await this.processBatch(
        batch,
        localAdapter,
        indexedDbAdapter,
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
    }

    // Handle failed keys with retry
    if (failedKeys.length > 0) {
      logger.warn('Retrying failed keys', { count: failedKeys.length });
      await this.retryFailedKeys(failedKeys, localAdapter, indexedDbAdapter);
    }

    // Log transfer statistics
    const totalSize = Object.values(transferStats).reduce((sum, size) => sum + size, 0);
    logger.info('Data transfer completed', {
      processedKeys,
      totalKeys,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      largestKey: this.findLargestKey(transferStats)
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
    const promises = keys.map(async (key) => {
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

          logger.debug('Key transferred successfully', {
            key,
            size: value.length
          });
          onSuccess(key, value.length);
        } else {
          logger.debug('Key not found in localStorage', { key });
          onSuccess(key);
        }
      } catch (error) {
        onError(key, error);
      }
    });

    await Promise.allSettled(promises);
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
      // If quota exceeded, try to compress (future enhancement)
      if (this.isQuotaError(error)) {
        logger.error('Quota exceeded for large payload', { key, sizeMB });
        throw new StorageError(
          StorageErrorType.QUOTA_EXCEEDED,
          `Cannot transfer large payload: ${key} (${sizeMB.toFixed(2)} MB)`,
          error instanceof Error ? error : undefined
        );
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

    const localAdapter = await createStorageAdapter('localStorage');
    const indexedDbAdapter = await createStorageAdapter('indexedDB');

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
   * Deep equality check for objects with circular reference protection
   */
  private deepEqual(obj1: unknown, obj2: unknown): boolean {
    return this.deepEqualWithVisited(obj1, obj2, new WeakSet(), new WeakSet());
  }

  /**
   * Deep equality implementation with visited set to prevent stack overflow
   */
  private deepEqualWithVisited(
    obj1: unknown,
    obj2: unknown,
    visited1: WeakSet<object>,
    visited2: WeakSet<object>
  ): boolean {
    if (obj1 === obj2) return true;

    if (obj1 === null || obj2 === null) return false;
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;

    // Check for circular references
    if (visited1.has(obj1 as object) || visited2.has(obj2 as object)) {
      return visited1.has(obj1 as object) && visited2.has(obj2 as object);
    }

    // Add to visited sets
    visited1.add(obj1 as object);
    visited2.add(obj2 as object);

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
      if (!keys2.includes(key)) return false;
      if (!this.deepEqualWithVisited(
        (obj1 as Record<string, unknown>)[key],
        (obj2 as Record<string, unknown>)[key],
        visited1,
        visited2
      )) {
        return false;
      }
    }

    return true;
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
    logger.warn('Attempting rollback');

    try {
      // Reset storage mode to localStorage
      await updateStorageConfig({
        mode: 'localStorage',
        migrationState: 'failed',
        migrationFailureCount: (getStorageConfig().migrationFailureCount || 0) + 1
      });

      // If we have a backup, offer to restore it
      if (this.backup) {
        logger.info('Backup available for restoration', {
          size: this.backup.length
        });
        // Note: Actual restoration would be triggered by user action
      }

      this.currentState = MigrationState.ROLLED_BACK;
      logger.info('Rollback completed');

    } catch (error) {
      logger.error('Rollback failed', { error });
      this.errors.push('Rollback failed: ' + error);
    }
  }

  /**
   * Update migration state and notify progress
   */
  private updateState(state: MigrationState, step: string): void {
    this.currentState = state;

    if (this.config.progressCallback) {
      this.config.progressCallback({
        state,
        currentStep: step,
        totalKeys: CRITICAL_KEYS.length,
        processedKeys: 0,
        percentage: 0,
        errors: [...this.errors]
      });
    }
  }

  /**
   * Update progress percentage
   */
  private updateProgress(processed: number, total: number): void {
    const percentage = Math.round((processed / total) * 100);

    if (this.config.progressCallback) {
      this.config.progressCallback({
        state: this.currentState,
        currentStep: `Processing key ${processed} of ${total}`,
        totalKeys: total,
        processedKeys: processed,
        percentage,
        errors: [...this.errors]
      });
    }
  }

  /**
   * Create migration result
   */
  private createResult(success: boolean, state: MigrationState): MigrationResult {
    return {
      success,
      state,
      errors: [...this.errors],
      backup: this.backup || undefined,
      duration: Date.now() - this.startTime
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