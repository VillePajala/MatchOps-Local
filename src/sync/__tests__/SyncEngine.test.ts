/**
 * SyncEngine Tests
 *
 * Tests for the background sync processor that handles local-to-cloud synchronization.
 * These tests verify the sync engine's ability to process queued operations reliably.
 *
 * @critical Core sync system - these tests protect against data loss and sync failures
 * @integration Tests interaction between SyncEngine and SyncQueue
 * @see src/sync/SyncEngine.ts
 * @see docs/03-active-plans/local-first-sync-plan.md
 */

// Polyfill structuredClone for Node.js < 17 (required by fake-indexeddb)
if (typeof structuredClone === 'undefined') {
  global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj));
}

// Mock IndexedDB using fake-indexeddb - must be before other imports
import 'fake-indexeddb/auto';

import { SyncEngine, SyncOperationExecutor, resetSyncEngine } from '../SyncEngine';
import { SyncQueue } from '../SyncQueue';
import { SyncStatusInfo } from '../types';

// Import logger for spying (we'll spy on its methods in tests)
import logger from '@/utils/logger';
import { SyncEntityType, SyncOperationType } from '../types';

/**
 * Helper to create a sync operation input for testing.
 * Reduces boilerplate in tests that need to enqueue operations.
 */
function createTestOperation(overrides: {
  entityType?: SyncEntityType;
  entityId?: string;
  operation?: SyncOperationType;
  data?: unknown;
  timestamp?: number;
} = {}) {
  return {
    entityType: overrides.entityType ?? 'player',
    entityId: overrides.entityId ?? 'player_1',
    operation: overrides.operation ?? 'update',
    data: overrides.data ?? {},
    timestamp: overrides.timestamp ?? Date.now(),
  };
}

// Helper to flush all pending promises and timers
// fake-indexeddb needs multiple event loop cycles to resolve all its internal promises
async function flushAllAsync(cycles = 50): Promise<void> {
  for (let i = 0; i < cycles; i++) {
    await jest.advanceTimersByTimeAsync(0);
  }
}

/**
 * Wait for a condition to be true with timeout.
 * Uses flush cycles to advance fake timers while checking the condition.
 * This is more deterministic than using a fixed number of cycles.
 */
async function waitForCondition(
  condition: () => boolean,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 10 } = options;
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`waitForCondition timed out after ${timeout}ms`);
    }
    // Advance fake timers and flush promises
    await jest.advanceTimersByTimeAsync(interval);
    await flushAllAsync(10);
  }
}

