/**
 * Memory-Optimized IndexedDB Migration with Progressive Data Loading
 *
 * Extends the control-enhanced migration with intelligent memory management:
 * - Dynamic chunk sizing based on memory pressure
 * - Progressive data loading for large datasets
 * - Forced garbage collection when needed
 * - Memory monitoring throughout migration
 */

import { IndexedDbMigrationOrchestratorEnhanced } from './indexedDbMigrationEnhanced';
import { MigrationResult, MigrationConfig } from './indexedDbMigration';
import { MigrationControlCallbacks } from '@/types/migrationControl';
import {
  MemoryManager,
  MemoryPressureLevel,
  MemoryPressureEvent,
  MemoryInfo
} from './memoryManager';
import { getLocalStorageItem } from './localStorage';
import logger from './logger';

/**
 * Configuration for memory-optimized migration
 */
export interface MemoryOptimizedMigrationConfig extends Partial<MigrationConfig> {
  /** Enable memory optimization features (default: true) */
  enableMemoryOptimization?: boolean;
  /** Target memory usage percentage before optimization kicks in (default: 0.7) */
  memoryOptimizationThreshold?: number;
  /** Enable progressive loading for large datasets (default: true) */
  enableProgressiveLoading?: boolean;
  /** Dataset size threshold for progressive loading in bytes (default: 100MB) */
  progressiveLoadingThreshold?: number;
  /** Enable forced garbage collection (default: true) */
  enableForcedGC?: boolean;
  /** Interval for memory monitoring during migration in ms (default: 2000) */
  memoryMonitoringInterval?: number;
}

/**
 * Progress information with memory metrics
 */
export interface MemoryOptimizedProgress {
  /** Current memory usage percentage */
  memoryUsage: number;
  /** Current memory pressure level */
  memoryPressure: MemoryPressureLevel;
  /** Current chunk size being used */
  currentChunkSize: number;
  /** Whether garbage collection was recently forced */
  gcTriggered: boolean;
  /** Available memory in MB */
  availableMemoryMB: number;
  /** Memory optimization actions taken */
  optimizationActions: string[];
}

/**
 * Performance metrics for migration analysis
 */
export interface MigrationPerformanceMetrics {
  /** Migration start timestamp */
  startTime: number;
  /** Migration end timestamp */
  endTime?: number;
  /** Total migration duration in milliseconds */
  duration?: number;
  /** Number of garbage collection triggers */
  gcTriggerCount: number;
  /** Average chunk size during migration */
  averageChunkSize: number;
  /** Peak memory usage percentage */
  peakMemoryUsage: number;
  /** Memory pressure level distribution */
  pressureLevelDistribution: Record<MemoryPressureLevel, number>;
  /** Total number of chunk size adjustments */
  chunkSizeAdjustments: number;
}

/**
 * Extended migration result with memory optimization metrics
 */
export interface MemoryOptimizedMigrationResult extends MigrationResult {
  /** Memory optimization performance metrics */
  memoryMetrics?: MigrationPerformanceMetrics;
  /** Memory optimization actions taken during migration */
  memoryOptimizationActions?: string[];
  /** Final memory usage percentage after migration */
  finalMemoryUsage?: number;
}

/**
 * Memory-optimized migration orchestrator with intelligent memory management
 *
 * @example
 * ```typescript
 * // Basic usage with default memory optimization
 * const orchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized({
 *   targetVersion: '2.0.0',
 *   memoryOptimizationThreshold: 0.8,
 *   progressiveLoadingThreshold: 50 * 1024 * 1024 // 50MB
 * });
 *
 * const result = await orchestrator.migrate();
 * console.log('Migration completed:', result.success);
 *
 * // Get performance metrics
 * const metrics = orchestrator.getPerformanceMetrics();
 * console.log('GC triggers:', metrics.gcTriggerCount);
 * console.log('Peak memory:', metrics.peakMemoryUsage + '%');
 * ```
 *
 * @example
 * ```typescript
 * // Advanced configuration for memory-constrained devices
 * const orchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized({
 *   targetVersion: '2.0.0',
 *   enableMemoryOptimization: true,
 *   memoryOptimizationThreshold: 0.6, // Lower threshold for constrained devices
 *   enableProgressiveLoading: true,
 *   progressiveLoadingThreshold: 25 * 1024 * 1024, // 25MB threshold
 *   enableForcedGC: true,
 *   memoryMonitoringInterval: 1000 // More frequent monitoring
 * });
 *
 * const result = await orchestrator.migrate();
 * const status = orchestrator.getMemoryOptimizationStatus();
 * console.log('Memory pressure:', status.memoryPressure);
 * ```
 */
