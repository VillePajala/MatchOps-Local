/**
 * Enhanced IndexedDB Migration with Control Features
 *
 * Extends the base migration orchestrator with pause/resume/cancel capabilities
 */

import { IndexedDbMigrationOrchestrator, MigrationResult, MigrationConfig } from './indexedDbMigration';
import { MigrationControlManager } from './migrationControlManager';
import { MigrationControlCallbacks, MigrationResumeData, MigrationEstimation, MigrationPreview } from '@/types/migrationControl';
import { migrationMutex } from './migrationMutex';
import logger from './logger';

export class IndexedDbMigrationOrchestratorEnhanced extends IndexedDbMigrationOrchestrator {
  private controlManager: MigrationControlManager;
  private processedKeysCache: string[] = [];
  private remainingKeysCache: string[] = [];
  private currentKeyIndex: number = 0;
  private bytesProcessedCache: number = 0;
  private totalBytesCache: number = 0;

  // IndexedDB configuration for rollback operations
  private readonly dbName: string;
  private readonly storeName: string;

  constructor(config: Partial<MigrationConfig> = {}, controlCallbacks?: MigrationControlCallbacks) {
    super(config);
    this.controlManager = new MigrationControlManager(controlCallbacks);

    // Set IndexedDB defaults matching the adapter configuration
    this.dbName = 'MatchOpsLocal';
    this.storeName = 'keyValueStore';
  }

  /**
   * Enhanced migrate with pause/resume support and tab coordination
   */
  public async migrate(): Promise<MigrationResult> {
    // Check for incomplete migrations on startup
    await this.recoverFromIncompleteState();

    // Acquire migration lock to prevent concurrent operations
    const lockAcquired = await migrationMutex.acquireLock('migration');
    if (!lockAcquired) {
      throw new Error('Another migration is already in progress in a different tab. Please wait for it to complete or force-release the lock.');
    }

    try {
      // Check if we have resume data
      const resumeData = await this.checkForResumeData();
      if (resumeData) {
        logger.log('Resuming migration from checkpoint', {
          itemsProcessed: resumeData.itemsProcessed,
          totalItems: resumeData.totalItems
        });

        // Restore state from resume data
        this.processedKeysCache = resumeData.processedKeys;
        this.remainingKeysCache = resumeData.remainingKeys;
        this.currentKeyIndex = resumeData.itemsProcessed;
        this.bytesProcessedCache = resumeData.bytesProcessed;
        this.totalBytesCache = resumeData.totalBytes;
      }

      const result = await super.migrate();
      return result;
    } finally {
      // Always release lock when migration completes or fails
      migrationMutex.releaseLock();
    }
  }

  /**
   * Recover from incomplete migration state (e.g., after browser crash)
   */
  private async recoverFromIncompleteState(): Promise<void> {
    try {
      // Check for stale locks first
      const currentLock = migrationMutex.getCurrentLock();
      if (currentLock) {
        logger.log('Found existing migration lock on startup', currentLock);

        // Check if lock is stale (older than 5 minutes)
        const lockAge = Date.now() - currentLock.timestamp;
        if (lockAge > 5 * 60 * 1000) {
          logger.warn('Clearing stale migration lock from previous session', {
            lockAge: Math.round(lockAge / 1000),
            operation: currentLock.operation
          });
          migrationMutex.forceReleaseLock();
        }
      }

      // Check for orphaned resume data
      const resumeData = await this.checkForResumeData();
      if (resumeData) {
        const resumeAge = Date.now() - resumeData.pauseTime;
        logger.log('Found resume data on startup', {
          itemsProcessed: resumeData.itemsProcessed,
          totalItems: resumeData.totalItems,
          resumeAge: Math.round(resumeAge / 1000 / 60), // minutes
          sessionId: resumeData.sessionId
        });

        // If resume data is very old (>24 hours), consider it stale
        if (resumeAge > 24 * 60 * 60 * 1000) {
          logger.warn('Resume data is very old, may need manual verification', {
            resumeAge: Math.round(resumeAge / 1000 / 60 / 60) // hours
          });
        }
      }
    } catch (error) {
      logger.error('Error during migration state recovery', error);
      // Don't throw - allow migration to proceed normally
    }
  }

