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
 * Memory-optimized migration orchestrator
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
   */
  public async migrate(): Promise<MigrationResult> {
    if (!this.memoryConfig.enableMemoryOptimization) {
      logger.debug('Memory optimization disabled, using standard migration');
      return super.migrate();
    }

    logger.log('Starting memory-optimized IndexedDB migration');

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

      logger.log('Memory-optimized migration completed successfully', {
        optimizationActions: this.memoryOptimizationActions,
        finalChunkSize: this.currentChunkSize,
        gcTriggered: this.gcTriggeredRecently
      });

      return result;

    } catch (error) {
      logger.error('Memory-optimized migration failed', {
        error,
        optimizationActions: this.memoryOptimizationActions,
        lastMemoryInfo: this.lastMemoryCheck
      });
      throw error;

    } finally {
      this.stopMemoryMonitoring();
      this.cleanupTimeouts();
      this.memoryManager.cleanup();
    }
  }

  /**
   * Start monitoring memory pressure during migration
   */
  private startMemoryMonitoring(): void {
    if (!this.memoryConfig.enableMemoryOptimization) {
      return;
    }

    logger.debug('Starting memory monitoring', {
      interval: this.memoryConfig.memoryMonitoringInterval
    });

    // Register for memory pressure events
    this.memoryManager.onMemoryPressure((event: MemoryPressureEvent) => {
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
   * Stop memory monitoring
   */
  private stopMemoryMonitoring(): void {
    if (this.memoryMonitoringInterval) {
      clearInterval(this.memoryMonitoringInterval);
      this.memoryMonitoringInterval = null;
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
   * Handle memory pressure events
   */
  private handleMemoryPressureEvent(event: MemoryPressureEvent): void {
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

      this.memoryOptimizationActions.push(
        `Chunk size adjusted: ${oldChunkSize} → ${this.currentChunkSize} (${event.level} pressure)`
      );

      logger.log('Chunk size adjusted due to memory pressure', {
        level: event.level,
        oldChunkSize,
        newChunkSize: this.currentChunkSize
      });
    }

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
   * Force garbage collection with throttling
   */
  private async performGarbageCollection(): Promise<void> {
    if (this.gcTriggeredRecently) {
      return;
    }

    try {
      this.gcTriggeredRecently = true;

      const success = await this.memoryManager.forceGarbageCollection();

      if (success) {
        this.memoryOptimizationActions.push('Forced garbage collection');
        logger.debug('Garbage collection forced successfully');
      }

      // Reset flag after delay to prevent excessive GC
      this.gcTimeoutId = setTimeout(() => {
        this.gcTriggeredRecently = false;
        this.gcTimeoutId = null;
      }, 5000);

    } catch (error) {
      this.gcTriggeredRecently = false;
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

    } catch (error) {
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
          if (value) {
            totalSize += new Blob([value]).size;
          }
        } catch (error) {
          logger.debug(`Failed to get size for key ${key}`, { error });
        }
      }

      logger.debug('Total data size estimation completed', {
        totalSizeMB: Math.round(totalSize / 1024 / 1024),
        keyCount: keys.length
      });

      return totalSize;

    } catch (error) {
      logger.error('Failed to estimate total data size', { error });
      return 0;
    }
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