export class IndexedDbMigrationOrchestratorMemoryOptimized extends IndexedDbMigrationOrchestratorEnhanced {
  private memoryManager: MemoryManager;
  private memoryConfig: MemoryOptimizedMigrationConfig;
  private currentChunkSize: number;
  private memoryMonitoringInterval: NodeJS.Timeout | null = null;
  private memoryOptimizationActions: string[] = [];
  private gcTriggeredRecently = false;
  private lastMemoryCheck: MemoryInfo | null = null;
  private gcTimeoutId: NodeJS.Timeout | null = null;
  private memoryPressureUnsubscribe: (() => void) | null = null;

  // Performance metrics tracking
  private performanceMetrics: MigrationPerformanceMetrics = {
    startTime: 0,
    gcTriggerCount: 0,
    averageChunkSize: 0,
    peakMemoryUsage: 0,
    pressureLevelDistribution: {
      [MemoryPressureLevel.LOW]: 0,
      [MemoryPressureLevel.MODERATE]: 0,
      [MemoryPressureLevel.HIGH]: 0,
      [MemoryPressureLevel.CRITICAL]: 0
    },
    chunkSizeAdjustments: 0
  };
  private chunkSizeSamples: number[] = [];

  constructor(
    config: MemoryOptimizedMigrationConfig = {},
    controlCallbacks?: MigrationControlCallbacks
  ) {
    super(config, controlCallbacks);

    this.memoryConfig = {
      enableMemoryOptimization: true,
      memoryOptimizationThreshold: 0.7,
      enableProgressiveLoading: true,
      progressiveLoadingThreshold: 100 * 1024 * 1024, // 100MB
      enableForcedGC: true,
      memoryMonitoringInterval: 2000,
      ...config
    };

    // Validate configuration
    this.validateConfig(this.memoryConfig);

    this.memoryManager = new MemoryManager({
      moderatePressureThreshold: 0.5,
      highPressureThreshold: this.memoryConfig.memoryOptimizationThreshold || 0.7,
      criticalPressureThreshold: 0.85,
      enableForcedGC: this.memoryConfig.enableForcedGC
    });

    // Start with recommended chunk size
    this.currentChunkSize = this.memoryManager.getRecommendedChunkSize();

    logger.debug('Memory-optimized migration orchestrator initialized', {
      config: this.memoryConfig,
      initialChunkSize: this.currentChunkSize
    });
  }

