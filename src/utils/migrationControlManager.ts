/**
 * Migration Control Manager
 *
 * Handles pause/resume, cancellation, and estimation for IndexedDB migration
 */

import {
  MigrationControl,
  MigrationResumeData,
  MigrationEstimation,
  MigrationCancellation,
  MigrationPreview,
  MigrationControlEvent,
  MigrationControlCallbacks
} from '@/types/migrationControl';
import { MIGRATION_CONTROL_FEATURES } from '@/config/migrationConfig';
import { LocalStorageAdapter } from './indexedDbAdapters';
import { logger } from './logger';

export class MigrationControlManager {
  private control: MigrationControl;
  private callbacks: MigrationControlCallbacks;
  private sessionId: string;
  private checkpointCounter: number = 0;
  private localStorageAdapter: LocalStorageAdapter;

  constructor(callbacks: MigrationControlCallbacks = {}) {
    this.callbacks = callbacks;
    this.sessionId = this.generateSessionId();
    this.localStorageAdapter = new LocalStorageAdapter();

    this.control = {
      canPause: MIGRATION_CONTROL_FEATURES.ALLOW_PAUSE,
      canCancel: MIGRATION_CONTROL_FEATURES.ALLOW_CANCEL,
      canResume: false,
      isPaused: false,
      isCancelling: false
    };

    // Check for existing resume data
    this.loadResumeData();
  }

  /**
   * Request pause of migration
   */
  public async requestPause(): Promise<void> {
    if (!this.control.canPause || this.control.isPaused) {
      return;
    }

    logger.log('Migration pause requested');
    this.control.isPaused = true;

    // Will be called by orchestrator at next pause point
  }

  /**
   * Save pause state for resume
   */
  public async savePauseState(
    lastProcessedKey: string,
    processedKeys: string[],
    remainingKeys: string[],
    itemsProcessed: number,
    totalItems: number,
    bytesProcessed: number,
    totalBytes: number
  ): Promise<void> {
    const resumeData: MigrationResumeData = {
      lastProcessedKey,
      processedKeys,
      remainingKeys,
      itemsProcessed,
      totalItems,
      bytesProcessed,
      totalBytes,
      checkpointId: `checkpoint_${Date.now()}`,
      checkpointTimestamp: Date.now(),
      sessionId: this.sessionId,
      startTime: Date.now() - (itemsProcessed * 100), // Approximate
      pauseTime: Date.now()
    };

    this.control.resumeData = resumeData;

    // Persist to storage
    await this.saveResumeData(resumeData);

    logger.log('Migration paused and state saved', {
      itemsProcessed,
      remainingItems: totalItems - itemsProcessed
    });

    this.callbacks.onPause?.();
  }

  /**
   * Resume migration from saved state
   */
  public async requestResume(): Promise<MigrationResumeData | null> {
    if (!this.control.canResume || !this.control.resumeData) {
      return null;
    }

    logger.log('Migration resume requested');
    this.control.isPaused = false;
    this.control.canResume = false;

    const resumeData = this.control.resumeData;
    this.callbacks.onResume?.();

    // Clear saved state after successful resume
    await this.clearResumeData();

    return resumeData;
  }

  /**
   * Request cancellation of migration
   */
  public async requestCancel(reason: MigrationCancellation['reason'] = 'user_request'): Promise<void> {
    if (!this.control.canCancel || this.control.isCancelling) {
      return;
    }

    logger.log('Migration cancellation requested', { reason });
    this.control.isCancelling = true;

    const cancellation: MigrationCancellation = {
      reason,
      timestamp: Date.now(),
      cleanupCompleted: false,
      dataRolledBack: false,
      backupRestored: false
    };

    // Orchestrator will handle actual cancellation
    this.callbacks.onCancel?.(cancellation);
  }

  /**
   * Estimate migration duration and size
   */
  public async estimateMigration(keys: string[]): Promise<MigrationEstimation> {
    logger.log('Estimating migration', { totalKeys: keys.length });

    const sampleSize = Math.min(
      MIGRATION_CONTROL_FEATURES.ESTIMATION_SAMPLE_SIZE,
      keys.length
    );

    let totalSize = 0;
    let totalTime = 0;
    const startTime = Date.now();

    // Sample first N items to estimate speed
    for (let i = 0; i < sampleSize; i++) {
      const key = keys[i];
      const itemStart = performance.now();

      try {
        const value = await this.localStorageAdapter.getItem(key);
        if (value) {
          const size = new Blob([value]).size;
          totalSize += size;
        }
      } catch (error) {
        logger.error('Error sampling item for estimation', { key, error });
      }

      totalTime += performance.now() - itemStart;
    }

    // Calculate estimates
    const averageSize = totalSize / sampleSize;
    const averageTime = totalTime / sampleSize;
    const estimatedTotalSize = averageSize * keys.length;
    const estimatedDuration = averageTime * keys.length;

    // Adjust for IndexedDB being typically faster than localStorage reads
    const adjustedDuration = estimatedDuration * 0.7;

    const estimation: MigrationEstimation = {
      totalDataSize: estimatedTotalSize,
      estimatedCompressedSize: estimatedTotalSize * 0.9, // Assume 10% compression
      estimatedDuration: adjustedDuration,
      estimatedCompletionTime: new Date(Date.now() + adjustedDuration),
      averageItemProcessingTime: averageTime,
      estimatedThroughput: totalSize / (totalTime / 1000), // bytes per second
      confidenceLevel: this.calculateConfidence(sampleSize, keys.length),
      sampleSize
    };

    logger.log('Migration estimation complete', estimation);
    this.callbacks.onEstimation?.(estimation);

    return estimation;
  }

