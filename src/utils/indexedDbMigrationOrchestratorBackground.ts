/**
 * IndexedDB Migration Orchestrator - Background Processing
 *
 * Extends the memory-optimized orchestrator with background migration capabilities.
 * Prioritizes critical data for immediate migration while processing non-critical
 * data during idle time to maintain optimal user experience.
 */

import { IndexedDbMigrationOrchestratorMemoryOptimized } from './indexedDbMigrationMemoryOptimized';
import {
  MigrationPriorityManager,
  MigrationPriority,
  DataClassification,
  createPriorityManager
} from './migrationPriorityManager';
import {
  BackgroundMigrationScheduler,
  BackgroundTask,
  SchedulerState,
  createBackgroundScheduler
} from './backgroundMigrationScheduler';
import {
  MigrationProgress,
  MigrationCallbacks,
  MigrationResult,
  MigrationOptions
} from '../types/migration';
import logger from './logger';

/**
 * Background migration configuration
 */
export interface BackgroundMigrationConfig {
  /** Enable background processing for non-critical data */
  enableBackgroundProcessing: boolean;
  /** Maximum time to spend on critical data before starting background (ms) */
  criticalDataTimeout: number;
  /** Delay between critical and background processing phases (ms) */
  backgroundProcessingDelay: number;
  /** Enable progress persistence across browser sessions */
  enableProgressPersistence: boolean;
  /** Auto-resume background migration on page load */
  autoResumeOnLoad: boolean;
  /** Current game ID for priority classification */
  currentGameId?: string;
}

/**
 * Background migration phases
 */
export enum BackgroundMigrationPhase {
  /** Processing critical data immediately */
  CRITICAL_PROCESSING = 'critical_processing',
  /** Waiting to start background processing */
  BACKGROUND_WAITING = 'background_waiting',
  /** Processing background data during idle time */
  BACKGROUND_PROCESSING = 'background_processing',
  /** Migration completed successfully */
  COMPLETED = 'completed',
  /** Migration was cancelled */
  CANCELLED = 'cancelled'
}

/**
 * Enhanced progress information with background processing details
 */
export interface BackgroundMigrationProgress extends MigrationProgress {
  phase: BackgroundMigrationPhase;
  criticalDataComplete: boolean;
  backgroundDataRemaining: number;
  estimatedBackgroundTime: number;
  canRunInBackground: boolean;
}

/**
 * Background migration callbacks
 */
export interface BackgroundMigrationCallbacks extends MigrationCallbacks {
  onPhaseChange?: (phase: BackgroundMigrationPhase) => void;
  onCriticalComplete?: () => void;
  onBackgroundStart?: () => void;
  onBackgroundPause?: () => void;
  onBackgroundResume?: () => void;
}

/**
 * Default background migration configuration
 */
const DEFAULT_BACKGROUND_CONFIG: BackgroundMigrationConfig = {
  enableBackgroundProcessing: true,
  criticalDataTimeout: 10000, // 10 seconds max for critical data
  backgroundProcessingDelay: 2000, // 2 seconds delay before background starts
  enableProgressPersistence: true,
  autoResumeOnLoad: true
};

/**
 * Migration orchestrator with background processing capabilities
 */
export class IndexedDbMigrationOrchestratorBackground extends IndexedDbMigrationOrchestratorMemoryOptimized {
  private backgroundConfig: BackgroundMigrationConfig;
  private priorityManager: MigrationPriorityManager;
  private backgroundScheduler: BackgroundMigrationScheduler;
  private currentPhase: BackgroundMigrationPhase = BackgroundMigrationPhase.CRITICAL_PROCESSING;

  // Data classification
  private criticalData: DataClassification[] = [];
  private importantData: DataClassification[] = [];
  private backgroundData: DataClassification[] = [];

  // Progress tracking
  private totalDataSize = 0;
  private criticalDataSize = 0;
  private backgroundDataSize = 0;
  private processedCriticalSize = 0;
  private processedBackgroundSize = 0;

  // State management
  private backgroundTaskId?: string;
  private criticalProcessingComplete = false;
  private backgroundProcessingActive = false;
  private backgroundCallbacks?: BackgroundMigrationCallbacks;