  /**
   * Override processKeys to add pause points
   */
  protected async processKeys(keys: string[]): Promise<void> {
    // If resuming, use cached keys
    const keysToProcess = this.remainingKeysCache.length > 0
      ? this.remainingKeysCache
      : keys;

    // Estimate if this is a fresh start
    if (this.currentKeyIndex === 0) {
      const estimation = await this.controlManager.estimateMigration(keysToProcess);
      this.updateProgressWithEstimation(estimation);
    }

    for (let i = this.currentKeyIndex; i < keysToProcess.length; i++) {
      // Check for pause request
      if (await this.checkPausePoint()) {
        await this.handlePause(keysToProcess[i], i, keysToProcess);
        return; // Exit to allow pause
      }

      // Check for cancel request
      if (this.checkCancelPoint()) {
        await this.handleCancel();
        throw new Error('Migration cancelled by user');
      }

      const key = keysToProcess[i];

      // Process the key (implement actual migration logic)
      await this.processKey();

      this.processedKeysCache.push(key);
      this.currentKeyIndex = i + 1;

      // Create checkpoint if needed
      if (this.controlManager.shouldCreateCheckpoint()) {
        await this.createCheckpoint(i, keysToProcess);
      }

      // Update progress
      this.updateMigrationProgress(i + 1, keysToProcess.length);
    }
  }

  /**
   * Check if migration should pause
   */
  private async checkPausePoint(): Promise<boolean> {
    return this.controlManager.isPaused();
  }

  /**
   * Check if migration should cancel
   */
  private checkCancelPoint(): boolean {
    return this.controlManager.isCancelling();
  }

  /**
   * Handle pause operation
   */
  private async handlePause(
    currentKey: string,
    currentIndex: number,
    allKeys: string[]
  ): Promise<void> {
    const remainingKeys = allKeys.slice(currentIndex);

    await this.controlManager.savePauseState(
      currentKey,
      this.processedKeysCache,
      remainingKeys,
      currentIndex,
      allKeys.length,
      this.bytesProcessedCache,
      this.totalBytesCache
    );

    logger.log('Migration paused', {
      progress: `${currentIndex}/${allKeys.length}`,
      percentComplete: Math.round((currentIndex / allKeys.length) * 100)
    });
  }

  /**
   * Handle cancel operation
   */
  private async handleCancel(): Promise<void> {
    logger.log('Migration cancelled, starting rollback');

    let rollbackSuccessful = false;

    try {
      // Perform actual rollback
      await this.performRollback();
      rollbackSuccessful = true;
      logger.log('Rollback completed successfully');
    } catch (error) {
      logger.error('Rollback failed', error);
      rollbackSuccessful = false;
      // Don't throw error here, let the control manager handle completion
    }

    try {
      // Report cancellation completion with rollback status
      await this.controlManager.completeCancellation(rollbackSuccessful, true, false);
    } finally {
      await this.controlManager.cleanup();
    }

    // Throw error after cleanup to signal cancellation
    throw new Error(rollbackSuccessful
      ? 'Migration cancelled and rolled back successfully'
      : 'Migration cancelled but rollback failed'
    );
  }

  /**
   * Perform rollback of migrated data with granular error handling
   */
  private async performRollback(): Promise<void> {
    if (this.processedKeysCache.length === 0) {
      logger.log('No data to rollback');
      return;
    }

    const rollbackMetrics = {
      totalKeys: this.processedKeysCache.length,
      successfulRollbacks: 0,
      failedRollbacks: 0,
      errors: [] as Array<{ key: string; error: string }>
    };

    logger.log('Starting granular rollback of migrated data', rollbackMetrics);

    // Access IndexedDB to remove migrated entries
    const dbRequest = indexedDB.open(this.dbName);

    return new Promise((resolve, reject) => {
      dbRequest.onerror = () => {
        const error = new Error(`Failed to open database for rollback: ${dbRequest.error?.message}`);
        logger.error('Database open failed during rollback', error);
        reject(error);
      };

      dbRequest.onsuccess = async () => {
        const db = dbRequest.result;

        try {
          const transaction = db.transaction([this.storeName], 'readwrite');
          const store = transaction.objectStore(this.storeName);

          // Process rollback in batches to avoid blocking
          const batchSize = 50;
          for (let i = 0; i < this.processedKeysCache.length; i += batchSize) {
            const batch = this.processedKeysCache.slice(i, i + batchSize);

            await this.rollbackBatch(store, batch, rollbackMetrics);

            // Allow other operations to run
            if (i + batchSize < this.processedKeysCache.length) {
              await new Promise(resolve => setTimeout(resolve, 10));
            }
          }

          await new Promise<void>((transactionResolve, transactionReject) => {
            transaction.oncomplete = () => {
              logger.log('Rollback transaction completed', rollbackMetrics);
              transactionResolve();
            };
            transaction.onerror = () => {
              logger.error('Rollback transaction failed', {
                error: transaction.error,
                metrics: rollbackMetrics
              });
              transactionReject(transaction.error);
            };
          });

          // Report rollback results
          const rollbackSuccess = rollbackMetrics.failedRollbacks === 0;
          if (!rollbackSuccess) {
            logger.warn('Partial rollback completed with errors', rollbackMetrics);
          }

          // Clear processed keys cache - even if some rollbacks failed
          // to prevent duplicate rollback attempts
          this.processedKeysCache = [];
          this.currentKeyIndex = 0;
          this.bytesProcessedCache = 0;

          // Resolve with success info
          resolve();
        } catch (error) {
          logger.error('Critical error during rollback transaction', {
            error,
            metrics: rollbackMetrics
          });
          reject(error);
        } finally {
          db.close();
        }
      };
    });
  }

