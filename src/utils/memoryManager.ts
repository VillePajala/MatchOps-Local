/**
 * Memory Management System for Migration Optimization
 *
 * Provides intelligent memory pressure detection and adaptive strategies
 * for handling large dataset migrations without causing browser crashes.
 *
 * Features:
 * - Real-time memory usage monitoring using Performance API
 * - Dynamic memory threshold calculation
 * - Adaptive chunk sizing based on available memory
 * - Forced garbage collection triggers
 * - Memory pressure event system
 * - Cross-browser compatibility with graceful fallbacks
 */

import logger from './logger';

/**
 * Type guard to check if performance.memory is available
 */
function hasPerformanceMemory(performance: Performance): performance is Performance & {
  memory: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
} {
  return 'memory' in performance &&
         performance.memory !== null &&
         typeof performance.memory === 'object' &&
         'usedJSHeapSize' in performance.memory &&
         'totalJSHeapSize' in performance.memory &&
         'jsHeapSizeLimit' in performance.memory;
}

/**
 * Type guard to check if navigator.deviceMemory is available
 */
function hasDeviceMemory(navigator: Navigator): navigator is Navigator & {
  deviceMemory: number;
} {
  return 'deviceMemory' in navigator && typeof navigator.deviceMemory === 'number';
}

/**
 * Type guard to check if window.gc is available
 */
function hasWindowGC(window: Window): window is Window & {
  gc: () => void;
} {
  return 'gc' in window && typeof window.gc === 'function';
}

/**
 * Memory usage information from Performance API
 */
export interface MemoryInfo {
  /** Total memory used by the JavaScript heap (bytes) */
  usedJSHeapSize: number;
  /** Total memory allocated by the JavaScript heap (bytes) */
  totalJSHeapSize: number;
  /** Maximum memory that can be allocated by the JavaScript heap (bytes) */
  jsHeapSizeLimit: number;
  /** Calculated memory usage percentage (0-100) */
  usagePercentage: number;
  /** Whether this device appears to be memory constrained */
  isMemoryConstrained: boolean;
  /** Available memory for new allocations (bytes) */
  availableMemory: number;
}

/**
 * Memory pressure levels for different optimization strategies
 */
export enum MemoryPressureLevel {
  LOW = 'low',       // < 50% usage - normal operation
  MODERATE = 'moderate', // 50-70% usage - start optimizing
  HIGH = 'high',     // 70-85% usage - aggressive optimization
  CRITICAL = 'critical' // > 85% usage - emergency measures
}

/**
 * Memory pressure event data
 */
export interface MemoryPressureEvent {
  level: MemoryPressureLevel;
  memoryInfo: MemoryInfo;
  timestamp: number;
  recommendedChunkSize: number;
  shouldForceGC: boolean;
  suggestedActions: string[];
}

/**
 * Configuration for memory management behavior
 */
export interface MemoryManagerConfig {
  /** Memory usage threshold for moderate pressure (default: 0.5) */
  moderatePressureThreshold: number;
  /** Memory usage threshold for high pressure (default: 0.7) */
  highPressureThreshold: number;
  /** Memory usage threshold for critical pressure (default: 0.85) */
  criticalPressureThreshold: number;
  /** Minimum chunk size in items (default: 10) */
  minChunkSize: number;
  /** Maximum chunk size in items (default: 1000) */
  maxChunkSize: number;
  /** Default chunk size when memory info unavailable (default: 100) */
  defaultChunkSize: number;
  /** How often to check memory usage in ms (default: 5000) */
  monitoringInterval: number;
  /** Enable forced garbage collection (default: true) */
  enableForcedGC: boolean;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: MemoryManagerConfig = {
  moderatePressureThreshold: 0.5,
  highPressureThreshold: 0.7,
  criticalPressureThreshold: 0.85,
  minChunkSize: 10,
  maxChunkSize: 1000,
  defaultChunkSize: 100,
  monitoringInterval: 5000,
  enableForcedGC: true
};

/**
 * Memory pressure event callback type
 */
export type MemoryPressureCallback = (event: MemoryPressureEvent) => void;

/**
 * Memory Manager for intelligent memory pressure detection and optimization
 */
export class MemoryManager {
  private config: MemoryManagerConfig;
  private callbacks: Set<MemoryPressureCallback> = new Set();
  private monitoringInterval: number | null = null;
  private lastMemoryInfo: MemoryInfo | null = null;
  private isMonitoring = false;
  private gcTimeoutId: number | null = null;

