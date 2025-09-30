/**
 * Storage Performance Metrics
 *
 * Provides comprehensive performance monitoring for storage operations.
 * Tracks latencies, throughput, error rates, and other key metrics to
 * enable observability and performance optimization.
 *
 * Features:
 * - Operation latency tracking (p50, p95, p99)
 * - Throughput measurement (operations per second)
 * - Error rate monitoring by type
 * - Cache hit/miss ratio tracking
 * - Database connection timing
 * - Sliding window for real-time metrics
 *
 * @author Claude Code
 */

import { createLogger } from './logger';
import { StorageErrorType } from './storageAdapter';

/**
 * Types of storage operations to track
 */
export enum OperationType {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete',
  CLEAR = 'clear',
  GET_KEYS = 'getKeys',
  ADAPTER_CREATE = 'adapterCreate',
  DB_CONNECT = 'dbConnect',
  DB_TRANSACTION = 'dbTransaction',
  CACHE_HIT = 'cacheHit',
  CACHE_MISS = 'cacheMiss'
}

/**
 * Single operation timing record
 */
export interface OperationTiming {
  operation: OperationType;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  error?: string;
  errorType?: StorageErrorType;
  metadata?: Record<string, unknown>;
}

/**
 * Timer for tracking individual operations
 */
export class OperationTimer {
  private readonly startTime: number;
  private endTime?: number;
  private metadata: Record<string, unknown> = {};

  constructor(
    private readonly operation: OperationType,
    private readonly onComplete: (timing: OperationTiming) => void
  ) {
    this.startTime = performance.now();
  }

  /**
   * Mark the operation as completed successfully
   */
  success(metadata?: Record<string, unknown>): void {
    if (this.endTime) return; // Already completed

    this.endTime = performance.now();
    this.onComplete({
      operation: this.operation,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.endTime - this.startTime,
      success: true,
      metadata: { ...this.metadata, ...metadata }
    });
  }

  /**
   * Mark the operation as failed
   */
  failure(error: string, errorType?: StorageErrorType, metadata?: Record<string, unknown>): void {
    if (this.endTime) return; // Already completed

    this.endTime = performance.now();
    this.onComplete({
      operation: this.operation,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.endTime - this.startTime,
      success: false,
      error,
      errorType,
      metadata: { ...this.metadata, ...metadata }
    });
  }

  /**
   * Add metadata to the operation
   */
  addMetadata(key: string, value: unknown): void {
    this.metadata[key] = value;
  }

  /**
   * Get the elapsed time without completing the operation
   */
  getElapsedTime(): number {
    return performance.now() - this.startTime;
  }
}

/**
 * Aggregated metrics snapshot
 */
export interface MetricsSnapshot {
  timestamp: number;
  windowDuration: number;
  operations: {
    total: number;
    successful: number;
    failed: number;
    byType: Record<OperationType, number>;
  };
  latency: {
    mean: number;
    median: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
  };
  throughput: {
    opsPerSecond: number;
    bytesPerSecond?: number;
  };
  errors: {
    total: number;
    rate: number;
    byType: Record<string, number>;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  database: {
    connections: number;
    avgConnectionTime: number;
    activeTransactions: number;
  };
}

/**
 * Storage metrics collector and analyzer
 */
export class StorageMetrics {
  private static readonly WINDOW_SIZE_MS = 60000; // 1 minute sliding window
  private static readonly MAX_HISTORY_SIZE = 1000; // Optimized for 2-minute sliding window (reduced from 10000 for better memory efficiency)

  private readonly logger = createLogger('StorageMetrics');
  private readonly operations: OperationTiming[] = [];
  private readonly activeTimers = new Map<string, OperationTimer>();

  // Cache metrics
  private cacheHits = 0;
  private cacheMisses = 0;

  // Database metrics
  private dbConnections = 0;
  private activeTransactions = 0;

