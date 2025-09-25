/**
 * Background Migration Engine
 *
 * Complete implementation of background migration with idle-time processing,
 * tab visibility handling, progress persistence, and smart retry logic.
 * This engine seamlessly integrates with the existing migration infrastructure
 * while providing non-blocking background processing capabilities.
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
  SchedulerState,
  createBackgroundScheduler
} from './backgroundMigrationScheduler';
import { StorageAdapter } from '../types/migration';
import { MigrationMutex } from './migrationMutex';
import logger from './logger';

/**
 * Progress persistence structure for cross-session resumption
 */
interface PersistedMigrationProgress {
  migrationId: string;
  phase: MigrationPhase;
  processedKeys: string[];
  remainingKeys: string[];
  criticalComplete: boolean;
  backgroundComplete: boolean;
  totalKeys: number;
  totalSize: number;
  processedSize: number;
  startTime: number;
  lastUpdateTime: number;
  retryCount: number;
  errors: Array<{ key: string; error: string; timestamp: number }>;
}

/**
 * Migration phases for background processing
 */
export enum MigrationPhase {
  INITIALIZING = 'initializing',
  CLASSIFYING = 'classifying',
  CRITICAL = 'critical',
  IMPORTANT = 'important',
  BACKGROUND = 'background',
  COMPLETING = 'completing',
  COMPLETED = 'completed',
  PAUSED = 'paused',
  FAILED = 'failed'
}

/**
 * Retry configuration with exponential backoff
 */
interface RetryConfiguration {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryableErrors: string[];
}

/**
 * Migration status information for UI components
 */
export interface MigrationStatus {
  isActive: boolean;
  isPaused: boolean;
  phase: MigrationPhase;
  progress: number; // 0-100
  criticalComplete: boolean;
  estimatedTimeRemaining: number; // milliseconds
  currentKey?: string;
  processedKeys: number;
  totalKeys: number;
  errors: number;
  canPause: boolean;
  canResume: boolean;
  canCancel: boolean;
}

/**
 * Configuration for the background migration engine
 */
export interface BackgroundMigrationEngineConfig {
  // Idle processing configuration
  enableIdleProcessing: boolean;
  idleTimeThreshold: number; // Minimum idle time in ms
  maxIdleProcessingTime: number; // Max time per idle callback

  // Tab visibility configuration
  pauseOnHiddenTab: boolean;
  throttleOnHiddenTab: boolean;
  hiddenTabThrottleDelay: number;

  // Progress persistence
  enableProgressPersistence: boolean;
  persistenceInterval: number; // How often to save progress (ms)
  autoResumeOnLoad: boolean;

  // Retry configuration
  enableSmartRetry: boolean;
  retryConfiguration: RetryConfiguration;

  // Performance tuning
  criticalBatchSize: number;
  backgroundBatchSize: number;
  maxConcurrentOperations: number;

  // Current context for priority classification
  currentGameId?: string;
  currentSeasonId?: string;
  currentTournamentId?: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: BackgroundMigrationEngineConfig = {
  enableIdleProcessing: true,
  idleTimeThreshold: 5,
  maxIdleProcessingTime: 50,

  pauseOnHiddenTab: false,
  throttleOnHiddenTab: true,
  hiddenTabThrottleDelay: 5000,

  enableProgressPersistence: true,
  persistenceInterval: 3000,
  autoResumeOnLoad: true,

  enableSmartRetry: true,
  retryConfiguration: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 2,
    retryableErrors: ['NetworkError', 'QuotaExceededError', 'AbortError']
  },

  criticalBatchSize: 10,
  backgroundBatchSize: 5,
  maxConcurrentOperations: 3
};

/**
 * Complete background migration engine implementation
 */
export class BackgroundMigrationEngine {
  private config: BackgroundMigrationEngineConfig;
  private priorityManager: MigrationPriorityManager;
  private scheduler: BackgroundMigrationScheduler;
  private mutex: MigrationMutex;

  // Migration state
  private migrationId: string;
  private currentPhase: MigrationPhase = MigrationPhase.INITIALIZING;
  private isPaused = false;
  private isCancelled = false;

  // Data classification
  private classifiedData = new Map<MigrationPriority, DataClassification[]>();
  private processedKeys = new Set<string>();
  private failedKeys = new Map<string, { error: string; retries: number }>();