  constructor(
    sourceAdapter: any,
    targetAdapter: any,
    callbacks?: BackgroundMigrationCallbacks,
    backgroundConfig: Partial<BackgroundMigrationConfig> = {}
  ) {
    super(sourceAdapter, targetAdapter, callbacks);

    this.backgroundConfig = { ...DEFAULT_BACKGROUND_CONFIG, ...backgroundConfig };
    this.backgroundCallbacks = callbacks;

    // Initialize priority manager
    this.priorityManager = createPriorityManager({
      currentGameId: this.backgroundConfig.currentGameId
    });

    // Initialize background scheduler
    this.backgroundScheduler = createBackgroundScheduler({
      minimumIdleTime: 5,
      maximumIdleTime: 50,
      enableTabVisibility: true,
      enablePerformanceMonitoring: true
    });

    logger.info('IndexedDbMigrationOrchestratorBackground initialized', {
      backgroundConfig: this.backgroundConfig,
      supportsIdleCallback: this.backgroundScheduler.supportsIdleCallback()
    });
  }

  /**
   * Start migration with background processing capabilities
   */
  async migrate(options: MigrationOptions = {}): Promise<MigrationResult> {
    try {
      logger.info('Starting background migration', { options });

      // Phase 1: Classify data by priority
      await this.classifyMigrationData();

      // Phase 2: Process critical data immediately
      this.setPhase(BackgroundMigrationPhase.CRITICAL_PROCESSING);
      const criticalResult = await this.processCriticalData(options);

      if (criticalResult.success && this.backgroundConfig.enableBackgroundProcessing) {
        // Phase 3: Start background processing for remaining data
        await this.startBackgroundProcessing(options);
      }

      return criticalResult;

    } catch (error) {
      logger.error('Background migration failed', { error });
      this.cleanup();
      throw error;
    }
  }

  /**
   * Pause background migration
   */
  async pause(): Promise<void> {
    await super.pause();

    if (this.backgroundProcessingActive) {
      this.backgroundScheduler.pauseProcessing();
      this.backgroundCallbacks?.onBackgroundPause?.();
      logger.info('Background processing paused');
    }
  }

  /**
   * Resume background migration
   */
  async resume(): Promise<any> {
    const resumeData = await super.resume();

    if (this.backgroundProcessingActive) {
      this.backgroundScheduler.resumeProcessing();
      this.backgroundCallbacks?.onBackgroundResume?.();
      logger.info('Background processing resumed');
    }

    return resumeData;
  }

  /**
   * Cancel migration and stop all background processing
   */
  async cancel(): Promise<void> {
    this.backgroundScheduler.stopProcessing();
    this.backgroundProcessingActive = false;
    this.setPhase(BackgroundMigrationPhase.CANCELLED);

    await super.cancel();
    logger.info('Background migration cancelled');
  }

  /**
   * Get enhanced progress with background processing information
   */
  getProgress(): BackgroundMigrationProgress {
    const baseProgress = super.getProgress();

    const totalProcessed = this.processedCriticalSize + this.processedBackgroundSize;
    const backgroundRemaining = this.backgroundDataSize - this.processedBackgroundSize;

    return {
      ...baseProgress,
      phase: this.currentPhase,
      criticalDataComplete: this.criticalProcessingComplete,
      backgroundDataRemaining: backgroundRemaining,
      estimatedBackgroundTime: this.estimateBackgroundTime(backgroundRemaining),
      canRunInBackground: this.backgroundConfig.enableBackgroundProcessing,
      percentage: this.totalDataSize > 0 ? Math.round((totalProcessed / this.totalDataSize) * 100) : 0
    };
  }

  /**
   * Update current game ID for priority classification
   */
  updateCurrentGameId(gameId: string | undefined): void {
    this.backgroundConfig.currentGameId = gameId;
    this.priorityManager.updateCurrentGameId(gameId);
    logger.debug('Updated current game ID for background migration', { gameId });
  }

  /**
   * Check if background processing is available
   */
  isBackgroundProcessingAvailable(): boolean {
    return this.backgroundConfig.enableBackgroundProcessing && this.backgroundScheduler.supportsIdleCallback();
  }

  /**
   * Get background processing status
   */
  getBackgroundStatus() {
    const schedulerStatus = this.backgroundScheduler.getStatus();
    return {
      ...schedulerStatus,
      phase: this.currentPhase,
      criticalComplete: this.criticalProcessingComplete,
      backgroundActive: this.backgroundProcessingActive
    };
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.backgroundScheduler.cleanup();
    super.cleanup();
    logger.info('Background migration orchestrator cleanup completed');
  }

