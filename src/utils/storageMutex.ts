/**
 * Storage Mutex Manager
 *
 * Provides thread-safe mutex implementation for preventing concurrent
 * operations in the storage system. Extracted from StorageFactory to
 * simplify adapter creation logic and improve maintainability.
 *
 * Features:
 * - Timeout-protected mutex acquisition
 * - Promise-based queue for waiting operations
 * - Automatic cleanup on timeout
 * - Debug logging for troubleshooting
 *
 * @author Claude Code
 */

import { createLogger } from './logger';
import { StorageError, StorageErrorType } from './storageAdapter';

/**
 * Result of mutex acquisition attempt
 */
export interface MutexAcquisitionResult {
  acquired: boolean;
  timedOut?: boolean;
  error?: Error;
}

/**
 * Configuration for mutex behavior
 */
export interface MutexConfig {
  defaultTimeout?: number;
  enableDebugLogging?: boolean;
  maxQueueSize?: number;
}

/**
 * Manages mutual exclusion for storage operations
 *
 * Prevents race conditions during critical operations like adapter creation
 * by ensuring only one operation can proceed at a time.
 *
 * @example
 * ```typescript
 * const mutex = new MutexManager();
 *
 * await mutex.acquire(5000);
 * try {
 *   // Critical section - only one operation at a time
 *   await performCriticalOperation();
 * } finally {
 *   mutex.release();
 * }
 * ```
 */
export class MutexManager {
  private static readonly DEFAULT_TIMEOUT_MS = 5000;
  private static readonly DEFAULT_MAX_QUEUE_SIZE = 100;

  private readonly logger = createLogger('MutexManager');
  private readonly defaultTimeout: number;
  private readonly debugLogging: boolean;
  private readonly maxQueueSize: number;

  private currentOperation: Promise<unknown> | null = null;
  private waitQueue: Array<{
    resolve: (value: void) => void;
    reject: (error: Error) => void;
  }> = [];

  private isAcquired = false;
  private acquiredAt: number | null = null;
  private timeoutHandle: NodeJS.Timeout | null = null;

  /**
   * Creates a new mutex manager instance
   *
   * @param config Optional configuration for mutex behavior
   */
  constructor(config?: MutexConfig) {
    this.defaultTimeout = config?.defaultTimeout ?? MutexManager.DEFAULT_TIMEOUT_MS;
    this.debugLogging = config?.enableDebugLogging ?? false;
    this.maxQueueSize = config?.maxQueueSize ?? MutexManager.DEFAULT_MAX_QUEUE_SIZE;
  }

  /**
   * Acquire the mutex with optional timeout
   *
   * If the mutex is already held, this will wait until it's released
   * or the timeout expires.
   *
   * @param timeout Maximum time to wait in milliseconds
   * @returns Promise that resolves when mutex is acquired
   * @throws {StorageError} If timeout is exceeded
   */
  async acquire(timeout?: number): Promise<void> {
    const effectiveTimeout = timeout ?? this.defaultTimeout;

    if (this.debugLogging) {
      this.logger.debug('Attempting to acquire mutex', {
        timeout: effectiveTimeout,
        isAcquired: this.isAcquired,
        queueLength: this.waitQueue.length
      });
    }

    // Fast path: mutex is available
    if (!this.isAcquired && !this.currentOperation) {
      this.doAcquire();
      return;
    }

    // Slow path: need to wait for mutex
    return this.waitForMutex(effectiveTimeout);
  }

  /**
   * Wait for mutex to become available with timeout protection
   */
  private async waitForMutex(timeout: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | null = null;
      let resolved = false;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        // Remove from wait queue if still present
        const index = this.waitQueue.findIndex(item =>
          item.resolve === resolveWrapper && item.reject === rejectWrapper
        );
        if (index >= 0) {
          this.waitQueue.splice(index, 1);
        }
      };