  // Progress tracking
  private totalKeys = 0;
  private totalSize = 0;
  private processedSize = 0;
  private startTime = Date.now();
  private lastProgressSave = Date.now();

  // Performance metrics
  private processingTimes: number[] = [];
  private averageProcessingTime = 0;

  // Visibility and idle handling
  private visibilityHandler?: () => void;
  private isTabVisible = true;
  private currentIdleTaskId?: string;
  private persistenceTimer?: NodeJS.Timeout;

  // Callbacks
  private onProgress?: (status: MigrationStatus) => void;
  private onPhaseChange?: (phase: MigrationPhase) => void;
  private onError?: (error: Error) => void;
  private onComplete?: () => void;

  constructor(
    private sourceAdapter: StorageAdapter,
    private targetAdapter: StorageAdapter,
    config: Partial<BackgroundMigrationEngineConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.migrationId = `bg_migration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize components
    this.priorityManager = createPriorityManager({
      currentGameId: this.config.currentGameId,
      currentSeasonId: this.config.currentSeasonId,
      currentTournamentId: this.config.currentTournamentId
    });

    this.scheduler = createBackgroundScheduler({
      minimumIdleTime: this.config.idleTimeThreshold,
      maximumIdleTime: this.config.maxIdleProcessingTime,
      enableTabVisibility: this.config.throttleOnHiddenTab || this.config.pauseOnHiddenTab,
      enablePerformanceMonitoring: true
    });

    this.mutex = new MigrationMutex();

    // Initialize data classification maps
    this.classifiedData.set(MigrationPriority.CRITICAL, []);
    this.classifiedData.set(MigrationPriority.IMPORTANT, []);
    this.classifiedData.set(MigrationPriority.BACKGROUND, []);

    this.setupEventHandlers();

    logger.info('BackgroundMigrationEngine initialized', {
      migrationId: this.migrationId,
      config: this.config
    });
  }

  /**
   * Setup event handlers for visibility and persistence
   */
  private setupEventHandlers(): void {
    // Tab visibility handling
    if (this.config.pauseOnHiddenTab || this.config.throttleOnHiddenTab) {
      this.visibilityHandler = () => {
        const wasVisible = this.isTabVisible;
        this.isTabVisible = !document.hidden;

        if (!wasVisible && this.isTabVisible) {
          logger.info('Tab became visible, resuming migration', { migrationId: this.migrationId });
          if (this.config.pauseOnHiddenTab && this.isPaused) {
            this.resume();
          }
        } else if (wasVisible && !this.isTabVisible) {
          logger.info('Tab became hidden', {
            migrationId: this.migrationId,
            action: this.config.pauseOnHiddenTab ? 'pausing' : 'throttling'
          });
          if (this.config.pauseOnHiddenTab && !this.isPaused) {
            this.pause();
          }
        }
      };

      document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    // Progress persistence timer
    if (this.config.enableProgressPersistence) {
      this.persistenceTimer = setInterval(() => {
        this.saveProgress();
      }, this.config.persistenceInterval);
    }
  }

  /**
   * Start the migration process
   */
  public async start(callbacks?: {
    onProgress?: (status: MigrationStatus) => void;
    onPhaseChange?: (phase: MigrationPhase) => void;
    onError?: (error: Error) => void;
    onComplete?: () => void;
  }): Promise<void> {
    // Set callbacks
    this.onProgress = callbacks?.onProgress;
    this.onPhaseChange = callbacks?.onPhaseChange;
    this.onError = callbacks?.onError;
    this.onComplete = callbacks?.onComplete;

    try {
      // Acquire migration lock
      const lockAcquired = await this.mutex.acquireLock(`background_${this.migrationId}`);
      if (!lockAcquired) {
        throw new Error('Could not acquire migration lock');
      }

      // Check for resumable progress
      if (this.config.enableProgressPersistence && this.config.autoResumeOnLoad) {
        const resumed = await this.loadProgress();
        if (resumed) {
          logger.info('Resuming previous migration', { migrationId: this.migrationId });
        }
      }

      // Start migration phases
      await this.runMigrationPhases();

    } catch (error) {
      logger.error('Migration failed', { migrationId: this.migrationId, error });
      this.currentPhase = MigrationPhase.FAILED;
      this.onError?.(error as Error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Run through all migration phases
   */
  private async runMigrationPhases(): Promise<void> {
    // Phase 1: Classification
    await this.classifyData();

    // Phase 2: Process critical data immediately
    if (this.classifiedData.get(MigrationPriority.CRITICAL)!.length > 0) {
      await this.processCriticalData();
    }

    // Phase 3: Process important data with minimal idle time
    if (this.classifiedData.get(MigrationPriority.IMPORTANT)!.length > 0) {
      await this.processImportantData();
    }

    // Phase 4: Process background data during idle time
    if (this.classifiedData.get(MigrationPriority.BACKGROUND)!.length > 0) {
      await this.processBackgroundData();
    }

    // Phase 5: Complete migration
    await this.completeMigration();
  }

  /**
   * Classify all data by priority
   */
  private async classifyData(): Promise<void> {
    this.setPhase(MigrationPhase.CLASSIFYING);

    try {
      const keys = await this.sourceAdapter.getAllKeys?.() || [];
      this.totalKeys = keys.length;

      for (const key of keys) {
        // Skip already processed keys (for resume)
        if (this.processedKeys.has(key)) {
          continue;
        }

        // Get size estimate
        const data = await this.sourceAdapter.getItem(key);
        const size = JSON.stringify(data).length;
        this.totalSize += size;

        // Classify the data
        const classification = this.priorityManager.classifyData(key, size, {
          currentGameId: this.config.currentGameId,
          currentSeasonId: this.config.currentSeasonId
        });

        // Add to appropriate priority bucket
        const bucket = this.classifiedData.get(classification.priority)!;
        bucket.push(classification);
      }

      logger.info('Data classification complete', {
        migrationId: this.migrationId,
        critical: this.classifiedData.get(MigrationPriority.CRITICAL)!.length,
        important: this.classifiedData.get(MigrationPriority.IMPORTANT)!.length,
        background: this.classifiedData.get(MigrationPriority.BACKGROUND)!.length
      });

    } catch (error) {
      logger.error('Classification failed', { migrationId: this.migrationId, error });
      throw error;
    }
  }

  /**
   * Process critical data immediately (blocking)
   */
  private async processCriticalData(): Promise<void> {
    this.setPhase(MigrationPhase.CRITICAL);
    const criticalData = this.classifiedData.get(MigrationPriority.CRITICAL)!;

    logger.info('Processing critical data', {
      migrationId: this.migrationId,
      count: criticalData.length
    });

    // Process critical data in batches
    for (let i = 0; i < criticalData.length; i += this.config.criticalBatchSize) {
      if (this.isCancelled) break;

      const batch = criticalData.slice(i, i + this.config.criticalBatchSize);
      await this.processBatch(batch);

      this.updateProgress();
    }
  }

  /**
   * Process important data with short idle delays
   */
  private async processImportantData(): Promise<void> {
    this.setPhase(MigrationPhase.IMPORTANT);
    const importantData = this.classifiedData.get(MigrationPriority.IMPORTANT)!;

    logger.info('Processing important data', {
      migrationId: this.migrationId,
      count: importantData.length
    });

    // Process with short idle delays between batches
    for (let i = 0; i < importantData.length; i += this.config.backgroundBatchSize) {
      if (this.isCancelled) break;

      // Wait for pause/resume
      while (this.isPaused && !this.isCancelled) {
        await this.sleep(100);
      }

      const batch = importantData.slice(i, i + this.config.backgroundBatchSize);

      // Use idle callback if available, otherwise process immediately
      if (this.config.enableIdleProcessing && this.scheduler.supportsIdleCallback()) {
        await this.processWithIdleCallback(batch);
      } else {
        await this.processBatch(batch);
        // Small delay to prevent blocking
        await this.sleep(10);
      }

      this.updateProgress();
    }
  }

  /**
   * Process background data during idle time only
   */
  private async processBackgroundData(): Promise<void> {
    this.setPhase(MigrationPhase.BACKGROUND);
    const backgroundData = this.classifiedData.get(MigrationPriority.BACKGROUND)!;

    logger.info('Processing background data', {
      migrationId: this.migrationId,
      count: backgroundData.length
    });

    // Process only during idle time
    for (let i = 0; i < backgroundData.length; i += this.config.backgroundBatchSize) {
      if (this.isCancelled) break;

      // Wait for pause/resume
      while (this.isPaused && !this.isCancelled) {
        await this.sleep(100);
      }

      // Apply tab visibility throttling
      if (!this.isTabVisible && this.config.throttleOnHiddenTab) {
        await this.sleep(this.config.hiddenTabThrottleDelay);
      }

      const batch = backgroundData.slice(i, i + this.config.backgroundBatchSize);

      // Always use idle callback for background data
      if (this.config.enableIdleProcessing && this.scheduler.supportsIdleCallback()) {
        await this.processWithIdleCallback(batch);
      } else {
        // Longer delay for background data when idle callback not available
        await this.processBatch(batch);
        await this.sleep(100);
      }

      this.updateProgress();
    }
  }

  /**
   * Process a batch of data using idle callback
   */
  private async processWithIdleCallback(batch: DataClassification[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const task: BackgroundTask = {
        id: `batch_${Date.now()}`,
        name: `Process ${batch.length} items`,
        priority: 0,
        estimatedDuration: batch.length * 10,
        processor: async () => {
          await this.processBatch(batch);
        },
        onError: reject
      };

      // Add task to scheduler
      this.scheduler.addTask(task);

      // Wait for task completion
      const checkInterval = setInterval(() => {
        const stats = this.scheduler.getStatistics();
        const completed = batch.every(item => this.processedKeys.has(item.key));

        if (completed) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Process a batch of data items
   */
  private async processBatch(batch: DataClassification[]): Promise<void> {
    const startTime = performance.now();

    await Promise.all(batch.map(async (item) => {
      if (this.processedKeys.has(item.key)) {
        return; // Already processed
      }

      try {
        // Migrate the item with retry logic
        await this.migrateItemWithRetry(item);

        this.processedKeys.add(item.key);
        this.processedSize += item.estimatedSize;

      } catch (error) {
        logger.error('Failed to migrate item', {
          migrationId: this.migrationId,
          key: item.key,
          error
        });

        this.failedKeys.set(item.key, {
          error: (error as Error).message,
          retries: this.failedKeys.get(item.key)?.retries || 0
        });
      }
    }));

    // Track processing time for estimation
    const processingTime = performance.now() - startTime;
    this.processingTimes.push(processingTime);
    if (this.processingTimes.length > 100) {
      this.processingTimes.shift();
    }
    this.averageProcessingTime = this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
  }

  /**
   * Migrate a single item with retry logic
   */
  private async migrateItemWithRetry(item: DataClassification): Promise<void> {
    const maxRetries = this.config.retryConfiguration.maxRetries;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Get data from source
        const data = await this.sourceAdapter.getItem(item.key);

        // Write to target
        await this.targetAdapter.setItem(item.key, data);

        return; // Success

      } catch (error) {
        lastError = error as Error;
        const errorName = lastError.name || 'UnknownError';

        // Check if error is retryable
        if (!this.config.retryConfiguration.retryableErrors.includes(errorName)) {
          throw lastError;
        }

        // Calculate delay with exponential backoff
        if (attempt < maxRetries) {
          const delay = Math.min(
            this.config.retryConfiguration.initialDelay * Math.pow(this.config.retryConfiguration.backoffFactor, attempt),
            this.config.retryConfiguration.maxDelay
          );

          logger.debug('Retrying migration', {
            migrationId: this.migrationId,
            key: item.key,
            attempt: attempt + 1,
            delay
          });

          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted
    if (lastError) {
      throw lastError;
    }
  }

  /**
   * Complete the migration
   */
  private async completeMigration(): Promise<void> {
    this.setPhase(MigrationPhase.COMPLETING);

    logger.info('Completing migration', {
      migrationId: this.migrationId,
      processed: this.processedKeys.size,
      failed: this.failedKeys.size,
      duration: Date.now() - this.startTime
    });

    // Clear persisted progress
    if (this.config.enableProgressPersistence) {
      localStorage.removeItem(this.getProgressKey());
    }

    this.setPhase(MigrationPhase.COMPLETED);
    this.onComplete?.();
  }

  /**
   * Pause the migration
   */
  public async pause(): Promise<void> {
    if (this.isPaused || this.currentPhase === MigrationPhase.COMPLETED) {
      return;
    }

    logger.info('Pausing migration', { migrationId: this.migrationId });

    this.isPaused = true;
    this.scheduler.pauseProcessing();

    // Save progress immediately
    if (this.config.enableProgressPersistence) {
      await this.saveProgress();
    }

    this.setPhase(MigrationPhase.PAUSED);
  }

  /**
   * Resume the migration
   */
  public async resume(): Promise<void> {
    if (!this.isPaused || this.currentPhase === MigrationPhase.COMPLETED) {
      return;
    }

    logger.info('Resuming migration', { migrationId: this.migrationId });

    this.isPaused = false;
    this.scheduler.resumeProcessing();

    // Restore the previous phase
    const previousPhase = await this.getPersistedPhase();
    if (previousPhase) {
      this.setPhase(previousPhase);
    }
  }

  /**
   * Cancel the migration
   */
  public async cancel(): Promise<void> {
    logger.info('Cancelling migration', { migrationId: this.migrationId });

    this.isCancelled = true;
    this.scheduler.stopProcessing();

    // Clear persisted progress
    if (this.config.enableProgressPersistence) {
      localStorage.removeItem(this.getProgressKey());
    }

    await this.cleanup();

    // Don't call onComplete when cancelled
  }

  /**
   * Get current migration status
   */
  public getStatus(): MigrationStatus {
    const processed = this.processedKeys.size;
    const progress = this.totalKeys > 0 ? (processed / this.totalKeys) * 100 : 0;
    const criticalComplete = this.classifiedData.get(MigrationPriority.CRITICAL)!
      .every(item => this.processedKeys.has(item.key));

    // Estimate remaining time
    let estimatedTimeRemaining = 0;
    if (this.averageProcessingTime > 0 && processed > 0) {
      const remainingKeys = this.totalKeys - processed;
      const batchSize = this.currentPhase === MigrationPhase.CRITICAL
        ? this.config.criticalBatchSize
        : this.config.backgroundBatchSize;
      const remainingBatches = Math.ceil(remainingKeys / batchSize);
      estimatedTimeRemaining = remainingBatches * this.averageProcessingTime;
    }

    return {
      isActive: !this.isPaused && !this.isCancelled && this.currentPhase !== MigrationPhase.COMPLETED,
      isPaused: this.isPaused,
      phase: this.currentPhase,
      progress,
      criticalComplete,
      estimatedTimeRemaining,
      currentKey: undefined, // Could track this if needed
      processedKeys: processed,
      totalKeys: this.totalKeys,
      errors: this.failedKeys.size,
      canPause: !this.isPaused && this.currentPhase !== MigrationPhase.COMPLETED,
      canResume: this.isPaused && this.currentPhase !== MigrationPhase.COMPLETED,
      canCancel: this.currentPhase !== MigrationPhase.COMPLETED
    };
  }

  /**
   * Save migration progress for resumption
   */
  private async saveProgress(): Promise<void> {
    if (!this.config.enableProgressPersistence) {
      return;
    }

    const progress: PersistedMigrationProgress = {
      migrationId: this.migrationId,
      phase: this.currentPhase,
      processedKeys: Array.from(this.processedKeys),
      remainingKeys: this.getRemainingKeys(),
      criticalComplete: this.classifiedData.get(MigrationPriority.CRITICAL)!
        .every(item => this.processedKeys.has(item.key)),
      backgroundComplete: this.classifiedData.get(MigrationPriority.BACKGROUND)!
        .every(item => this.processedKeys.has(item.key)),
      totalKeys: this.totalKeys,
      totalSize: this.totalSize,
      processedSize: this.processedSize,
      startTime: this.startTime,
      lastUpdateTime: Date.now(),
      retryCount: 0,
      errors: Array.from(this.failedKeys.entries()).map(([key, value]) => ({
        key,
        error: value.error,
        timestamp: Date.now()
      }))
    };

    try {
      localStorage.setItem(this.getProgressKey(), JSON.stringify(progress));
      this.lastProgressSave = Date.now();
    } catch (error) {
      logger.error('Failed to save progress', { migrationId: this.migrationId, error });
    }
  }

  /**
   * Load previously saved progress
   */
  private async loadProgress(): Promise<boolean> {
    if (!this.config.enableProgressPersistence) {
      return false;
    }

    try {
      const saved = localStorage.getItem(this.getProgressKey());
      if (!saved) {
        return false;
      }

      const progress: PersistedMigrationProgress = JSON.parse(saved);

      // Restore state
      this.migrationId = progress.migrationId;
      this.currentPhase = progress.phase;
      this.processedKeys = new Set(progress.processedKeys);
      this.totalKeys = progress.totalKeys;
      this.totalSize = progress.totalSize;
      this.processedSize = progress.processedSize;
      this.startTime = progress.startTime;

      // Restore failed keys
      progress.errors.forEach(error => {
        this.failedKeys.set(error.key, {
          error: error.error,
          retries: 0
        });
      });

      logger.info('Loaded previous progress', {
        migrationId: this.migrationId,
        processed: this.processedKeys.size,
        remaining: progress.remainingKeys.length
      });

      return true;

    } catch (error) {
      logger.error('Failed to load progress', { error });
      return false;
    }
  }

  /**
   * Get the persisted phase
   */
  private async getPersistedPhase(): Promise<MigrationPhase | null> {
    try {
      const saved = localStorage.getItem(this.getProgressKey());
      if (saved) {
        const progress: PersistedMigrationProgress = JSON.parse(saved);
        return progress.phase;
      }
    } catch {
      // Ignore errors
    }
    return null;
  }

  /**
   * Get remaining keys to process
   */
  private getRemainingKeys(): string[] {
    const remaining: string[] = [];

    for (const [_, items] of this.classifiedData) {
      for (const item of items) {
        if (!this.processedKeys.has(item.key)) {
          remaining.push(item.key);
        }
      }
    }

    return remaining;
  }

  /**
   * Get storage key for progress persistence
   */
  private getProgressKey(): string {
    return `migration_progress_${this.migrationId}`;
  }

  /**
   * Update progress and notify
   */
  private updateProgress(): void {
    const status = this.getStatus();
    this.onProgress?.(status);

    // Save progress periodically
    if (this.config.enableProgressPersistence &&
        Date.now() - this.lastProgressSave > this.config.persistenceInterval) {
      this.saveProgress();
    }
  }

  /**
   * Set the current phase and notify
   */
  private setPhase(phase: MigrationPhase): void {
    this.currentPhase = phase;
    this.onPhaseChange?.(phase);
    this.updateProgress();
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    // Stop scheduler
    this.scheduler.stopProcessing();

    // Release lock
    await this.mutex.releaseLock();

    // Remove event handlers
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }

    // Clear persistence timer
    if (this.persistenceTimer) {
      clearInterval(this.persistenceTimer);
    }

    logger.info('Migration engine cleaned up', { migrationId: this.migrationId });
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a background migration engine instance
 */
export function createBackgroundMigrationEngine(
  sourceAdapter: StorageAdapter,
  targetAdapter: StorageAdapter,
  config?: Partial<BackgroundMigrationEngineConfig>
): BackgroundMigrationEngine {
  return new BackgroundMigrationEngine(sourceAdapter, targetAdapter, config);
}

/**
 * Get the status of any active migration
 */
export async function getActiveMigrationStatus(): Promise<MigrationStatus | null> {
  // Check for any persisted migration progress
  const keys = Object.keys(localStorage).filter(key => key.startsWith('migration_progress_'));

  if (keys.length > 0) {
    try {
      const saved = localStorage.getItem(keys[0]);
      if (saved) {
        const progress: PersistedMigrationProgress = JSON.parse(saved);

        return {
          isActive: false,
          isPaused: true,
          phase: progress.phase,
          progress: (progress.processedKeys.length / progress.totalKeys) * 100,
          criticalComplete: progress.criticalComplete,
          estimatedTimeRemaining: 0,
          processedKeys: progress.processedKeys.length,
          totalKeys: progress.totalKeys,
          errors: progress.errors.length,
          canPause: false,
          canResume: true,
          canCancel: true
        };
      }
    } catch {
      // Ignore errors
    }
  }

  return null;
}