  /**
   * Enhanced migrate with memory optimization
   *
   * @example
   * ```typescript
   * const orchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized({
   *   targetVersion: '2.0.0',
   *   memoryOptimizationThreshold: 0.7
   * });
   *
   * try {
   *   const result = await orchestrator.migrate();
   *   if (result.success) {
   *     console.log('Migration completed successfully');
   *     console.log('Migrated keys:', result.migratedKeys?.length);
   *   }
   * } catch (error) {
   *   console.error('Migration failed:', error);
   * }
   * ```
   *
   * @returns Promise resolving to migration result with success status and details
   */
  public async migrate(): Promise<MemoryOptimizedMigrationResult> {
    if (!this.memoryConfig.enableMemoryOptimization) {
      logger.debug('Memory optimization disabled, using standard migration');
      const result = await super.migrate();
      // Return basic result without memory metrics when optimization is disabled
      return {
        ...result,
        memoryMetrics: undefined,
        memoryOptimizationActions: [],
        finalMemoryUsage: undefined
      };
    }

    logger.log('Starting memory-optimized IndexedDB migration');

    // Initialize performance tracking
    this.performanceMetrics.startTime = Date.now();

    // Start memory monitoring
    this.startMemoryMonitoring();

    // Check if progressive loading is needed
    const shouldUseProgressiveLoading = await this.shouldUseProgressiveLoading();

    if (shouldUseProgressiveLoading) {
      logger.log('Large dataset detected, using progressive loading strategy');
      this.memoryOptimizationActions.push('Progressive loading enabled for large dataset');
    }

    try {
      const result = await super.migrate();

      // Finalize performance metrics
      this.finalizePerformanceMetrics();

      // Get final memory usage
      const finalMemoryInfo = this.memoryManager.getMemoryInfo();

      logger.log('Memory-optimized migration completed successfully', {
        optimizationActions: this.memoryOptimizationActions,
        finalChunkSize: this.currentChunkSize,
        gcTriggered: this.gcTriggeredRecently,
        performanceMetrics: this.performanceMetrics
      });

      // Return extended result with memory metrics
      const memoryOptimizedResult: MemoryOptimizedMigrationResult = {
        ...result,
        memoryMetrics: { ...this.performanceMetrics },
        memoryOptimizationActions: [...this.memoryOptimizationActions],
        finalMemoryUsage: finalMemoryInfo?.usagePercentage
      };

      return memoryOptimizedResult;

    } catch (error: unknown) {
      logger.error('Memory-optimized migration failed', {
        error,
        optimizationActions: this.memoryOptimizationActions,
        lastMemoryInfo: this.lastMemoryCheck
      });
      throw error;

    } finally {
      await this.cleanupMemoryOptimization();
    }
  }

  /**
   * Start monitoring memory pressure during migration
   */
  private startMemoryMonitoring(): void {
    if (!this.memoryConfig.enableMemoryOptimization) {
      return;
    }

    // Skip monitoring in test environment unless explicitly needed
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test' && !process.env.FORCE_MEMORY_MONITORING) {
      logger.debug('Skipping memory monitoring in test environment');
      return;
    }

    logger.debug('Starting memory monitoring', {
      interval: this.memoryConfig.memoryMonitoringInterval
    });

    // Register for memory pressure events and store unsubscribe function
    this.memoryPressureUnsubscribe = this.memoryManager.onMemoryPressure((event: MemoryPressureEvent) => {
      this.handleMemoryPressureEvent(event);
    });

    // Start monitoring
    this.memoryManager.startMonitoring();