  constructor(config: Partial<MemoryManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    logger.debug('MemoryManager initialized', { config: this.config });
  }

  /**
   * Get current memory information
   */
  public getMemoryInfo(): MemoryInfo | null {
    try {
      // Check if Performance API with memory is available (Chrome/Chromium)
      if (typeof performance !== 'undefined' && hasPerformanceMemory(performance)) {
        const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = performance.memory;

        // Calculate usage percentage
        const usagePercentage = jsHeapSizeLimit > 0
          ? (usedJSHeapSize / jsHeapSizeLimit) * 100
          : 0;

        // Calculate available memory
        const availableMemory = Math.max(0, jsHeapSizeLimit - usedJSHeapSize);

        // Determine if device is memory constrained
        // Devices with < 100MB heap limit are considered constrained
        const isMemoryConstrained = jsHeapSizeLimit < 100 * 1024 * 1024;

        const memoryInfo: MemoryInfo = {
          usedJSHeapSize,
          totalJSHeapSize,
          jsHeapSizeLimit,
          usagePercentage,
          isMemoryConstrained,
          availableMemory
        };

        this.lastMemoryInfo = memoryInfo;
        return memoryInfo;
      }

      // Fallback: Try to estimate memory usage for non-Chrome browsers
      return this.estimateMemoryUsage();

    } catch (error: unknown) {
      logger.debug('Failed to get memory info', { error });
      return null;
    }
  }

  /**
   * Estimate memory usage for browsers without Performance.memory API
   */
  private estimateMemoryUsage(): MemoryInfo | null {
    try {
      // Use navigator.deviceMemory if available (Chrome 63+)
      if (hasDeviceMemory(navigator)) {
        const deviceMemory = navigator.deviceMemory;
        const estimatedLimit = deviceMemory * 1024 * 1024 * 1024 * 0.25; // 25% of device memory
        const estimatedUsed = estimatedLimit * 0.3; // Assume 30% usage

        return {
          usedJSHeapSize: estimatedUsed,
          totalJSHeapSize: estimatedUsed,
          jsHeapSizeLimit: estimatedLimit,
          usagePercentage: 30,
          isMemoryConstrained: deviceMemory < 4, // < 4GB RAM
          availableMemory: estimatedLimit - estimatedUsed
        };
      }

      // Last resort: Conservative estimates
      const conservativeLimit = 100 * 1024 * 1024; // 100MB
      return {
        usedJSHeapSize: conservativeLimit * 0.5,
        totalJSHeapSize: conservativeLimit * 0.5,
        jsHeapSizeLimit: conservativeLimit,
        usagePercentage: 50,
        isMemoryConstrained: true,
        availableMemory: conservativeLimit * 0.5
      };

    } catch (error: unknown) {
      logger.debug('Failed to estimate memory usage', { error });
      return null;
    }
  }

  /**
   * Determine current memory pressure level
   */
  public getMemoryPressureLevel(memoryInfo?: MemoryInfo): MemoryPressureLevel {
    const memory = memoryInfo || this.getMemoryInfo() || undefined;

    if (!memory) {
      // Conservative approach when memory info unavailable
      return MemoryPressureLevel.MODERATE;
    }

    const usage = memory.usagePercentage / 100;

    if (usage >= this.config.criticalPressureThreshold) {
      return MemoryPressureLevel.CRITICAL;
    } else if (usage >= this.config.highPressureThreshold) {
      return MemoryPressureLevel.HIGH;
    } else if (usage >= this.config.moderatePressureThreshold) {
      return MemoryPressureLevel.MODERATE;
    } else {
      return MemoryPressureLevel.LOW;
    }
  }

