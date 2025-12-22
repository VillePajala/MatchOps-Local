/**
 * Lock Manager for preventing race conditions in concurrent operations
 * 
 * Simple, reliable implementation using promises and queues.
 */

export interface LockOptions {
  timeout?: number; // milliseconds
}

interface QueueItem {
  resolve: () => void;
  reject: (error: Error) => void;
  timeoutHandle: NodeJS.Timeout;
}

export class LockManager {
  private queues: Map<string, QueueItem[]> = new Map();
  private activeLocks: Set<string> = new Set();
  private readonly DEFAULT_TIMEOUT = 10000; // 10 seconds

  /**
   * Acquire a lock for the given resource
   * @param resource - Resource identifier
   * @param options - Lock options
   * @returns Function to release the lock
   */
  async acquire(resource: string, options: LockOptions = {}): Promise<() => void> {
    const { timeout = this.DEFAULT_TIMEOUT } = options;
    
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.removeFromQueue(resource, queueItem);
        reject(new Error(`Lock acquisition timeout for resource "${resource}"`));
      }, timeout);

      const queueItem: QueueItem = {
        resolve: () => {
          clearTimeout(timeoutHandle);
          resolve(() => this.release(resource));
        },
        reject: (error: Error) => {
          clearTimeout(timeoutHandle);
          reject(error);
        },
        timeoutHandle
      };

      if (!this.activeLocks.has(resource)) {
        // Resource is free, acquire immediately
        this.activeLocks.add(resource);
        queueItem.resolve();
      } else {
        // Resource is locked, add to queue
        const queue = this.queues.get(resource) || [];
        queue.push(queueItem);
        this.queues.set(resource, queue);
      }
    });
  }

  private release(resource: string): void {
    this.activeLocks.delete(resource);
    
    const queue = this.queues.get(resource);
    if (queue && queue.length > 0) {
      // Process next in queue
      const nextItem = queue.shift()!;
      this.activeLocks.add(resource);
      
      // Clean up queue if empty
      if (queue.length === 0) {
        this.queues.delete(resource);
      }
      
      // Resolve the next waiter
      nextItem.resolve();
    }
  }

  private removeFromQueue(resource: string, itemToRemove: QueueItem): void {
    const queue = this.queues.get(resource);
    if (queue) {
      const index = queue.indexOf(itemToRemove);
      if (index !== -1) {
        queue.splice(index, 1);
        if (queue.length === 0) {
          this.queues.delete(resource);
        }
      }
    }
  }

  /**
   * Execute an operation with a lock
   * @param resource - Resource identifier
   * @param operation - Operation to execute
   * @param options - Lock options
   * @returns Result of the operation
   */
  async withLock<T>(
    resource: string, 
    operation: () => Promise<T>, 
    options: LockOptions = {}
  ): Promise<T> {
    const release = await this.acquire(resource, options);
    
    try {
      return await operation();
    } finally {
      release();
    }
  }

  /**
   * Check if a resource is currently locked
   * @param resource - Resource identifier
   * @returns True if locked
   */
  isLocked(resource: string): boolean {
    return this.activeLocks.has(resource);
  }

  /**
   * Get the queue size for a resource
   * @param resource - Resource identifier
   * @returns Number of operations waiting for the lock
   */
  getQueueSize(resource: string): number {
    const queue = this.queues.get(resource);
    return queue ? queue.length : 0;
  }

  /**
   * Force release all locks (use with caution)
   * This should only be used in error recovery scenarios
   */
  forceReleaseAll(): void {
    // Clear all timeouts
    for (const queue of this.queues.values()) {
      for (const item of queue) {
        clearTimeout(item.timeoutHandle);
      }
    }
    
    this.queues.clear();
    this.activeLocks.clear();
  }
}

// Global lock manager instance
export const lockManager = new LockManager();

// Convenience function for roster operations
// Uses default timeout (10s) - sufficient for local IndexedDB operations
export const withRosterLock = <T>(operation: () => Promise<T>): Promise<T> => {
  return lockManager.withLock('roster_operations', operation);
};