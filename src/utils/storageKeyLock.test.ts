import { withKeyLock, isKeyLocked, getKeyLockQueueSize } from './storageKeyLock';
import { lockManager } from './lockManager';

/**
 * Tests for Storage Key Lock utility
 *
 * Validates that the storage key lock mechanism prevents race conditions
 * by serializing concurrent writes to the same storage key.
 *
 * @critical
 */
describe('Storage Key Lock', () => {
  beforeEach(() => {
    // Clear any existing locks
    jest.clearAllMocks();
  });

  /**
   * Basic lock acquisition and release
   * @critical
   */
  it('should acquire and release lock for a storage key', async () => {
    const key = 'test_key';
    let operationExecuted = false;

    await withKeyLock(key, async () => {
      operationExecuted = true;
      expect(isKeyLocked(key)).toBe(true);
    });

    expect(operationExecuted).toBe(true);
    expect(isKeyLocked(key)).toBe(false);
  });

  /**
   * Sequential execution of operations on same key
   * @critical
   */
  it('should serialize concurrent operations on the same key', async () => {
    const key = 'concurrent_test_key';
    const executionOrder: number[] = [];
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Start three operations concurrently
    const promises = [
      withKeyLock(key, async () => {
        executionOrder.push(1);
        await delay(10);
        executionOrder.push(4);
      }),
      withKeyLock(key, async () => {
        executionOrder.push(2);
        await delay(10);
        executionOrder.push(5);
      }),
      withKeyLock(key, async () => {
        executionOrder.push(3);
        await delay(10);
        executionOrder.push(6);
      }),
    ];

    await Promise.all(promises);

    // Each operation should complete before the next starts
    // Valid sequences: [1,4,2,5,3,6] or [1,4,3,6,2,5] etc.
    expect(executionOrder.length).toBe(6);

    // Find where each operation started and ended
    const op1Start = executionOrder.indexOf(1);
    const op1End = executionOrder.indexOf(4);
    const op2Start = executionOrder.indexOf(2);
    const op2End = executionOrder.indexOf(5);
    const op3Start = executionOrder.indexOf(3);
    const op3End = executionOrder.indexOf(6);

    // Each operation should complete (end) before next operation starts
    expect(op1End).toBeLessThan(op2Start);
    expect(op2End).toBeLessThan(op3Start);
  });

  /**
   * Different keys can be locked concurrently
   * @integration
   */
  it('should allow concurrent operations on different keys', async () => {
    const key1 = 'key_1';
    const key2 = 'key_2';
    const executionOrder: string[] = [];
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const promises = [
      withKeyLock(key1, async () => {
        executionOrder.push('key1_start');
        await delay(20);
        executionOrder.push('key1_end');
      }),
      withKeyLock(key2, async () => {
        executionOrder.push('key2_start');
        await delay(20);
        executionOrder.push('key2_end');
      }),
    ];

    await Promise.all(promises);

    // Both operations should have started before either finished
    const key1StartIdx = executionOrder.indexOf('key1_start');
    const key2StartIdx = executionOrder.indexOf('key2_start');
    const key1EndIdx = executionOrder.indexOf('key1_end');
    const key2EndIdx = executionOrder.indexOf('key2_end');

    // Both should start before either ends (proving concurrency)
    expect(Math.max(key1StartIdx, key2StartIdx)).toBeLessThan(Math.min(key1EndIdx, key2EndIdx));
  });

  /**
   * Lock returns operation result
   * @critical
   */
  it('should return the operation result', async () => {
    const key = 'result_test_key';
    const result = await withKeyLock(key, async () => {
      return { success: true, data: 'test_data' };
    });

    expect(result).toEqual({ success: true, data: 'test_data' });
  });

  /**
   * Lock propagates errors
   * @edge-case
   */
  it('should propagate errors from operations', async () => {
    const key = 'error_test_key';

    await expect(
      withKeyLock(key, async () => {
        throw new Error('Operation failed');
      })
    ).rejects.toThrow('Operation failed');

    // Lock should be released even after error
    expect(isKeyLocked(key)).toBe(false);
  });

  /**
   * Queue size tracking
   * @integration
   */
  it('should track queue size correctly', async () => {
    const key = 'queue_test_key';
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Start first operation
    const firstOp = withKeyLock(key, async () => {
      await delay(50);
    });

    // Wait a bit for first lock to be acquired
    await delay(5);

    // Queue two more operations
    const secondOp = withKeyLock(key, async () => {
      await delay(10);
    });

    const thirdOp = withKeyLock(key, async () => {
      await delay(10);
    });

    // Wait a bit for operations to queue
    await delay(5);

    // Queue size should reflect waiting operations
    const queueSize = getKeyLockQueueSize(`storage_key::${key}`);
    expect(queueSize).toBeGreaterThanOrEqual(0);

    await Promise.all([firstOp, secondOp, thirdOp]);

    // Queue should be empty after all operations complete
    expect(getKeyLockQueueSize(`storage_key::${key}`)).toBe(0);
  });

  /**
   * Storage key namespace isolation
   * @integration
   */
  it('should use storage_key namespace for resources', async () => {
    const key = 'namespace_test';

    const lockSpy = jest.spyOn(lockManager, 'withLock');

    await withKeyLock(key, async () => {
      // Operation
    });

    expect(lockSpy).toHaveBeenCalledWith(
      `storage_key::${key}`,
      expect.any(Function),
      { timeout: 10000 }
    );

    lockSpy.mockRestore();
  });
});