  /**
   * Calculate recommended chunk size based on memory pressure
   */
  public getRecommendedChunkSize(memoryInfo?: MemoryInfo): number {
    const memory = memoryInfo || this.getMemoryInfo() || undefined;
    const pressureLevel = this.getMemoryPressureLevel(memory);

    // Base chunk size calculation
    let chunkSize = this.config.defaultChunkSize;

    switch (pressureLevel) {
      case MemoryPressureLevel.LOW:
        // High memory available - use larger chunks for performance
        chunkSize = this.config.maxChunkSize;
        break;

      case MemoryPressureLevel.MODERATE:
        // Moderate pressure - use medium chunks
        chunkSize = Math.floor(this.config.maxChunkSize * 0.6);
        break;

      case MemoryPressureLevel.HIGH:
        // High pressure - use smaller chunks
        chunkSize = Math.floor(this.config.maxChunkSize * 0.3);
        break;

      case MemoryPressureLevel.CRITICAL:
        // Critical pressure - use minimum chunks
        chunkSize = this.config.minChunkSize;
        break;
    }

    // Additional adjustment for memory-constrained devices
    if (memory?.isMemoryConstrained) {
      chunkSize = Math.floor(chunkSize * 0.5);
    }

    // Ensure chunk size is within bounds
    return Math.max(
      this.config.minChunkSize,
      Math.min(this.config.maxChunkSize, chunkSize)
    );
  }

  /**
   * Determine if forced garbage collection should be triggered
   */
  public shouldForceGarbageCollection(memoryInfo?: MemoryInfo): boolean {
    if (!this.config.enableForcedGC) {
      return false;
    }

    const memory = memoryInfo || this.getMemoryInfo() || undefined;
    const pressureLevel = this.getMemoryPressureLevel(memory);

    // Force GC for high and critical pressure levels
    return pressureLevel === MemoryPressureLevel.HIGH ||
           pressureLevel === MemoryPressureLevel.CRITICAL;
  }

  /**
   * Force garbage collection if supported
   */
  public async forceGarbageCollection(): Promise<boolean> {
    try {
      // Check if manual GC is available (Chrome with --enable-precise-memory-info)
      if (typeof window !== 'undefined' && hasWindowGC(window)) {
        window.gc();
        logger.debug('Forced garbage collection executed');
        return true;
      }

      // Alternative: Create temporary memory pressure to encourage GC
      const tempArray = new Array(1000000).fill(null);
      tempArray.splice(0, tempArray.length);

      // Request idle callback to allow GC to run
      if ('requestIdleCallback' in window) {
        return new Promise((resolve, reject) => {
          // Add timeout to prevent hanging in test environments or CI
          const timeoutId = setTimeout(() => {
            logger.debug('RequestIdleCallback timeout, resolving GC attempt');
            resolve(false);
          }, 100); // 100ms timeout

          try {
            requestIdleCallback(() => {
              try {
                clearTimeout(timeoutId);
                logger.debug('Encouraged garbage collection via memory pressure');
                resolve(true);
              } catch (error: unknown) {
                clearTimeout(timeoutId);
                reject(error);
              }
            });
          } catch (error: unknown) {
            clearTimeout(timeoutId);
            reject(error);
          }
        });
      }

      return false;

    } catch (error: unknown) {
      logger.debug('Failed to force garbage collection', { error });
      return false;
    }
  }

  /**
   * Get suggested optimization actions for current memory state
   */
  public getSuggestedActions(memoryInfo?: MemoryInfo): string[] {
    const memory = memoryInfo || this.getMemoryInfo() || undefined;
    const pressureLevel = this.getMemoryPressureLevel(memory);
    const actions: string[] = [];

    switch (pressureLevel) {
      case MemoryPressureLevel.LOW:
        actions.push('Use larger batch sizes for optimal performance');
        break;

      case MemoryPressureLevel.MODERATE:
        actions.push('Reduce batch size moderately');
        actions.push('Monitor memory usage more frequently');
        break;

      case MemoryPressureLevel.HIGH:
        actions.push('Significantly reduce batch size');
        actions.push('Force garbage collection between batches');
        actions.push('Clear processed data immediately');
        break;

      case MemoryPressureLevel.CRITICAL:
        actions.push('Use minimum batch size');
        actions.push('Force garbage collection after each batch');
        actions.push('Consider pausing migration temporarily');
        actions.push('Clear all unnecessary references');
        break;
    }

    if (memory?.isMemoryConstrained) {
      actions.push('Device appears memory-constrained - use conservative settings');
    }

    return actions;
  }

