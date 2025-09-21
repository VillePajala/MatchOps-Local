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
  batchSize: 10,
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

      // Store backup in localStorage for recovery
      const backupKey = `migration_backup_${Date.now()}`;
      localStorage.setItem(backupKey, this.backup);
      localStorage.setItem('last_migration_backup_key', backupKey);

      logger.info('Backup created successfully', {
        size: this.backup.length,
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
    const maxRetries = 3;

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
            const delay = Math.pow(2, retryCount) * 100; // Exponential backoff
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
    return value.length > 1024 * 1024; // 1MB threshold
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
   * Deep equality check for objects
   */
  private deepEqual(obj1: unknown, obj2: unknown): boolean {
    if (obj1 === obj2) return true;

    if (obj1 === null || obj2 === null) return false;
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
      if (!keys2.includes(key)) return false;
      if (!this.deepEqual((obj1 as Record<string, unknown>)[key], (obj2 as Record<string, unknown>)[key])) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate simple checksum for data integrity
   */
  private async calculateChecksum(data: string): Promise<string> {
    // Simple checksum for now - could be replaced with crypto.subtle.digest
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    // Add length as additional verification
    return `${Math.abs(hash).toString(16)}-${data.length}`;
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
 * Get last migration backup
 */
export function getLastMigrationBackup(): string | null {
  const backupKey = localStorage.getItem('last_migration_backup_key');
  if (!backupKey) {
    return null;
  }

  return localStorage.getItem(backupKey);
}

/**
 * Clear migration backup
 */
export function clearMigrationBackup(): void {
  const backupKey = localStorage.getItem('last_migration_backup_key');
  if (backupKey) {
    localStorage.removeItem(backupKey);
    localStorage.removeItem('last_migration_backup_key');
  }
}