      const resolveWrapper = (value: void) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(value);
        }
      };

      const rejectWrapper = (error: Error) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(error);
        }
      };

      // Check queue size limit to prevent unbounded growth
      if (this.waitQueue.length >= this.maxQueueSize) {
        const error = new StorageError(
          StorageErrorType.ACCESS_DENIED,
          `Mutex wait queue full (${this.maxQueueSize} operations waiting)`,
          new Error('Queue capacity exceeded')
        );
        this.logger.error('Mutex wait queue exceeded maximum size', {
          queueSize: this.waitQueue.length,
          maxQueueSize: this.maxQueueSize
        });
        reject(error);
        return;
      }

      // Add to wait queue
      this.waitQueue.push({
        resolve: resolveWrapper,
        reject: rejectWrapper
      });

      // Set timeout
      timeoutId = setTimeout(() => {
        if (!resolved) {
          const error = new StorageError(
            StorageErrorType.ACCESS_DENIED,
            `Mutex acquisition timeout after ${timeout}ms`,
            new Error('Mutex timeout')
          );

          if (this.debugLogging) {
            this.logger.debug('Mutex acquisition timed out', {
              timeout,
              queueLength: this.waitQueue.length
            });
          }

          rejectWrapper(error);
        }
      }, timeout);

      // If mutex is currently free (race condition check), acquire immediately
      if (!this.isAcquired && !this.currentOperation) {
        this.processNextInQueue();
      }
    });
  }

  /**
   * Internal method to acquire the mutex
   */
  private doAcquire(): void {
    this.isAcquired = true;
    this.acquiredAt = Date.now();

    if (this.debugLogging) {
      this.logger.debug('Mutex acquired', {
        acquiredAt: this.acquiredAt,
        queueLength: this.waitQueue.length
      });
    }
  }

  /**
   * Release the mutex
   *
   * Allows the next waiting operation to proceed.
   */
  release(): void {
    if (!this.isAcquired) {
      if (this.debugLogging) {
        this.logger.debug('Attempted to release mutex that was not acquired');
      }
      return;
    }

    const heldDuration = this.acquiredAt ? Date.now() - this.acquiredAt : 0;

    this.isAcquired = false;
    this.acquiredAt = null;
    this.currentOperation = null;

    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    if (this.debugLogging) {
      this.logger.debug('Mutex released', {
        heldDuration,
        queueLength: this.waitQueue.length
      });
    }

    // Process next waiting operation
    this.processNextInQueue();
  }

  /**
   * Process the next operation waiting in the queue
   */
  private processNextInQueue(): void {
    if (this.waitQueue.length === 0) {
      return;
    }

    if (this.isAcquired) {
      return;
    }

    const next = this.waitQueue.shift();
    if (next) {
      this.doAcquire();
      next.resolve();
    }
  }

  /**
   * Check if the mutex is currently held
   *
   * @returns true if mutex is acquired, false otherwise
   */
  isLocked(): boolean {
    return this.isAcquired;
  }

  /**
   * Get the number of operations waiting for the mutex
   *
   * @returns Number of waiting operations
   */
  getQueueLength(): number {
    return this.waitQueue.length;
  }

  /**
   * Get statistics about mutex usage
   *
   * @returns Object containing mutex statistics
   */
  getStats(): {
    isLocked: boolean;
    queueLength: number;
    acquiredAt: number | null;
    heldDuration: number | null;
  } {
    return {
      isLocked: this.isAcquired,
      queueLength: this.waitQueue.length,
      acquiredAt: this.acquiredAt,
      heldDuration: this.acquiredAt ? Date.now() - this.acquiredAt : null
    };
  }

  /**
   * Force release of the mutex (use with caution)
   *
   * This should only be used in error recovery scenarios where
   * the normal release mechanism has failed.
   */
  forceRelease(): void {
    if (this.debugLogging) {
      this.logger.warn('Force releasing mutex', this.getStats());
    }

    // Reject all waiting operations
    const error = new StorageError(
      StorageErrorType.ACCESS_DENIED,
      'Mutex force released',
      new Error('Forced mutex release')
    );

    while (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift();
      waiter?.reject(error);
    }

    // Reset state
    this.isAcquired = false;
    this.acquiredAt = null;
    this.currentOperation = null;

    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  /**
   * Set an operation promise to track
   *
   * This allows the mutex to track when an async operation completes
   * and automatically release if needed.
   *
   * @param operation Promise representing the operation
   */
  setCurrentOperation<T>(operation: Promise<T>): Promise<T> {
    this.currentOperation = operation;

    // Auto-release on completion
    operation.finally(() => {
      if (this.currentOperation === operation) {
        this.currentOperation = null;
        if (!this.isAcquired) {
          // Operation completed but mutex was already released
          this.processNextInQueue();
        }
      }
    });

    return operation;
  }
}

/**
 * Default mutex instance for convenience
 */
export const defaultMutex = new MutexManager();