  /**
   * Preview migration without actually performing it
   */
  public async previewMigration(keys: string[]): Promise<MigrationPreview> {
    logger.log('Starting migration preview');

    const sampleSize = Math.min(
      MIGRATION_CONTROL_FEATURES.DRY_RUN_SAMPLE_SIZE,
      keys.length
    );

    const sampleKeys = keys.slice(0, sampleSize);
    const validationResults = [];
    const warnings = [];

    // Test each sample key
    for (const key of sampleKeys) {
      try {
        const value = await this.localStorageAdapter.getItem(key);
        const size = value ? new Blob([value]).size : 0;

        validationResults.push({
          key,
          readable: value !== null,
          writable: true, // Will test in actual implementation
          size
        });

        if (size > 1024 * 1024) { // 1MB
          warnings.push(`Large item detected: ${key} (${(size / 1024 / 1024).toFixed(2)}MB)`);
        }
      } catch (error) {
        validationResults.push({
          key,
          readable: false,
          writable: false,
          size: 0
        });
        warnings.push(`Cannot access key: ${key}`);
      }
    }

    // Check resources
    const storageAvailable = await this.checkStorageAvailable();
    const memoryAvailable = this.checkMemoryAvailable();
    const apiCompatible = this.checkAPICompatibility();

    if (!storageAvailable) {
      warnings.push('Insufficient storage space available');
    }
    if (!memoryAvailable) {
      warnings.push('Low memory detected, migration may be slow');
    }
    if (!apiCompatible) {
      warnings.push('Some browser APIs may not be fully compatible');
    }

    const preview: MigrationPreview = {
      canProceed: storageAvailable && apiCompatible,
      estimatedSuccess: validationResults.every(r => r.readable) && warnings.length === 0,
      sampleKeys,
      validationResults,
      warnings,
      storageAvailable,
      memoryAvailable,
      apiCompatible
    };

    logger.log('Migration preview complete', preview);
    this.callbacks.onPreview?.(preview);

    return preview;
  }

  /**
   * Check if we should create a checkpoint
   */
  public shouldCreateCheckpoint(): boolean {
    this.checkpointCounter++;
    return this.checkpointCounter % MIGRATION_CONTROL_FEATURES.CHECKPOINT_INTERVAL === 0;
  }

  /**
   * Check if migration is paused
   */
  public isPaused(): boolean {
    return this.control.isPaused;
  }

  /**
   * Check if migration is cancelling
   */
  public isCancelling(): boolean {
    return this.control.isCancelling;
  }

  /**
   * Get current control state
   */
  public getControlState(): MigrationControl {
    return { ...this.control };
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    await this.clearResumeData();
    this.callbacks = {};
  }

  // Private helper methods

  private async saveResumeData(data: MigrationResumeData): Promise<void> {
    try {
      await this.localStorageAdapter.setItem(
        MIGRATION_CONTROL_FEATURES.PROGRESS_STORAGE_KEY,
        JSON.stringify(data)
      );
    } catch (error) {
      logger.error('Failed to save resume data', error);
    }
  }

  private async loadResumeData(): Promise<void> {
    try {
      const saved = await this.localStorageAdapter.getItem(
        MIGRATION_CONTROL_FEATURES.PROGRESS_STORAGE_KEY
      );

      if (saved) {
        this.control.resumeData = JSON.parse(saved);
        this.control.canResume = true;
        logger.log('Found existing resume data', {
          sessionId: this.control.resumeData?.sessionId
        });
      }
    } catch (error) {
      logger.error('Failed to load resume data', error);
    }
  }

  private async clearResumeData(): Promise<void> {
    try {
      await this.localStorageAdapter.removeItem(
        MIGRATION_CONTROL_FEATURES.PROGRESS_STORAGE_KEY
      );
    } catch (error) {
      logger.error('Failed to clear resume data', error);
    }
  }

  private async checkStorageAvailable(): Promise<boolean> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        const available = (estimate.quota || 0) - (estimate.usage || 0);
        return available > 50 * 1024 * 1024; // Need at least 50MB
      } catch {
        return true; // Assume available if can't check
      }
    }
    return true;
  }

  private checkMemoryAvailable(): boolean {
    // @ts-ignore - performance.memory is Chrome-specific
    if (typeof performance !== 'undefined' && performance.memory) {
      // @ts-ignore
      const used = performance.memory.usedJSHeapSize;
      // @ts-ignore
      const limit = performance.memory.jsHeapSizeLimit;
      return used / limit < 0.8; // Less than 80% memory used
    }
    return true; // Assume available if can't check
  }

  private checkAPICompatibility(): boolean {
    return !!(
      typeof indexedDB !== 'undefined' &&
      typeof localStorage !== 'undefined' &&
      typeof Promise !== 'undefined'
    );
  }

  private calculateConfidence(sampleSize: number, totalSize: number): 'low' | 'medium' | 'high' {
    const ratio = sampleSize / totalSize;
    if (ratio >= 0.1) return 'high';
    if (ratio >= 0.05) return 'medium';
    return 'low';
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}