  constructor() {
    // Periodically clean old operations
    setInterval(() => this.cleanOldOperations(), StorageMetrics.WINDOW_SIZE_MS);
  }

  /**
   * Start tracking a new operation
   *
   * @param operation Type of operation to track
   * @param id Optional identifier for the operation
   * @returns OperationTimer to track the operation
   */
  startOperation(operation: OperationType, id?: string): OperationTimer {
    const timer = new OperationTimer(operation, (timing) => {
      this.recordTiming(timing);

      // Remove from active timers if tracked
      if (id) {
        this.activeTimers.delete(id);
      }
    });

    // Track active timer if ID provided
    if (id) {
      this.activeTimers.set(id, timer);
    }

    // Update specific counters
    if (operation === OperationType.DB_CONNECT) {
      this.dbConnections++;
    } else if (operation === OperationType.DB_TRANSACTION) {
      this.activeTransactions++;
    }

    return timer;
  }

  /**
   * Record a completed operation timing
   */
  private recordTiming(timing: OperationTiming): void {
    this.operations.push(timing);

    // Update cache metrics
    if (timing.operation === OperationType.CACHE_HIT) {
      this.cacheHits++;
    } else if (timing.operation === OperationType.CACHE_MISS) {
      this.cacheMisses++;
    }

    // Update transaction counter
    if (timing.operation === OperationType.DB_TRANSACTION) {
      this.activeTransactions = Math.max(0, this.activeTransactions - 1);
    }

    // Limit history size with warning when approaching capacity
    if (this.operations.length > StorageMetrics.MAX_HISTORY_SIZE) {
      this.operations.shift();

      // Warn periodically if consistently at capacity (indicates high load)
      if (this.operations.length % 100 === 0) {
        this.logger.warn('Metrics array at capacity, indicating high operation rate', {
          capacity: StorageMetrics.MAX_HISTORY_SIZE,
          currentSize: this.operations.length,
          windowSize: StorageMetrics.WINDOW_SIZE_MS
        });
      }
    }
  }

  /**
   * Record a simple latency measurement
   *
   * @param operation Type of operation
   * @param duration Duration in milliseconds
   * @param success Whether operation succeeded
   */
  recordLatency(
    operation: OperationType,
    duration: number,
    success: boolean = true,
    metadata?: Record<string, unknown>
  ): void {
    const now = performance.now();
    this.recordTiming({
      operation,
      startTime: now - duration,
      endTime: now,
      duration,
      success,
      metadata
    });
  }

  /**
   * Record a cache hit
   */
  recordCacheHit(): void {
    this.cacheHits++;
  }

  /**
   * Record a cache miss
   */
  recordCacheMiss(): void {
    this.cacheMisses++;
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): MetricsSnapshot {
    const now = performance.now();
    const windowStart = now - StorageMetrics.WINDOW_SIZE_MS;

    // Filter operations within the window
    const recentOps = this.operations.filter(op =>
      op.startTime >= windowStart
    );

    // Calculate operation counts
    const totalOps = recentOps.length;
    const successfulOps = recentOps.filter(op => op.success).length;
    const failedOps = totalOps - successfulOps;

    // Count by type
    const opsByType: Record<string, number> = {};
    for (const op of recentOps) {
      opsByType[op.operation] = (opsByType[op.operation] || 0) + 1;
    }

    // Calculate latencies
    const latencies = recentOps
      .filter(op => op.duration !== undefined)
      .map(op => op.duration!)
      .sort((a, b) => a - b);

    const latencyStats = this.calculateLatencyStats(latencies);

    // Calculate throughput
    const windowDurationSeconds = StorageMetrics.WINDOW_SIZE_MS / 1000;
    const opsPerSecond = totalOps / windowDurationSeconds;

    // Calculate error metrics
    const errors = recentOps.filter(op => !op.success);
    const errorsByType: Record<string, number> = {};
    for (const error of errors) {
      const type = error.errorType || 'unknown';
      errorsByType[type] = (errorsByType[type] || 0) + 1;
    }
    const errorRate = totalOps > 0 ? failedOps / totalOps : 0;

    // Calculate cache hit rate
    const totalCacheOps = this.cacheHits + this.cacheMisses;
    const cacheHitRate = totalCacheOps > 0 ? this.cacheHits / totalCacheOps : 0;

    // Calculate average connection time
    const connectionOps = recentOps.filter(op =>
      op.operation === OperationType.DB_CONNECT && op.duration
    );
    const avgConnectionTime = connectionOps.length > 0
      ? connectionOps.reduce((sum, op) => sum + op.duration!, 0) / connectionOps.length
      : 0;

    return {
      timestamp: now,
      windowDuration: StorageMetrics.WINDOW_SIZE_MS,
      operations: {
        total: totalOps,
        successful: successfulOps,
        failed: failedOps,
        byType: opsByType as Record<OperationType, number>
      },
      latency: latencyStats,
      throughput: {
        opsPerSecond
      },
      errors: {
        total: errors.length,
        rate: errorRate,
        byType: errorsByType
      },
      cache: {
        hits: this.cacheHits,
        misses: this.cacheMisses,
        hitRate: cacheHitRate
      },
      database: {
        connections: this.dbConnections,
        avgConnectionTime,
        activeTransactions: this.activeTransactions
      }
    };
  }