  /**
   * Rollback a batch of keys with individual error handling
   */
  private async rollbackBatch(
    store: IDBObjectStore,
    keys: string[],
    metrics: { successfulRollbacks: number; failedRollbacks: number; errors: Array<{ key: string; error: string }> }
  ): Promise<void> {
    const batchPromises = keys.map(async (key) => {
      try {
        const deleteRequest = store.delete(key);

        await new Promise<void>((deleteResolve, deleteReject) => {
          deleteRequest.onsuccess = () => {
            metrics.successfulRollbacks++;
            logger.log('Successfully rolled back key', { key });
            deleteResolve();
          };
          deleteRequest.onerror = () => {
            const errorMessage = deleteRequest.error?.message || 'Unknown delete error';
            metrics.failedRollbacks++;
            metrics.errors.push({ key, error: errorMessage });
            logger.error('Failed to rollback key', { key, error: errorMessage });
            deleteReject(deleteRequest.error);
          };
        });
      } catch (deleteError) {
        const errorMessage = deleteError instanceof Error ? deleteError.message : 'Unknown error';
        metrics.failedRollbacks++;
        metrics.errors.push({ key, error: errorMessage });
        logger.error('Exception during key rollback', { key, error: errorMessage });
        // Don't rethrow - continue with other keys
      }
    });

    // Wait for all batch operations (some may fail)
    await Promise.allSettled(batchPromises);
  }

  /**
   * Create a checkpoint for resume capability
   */
  private async createCheckpoint(
    currentIndex: number,
    allKeys: string[]
  ): Promise<void> {
    logger.log('Creating migration checkpoint', {
      index: currentIndex,
      total: allKeys.length
    });

    // Checkpoint creation handled by control manager
  }

  /**
   * Check for existing resume data
   */
  private async checkForResumeData(): Promise<MigrationResumeData | null> {
    const controlState = this.controlManager.getControlState();
    if (controlState.canResume && controlState.resumeData) {
      return await this.controlManager.requestResume();
    }
    return null;
  }

  /**
   * Process a single key (stub - actual implementation in parent)
   */
  private async processKey(): Promise<void> {
    // This would be implemented in the actual migration logic
    // For now, just simulate processing
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  /**
   * Update progress with estimation
   */
  private updateProgressWithEstimation(estimation: MigrationEstimation): void {
    // Update UI with estimation data
    logger.log('Migration estimation', {
      estimatedDuration: estimation.estimatedDuration,
      totalDataSize: estimation.totalDataSize,
      confidence: estimation.confidenceLevel
    });
  }

  /**
   * Update migration progress with enhanced logging
   */
  private updateMigrationProgress(current: number, total: number): void {
    const percentage = Math.round((current / total) * 100);
    logger.log('Migration progress', {
      current,
      total,
      percentage: `${percentage}%`
    });
  }

  /**
   * Preview migration before starting
   */
  public async preview(): Promise<MigrationPreview> {
    const keys = await this.getAllKeys();
    return await this.controlManager.previewMigration(keys);
  }

  /**
   * Get all keys to migrate (stub)
   */
  private async getAllKeys(): Promise<string[]> {
    // Would get actual keys from localStorage
    return [];
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    await this.controlManager.cleanup();
  }
}