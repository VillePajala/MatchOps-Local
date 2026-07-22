/**
 * Storage Mutex Manager Tests
 *
 * Tests the thread-safe mutex implementation for preventing concurrent
 * operations in the storage system.
 *
 * @author Claude Code
 */

import { MutexManager, MutexConfig } from './storageMutex';
import { StorageError, StorageErrorType } from './storageAdapter';

describe('MutexManager', () => {
  let mutex: MutexManager;

  beforeEach(() => {
    mutex = new MutexManager();
  });

  afterEach(async () => {
    // Force release to clean up any hanging locks
    mutex.forceRelease();

    // Wait for any pending promises to resolve
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  describe('Basic Mutex Operations', () => {
    /**
     * Tests basic acquire and release functionality
     * @critical
     */
    it('should acquire and release mutex successfully', async () => {
      expect(mutex.isLocked()).toBe(false);

      await mutex.acquire();
      expect(mutex.isLocked()).toBe(true);

      mutex.release();
      expect(mutex.isLocked()).toBe(false);
    });

    /**
     * Tests immediate acquisition when mutex is available
     * @integration
     */
    it('should acquire immediately when available', async () => {
      const startTime = Date.now();
      await mutex.acquire();
      const endTime = Date.now();

      // An uncontended acquire must not block on a timeout. A tight 10ms bound
      // flaked under CI event-loop stalls; a generous bound still proves it
      // returned promptly (nowhere near any timeout) without timing jitter.
      expect(endTime - startTime).toBeLessThan(1000);
      expect(mutex.isLocked()).toBe(true);

      mutex.release();
    });

    /**
     * Tests that multiple releases don't cause issues
     * @edge-case
     */
    it('should handle multiple releases gracefully', async () => {
      await mutex.acquire();
      expect(mutex.isLocked()).toBe(true);

      mutex.release();
      expect(mutex.isLocked()).toBe(false);

      // Second release should be safe
      mutex.release();
      expect(mutex.isLocked()).toBe(false);
    });

    /**
     * Documents the hazard that storage.ts call sites guard against: a caller whose
     * acquire() TIMED OUT must NOT call release(), because release() only short-circuits
     * when the mutex is fully free — while another owner holds it, a stray release()
     * hands that owner's lock to the next waiter. Callers therefore track an `acquired`
     * flag and only release when they actually acquired.
     * @edge-case
     */
    it('release() by a non-owner steals the current owners lock (callers must guard with an acquired flag)', async () => {
      // Owner acquires and holds the lock.
      await mutex.acquire();
      expect(mutex.isLocked()).toBe(true);

      // A second caller times out waiting (owner still holds it).
      await expect(mutex.acquire(10)).rejects.toThrow();
      expect(mutex.isLocked()).toBe(true); // owner still holds it

      // If that timed-out caller wrongly calls release(), it frees the OWNER's lock —
      // this is the corruption storage.ts avoids by only releasing what it acquired.
      mutex.release();
      expect(mutex.isLocked()).toBe(false);
    });
  });

  describe('Concurrent Access', () => {
    /**
     * Tests that second operation waits for first to complete
     * @critical
     */
    it('should queue operations when mutex is held', async () => {
      const operations: string[] = [];

      // First operation acquires mutex
      const promise1 = mutex.acquire().then(() => {
        operations.push('op1-acquired');
        return new Promise<void>(resolve => {
          setTimeout(() => {
            operations.push('op1-releasing');
            mutex.release();
            resolve();
          }, 50);
        });
      });

      // Second operation should wait
      const promise2 = mutex.acquire().then(() => {
        operations.push('op2-acquired');
        mutex.release();
      });

      await Promise.all([promise1, promise2]);

      expect(operations).toEqual([
        'op1-acquired',
        'op1-releasing',
        'op2-acquired'
      ]);
    });

    /**
     * Tests multiple operations queued in order
     * @integration
     */
    it('should process queued operations in order', async () => {
      const executionOrder: number[] = [];
      const operations: Promise<void>[] = [];

      // Create 5 operations that will queue up
      for (let i = 0; i < 5; i++) {
        const operation = mutex.acquire().then(() => {
          executionOrder.push(i);
          // Small delay to ensure order
          return new Promise<void>(resolve => {
            setTimeout(() => {
              mutex.release();
              resolve();
            }, 10);
          });
        });
        operations.push(operation);
      }

      await Promise.all(operations);
      expect(executionOrder).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe('Timeout Handling', () => {
    /**
     * Tests timeout behavior when mutex is held too long
     * @edge-case
     */
    it('should timeout when mutex is held beyond timeout', async () => {
      // Acquire mutex and hold it
      await mutex.acquire();

      // Second operation should timeout quickly
      await expect(
        mutex.acquire(100) // 100ms timeout
      ).rejects.toThrow(StorageError);

      expect(mutex.isLocked()).toBe(true); // First operation still holds it
      mutex.release();
    });

    /**
     * Tests custom timeout configuration
     * @integration
     */
    it('should respect custom timeout configuration', async () => {
      const customMutex = new MutexManager({ defaultTimeout: 50 });

      await customMutex.acquire();

      // The configured 50ms default timeout must make the contended acquire
      // REJECT (with StorageError) in ~50ms. `.rejects` also fixes the latent
      // silent-pass bug of the old try/catch (no rejection -> catch never ran ->
      // zero assertions). Generous upper bound absorbs CI jitter; the old 100ms
      // bound flaked. Lower bound is safe - timers never fire early.
      const startTime = Date.now();
      await expect(customMutex.acquire()).rejects.toBeInstanceOf(StorageError);
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(45);
      expect(elapsed).toBeLessThan(2000);

      customMutex.forceRelease();
    });

    /**
     * Tests timeout error contains correct information
     * @edge-case
     */
    it('should provide detailed timeout error information', async () => {
      await mutex.acquire();

      try {
        await mutex.acquire(200);
        fail('Should have thrown timeout error');
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).type).toBe(StorageErrorType.ACCESS_DENIED);
        expect((error as StorageError).message).toContain('Mutex acquisition timeout after 200ms');
      }

      mutex.release();
    });
  });

  describe('Queue Management', () => {
    /**
     * Tests queue length tracking
     * @integration
     */
    it('should track queue length accurately', async () => {
      await mutex.acquire();
      expect(mutex.getQueueLength()).toBe(0);

      // Start multiple operations that will queue
      const promise1 = mutex.acquire();
      expect(mutex.getQueueLength()).toBe(1);

      const promise2 = mutex.acquire();
      expect(mutex.getQueueLength()).toBe(2);

      const promise3 = mutex.acquire();
      expect(mutex.getQueueLength()).toBe(3);

      // Release original lock
      mutex.release();

      // Wait for first queued operation to complete
      await promise1;
      expect(mutex.getQueueLength()).toBe(2);

      mutex.release();
      await promise2;
      expect(mutex.getQueueLength()).toBe(1);

      mutex.release();
      await promise3;
      expect(mutex.getQueueLength()).toBe(0);

      mutex.release();
    });

    /**
     * Tests queue cleanup on timeout
     * @edge-case
     */
    it('should clean up queue when operations timeout', async () => {
      await mutex.acquire();

      // Start operations that will timeout
      const timeoutPromises = [
        mutex.acquire(50).catch(() => {}),
        mutex.acquire(50).catch(() => {}),
        mutex.acquire(50).catch(() => {})
      ];

      expect(mutex.getQueueLength()).toBe(3);

      await Promise.all(timeoutPromises);
      expect(mutex.getQueueLength()).toBe(0);

      mutex.release();
    });
  });

  describe('Statistics and Monitoring', () => {
    /**
     * Tests statistics tracking
     * @integration
     */
    it('should provide accurate statistics', async () => {
      const initialStats = mutex.getStats();
      expect(initialStats.isLocked).toBe(false);
      expect(initialStats.queueLength).toBe(0);
      expect(initialStats.acquiredAt).toBeNull();
      expect(initialStats.heldDuration).toBeNull();

      await mutex.acquire();

      // Add small delay to ensure heldDuration > 0
      await new Promise(resolve => setTimeout(resolve, 5));

      const acquiredStats = mutex.getStats();
      expect(acquiredStats.isLocked).toBe(true);
      expect(acquiredStats.queueLength).toBe(0);
      expect(acquiredStats.acquiredAt).toBeGreaterThan(0);
      expect(acquiredStats.heldDuration).toBeGreaterThanOrEqual(0);

      mutex.release();
      const releasedStats = mutex.getStats();
      expect(releasedStats.isLocked).toBe(false);
      expect(releasedStats.acquiredAt).toBeNull();
      expect(releasedStats.heldDuration).toBeNull();
    });

    /**
     * Tests held duration tracking
     * @performance
     */
    it('should track held duration accurately', async () => {
      // Measure REAL elapsed wall-clock and assert heldDuration against that,
      // rather than a hardcoded 90-150ms window. A fixed upper bound flaked
      // under CI event-loop stalls (the 100ms sleep can resolve much later, so
      // heldDuration overshoots 150). setTimeout never fires EARLY, so the
      // lower bound is safe; the upper bound now self-calibrates to actual time.
      const start = Date.now();
      await mutex.acquire();

      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = mutex.getStats();
      const actualElapsed = Date.now() - start;
      // Tracks wall-clock since acquire: at least the ~100ms we waited, and
      // never more than the real elapsed time (+ small clock-resolution margin).
      expect(stats.heldDuration).toBeGreaterThanOrEqual(90);
      expect(stats.heldDuration).toBeLessThanOrEqual(actualElapsed + 50);

      mutex.release();
    });
  });

  describe('Operation Tracking', () => {
    /**
     * Tests operation promise tracking
     * @integration
     */
    it('should track current operation promise', async () => {
      await mutex.acquire();

      const operationPromise = Promise.resolve('test-result');
      const trackedPromise = mutex.setCurrentOperation(operationPromise);

      expect(trackedPromise).toBe(operationPromise);

      const result = await trackedPromise;
      expect(result).toBe('test-result');

      mutex.release();
    });

    /**
     * Tests operation promise auto-cleanup
     * @integration
     */
    it('should auto-clean operation promise on completion', async () => {
      await mutex.acquire();

      let resolveOperation: (value: string) => void;
      const operationPromise = new Promise<string>(resolve => {
        resolveOperation = resolve;
      });

      mutex.setCurrentOperation(operationPromise);

      // Complete the operation
      resolveOperation!('completed');
      await operationPromise;

      // Promise should be cleaned up automatically
      mutex.release();
      expect(mutex.getStats().isLocked).toBe(false);
    });
  });

  describe('Force Release', () => {
    /**
     * Tests force release functionality
     * @edge-case
     */
    it('should force release and reject all waiting operations', async () => {
      await mutex.acquire();

      const rejectedPromises: Promise<void>[] = [];
      for (let i = 0; i < 3; i++) {
        rejectedPromises.push(
          mutex.acquire().catch(error => {
            expect(error).toBeInstanceOf(StorageError);
            expect((error as StorageError).message).toContain('Mutex force released');
          })
        );
      }

      expect(mutex.getQueueLength()).toBe(3);

      mutex.forceRelease();

      expect(mutex.isLocked()).toBe(false);
      expect(mutex.getQueueLength()).toBe(0);

      await Promise.all(rejectedPromises);
    });

    /**
     * Tests force release during normal operation
     * @edge-case
     */
    it('should handle force release during normal operation', async () => {
      await mutex.acquire();
      expect(mutex.isLocked()).toBe(true);

      mutex.forceRelease();
      expect(mutex.isLocked()).toBe(false);

      // Should be able to acquire normally after force release
      await mutex.acquire();
      expect(mutex.isLocked()).toBe(true);

      mutex.release();
      expect(mutex.isLocked()).toBe(false);
    });
  });

  describe('Configuration', () => {
    /**
     * Tests custom configuration options
     * @integration
     */
    it('should respect custom configuration', async () => {
      const config: MutexConfig = {
        defaultTimeout: 1000,
        enableDebugLogging: true
      };

      const customMutex = new MutexManager(config);

      await customMutex.acquire();
      expect(customMutex.isLocked()).toBe(true);

      customMutex.release();
      customMutex.forceRelease();
    });

    /**
     * Tests default configuration values
     * @integration
     */
    it('should use sensible defaults when no config provided', async () => {
      const defaultMutex = new MutexManager();

      await defaultMutex.acquire();

      // A per-call short timeout (100ms) must override the 5000ms default: the
      // second acquire should REJECT in ~100ms, not hang for the full default.
      // Using `.rejects` also fixes a latent bug in the old try/catch form -
      // if acquire did NOT reject, the catch never ran and the test passed with
      // zero assertions. The upper bound is generous (2000ms >> 100ms but <<
      // 5000ms default) so it proves the short timeout without flaking on CI
      // event-loop jitter the way the old tight 200ms bound did.
      const startTime = Date.now();
      await expect(defaultMutex.acquire(100)).rejects.toBeDefined();
      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(2000);

      defaultMutex.forceRelease();
    });
  });

  describe('Error Recovery', () => {
    /**
     * Tests recovery from timeout errors
     * @edge-case
     */
    it('should recover gracefully from timeout errors', async () => {
      await mutex.acquire();

      // Create operation that will timeout
      try {
        await mutex.acquire(50);
        fail('Should have timed out');
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
      }

      // Original mutex should still be locked
      expect(mutex.isLocked()).toBe(true);

      // Release and new operations should work normally
      mutex.release();
      expect(mutex.isLocked()).toBe(false);

      await mutex.acquire();
      expect(mutex.isLocked()).toBe(true);

      mutex.release();
    });

    /**
     * Tests recovery from force release
     * @edge-case
     */
    it('should recover normally after force release', async () => {
      await mutex.acquire();

      // Queue up some operations
      const promises = [
        mutex.acquire().catch(() => {}),
        mutex.acquire().catch(() => {}),
        mutex.acquire().catch(() => {})
      ];

      expect(mutex.getQueueLength()).toBe(3);

      mutex.forceRelease();
      await Promise.all(promises);

      // Should work normally after force release
      await mutex.acquire();
      expect(mutex.isLocked()).toBe(true);

      mutex.release();
      expect(mutex.isLocked()).toBe(false);
    });
  });
});