  /**
   * Start monitoring memory pressure and trigger callbacks
   */
  public startMonitoring(): void {
    if (this.isMonitoring) {
      logger.debug('Memory monitoring already active');
      return;
    }

    // Skip monitoring in test environment unless explicitly needed
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test' && !process.env.FORCE_MEMORY_MONITORING) {
      logger.debug('Skipping memory monitoring in test environment');
      return;
    }

    this.isMonitoring = true;
    logger.debug('Starting memory pressure monitoring', {
      interval: this.config.monitoringInterval
    });

    this.monitoringInterval = setInterval(() => {
      this.checkMemoryPressure();
    }, this.config.monitoringInterval) as unknown as number;

    // Initial check
    this.checkMemoryPressure();
  }

  /**
   * Stop monitoring memory pressure
   */
  public stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    logger.debug('Stopped memory pressure monitoring');
  }

  /**
   * Check current memory pressure and notify callbacks
   */
  private checkMemoryPressure(): void {
    const memoryInfo = this.getMemoryInfo();

    if (!memoryInfo) {
      return;
    }

    const level = this.getMemoryPressureLevel(memoryInfo);
    const recommendedChunkSize = this.getRecommendedChunkSize(memoryInfo);
    const shouldForceGC = this.shouldForceGarbageCollection(memoryInfo);
    const suggestedActions = this.getSuggestedActions(memoryInfo);

    const event: MemoryPressureEvent = {
      level,
      memoryInfo,
      timestamp: Date.now(),
      recommendedChunkSize,
      shouldForceGC,
      suggestedActions
    };

    // Log significant pressure changes
    if (level === MemoryPressureLevel.HIGH || level === MemoryPressureLevel.CRITICAL) {
      logger.warn('High memory pressure detected', {
        level,
        usagePercentage: memoryInfo.usagePercentage.toFixed(1),
        availableMemory: Math.round(memoryInfo.availableMemory / 1024 / 1024),
        recommendedChunkSize
      });
    }

    // Notify all registered callbacks
    this.callbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error: unknown) {
        logger.error('Error in memory pressure callback', { error });
      }
    });
  }

  /**
   * Register callback for memory pressure events
   */
  public onMemoryPressure(callback: MemoryPressureCallback): () => void {
    this.callbacks.add(callback);

    logger.debug('Memory pressure callback registered', {
      totalCallbacks: this.callbacks.size
    });

    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
      logger.debug('Memory pressure callback unregistered', {
        totalCallbacks: this.callbacks.size
      });
    };
  }

  /**
   * Get current configuration
   */
  public getConfig(): MemoryManagerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<MemoryManagerConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.debug('Memory manager configuration updated', {
      updates,
      newConfig: this.config
    });
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.stopMonitoring();
    this.callbacks.clear();
    this.lastMemoryInfo = null;
    logger.debug('Memory manager cleaned up');
  }
}

/**
 * Global memory manager instance
 */
export const memoryManager = new MemoryManager();

/**
 * Convenience function to get current memory info
 */
export function getCurrentMemoryInfo(): MemoryInfo | null {
  return memoryManager.getMemoryInfo();
}

/**
 * Convenience function to get current memory pressure level
 */
export function getCurrentMemoryPressure(): MemoryPressureLevel {
  return memoryManager.getMemoryPressureLevel();
}

/**
 * Convenience function to get recommended chunk size
 */
export function getRecommendedChunkSize(): number {
  return memoryManager.getRecommendedChunkSize();
}

/**
 * Convenience function to force garbage collection
 */
export function forceGarbageCollection(): Promise<boolean> {
  return memoryManager.forceGarbageCollection();
}