    // Additional periodic checks during migration
    const intervalId = setInterval(() => {
      this.performMemoryCheck();
    }, this.memoryConfig.memoryMonitoringInterval || 2000);
    this.memoryMonitoringInterval = intervalId;
  }

  /**
   * Stop memory monitoring and cleanup callbacks
   */
  private stopMemoryMonitoring(): void {
    if (this.memoryMonitoringInterval) {
      clearInterval(this.memoryMonitoringInterval);
      this.memoryMonitoringInterval = null;
    }

    // Unsubscribe from memory pressure events
    if (this.memoryPressureUnsubscribe) {
      this.memoryPressureUnsubscribe();
      this.memoryPressureUnsubscribe = null;
    }

    this.memoryManager.stopMonitoring();
    logger.debug('Memory monitoring stopped');
  }

  /**
   * Clean up timeout references to prevent memory leaks
   */
  private cleanupTimeouts(): void {
    if (this.gcTimeoutId) {
      clearTimeout(this.gcTimeoutId);
      this.gcTimeoutId = null;
    }
  }

  /**
   * Comprehensive cleanup method to prevent memory leaks
   */
  private async cleanupMemoryOptimization(): Promise<void> {
    this.stopMemoryMonitoring();
    this.cleanupTimeouts();
    this.memoryManager.cleanup();

    // Clear references to prevent retention
    this.memoryOptimizationActions = [];
    this.lastMemoryCheck = null;
    this.gcTriggeredRecently = false;

    logger.debug('Memory-optimized migration orchestrator cleanup completed');
  }

  /**
   * Public cleanup method for external cleanup coordination
   */
  public async cleanup(): Promise<void> {
    let memoryCleanupError: Error | null = null;

    try {
      await this.cleanupMemoryOptimization();
    } catch (error: unknown) {
      // Log the error but save it to re-throw after parent cleanup
      logger.error('Critical error during memory optimization cleanup', { error });
      memoryCleanupError = error instanceof Error ?
        error :
        new Error(`Memory cleanup failed: ${String(error)}`);
    }

    // Always attempt parent cleanup
    try {
      if (super.cleanup && typeof super.cleanup === 'function') {
        await super.cleanup();
      }
    } catch (parentError: unknown) {
      // If both cleanups failed, create a combined error
      if (memoryCleanupError) {
        const combinedError = new Error(
          `Multiple cleanup failures: Memory: ${memoryCleanupError.message}, Parent: ${String(parentError)}`
        );
        throw combinedError;
      }
      throw parentError;
    }

    // Re-throw memory cleanup error if parent cleanup succeeded
    if (memoryCleanupError) {
      throw memoryCleanupError;
    }
  }

  /**
   * Validate configuration parameters to prevent invalid settings
   */
  private validateConfig(config: MemoryOptimizedMigrationConfig): void {
    const {
      memoryOptimizationThreshold,
      progressiveLoadingThreshold,
      memoryMonitoringInterval
    } = config;

    if (memoryOptimizationThreshold !== undefined &&
        (memoryOptimizationThreshold < 0 || memoryOptimizationThreshold > 1)) {
      throw new Error('memoryOptimizationThreshold must be between 0 and 1');
    }

    if (progressiveLoadingThreshold !== undefined && progressiveLoadingThreshold < 0) {
      throw new Error('progressiveLoadingThreshold must be positive');
    }

    if (memoryMonitoringInterval !== undefined &&
        (memoryMonitoringInterval < 100 || memoryMonitoringInterval > 60000)) {
      throw new Error('memoryMonitoringInterval must be between 100ms and 60000ms');
    }

    logger.debug('Memory optimization configuration validated successfully', { config });
  }

  /**
   * Finalize performance metrics at migration end
   */
  private finalizePerformanceMetrics(): void {
    this.performanceMetrics.endTime = Date.now();
    this.performanceMetrics.duration = this.performanceMetrics.endTime - this.performanceMetrics.startTime;

    // Calculate average chunk size
    if (this.chunkSizeSamples.length > 0) {
      this.performanceMetrics.averageChunkSize = Math.round(
        this.chunkSizeSamples.reduce((sum, size) => sum + size, 0) / this.chunkSizeSamples.length
      );
    }

    logger.debug('Performance metrics finalized', this.performanceMetrics);
  }

  /**
   * Update performance metrics during migration
   */
  private updatePerformanceMetrics(memoryInfo: MemoryInfo | null, pressureLevel: MemoryPressureLevel): void {
    // Track peak memory usage
    if (memoryInfo && memoryInfo.usagePercentage > this.performanceMetrics.peakMemoryUsage) {
      this.performanceMetrics.peakMemoryUsage = memoryInfo.usagePercentage;
    }

    // Track pressure level distribution
    this.performanceMetrics.pressureLevelDistribution[pressureLevel]++;

    // Track chunk size samples
    this.chunkSizeSamples.push(this.currentChunkSize);
  }

  /**
   * Get current performance metrics for migration analysis
   *
   * @example
   * ```typescript
   * const orchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized();
   *
   * await orchestrator.migrate();
   *
   * // Analyze migration performance
   * const metrics = orchestrator.getPerformanceMetrics();
   * console.log('Migration duration:', metrics.duration + 'ms');
   * console.log('GC triggers:', metrics.gcTriggerCount);
   * console.log('Average chunk size:', metrics.averageChunkSize);
   * console.log('Peak memory usage:', metrics.peakMemoryUsage + '%');
   * console.log('Chunk size adjustments:', metrics.chunkSizeAdjustments);
   *
   * // Analyze pressure level distribution
   * Object.entries(metrics.pressureLevelDistribution).forEach(([level, count]) => {
   *   console.log(`${level} pressure occurred ${count} times`);
   * });
   * ```
   *
   * @returns Performance metrics including duration, GC triggers, memory usage, and pressure distribution
   */
  public getPerformanceMetrics(): MigrationPerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Handle memory pressure events
   */
  private handleMemoryPressureEvent(event: MemoryPressureEvent): void {
    // Skip memory optimization during pause to avoid interference
    if (this.isPausedState()) {
      return;
    }

    this.lastMemoryCheck = event.memoryInfo;

    logger.debug('Memory pressure event received', {
      level: event.level,
      usagePercentage: event.memoryInfo.usagePercentage.toFixed(1),
      recommendedChunkSize: event.recommendedChunkSize,
      shouldForceGC: event.shouldForceGC
    });

    // Update chunk size based on recommendation
    if (event.recommendedChunkSize !== this.currentChunkSize) {
      const oldChunkSize = this.currentChunkSize;
      this.currentChunkSize = event.recommendedChunkSize;

      // Track chunk size adjustment
      this.performanceMetrics.chunkSizeAdjustments++;

      this.memoryOptimizationActions.push(
        `Chunk size adjusted: ${oldChunkSize} → ${this.currentChunkSize} (${event.level} pressure)`
      );

      logger.log('Chunk size adjusted due to memory pressure', {
        level: event.level,
        oldChunkSize,
        newChunkSize: this.currentChunkSize
      });
    }

    // Update performance metrics
    this.updatePerformanceMetrics(event.memoryInfo, event.level);

    // Force garbage collection if recommended
    if (event.shouldForceGC && !this.gcTriggeredRecently) {
      this.performGarbageCollection();
    }

    // Log high/critical pressure situations
    if (event.level === MemoryPressureLevel.HIGH ||
        event.level === MemoryPressureLevel.CRITICAL) {

      logger.warn('High memory pressure during migration', {
        level: event.level,
        usagePercentage: event.memoryInfo.usagePercentage.toFixed(1),
        availableMemoryMB: Math.round(event.memoryInfo.availableMemory / 1024 / 1024),
        suggestedActions: event.suggestedActions
      });

      this.memoryOptimizationActions.push(
        ...event.suggestedActions.map(action => `Memory pressure (${event.level}): ${action}`)
      );
    }
  }

  /**
   * Perform periodic memory checks
   */
  private performMemoryCheck(): void {
    // Skip memory checks during pause to avoid interference
    if (this.isPausedState()) {
      return;
    }

    const memoryInfo = this.memoryManager.getMemoryInfo();

    if (!memoryInfo) {
      return;
    }

    this.lastMemoryCheck = memoryInfo;

    // Check for critical memory usage
    if (memoryInfo.usagePercentage > 90) {
      logger.warn('Critical memory usage detected during migration', {
        usagePercentage: memoryInfo.usagePercentage.toFixed(1),
        availableMemoryMB: Math.round(memoryInfo.availableMemory / 1024 / 1024)
      });

      // Emergency optimization
      this.performEmergencyOptimization();
    }
  }

  /**
   * Perform emergency memory optimization
   */
  private performEmergencyOptimization(): void {
    logger.warn('Performing emergency memory optimization');

    // Reduce chunk size to minimum
    const oldChunkSize = this.currentChunkSize;
    this.currentChunkSize = this.memoryManager.getConfig().minChunkSize;

    // Force immediate garbage collection
    this.performGarbageCollection();

    this.memoryOptimizationActions.push(
      `Emergency optimization: chunk size ${oldChunkSize} → ${this.currentChunkSize}, forced GC`
    );

    logger.warn('Emergency optimization completed', {
      oldChunkSize,
      newChunkSize: this.currentChunkSize
    });
  }

  /**
   * Get GC throttle duration based on current memory pressure
   */
  private getGcThrottleDuration(): number {
    // Use shorter timeout in test environments to prevent hanging
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return 10;
    }

    const memoryInfo = this.lastMemoryCheck || this.memoryManager.getMemoryInfo();
    const pressureLevel = this.memoryManager.getMemoryPressureLevel(memoryInfo || undefined);

    // Adaptive throttle duration based on memory pressure
    switch (pressureLevel) {
      case MemoryPressureLevel.CRITICAL:
        return 1000; // 1 second - very responsive during critical situations
      case MemoryPressureLevel.HIGH:
        return 2000; // 2 seconds - faster response for high pressure
      case MemoryPressureLevel.MODERATE:
        return 3000; // 3 seconds - moderate throttling
      case MemoryPressureLevel.LOW:
      default:
        return 5000; // 5 seconds - standard throttling for normal conditions
    }
  }

  /**
   * Force garbage collection using memory manager's improved implementation
   */
  private async performGarbageCollection(): Promise<void> {
    if (this.gcTriggeredRecently) {
      return;
    }

    try {
      this.gcTriggeredRecently = true;

      // Clear any existing timeout to prevent race conditions
      if (this.gcTimeoutId) {
        clearTimeout(this.gcTimeoutId);
        this.gcTimeoutId = null;
      }

      // Use memory manager's improved GC with retry logic
      const success = await this.memoryManager.forceGarbageCollection();

      if (success) {
        // Track GC trigger in performance metrics
        this.performanceMetrics.gcTriggerCount++;
        this.memoryOptimizationActions.push('Forced garbage collection');
        logger.debug('Garbage collection forced successfully');
      }

      // Reset flag after delay to prevent excessive GC
      // Use adaptive timeout based on memory pressure
      const timeoutMs = this.getGcThrottleDuration();
      this.gcTimeoutId = setTimeout(() => {
        this.gcTriggeredRecently = false;
        this.gcTimeoutId = null;
      }, timeoutMs);

    } catch (error: unknown) {
      this.gcTriggeredRecently = false;
      // Clear timeout reference on error
      if (this.gcTimeoutId) {
        clearTimeout(this.gcTimeoutId);
        this.gcTimeoutId = null;
      }
      logger.debug('Failed to force garbage collection', { error });
    }
  }

  /**
   * Determine if progressive loading should be used
   */
  private async shouldUseProgressiveLoading(): Promise<boolean> {
    if (!this.memoryConfig.enableProgressiveLoading) {
      return false;
    }

    try {
      // Estimate total data size
      const totalDataSize = await this.estimateTotalDataSize();

      logger.debug('Estimated total data size for migration', {
        totalDataSizeMB: Math.round(totalDataSize / 1024 / 1024),
        threshold: Math.round((this.memoryConfig.progressiveLoadingThreshold || 0) / 1024 / 1024)
      });

      return totalDataSize > (this.memoryConfig.progressiveLoadingThreshold || 0);

    } catch (error: unknown) {
      logger.debug('Failed to estimate data size, using progressive loading', { error });
      return true; // Conservative approach
    }
  }

  /**
   * Estimate total data size across all localStorage keys
   */
  private async estimateTotalDataSize(): Promise<number> {
    let totalSize = 0;

    try {
      // Get all localStorage keys that we'll migrate
      const keys = this.getKeysToMigrate();

      for (const key of keys) {
        try {
          const value = getLocalStorageItem(key);
          // Enhanced null checks for localStorage items
          if (value !== null && value !== undefined && typeof value === 'string') {
            // Estimate data size with caching for performance
            totalSize += this.estimateDataSize(value, `localStorage_${key}`);
          }
        } catch (error: unknown) {
          logger.debug(`Failed to get size for key ${key}`, { error });
        }
      }

      logger.debug('Total data size estimation completed', {
        totalSizeMB: Math.round(totalSize / 1024 / 1024),
        keyCount: keys.length
      });

      return totalSize;

    } catch (error: unknown) {
      logger.error('Failed to estimate total data size', { error });
      return 0;
    }
  }

  /**
   * Estimate data size using memory manager's improved estimation with caching
   */
  private estimateDataSize(data: string, cacheKey?: string): number {
    return this.memoryManager.getEstimatedDataSize(data, cacheKey);
  }

  /**
   * Get list of keys to migrate (override in subclass if needed)
   */
  protected getKeysToMigrate(): string[] {
    // This should return the list of localStorage keys to migrate
    // Implementation depends on the specific migration strategy
    return [
      'savedSoccerGames',
      'soccerMasterRoster',
      'soccerSeasons',
      'soccerTournaments',
      'soccerAppSettings',
      'soccerTeamsIndex',
      'soccerTeamRosters',
      'lastHomeTeamName',
      'soccerTimerState',
      'soccerPlayerAdjustments'
    ];
  }

  /**
   * Get current memory optimization status
   *
   * @example
   * ```typescript
   * const orchestrator = new IndexedDbMigrationOrchestratorMemoryOptimized();
   *
   * // During migration, check current status
   * const status = orchestrator.getMemoryOptimizationStatus();
   * console.log('Memory usage:', status.memoryUsage + '%');
   * console.log('Pressure level:', status.memoryPressure);
   * console.log('Current chunk size:', status.currentChunkSize);
   * console.log('Available memory:', status.availableMemoryMB + 'MB');
   *
   * if (status.gcTriggered) {
   *   console.log('Garbage collection was recently triggered');
   * }
   * ```
   *
   * @returns Current memory optimization status and metrics
   */
  public getMemoryOptimizationStatus(): MemoryOptimizedProgress {
    const memoryInfo = this.lastMemoryCheck || this.memoryManager.getMemoryInfo();

    return {
      memoryUsage: memoryInfo?.usagePercentage || 0,
      memoryPressure: this.memoryManager.getMemoryPressureLevel(memoryInfo || undefined),
      currentChunkSize: this.currentChunkSize,
      gcTriggered: this.gcTriggeredRecently,
      availableMemoryMB: memoryInfo ? Math.round(memoryInfo.availableMemory / 1024 / 1024) : 0,
      optimizationActions: [...this.memoryOptimizationActions]
    };
  }

  /**
   * Override to use dynamic chunk sizing
   */
  protected getOptimalBatchSize(): number {
    // Use memory-optimized chunk size instead of static configuration
    return this.currentChunkSize;
  }

  /**
   * Enhanced progress reporting with memory information
   */
  protected logProgressWithMemoryInfo(
    state: string,
    percentage: number,
    processedKeys: number,
    totalKeys: number
  ): void {
    // Add memory optimization info if monitoring is enabled
    if (this.memoryConfig.enableMemoryOptimization) {
      const memoryStatus = this.getMemoryOptimizationStatus();

      logger.debug('Migration progress with memory info', {
        state,
        percentage,
        processedKeys,
        totalKeys,
        memoryUsage: `${memoryStatus.memoryUsage.toFixed(1)}%`,
        memoryPressure: memoryStatus.memoryPressure,
        currentChunkSize: memoryStatus.currentChunkSize,
        availableMemoryMB: memoryStatus.availableMemoryMB
      });
    }
  }

  /**
   * Get memory optimization warnings for migration estimation
   */
  public getMemoryOptimizationWarnings(keys: string[]): string[] {
    if (!this.memoryConfig.enableMemoryOptimization) {
      return [];
    }

    // Add memory-specific warnings and recommendations
    const memoryInfo = this.memoryManager.getMemoryInfo();
    const warnings: string[] = [];

    if (memoryInfo?.isMemoryConstrained) {
      warnings.push('Device appears memory-constrained - migration will use conservative settings');
    }

    if (memoryInfo && memoryInfo.usagePercentage > 70) {
      warnings.push('High memory usage detected - consider closing other applications');
    }

    // Estimate if progressive loading will be needed
    const estimatedSize = keys.length * 1024; // Rough estimate
    if (estimatedSize > (this.memoryConfig.progressiveLoadingThreshold || 0)) {
      warnings.push('Large dataset detected - progressive loading will be used');
    }

    return warnings;
  }
}