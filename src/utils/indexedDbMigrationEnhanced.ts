/**
 * Enhanced IndexedDB Migration with Control Features
 *
 * Extends the base migration orchestrator with pause/resume/cancel capabilities
 */

import { IndexedDbMigrationOrchestrator, MigrationResult, MigrationConfig } from './indexedDbMigration';
import { MigrationControlManager } from './migrationControlManager';
import { MigrationControlCallbacks, MigrationResumeData, MigrationEstimation, MigrationPreview } from '@/types/migrationControl';
import logger from './logger';

export class IndexedDbMigrationOrchestratorEnhanced extends IndexedDbMigrationOrchestrator {
  private controlManager: MigrationControlManager;
  private processedKeysCache: string[] = [];
  private remainingKeysCache: string[] = [];
  private currentKeyIndex: number = 0;
  private bytesProcessedCache: number = 0;
  private totalBytesCache: number = 0;

  constructor(config: Partial<MigrationConfig> = {}, controlCallbacks?: MigrationControlCallbacks) {
    super(config);
    this.controlManager = new MigrationControlManager(controlCallbacks);
  }

  /**
   * Enhanced migrate with pause/resume support
   */
  public async migrate(): Promise<MigrationResult> {
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

    return super.migrate();
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
   * Perform rollback of migrated data
   */
  private async performRollback(): Promise<void> {
    if (this.processedKeysCache.length === 0) {
      logger.log('No data to rollback');
      return;
    }

    logger.log('Rolling back migrated data', {
      keysToRollback: this.processedKeysCache.length
    });

    // Access IndexedDB to remove migrated entries
    const dbRequest = indexedDB.open(this.config.databaseName);

    return new Promise((resolve, reject) => {
      dbRequest.onerror = () => {
        const error = new Error(`Failed to open database for rollback: ${dbRequest.error?.message}`);
        logger.error('Database open failed during rollback', error);
        reject(error);
      };

      dbRequest.onsuccess = async () => {
        const db = dbRequest.result;

        try {
          const transaction = db.transaction([this.config.storeName], 'readwrite');
          const store = transaction.objectStore(this.config.storeName);

          // Remove all processed keys from IndexedDB
          for (const key of this.processedKeysCache) {
            try {
              const deleteRequest = store.delete(key);

              // Wait for each delete to complete
              await new Promise<void>((deleteResolve, deleteReject) => {
                deleteRequest.onsuccess = () => deleteResolve();
                deleteRequest.onerror = () => deleteReject(deleteRequest.error);
              });

              logger.log('Rolled back key', { key });
            } catch (deleteError) {
              logger.error('Failed to rollback key', { key, error: deleteError });
              // Continue with other keys even if one fails
            }
          }

          await new Promise<void>((transactionResolve, transactionReject) => {
            transaction.oncomplete = () => {
              logger.log('Rollback transaction completed');
              transactionResolve();
            };
            transaction.onerror = () => {
              transactionReject(transaction.error);
            };
          });

          // Clear processed keys cache after successful rollback
          this.processedKeysCache = [];
          this.currentKeyIndex = 0;
          this.bytesProcessedCache = 0;

          resolve();
        } catch (error) {
          logger.error('Error during rollback transaction', error);
          reject(error);
        } finally {
          db.close();
        }
      };
    });
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