  /**
   * Classify migration data by priority
   */
  private async classifyMigrationData(): Promise<void> {
    logger.info('Classifying migration data by priority');

    // Get all keys and their sizes from source adapter
    const sourceKeys = await this.getSourceKeys();
    const dataEntries = await Promise.all(
      sourceKeys.map(async (key) => {
        const data = await this.sourceAdapter.getItem(key);
        const size = data ? JSON.stringify(data).length : 0;
        return { key, size, metadata: this.extractMetadata(key, data) };
      })
    );

    // Classify data using priority manager
    const classifications = this.priorityManager.classifyAndSortData(dataEntries);

    // Separate by priority levels
    this.criticalData = this.priorityManager.getEntriesByPriority(classifications, MigrationPriority.CRITICAL);
    this.importantData = this.priorityManager.getEntriesByPriority(classifications, MigrationPriority.IMPORTANT);
    this.backgroundData = this.priorityManager.getEntriesByPriority(classifications, MigrationPriority.BACKGROUND);

    // Calculate size totals
    this.criticalDataSize = this.criticalData.reduce((sum, item) => sum + item.estimatedSize, 0);
    const importantDataSize = this.importantData.reduce((sum, item) => sum + item.estimatedSize, 0);
    this.backgroundDataSize = this.backgroundData.reduce((sum, item) => sum + item.estimatedSize, 0);
    this.totalDataSize = this.criticalDataSize + importantDataSize + this.backgroundDataSize;

    // Important data is processed with critical data for immediate completion
    this.criticalData = [...this.criticalData, ...this.importantData];
    this.criticalDataSize += importantDataSize;

    logger.info('Data classification completed', {
      criticalCount: this.criticalData.length,
      backgroundCount: this.backgroundData.length,
      criticalSizeMB: Math.round(this.criticalDataSize / 1024 / 1024 * 100) / 100,
      backgroundSizeMB: Math.round(this.backgroundDataSize / 1024 / 1024 * 100) / 100
    });
  }

  /**
   * Process critical and important data immediately
   */
  private async processCriticalData(options: MigrationOptions): Promise<MigrationResult> {
    if (this.criticalData.length === 0) {
      logger.info('No critical data to process');
      this.criticalProcessingComplete = true;
      this.backgroundCallbacks?.onCriticalComplete?.();
      return { success: true, migratedKeys: [], errors: [] };
    }

    logger.info('Processing critical data', { count: this.criticalData.length });

    const criticalKeys = this.criticalData.map(item => item.key);

    // Use parent class migration with only critical keys
    const originalCallbacks = this.callbacks;
    this.callbacks = {
      ...originalCallbacks,
      onProgress: (progress) => {
        this.processedCriticalSize = Math.round((progress.percentage / 100) * this.criticalDataSize);
        this.updateBackgroundProgress();
        originalCallbacks?.onProgress?.(this.getProgress());
      }
    };

    const result = await super.migrateKeys(criticalKeys, options);

    this.criticalProcessingComplete = true;
    this.backgroundCallbacks?.onCriticalComplete?.();

    logger.info('Critical data processing completed', {
      success: result.success,
      migratedCount: result.migratedKeys.length,
      errorCount: result.errors.length
    });

    return result;
  }

  /**
   * Start background processing for remaining data
   */
  private async startBackgroundProcessing(options: MigrationOptions): Promise<void> {
    if (this.backgroundData.length === 0) {
      logger.info('No background data to process');
      this.setPhase(BackgroundMigrationPhase.COMPLETED);
      return;
    }

    // Wait before starting background processing
    if (this.backgroundConfig.backgroundProcessingDelay > 0) {
      this.setPhase(BackgroundMigrationPhase.BACKGROUND_WAITING);
      await new Promise(resolve => setTimeout(resolve, this.backgroundConfig.backgroundProcessingDelay));
    }

    this.setPhase(BackgroundMigrationPhase.BACKGROUND_PROCESSING);
    this.backgroundProcessingActive = true;
    this.backgroundCallbacks?.onBackgroundStart?.();

    // Create background migration task
    const backgroundTask: BackgroundTask = {
      id: `background_migration_${Date.now()}`,
      name: 'Background Data Migration',
      priority: 10, // Lower priority for background processing
      estimatedDuration: this.estimateBackgroundTime(this.backgroundDataSize),
      processor: () => this.processBackgroundChunk()
    };

    this.backgroundTaskId = backgroundTask.id;
    this.backgroundScheduler.addTask(backgroundTask);

    logger.info('Background processing started', {
      dataCount: this.backgroundData.length,
      estimatedDuration: backgroundTask.estimatedDuration
    });
  }