  /**
   * Calculate latency statistics from sorted array
   */
  private calculateLatencyStats(sortedLatencies: number[]): MetricsSnapshot['latency'] {
    if (sortedLatencies.length === 0) {
      return {
        mean: 0,
        median: 0,
        p95: 0,
        p99: 0,
        min: 0,
        max: 0
      };
    }

    const sum = sortedLatencies.reduce((a, b) => a + b, 0);
    const mean = sum / sortedLatencies.length;

    const median = this.getPercentile(sortedLatencies, 50);
    const p95 = this.getPercentile(sortedLatencies, 95);
    const p99 = this.getPercentile(sortedLatencies, 99);

    return {
      mean,
      median,
      p95,
      p99,
      min: sortedLatencies[0],
      max: sortedLatencies[sortedLatencies.length - 1]
    };
  }

  /**
   * Get percentile value from sorted array
   */
  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;

    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  /**
   * Clean operations outside the sliding window
   */
  private cleanOldOperations(): void {
    const now = performance.now();
    const cutoff = now - StorageMetrics.WINDOW_SIZE_MS * 2; // Keep 2x window for history

    // Clean old operations
    const keepIndex = this.operations.findIndex(op => op.startTime >= cutoff);

    if (keepIndex > 0) {
      this.operations.splice(0, keepIndex);
      this.logger.debug(`Cleaned ${keepIndex} old operations, ${this.operations.length} remaining`);
    }
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.operations.length = 0;
    this.activeTimers.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.dbConnections = 0;
    this.activeTransactions = 0;
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics(): {
    snapshot: MetricsSnapshot;
    history: OperationTiming[];
  } {
    return {
      snapshot: this.getMetrics(),
      history: [...this.operations]
    };
  }

  /**
   * Log current metrics summary
   */
  logSummary(): void {
    const metrics = this.getMetrics();

    this.logger.info('Storage Metrics Summary', {
      operations: `${metrics.operations.successful}/${metrics.operations.total} successful`,
      latency: `p50=${metrics.latency.median.toFixed(2)}ms, p95=${metrics.latency.p95.toFixed(2)}ms, p99=${metrics.latency.p99.toFixed(2)}ms`,
      throughput: `${metrics.throughput.opsPerSecond.toFixed(2)} ops/sec`,
      errors: `${(metrics.errors.rate * 100).toFixed(2)}% error rate`,
      cache: `${(metrics.cache.hitRate * 100).toFixed(2)}% hit rate`
    });
  }
}

/**
 * Global metrics instance
 */
export const storageMetrics = new StorageMetrics();