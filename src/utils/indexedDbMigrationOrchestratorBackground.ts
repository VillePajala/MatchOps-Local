/**
 * Background Migration Orchestrator - Simplified Implementation
 *
 * Provides background migration capabilities with priority-based processing
 * that works with the existing migration system architecture.
 */

import {
  MigrationPriorityManager,
  MigrationPriority,
  DataClassification,
  createPriorityManager
} from './migrationPriorityManager';
import {
  BackgroundMigrationScheduler,
  BackgroundTask,
  createBackgroundScheduler
} from './backgroundMigrationScheduler';
import {
  MigrationProgress,
  MigrationCallbacks,
  MigrationResult,
  MigrationOptions,
  MigrationState,
  StorageAdapter
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
 * Background migration orchestrator that works with existing adapters
 */
export class BackgroundMigrationOrchestrator {
  private config: BackgroundMigrationConfig;
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
  private callbacks?: BackgroundMigrationCallbacks;

  constructor(
    private sourceAdapter: StorageAdapter,
    private targetAdapter: StorageAdapter,
    callbacks?: BackgroundMigrationCallbacks,
    backgroundConfig: Partial<BackgroundMigrationConfig> = {}
  ) {
    this.config = { ...DEFAULT_BACKGROUND_CONFIG, ...backgroundConfig };
    this.callbacks = callbacks;

    // Initialize priority manager
    this.priorityManager = createPriorityManager({
      currentGameId: this.config.currentGameId
    });

    // Initialize background scheduler
    this.backgroundScheduler = createBackgroundScheduler({
      minimumIdleTime: 5,
      maximumIdleTime: 50,
      enableTabVisibility: true,
      enablePerformanceMonitoring: true
    });

    logger.info('BackgroundMigrationOrchestrator initialized', {
      backgroundConfig: this.config,
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
      const criticalResult = await this.processCriticalData();

      if (criticalResult.success && this.config.enableBackgroundProcessing) {
        // Phase 3: Start background processing for remaining data
        await this.startBackgroundProcessing();
      }

      return criticalResult;

    } catch (error) {
      logger.error('Background migration failed', { error });
      this.cleanup();
      throw error;
    }
  }

  /**
   * Get enhanced progress with background processing information
   */
  getProgress(): BackgroundMigrationProgress {
    const totalProcessed = this.processedCriticalSize + this.processedBackgroundSize;
    const backgroundRemaining = this.backgroundDataSize - this.processedBackgroundSize;

    // Map background migration phase to standard migration state
    const mapPhaseToState = (phase: BackgroundMigrationPhase): MigrationState => {
      switch (phase) {
        case BackgroundMigrationPhase.CRITICAL_PROCESSING:
        case BackgroundMigrationPhase.BACKGROUND_PROCESSING:
          return MigrationState.PROCESSING;
        case BackgroundMigrationPhase.BACKGROUND_WAITING:
          return MigrationState.PAUSED;
        case BackgroundMigrationPhase.COMPLETED:
          return MigrationState.COMPLETED;
        case BackgroundMigrationPhase.CANCELLED:
          return MigrationState.CANCELLED;
        default:
          return MigrationState.PROCESSING;
      }
    };

    return {
      state: mapPhaseToState(this.currentPhase),
      currentStep: `Phase: ${this.currentPhase}`,
      totalKeys: this.criticalData.length + this.backgroundData.length,
      processedKeys: this.criticalProcessingComplete ? this.criticalData.length : 0,
      percentage: this.totalDataSize > 0 ? Math.round((totalProcessed / this.totalDataSize) * 100) : 0,
      phase: this.currentPhase,
      criticalDataComplete: this.criticalProcessingComplete,
      backgroundDataRemaining: backgroundRemaining,
      estimatedBackgroundTime: this.estimateBackgroundTime(backgroundRemaining),
      canRunInBackground: this.config.enableBackgroundProcessing
    };
  }

  /**
   * Update current game ID for priority classification
   */
  updateCurrentGameId(gameId: string | undefined): void {
    this.config.currentGameId = gameId;
    this.priorityManager.updateCurrentGameId(gameId);
    logger.debug('Updated current game ID for background migration', { gameId });
  }

  /**
   * Check if background processing is available
   */
  isBackgroundProcessingAvailable(): boolean {
    return this.config.enableBackgroundProcessing && this.backgroundScheduler.supportsIdleCallback();
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
  private async processCriticalData(): Promise<MigrationResult> {
    if (this.criticalData.length === 0) {
      logger.info('No critical data to process');
      this.criticalProcessingComplete = true;
      this.callbacks?.onCriticalComplete?.();
      return {
        success: true,
        migratedKeys: [],
        errors: [],
        state: MigrationState.COMPLETED
      } as MigrationResult;
    }

    logger.info('Processing critical data', {
      count: this.criticalData.length,
      timeout: this.config.criticalDataTimeout
    });

    const startTime = Date.now();
    const timeoutMs = this.config.criticalDataTimeout;

    const migratedKeys: string[] = [];
    const errors: string[] = [];

    // Process each critical item with timeout checking
    for (const item of this.criticalData) {
      // Check if we've exceeded the critical data timeout
      if (timeoutMs > 0 && Date.now() - startTime > timeoutMs) {
        const timeoutMsg = `Critical data processing timeout exceeded (${timeoutMs}ms)`;
        errors.push(timeoutMsg);
        logger.warn('Critical data processing timeout', {
          timeoutMs,
          elapsedMs: Date.now() - startTime,
          processedCount: migratedKeys.length,
          totalCount: this.criticalData.length
        });
        break;
      }

      try {
        const sourceData = await this.sourceAdapter.getItem(item.key);
        if (sourceData !== null) {
          await this.targetAdapter.setItem(item.key, sourceData);
          migratedKeys.push(item.key);
          this.processedCriticalSize += item.estimatedSize;

          // Update progress
          this.callbacks?.onProgress?.(this.getProgress());

          logger.debug('Critical item migrated', {
            key: item.key,
            size: item.estimatedSize,
            elapsedMs: Date.now() - startTime
          });
        }
      } catch (error) {
        const errorMsg = `Failed to migrate ${item.key}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        logger.error('Critical item migration failed', { key: item.key, error: errorMsg });
      }
    }

    this.criticalProcessingComplete = true;
    this.callbacks?.onCriticalComplete?.();

    const result: MigrationResult = {
      success: errors.length === 0,
      migratedKeys,
      errors,
      state: errors.length === 0 ? MigrationState.COMPLETED : MigrationState.FAILED
    };

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
  private async startBackgroundProcessing(): Promise<void> {
    if (this.backgroundData.length === 0) {
      logger.info('No background data to process');
      this.setPhase(BackgroundMigrationPhase.COMPLETED);
      return;
    }

    // Wait before starting background processing
    if (this.config.backgroundProcessingDelay > 0) {
      this.setPhase(BackgroundMigrationPhase.BACKGROUND_WAITING);
      await new Promise(resolve => setTimeout(resolve, this.config.backgroundProcessingDelay));
    }

    this.setPhase(BackgroundMigrationPhase.BACKGROUND_PROCESSING);
    this.backgroundProcessingActive = true;
    this.callbacks?.onBackgroundStart?.();

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
      this.callbacks?.onProgress?.(this.getProgress());

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
    this.callbacks?.onProgress?.(this.getProgress());
  }

  /**
   * Set current migration phase
   */
  private setPhase(phase: BackgroundMigrationPhase): void {
    this.currentPhase = phase;
    this.callbacks?.onPhaseChange?.(phase);
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
  private extractMetadata(key: string, data: unknown): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};

    // Extract timestamp information if available
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if (obj.lastModified) metadata.lastModified = obj.lastModified;
      if (obj.createdAt) metadata.createdAt = obj.createdAt;
      if (obj.timestamp) metadata.timestamp = obj.timestamp;
      if (obj.isActive !== undefined) metadata.isActive = obj.isActive;
      if (obj.isCurrent !== undefined) metadata.isCurrent = obj.isCurrent;
    }

    return metadata;
  }

  /**
   * Get all keys from source adapter
   */
  private async getSourceKeys(): Promise<string[]> {
    // This method should be implemented based on the specific adapter interface
    // For now, we'll assume a method exists or implement a fallback
    if (this.sourceAdapter.getAllKeys) {
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
  sourceAdapter: StorageAdapter,
  targetAdapter: StorageAdapter,
  callbacks?: BackgroundMigrationCallbacks,
  config: Partial<BackgroundMigrationConfig> = {}
): BackgroundMigrationOrchestrator {
  return new BackgroundMigrationOrchestrator(sourceAdapter, targetAdapter, callbacks, config);
}