  /**
   * Process a chunk of background data
   */
  private async processBackgroundChunk(): Promise<void> {
    if (this.backgroundData.length === 0) {
      this.completeBackgroundProcessing();
      return;
    }

    // Process one item at a time during idle time
    const item = this.backgroundData.shift()!;

    try {
      const sourceData = await this.sourceAdapter.getItem(item.key);
      if (sourceData !== null) {
        await this.targetAdapter.setItem(item.key, sourceData);
        this.processedBackgroundSize += item.estimatedSize;

        logger.debug('Background item migrated', {
          key: item.key,
          size: item.estimatedSize,
          remaining: this.backgroundData.length
        });
      }

      // Update progress
      this.updateBackgroundProgress();

      // Schedule next chunk if more data exists
      if (this.backgroundData.length > 0) {
        const nextTask: BackgroundTask = {
          id: `background_migration_${Date.now()}`,
          name: 'Background Data Migration',
          priority: 10,
          estimatedDuration: 20, // Estimate for single item
          processor: () => this.processBackgroundChunk()
        };

        this.backgroundScheduler.addTask(nextTask);
      } else {
        this.completeBackgroundProcessing();
      }

    } catch (error) {
      logger.error('Background chunk processing failed', {
        key: item.key,
        error: error instanceof Error ? error.message : String(error)
      });

      // Continue with next item even if this one fails
      if (this.backgroundData.length > 0) {
        const retryTask: BackgroundTask = {
          id: `background_migration_retry_${Date.now()}`,
          name: 'Background Data Migration (Retry)',
          priority: 10,
          estimatedDuration: 20,
          processor: () => this.processBackgroundChunk()
        };

        this.backgroundScheduler.addTask(retryTask);
      } else {
        this.completeBackgroundProcessing();
      }
    }
  }

  /**
   * Complete background processing
   */
  private completeBackgroundProcessing(): void {
    this.backgroundProcessingActive = false;
    this.setPhase(BackgroundMigrationPhase.COMPLETED);

    logger.info('Background processing completed', {
      processedSize: this.processedBackgroundSize,
      totalBackgroundSize: this.backgroundDataSize
    });

    // Final progress update
    this.updateBackgroundProgress();
  }

  /**
   * Update and emit background migration progress
   */
  private updateBackgroundProgress(): void {
    const progress = this.getProgress();
    this.callbacks?.onProgress?.(progress);
  }

  /**
   * Set current migration phase
   */
  private setPhase(phase: BackgroundMigrationPhase): void {
    this.currentPhase = phase;
    this.backgroundCallbacks?.onPhaseChange?.(phase);
    logger.debug('Migration phase changed', { phase });
  }

  /**
   * Estimate background processing time
   */
  private estimateBackgroundTime(remainingSize: number): number {
    if (remainingSize === 0) return 0;

    // Estimate based on idle processing speed (conservative estimate)
    const bytesPerSecond = 10 * 1024; // 10KB/s during idle time
    return Math.ceil(remainingSize / bytesPerSecond) * 1000;
  }

  /**
   * Extract metadata from key and data for priority classification
   */
  private extractMetadata(key: string, data: any): any {
    const metadata: any = {};

    // Extract timestamp information if available
    if (data && typeof data === 'object') {
      if (data.lastModified) metadata.lastModified = data.lastModified;
      if (data.createdAt) metadata.createdAt = data.createdAt;
      if (data.timestamp) metadata.timestamp = data.timestamp;
      if (data.isActive !== undefined) metadata.isActive = data.isActive;
      if (data.isCurrent !== undefined) metadata.isCurrent = data.isCurrent;
    }

    return metadata;
  }

  /**
   * Get all keys from source adapter
   */
  private async getSourceKeys(): Promise<string[]> {
    // This method should be implemented based on the specific adapter interface
    // For now, we'll assume a method exists or implement a fallback
    if (typeof this.sourceAdapter.getAllKeys === 'function') {
      return await this.sourceAdapter.getAllKeys();
    }

    // Fallback: iterate through common storage keys
    const commonKeys = [
      'soccerAppSettings',
      'soccerMasterRoster',
      'soccerSavedGames',
      'seasonsList',
      'tournamentsList'
    ];

    const existingKeys: string[] = [];
    for (const key of commonKeys) {
      const value = await this.sourceAdapter.getItem(key);
      if (value !== null) {
        existingKeys.push(key);
      }
    }

    return existingKeys;
  }
}

/**
 * Create configured background migration orchestrator
 */
export function createBackgroundMigrationOrchestrator(
  sourceAdapter: any,
  targetAdapter: any,
  callbacks?: BackgroundMigrationCallbacks,
  config: Partial<BackgroundMigrationConfig> = {}
): IndexedDbMigrationOrchestratorBackground {
  return new IndexedDbMigrationOrchestratorBackground(sourceAdapter, targetAdapter, callbacks, config);
}