describe('SyncEngine', () => {
  let queue: SyncQueue;
  let engine: SyncEngine;
  let mockExecutor: jest.MockedFunction<SyncOperationExecutor>;

  beforeEach(async () => {
    // Use fake timers
    jest.useFakeTimers();

    // Reset singleton (async - waits for dispose to complete)
    await resetSyncEngine();

    // Mock navigator.onLine BEFORE creating engine (engine reads it in constructor)
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });

    // Create fresh queue with test userId for isolation
    queue = new SyncQueue('test-user-id', {
      maxRetries: 3,
      backoffBaseMs: 100,
      backoffMaxMs: 1000,
    });
    await queue.initialize();

    // Create engine with short interval for testing
    engine = new SyncEngine(queue, {
      syncIntervalMs: 1000,
      batchSize: 5,
    });

    // Create mock executor
    mockExecutor = jest.fn().mockResolvedValue(undefined);
    engine.setExecutor(mockExecutor);
  });

  afterEach(async () => {
    engine.stop();
    await queue.clear();
    await queue.close();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('lifecycle', () => {
    it('should start and stop correctly', () => {
      expect(engine.isEngineRunning()).toBe(false);

      engine.start();
      expect(engine.isEngineRunning()).toBe(true);

      engine.stop();
      expect(engine.isEngineRunning()).toBe(false);
    });

    it('should not start twice', () => {
      engine.start();
      engine.start(); // Should be a no-op
      expect(engine.isEngineRunning()).toBe(true);
    });

    it('should process queue on start when online', async () => {
      await queue.enqueue(createTestOperation({ data: { name: 'Test' } }));

      engine.start();
      await flushAllAsync();

      expect(mockExecutor).toHaveBeenCalledTimes(1);
    });

    it('should dispose and clear all listeners', async () => {
      const statusChanges: unknown[] = [];
      engine.onStatusChange((info) => statusChanges.push(info));

      engine.start();
      await flushAllAsync();

      const countBefore = statusChanges.length;
      expect(countBefore).toBeGreaterThan(0);

      // Dispose clears listeners
      engine.dispose();
      expect(engine.isEngineRunning()).toBe(false);

      // Create new engine to trigger status changes on old listeners (should not fire)
      const newEngine = new SyncEngine(queue, { syncIntervalMs: 1000 });
      newEngine.setExecutor(mockExecutor);
      newEngine.start();
      await flushAllAsync();
      newEngine.stop();

      // Old listeners should not have received new events
      expect(statusChanges.length).toBe(countBefore);
    });

    /**
     * Issue #330: Concurrent dispose() calls should wait for the same operation.
     * Uses promise deduplication to prevent race conditions during cleanup.
     */
    it('should handle concurrent dispose calls via promise deduplication', async () => {
      engine.start();
      await flushAllAsync();

      // Call dispose twice concurrently
      const dispose1 = engine.dispose();
      const dispose2 = engine.dispose();

      // Both should resolve (not throw)
      await expect(Promise.all([dispose1, dispose2])).resolves.not.toThrow();

      // Engine should be stopped
      expect(engine.isEngineRunning()).toBe(false);
    });

    /**
     * Concurrent dispose calls should all wait for the same underlying operation.
     */
    it('should return same promise for concurrent dispose calls', async () => {
      // We can't directly test promise identity due to the async wrapper,
      // but we can verify both complete successfully without errors
      engine.start();
      await flushAllAsync();

      // Start multiple disposes
      const results = await Promise.allSettled([
        engine.dispose(),
        engine.dispose(),
        engine.dispose(),
      ]);

      // All should succeed
      expect(results.every(r => r.status === 'fulfilled')).toBe(true);
    });
  });

  describe('processing', () => {
    it('should process pending operations', async () => {
      await queue.enqueue(createTestOperation({
        operation: 'create',
        data: { name: 'Player 1' },
      }));
      await queue.enqueue(createTestOperation({
        entityId: 'player_2',
        operation: 'create',
        data: { name: 'Player 2' },
        timestamp: Date.now() + 100,
      }));

      engine.start();
      await flushAllAsync();

      expect(mockExecutor).toHaveBeenCalledTimes(2);

      const stats = await queue.getStats();
      expect(stats.total).toBe(0); // All completed
    });

    it('should remove completed operations from queue', async () => {
      const id = await queue.enqueue(createTestOperation({
        entityType: 'game',
        entityId: 'game_1',
      }));

      engine.start();
      await flushAllAsync();

      const op = await queue.getById(id);
      expect(op).toBeNull(); // Removed after completion
    });

    it('should mark failed operations', async () => {
      mockExecutor.mockRejectedValue(new Error('Network error'));

      const id = await queue.enqueue(createTestOperation());

      engine.start();
      await flushAllAsync();

      expect(mockExecutor).toHaveBeenCalledTimes(1);

      const op = await queue.getById(id);
      expect(op).not.toBeNull();
      expect(op?.retryCount).toBe(1);
    });

    it('should respect batch size', async () => {
      // Add 10 operations, batch size is 5
      for (let i = 0; i < 10; i++) {
        await queue.enqueue(createTestOperation({
          entityId: `player_${i}`,
          operation: 'create',
          timestamp: Date.now() + i,
        }));
      }

      engine.start();

      // Wait for first batch to complete (batch size is 5)
      // Using waitForCondition is more deterministic than fixed flush cycles
      await waitForCondition(() => mockExecutor.mock.calls.length >= 5);
      expect(mockExecutor).toHaveBeenCalledTimes(5);

      // Advance to next interval for second batch
      await jest.advanceTimersByTimeAsync(1000);

      // Wait for second batch to complete
      await waitForCondition(() => mockExecutor.mock.calls.length >= 10);
      expect(mockExecutor).toHaveBeenCalledTimes(10);
    });
  });

  describe('online/offline handling', () => {
    it('should refresh online state on start', async () => {
      // Simulate: engine constructed offline, then browser comes online before start()
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });

      const lateOnlineEngine = new SyncEngine(queue, { syncIntervalMs: 1000 });
      lateOnlineEngine.setExecutor(mockExecutor);

      // Engine thinks it's offline
      expect(lateOnlineEngine.isCurrentlyOnline()).toBe(false);

      // Browser comes online (but no event because listeners aren't attached yet)
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true,
      });

      await queue.enqueue(createTestOperation());

      // start() should refresh online state and process queue
      lateOnlineEngine.start();
      await flushAllAsync();

      // Engine should now know it's online and have processed the operation
      expect(lateOnlineEngine.isCurrentlyOnline()).toBe(true);
      expect(mockExecutor).toHaveBeenCalledTimes(1);

      lateOnlineEngine.stop();
    });

    it('should not process when offline', async () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });

      // Create new engine with offline state
      const offlineEngine = new SyncEngine(queue, { syncIntervalMs: 1000 });
      offlineEngine.setExecutor(mockExecutor);

      await queue.enqueue(createTestOperation());

      offlineEngine.start();
      await flushAllAsync();

      expect(mockExecutor).not.toHaveBeenCalled();
      offlineEngine.stop();
    });

    it('should report offline status', async () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });

      const offlineEngine = new SyncEngine(queue, { syncIntervalMs: 1000 });
      offlineEngine.setExecutor(mockExecutor);

      const status = await offlineEngine.getStatus();
      expect(status.isOnline).toBe(false);
      expect(status.state).toBe('offline');

      offlineEngine.stop();
    });

    it('should resume processing when coming online', async () => {
      // Start offline - need new engine created with offline state
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });

      const offlineEngine = new SyncEngine(queue, { syncIntervalMs: 1000 });
      offlineEngine.setExecutor(mockExecutor);

      await queue.enqueue(createTestOperation());

      offlineEngine.start();
      await flushAllAsync();

      expect(mockExecutor).not.toHaveBeenCalled();

      // Simulate coming online
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true,
      });

      // Dispatch online event
      window.dispatchEvent(new Event('online'));
      await flushAllAsync();

      expect(mockExecutor).toHaveBeenCalledTimes(1);

      offlineEngine.stop();
    });
  });

  describe('nudge', () => {
    it('should trigger immediate sync', async () => {
      engine.start();
      await flushAllAsync();
      mockExecutor.mockClear();

      // Add operation after initial sync
      await queue.enqueue(createTestOperation());

      // Nudge instead of waiting for interval
      engine.nudge();
      await flushAllAsync();

      expect(mockExecutor).toHaveBeenCalledTimes(1);
    });

    it('should not nudge when offline', async () => {
      engine.start();
      await flushAllAsync();

      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });

      // Simulate offline event
      window.dispatchEvent(new Event('offline'));

      await queue.enqueue(createTestOperation());

      mockExecutor.mockClear();
      engine.nudge();
      await flushAllAsync();

      expect(mockExecutor).not.toHaveBeenCalled();
    });

    it('should not nudge when not running', async () => {
      await queue.enqueue(createTestOperation());

      engine.nudge();
      await flushAllAsync();

      expect(mockExecutor).not.toHaveBeenCalled();
    });
  });

  describe('status', () => {
    it('should report synced when queue is empty', async () => {
      engine.start();
      await flushAllAsync();

      const status = await engine.getStatus();
      expect(status.state).toBe('synced');
      expect(status.pendingCount).toBe(0);
      expect(status.failedCount).toBe(0);
    });

    it('should report pending when operations are queued', async () => {
      await queue.enqueue(createTestOperation());

      // Don't start engine - operations stay pending
      const status = await engine.getStatus();
      expect(status.state).toBe('pending');
      expect(status.pendingCount).toBe(1);
    });

    it('should report error when operations have failed', async () => {
      const id = await queue.enqueue(createTestOperation());

      // Fail to max retries
      for (let i = 0; i < 3; i++) {
        await queue.markFailed(id, 'Error');
      }

      const status = await engine.getStatus();
      expect(status.state).toBe('error');
      expect(status.failedCount).toBe(1);
    });
  });

  describe('events', () => {
    it('should emit status change events', async () => {
      const statusChanges: SyncStatusInfo[] = [];
      engine.onStatusChange((info) => statusChanges.push({ ...info }));

      await queue.enqueue(createTestOperation());

      engine.start();
      await flushAllAsync();

      // Should have received status changes
      expect(statusChanges.length).toBeGreaterThan(0);
    });

    it('should emit operation complete events', async () => {
      const completed: { id: string; entityType: string; entityId: string }[] = [];
      engine.onOperationComplete((id, entityType, entityId) => {
        completed.push({ id, entityType, entityId });
      });

      await queue.enqueue(createTestOperation());

      engine.start();
      await flushAllAsync();

      expect(completed).toHaveLength(1);
      expect(completed[0].entityType).toBe('player');
      expect(completed[0].entityId).toBe('player_1');
    });

    it('should emit operation failed events', async () => {
      mockExecutor.mockRejectedValue(new Error('Sync failed'));

      const failed: { id: string; error: string; willRetry: boolean }[] = [];
      engine.onOperationFailed((id, error, willRetry) => {
        failed.push({ id, error, willRetry });
      });

      await queue.enqueue(createTestOperation());

      engine.start();
      await flushAllAsync();

      expect(failed).toHaveLength(1);
      expect(failed[0].error).toBe('Sync failed');
      expect(failed[0].willRetry).toBe(true); // First failure, will retry
    });

    it('should unsubscribe listeners correctly', async () => {
      const statusChanges: SyncStatusInfo[] = [];
      const unsubscribe = engine.onStatusChange((info) => statusChanges.push({ ...info }));

      engine.start();
      await flushAllAsync();

      const countBefore = statusChanges.length;

      // Unsubscribe
      unsubscribe();

      // Trigger more changes
      await queue.enqueue(createTestOperation());

      engine.nudge();
      await flushAllAsync();

      // Should not have received more events
      expect(statusChanges.length).toBe(countBefore);
    });
  });

  describe('edge cases', () => {
    it('should handle executor not set', async () => {
      const engineNoExecutor = new SyncEngine(queue, { syncIntervalMs: 1000 });

      await queue.enqueue(createTestOperation());

      engineNoExecutor.start();
      await flushAllAsync();

      // Should not throw, just skip
      const stats = await queue.getStats();
      expect(stats.pending).toBe(1); // Still pending

      engineNoExecutor.stop();
    });

    it('should handle executor set after start', async () => {
      const lateExecutorEngine = new SyncEngine(queue, { syncIntervalMs: 1000 });

      await queue.enqueue(createTestOperation({ entityId: 'player_late' }));

      // Start without executor
      lateExecutorEngine.start();
      await flushAllAsync();

      // Should skip processing (no executor)
      expect(mockExecutor).not.toHaveBeenCalled();

      // Now set executor and nudge
      lateExecutorEngine.setExecutor(mockExecutor);
      lateExecutorEngine.nudge();
      await flushAllAsync();

      // Should now process
      expect(mockExecutor).toHaveBeenCalledTimes(1);

      lateExecutorEngine.stop();
    });

    it('should update lastSyncedAt after successful sync', async () => {
      engine.start();
      await flushAllAsync();

      const status = await engine.getStatus();
      expect(status.lastSyncedAt).not.toBeNull();
    });

    it('should report isEngineSyncing correctly', async () => {
      expect(engine.isEngineSyncing()).toBe(false);

      // During sync, this would be true - tested indirectly via status
      engine.start();
      await flushAllAsync();

      // After sync completes, should be false again
      expect(engine.isEngineSyncing()).toBe(false);
    });

    it('should report isCurrentlyOnline correctly', async () => {
      expect(engine.isCurrentlyOnline()).toBe(true);

      // Start engine first so it registers event listeners
      engine.start();
      await flushAllAsync();

      // Simulate going offline
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });
      window.dispatchEvent(new Event('offline'));

      // Allow pending promises to resolve
      await flushAllAsync();

      expect(engine.isCurrentlyOnline()).toBe(false);
    });
  });

  describe('stale syncing recovery', () => {
    it('should reset stale syncing operations on start', async () => {
      // Enqueue an operation and mark it as syncing (simulating crash during sync)
      const id = await queue.enqueue(createTestOperation({
        entityId: 'player_stale',
        data: { name: 'Stale' },
      }));

      await queue.markSyncing(id);

      // Verify it's stuck in syncing
      const op = await queue.getById(id);
      expect(op?.status).toBe('syncing');

      // Start engine - should reset stale ops and process them automatically
      engine.start();

      // Flush to let resetStaleSyncing complete and initial processQueue run
      // The initial processQueue won't find the operation ready (minimum delay not elapsed)
      await flushAllAsync();

      // Advance time past the minimum retry delay (2000ms) for reset operations.
      // resetStaleSyncing sets lastAttempt=now but does NOT increment retryCount
      // (to prevent cascade backoff). Operations with retryCount=0 but lastAttempt set
      // require a 2-second minimum delay before isReadyForRetry returns true.
      // This prevents tight retry loops during auth state changes.
      // Then advance to the next sync interval (1000ms) to trigger processing.
      await jest.advanceTimersByTimeAsync(3000);
      await flushAllAsync();

      // The operation should have been reset AND processed (removed from queue)
      expect(mockExecutor).toHaveBeenCalledTimes(1);

      // Verify the executor was called with the operation
      expect(mockExecutor).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'player',
          entityId: 'player_stale',
        })
      );

      // Operation should be removed after successful processing
      const processedOp = await queue.getById(id);
      expect(processedOp).toBeNull();
    });

    it('should handle resetStaleSyncing error gracefully', async () => {
      // Spy on logger.error to verify error logging
      const loggerErrorSpy = jest.spyOn(logger, 'error');

      // Spy on resetStaleSyncing to make it reject
      const resetSpy = jest.spyOn(queue, 'resetStaleSyncing').mockRejectedValueOnce(
        new Error('DB error')
      );

      // Engine should still start and function
      engine.start();
      expect(engine.isEngineRunning()).toBe(true);

      // Wait for the async stale reset to complete (and fail)
      await flushAllAsync();

      // CRITICAL: Verify the error was logged
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        '[SyncEngine] Failed to reset stale syncing operations:',
        expect.any(Error)
      );

      // Verify stale reset failure is tracked in status
      const status = await engine.getStatus();
      expect(status.hasStaleResetFailure).toBe(true);

      // Clean up spies
      loggerErrorSpy.mockRestore();
      resetSpy.mockRestore();
    });

    /**
     * @critical Verifies that queue processing is blocked when stale reset fails.
     * This prevents silent data loss from operations stuck in 'syncing' status.
     */
    it('should block queue processing after stale reset failure until recovery', async () => {
      // Make stale reset fail persistently
      const resetSpy = jest.spyOn(queue, 'resetStaleSyncing').mockRejectedValue(
        new Error('DB error')
      );

      // Enqueue an operation (will be in 'pending' status, not 'syncing')
      await queue.enqueue(createTestOperation({ entityId: 'player_blocked' }));

      engine.start();
      await flushAllAsync();

      // Operation should NOT be processed - queue processing is blocked after stale reset failure
      // This is critical: if stale reset fails, operations may be stuck in 'syncing' state
      // and processing would skip them (getPending only returns 'pending' ops)
      expect(mockExecutor).not.toHaveBeenCalled();

      // Verify status indicates stale reset failure
      let status = await engine.getStatus();
      expect(status.hasStaleResetFailure).toBe(true);

      // Allow stale reset to succeed on next attempt
      resetSpy.mockRestore();

      // Advance through 10 sync intervals to trigger recovery attempt
      // (SyncEngine retries stale reset every 10 processing attempts)
      for (let i = 0; i < 10; i++) {
        await jest.advanceTimersByTimeAsync(1000);
        await flushAllAsync();
      }

      // Now the operation should be processed after recovery
      expect(mockExecutor).toHaveBeenCalledTimes(1);

      // Status should indicate recovery succeeded
      status = await engine.getStatus();
      expect(status.hasStaleResetFailure).toBe(false);
    });
  });

  describe('singleton', () => {
    it('should throw when getSyncEngine called without queue on first call', async () => {
      // Import getSyncEngine for this test
      const { getSyncEngine, resetSyncEngine: reset } = await import('../SyncEngine');

      // Reset to ensure no instance exists (async)
      await reset();

      expect(() => getSyncEngine()).toThrow('SyncEngine not initialized');
    });

    it('should return same instance on subsequent calls', async () => {
      const { getSyncEngine, resetSyncEngine: reset } = await import('../SyncEngine');

      await reset();

      const instance1 = getSyncEngine(queue);
      const instance2 = getSyncEngine(); // No queue needed after first call

      expect(instance1).toBe(instance2);

      await reset();
    });
  });
});
