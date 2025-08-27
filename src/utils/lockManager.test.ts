import { LockManager, withRosterLock } from './lockManager';

describe('LockManager', () => {
  let lockManager: LockManager;

  beforeEach(() => {
    lockManager = new LockManager();
  });

  afterEach(() => {
    // Clean up any remaining locks
    lockManager.forceReleaseAll();
  });

  describe('basic lock operations', () => {
    it('should acquire and release locks properly', async () => {
      const resource = 'test-resource';
      expect(lockManager.isLocked(resource)).toBe(false);

      const release = await lockManager.acquire(resource);
      expect(lockManager.isLocked(resource)).toBe(true);

      release();
      
      // Wait a tick for cleanup
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(lockManager.isLocked(resource)).toBe(false);
    });

    it('should prevent concurrent access to the same resource', async () => {
      const resource = 'test-resource';
      const results: number[] = [];
      const delay = 50;

      const operation = async (value: number) => {
        return lockManager.withLock(resource, async () => {
          results.push(value);
          await new Promise(resolve => setTimeout(resolve, delay));
          return value;
        });
      };

      // Start three operations concurrently
      const promises = [
        operation(1),
        operation(2),
        operation(3)
      ];

      await Promise.all(promises);

      // Results should be in sequential order due to locking
      expect(results).toEqual([1, 2, 3]);
    });

    it('should allow concurrent access to different resources', async () => {
      const results: string[] = [];
      const delay = 50;

      const operation = async (resource: string, value: string) => {
        return lockManager.withLock(resource, async () => {
          await new Promise(resolve => setTimeout(resolve, delay));
          results.push(value);
          return value;
        });
      };

      const startTime = Date.now();
      
      // Start operations on different resources concurrently
      await Promise.all([
        operation('resource-1', 'a'),
        operation('resource-2', 'b'),
        operation('resource-3', 'c')
      ]);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should complete in roughly the time of one operation (since they're concurrent)
      // Allow some buffer for test timing variations
      expect(totalTime).toBeLessThan(delay * 2);
      
      // All operations should have completed
      expect(results).toHaveLength(3);
      expect(results).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    });
  });

  describe('queue management', () => {
    it('should queue operations waiting for the same resource', async () => {
      const resource = 'test-resource';
      let operationsStarted = 0;
      let operationsCompleted = 0;

      const operation = async (id: number) => {
        return lockManager.withLock(resource, async () => {
          operationsStarted++;
          await new Promise(resolve => setTimeout(resolve, 30));
          operationsCompleted++;
          return id;
        });
      };

      // Start multiple operations
      const promises = [
        operation(1),
        operation(2),
        operation(3),
        operation(4)
      ];

      // Give first operation time to start
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should have queue of 3 waiting operations
      expect(lockManager.getQueueSize(resource)).toBe(3);
      expect(operationsStarted).toBe(1);
      expect(operationsCompleted).toBe(0);

      // Wait for all to complete
      const results = await Promise.all(promises);
      
      expect(results).toEqual([1, 2, 3, 4]);
      expect(operationsCompleted).toBe(4);
      expect(lockManager.getQueueSize(resource)).toBe(0);
    });

    it('should process queue in FIFO order', async () => {
      const resource = 'test-resource';
      const completionOrder: number[] = [];

      const operation = async (id: number) => {
        return lockManager.withLock(resource, async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          completionOrder.push(id);
          return id;
        });
      };

      // Start operations in specific order
      const promises = [
        operation(1),
        operation(2),
        operation(3),
        operation(4),
        operation(5)
      ];

      await Promise.all(promises);
      
      // Should complete in the same order they were started
      expect(completionOrder).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('error handling', () => {
    it('should release lock even if operation throws', async () => {
      const resource = 'test-resource';
      
      const failingOperation = lockManager.withLock(resource, async () => {
        throw new Error('Test error');
      });

      await expect(failingOperation).rejects.toThrow('Test error');
      
      // Lock should be released
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(lockManager.isLocked(resource)).toBe(false);
    });

    it('should allow subsequent operations after one fails', async () => {
      const resource = 'test-resource';
      const results: string[] = [];

      // First operation fails
      const failingOperation = lockManager.withLock(resource, async () => {
        throw new Error('First operation failed');
      });

      // Second operation succeeds
      const successfulOperation = lockManager.withLock(resource, async () => {
        results.push('success');
        return 'ok';
      });

      await expect(failingOperation).rejects.toThrow('First operation failed');
      await expect(successfulOperation).resolves.toBe('ok');
      
      expect(results).toEqual(['success']);
    });

    it('should timeout if lock cannot be acquired within timeout period', async () => {
      const resource = 'test-resource';
      const shortTimeout = 100;

      // Acquire lock and hold it
      const release = await lockManager.acquire(resource);
      
      // Try to acquire with short timeout
      const timedOutAcquisition = lockManager.acquire(resource, { 
        timeout: shortTimeout,
        maxRetries: 0 // Disable retries for this test
      });

      await expect(timedOutAcquisition).rejects.toThrow(/timeout/i);
      
      // Clean up
      release();
    }, 10000);

    it('should handle timeout scenarios', async () => {
      const resource = 'test-resource';
      
      // Acquire lock and hold it
      const release = await lockManager.acquire(resource);
      
      // Try to acquire with very short timeout
      const shortTimeoutPromise = lockManager.acquire(resource, { timeout: 50 });
      
      await expect(shortTimeoutPromise).rejects.toThrow(/timeout/i);
      
      // Original lock should still be held
      expect(lockManager.isLocked(resource)).toBe(true);
      
      release();
      
      // Wait a tick for cleanup
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(lockManager.isLocked(resource)).toBe(false);
    });
  });

  describe('roster lock integration', () => {
    it('should use withRosterLock for roster operations', async () => {
      const results: number[] = [];

      const rosterOperation = async (value: number) => {
        return withRosterLock(async () => {
          results.push(value);
          await new Promise(resolve => setTimeout(resolve, 20));
          return value;
        });
      };

      await Promise.all([
        rosterOperation(1),
        rosterOperation(2),
        rosterOperation(3)
      ]);

      expect(results).toEqual([1, 2, 3]);
    });
  });

  describe('force release', () => {
    it('should force release all locks', async () => {
      const resource1 = 'resource-1';
      const resource2 = 'resource-2';

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _release1 = await lockManager.acquire(resource1);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _release2 = await lockManager.acquire(resource2);

      expect(lockManager.isLocked(resource1)).toBe(true);
      expect(lockManager.isLocked(resource2)).toBe(true);

      lockManager.forceReleaseAll();

      expect(lockManager.isLocked(resource1)).toBe(false);
      expect(lockManager.isLocked(resource2)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid acquire/release cycles', async () => {
      const resource = 'test-resource';
      const operations = 50;
      const results: number[] = [];

      const rapidOperations = Array.from({ length: operations }, (_, i) => 
        lockManager.withLock(resource, async () => {
          results.push(i);
          // Very short operation
          await new Promise(resolve => setTimeout(resolve, 1));
          return i;
        })
      );

      const allResults = await Promise.all(rapidOperations);

      expect(allResults).toHaveLength(operations);
      expect(results).toHaveLength(operations);
      
      // All operations should have completed
      const expectedResults = Array.from({ length: operations }, (_, i) => i);
      expect(results).toEqual(expectedResults);
    });

    it('should handle zero-delay operations', async () => {
      const resource = 'test-resource';
      const results: number[] = [];

      const instantOperation = (value: number) => {
        return lockManager.withLock(resource, async () => {
          results.push(value);
          return value;
        });
      };

      await Promise.all([
        instantOperation(1),
        instantOperation(2),
        instantOperation(3)
      ]);

      expect(results).toEqual([1, 2, 3]);
    });
  });
});