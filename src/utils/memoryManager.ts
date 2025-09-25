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
  CRITICAL = 'critical', // 85-95% usage - emergency measures
  EMERGENCY = 'emergency' // > 95% usage - halt operation immediately
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
  /** Timeout for requestIdleCallback during GC in ms (default: 100) */
  gcTimeoutMs?: number;
  /** Minimum time between GC attempts in ms (default: 5000) */
  gcThrottleMs?: number;
}

/**
 * Configuration presets for different use cases
 * Makes it easier to configure without understanding all parameters
 */
export const MEMORY_CONFIG_PRESETS = {
  /**
   * Aggressive preset for maximum speed
   * Use when memory is plentiful and speed is priority
   */
  AGGRESSIVE: {
    moderatePressureThreshold: 0.6,
    highPressureThreshold: 0.8,
    criticalPressureThreshold: 0.95,
    minChunkSize: 100,
    maxChunkSize: 5000,
    defaultChunkSize: 500,
    monitoringInterval: 10000,  // Check less frequently
    enableForcedGC: false,       // Skip GC for speed
    gcTimeoutMs: 50,
    gcThrottleMs: 10000
  } as MemoryManagerConfig,

  /**
   * Conservative preset for memory-constrained devices
   * Use on mobile devices or older hardware
   */
  CONSERVATIVE: {
    moderatePressureThreshold: 0.4,
    highPressureThreshold: 0.6,
    criticalPressureThreshold: 0.75,
    minChunkSize: 5,
    maxChunkSize: 100,
    defaultChunkSize: 20,
    monitoringInterval: 2000,   // Check frequently
    enableForcedGC: true,        // Aggressively manage memory
    gcTimeoutMs: 200,
    gcThrottleMs: 2000
  } as MemoryManagerConfig,

  /**
   * Balanced preset for general use (default)
   * Good balance between speed and memory usage
   */
  BALANCED: {
    moderatePressureThreshold: 0.5,
    highPressureThreshold: 0.7,
    criticalPressureThreshold: 0.85,
    minChunkSize: 10,
    maxChunkSize: 1000,
    defaultChunkSize: 100,
    monitoringInterval: 5000,
    enableForcedGC: true,
    gcTimeoutMs: 100,
    gcThrottleMs: 5000
  } as MemoryManagerConfig,

  /**
   * Adaptive preset for battery-efficient operation
   * Adjusts monitoring based on device capabilities
   */
  ADAPTIVE: {
    moderatePressureThreshold: 0.5,
    highPressureThreshold: 0.7,
    criticalPressureThreshold: 0.85,
    minChunkSize: 10,
    maxChunkSize: 1000,
    defaultChunkSize: 100,
    monitoringInterval: 8000,   // Less frequent monitoring for battery
    enableForcedGC: true,
    gcTimeoutMs: 150,
    gcThrottleMs: 8000
  } as MemoryManagerConfig
};

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: MemoryManagerConfig = MEMORY_CONFIG_PRESETS.BALANCED;

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
  private callbackCleanupFunctions: Map<MemoryPressureCallback, () => void> = new Map();
  private monitoringInterval: number | null = null;
  private lastMemoryInfo: MemoryInfo | null = null;
  private isMonitoring = false;
  private gcTimeoutId: number | null = null;
  private lastGCAttempt = 0;
  private sizeEstimationCache: Map<string, number> = new Map();

  constructor(config: Partial<MemoryManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.validateConfig(this.config);
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
        const estimatedLimit = deviceMemory * 1024 * 1024 * 1024 * 0.20; // 20% of device memory (more conservative)
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

    // Emergency threshold: > 95% usage - immediate halt required
    if (usage >= 0.95) {
      return MemoryPressureLevel.EMERGENCY;
    } else if (usage >= this.config.criticalPressureThreshold) {
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
   * Force garbage collection with throttling and retry logic
   */
  public async forceGarbageCollection(retries = 3): Promise<boolean> {
    // Check throttling - prevent excessive GC calls
    const now = Date.now();
    const throttleMs = this.config.gcThrottleMs || 5000;
    if (now - this.lastGCAttempt < throttleMs) {
      logger.debug('GC attempt throttled', {
        timeSinceLastAttempt: now - this.lastGCAttempt,
        throttleMs
      });
      return false;
    }

    this.lastGCAttempt = now;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const success = await this.attemptGarbageCollection();
        if (success) {
          logger.debug(`GC succeeded on attempt ${attempt}`);
          return true;
        }

        // Wait between retries with exponential backoff
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        }
      } catch (error: unknown) {
        logger.debug(`GC attempt ${attempt} failed`, { error });
        if (attempt === retries) {
          logger.debug('All GC attempts failed', { error });
        }
      }
    }

    return false;
  }

  /**
   * Single garbage collection attempt
   */
  private async attemptGarbageCollection(): Promise<boolean> {
    try {
      // Check if manual GC is available (Chrome with --enable-precise-memory-info)
      if (typeof window !== 'undefined' && hasWindowGC(window)) {
        // CSP-safe environment check - only use window.gc in non-production
        try {
          // Avoid CSP violations in production environments
          const isProduction = process.env.NODE_ENV === 'production';
          const isSafeEnvironment = process.env.NODE_ENV === 'test' ||
                                   process.env.NODE_ENV === 'development';

          if (!isProduction && isSafeEnvironment && typeof window.gc === 'function') {
            window.gc();
            logger.debug('Forced garbage collection executed');
            return true;
          } else if (isProduction) {
            logger.debug('Skipping window.gc() in production to avoid CSP violations');
          }
        } catch (gcError: unknown) {
          // Silently handle CSP or security errors
          logger.debug('window.gc() blocked by CSP or security policy', { gcError });
        }
      }

      // Alternative: Create temporary memory pressure to encourage GC
      const tempArray = new Array(1000000).fill(null);
      tempArray.splice(0, tempArray.length);

      // Request idle callback to allow GC to run
      if ('requestIdleCallback' in window) {
        return new Promise((resolve, reject) => {
          const timeoutMs = this.config.gcTimeoutMs || 100;
          const timeoutId = setTimeout(() => {
            logger.debug('RequestIdleCallback timeout, resolving GC attempt');
            resolve(false);
          }, timeoutMs);

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

      case MemoryPressureLevel.EMERGENCY:
        actions.push('HALT MIGRATION IMMEDIATELY');
        actions.push('Force garbage collection');
        actions.push('Clear all data from memory');
        actions.push('Wait for memory recovery before resuming');
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
   * Register callback for memory pressure events with proper cleanup tracking
   */
  public onMemoryPressure(callback: MemoryPressureCallback): () => void {
    this.callbacks.add(callback);

    logger.debug('Memory pressure callback registered', {
      totalCallbacks: this.callbacks.size
    });

    // Create cleanup function
    const cleanup = () => {
      this.callbacks.delete(callback);
      this.callbackCleanupFunctions.delete(callback);
      logger.debug('Memory pressure callback unregistered', {
        totalCallbacks: this.callbacks.size
      });
    };

    // Store cleanup function for comprehensive cleanup
    this.callbackCleanupFunctions.set(callback, cleanup);

    // Return unsubscribe function
    return cleanup;
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
   * Comprehensive cleanup to prevent memory leaks
   */
  public cleanup(): void {
    this.stopMonitoring();

    // Clear all callbacks and their cleanup functions
    this.callbackCleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error: unknown) {
        logger.debug('Error during callback cleanup', { error });
      }
    });
    this.callbacks.clear();
    this.callbackCleanupFunctions.clear();

    // Clear caches and references
    this.sizeEstimationCache.clear();
    this.lastMemoryInfo = null;
    this.lastGCAttempt = 0;

    // Clear any pending timeouts
    if (this.gcTimeoutId) {
      clearTimeout(this.gcTimeoutId);
      this.gcTimeoutId = null;
    }

    logger.debug('Memory manager cleaned up');
  }

  /**
   * Validate configuration to prevent invalid settings
   */
  private validateConfig(config: MemoryManagerConfig): void {
    const {
      moderatePressureThreshold,
      highPressureThreshold,
      criticalPressureThreshold,
      minChunkSize,
      maxChunkSize,
      defaultChunkSize,
      monitoringInterval,
      gcThrottleMs
    } = config;

    // Validate threshold ordering and bounds
    if (moderatePressureThreshold < 0 || moderatePressureThreshold > 1) {
      throw new Error('moderatePressureThreshold must be between 0 and 1');
    }
    if (highPressureThreshold < 0 || highPressureThreshold > 1) {
      throw new Error('highPressureThreshold must be between 0 and 1');
    }
    if (criticalPressureThreshold < 0 || criticalPressureThreshold > 1) {
      throw new Error('criticalPressureThreshold must be between 0 and 1');
    }
    if (moderatePressureThreshold >= highPressureThreshold) {
      throw new Error('moderatePressureThreshold must be less than highPressureThreshold');
    }
    if (highPressureThreshold >= criticalPressureThreshold) {
      throw new Error('highPressureThreshold must be less than criticalPressureThreshold');
    }
    if (criticalPressureThreshold >= 0.95) {
      throw new Error('criticalPressureThreshold must be less than 0.95 for safety');
    }

    // Validate chunk sizes
    if (minChunkSize <= 0) {
      throw new Error('minChunkSize must be positive');
    }
    if (maxChunkSize <= minChunkSize) {
      throw new Error('maxChunkSize must be greater than minChunkSize');
    }
    if (defaultChunkSize < minChunkSize || defaultChunkSize > maxChunkSize) {
      throw new Error('defaultChunkSize must be between minChunkSize and maxChunkSize');
    }

    // Validate intervals
    if (monitoringInterval < 100 || monitoringInterval > 60000) {
      throw new Error('monitoringInterval must be between 100ms and 60000ms');
    }
    if (gcThrottleMs && (gcThrottleMs < 1000 || gcThrottleMs > 30000)) {
      throw new Error('gcThrottleMs must be between 1000ms and 30000ms');
    }

    logger.debug('Memory manager configuration validated successfully');
  }

  /**
   * Get cached size estimation or calculate and cache new one
   */
  public getEstimatedDataSize(data: string, cacheKey?: string): number {
    if (cacheKey && this.sizeEstimationCache.has(cacheKey)) {
      return this.sizeEstimationCache.get(cacheKey)!;
    }

    let size: number;
    try {
      // Primary method: Use TextEncoder for accurate UTF-8 byte length
      size = new TextEncoder().encode(data).byteLength;
    } catch (error: unknown) {
      try {
        // Fallback 1: Use Blob API for size calculation
        const blob = new Blob([data]);
        size = blob.size;
      } catch (blobError) {
        // Fallback 2: More accurate estimation based on UTF-16 encoding
        // Account for actual character encoding complexity
        logger.debug('Using improved string length estimation fallback', {
          error,
          blobError,
          dataLength: data.length
        });

        // Calculate more accurate size estimation
        // JSON.stringify adds overhead for escaping and structure
        try {
          size = JSON.stringify(data).length * 2.1; // Account for UTF-16 with overhead
        } catch (jsonError) {
          // Ultimate fallback: Conservative overestimate
          size = data.length * 3; // Conservative 3 bytes per character
          logger.warn('Using conservative size estimation', { jsonError });
        }
      }
    }

    // Apply safety multiplier for conservative estimates
    const conservativeSize = Math.round(size * 1.2);

    // Cache the result if cache key provided
    if (cacheKey) {
      this.sizeEstimationCache.set(cacheKey, conservativeSize);

      // Limit cache size to prevent memory issues
      if (this.sizeEstimationCache.size > 1000) {
        const firstKey = this.sizeEstimationCache.keys().next().value;
        if (firstKey !== undefined) {
          this.sizeEstimationCache.delete(firstKey);
        }
      }
    }

    return conservativeSize;
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