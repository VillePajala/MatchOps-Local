/**
 * SyncEngine Tests
 *
 * Tests for the background sync processor.
 *
 * @see src/sync/SyncEngine.ts
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

// Mock logger
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Helper to flush all pending promises and timers
// fake-indexeddb needs multiple event loop cycles to resolve all its internal promises
async function flushAllAsync(cycles = 50): Promise<void> {
  for (let i = 0; i < cycles; i++) {
    await jest.advanceTimersByTimeAsync(0);
  }
}

describe('SyncEngine', () => {
  let queue: SyncQueue;
  let engine: SyncEngine;
  let mockExecutor: jest.MockedFunction<SyncOperationExecutor>;

  beforeEach(async () => {
    // Use fake timers
    jest.useFakeTimers();

    // Reset singleton
    resetSyncEngine();

    // Mock navigator.onLine BEFORE creating engine (engine reads it in constructor)
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });

    // Create fresh queue
    queue = new SyncQueue({
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
      await queue.enqueue({
        entityType: 'player',
        entityId: 'player_1',
        operation: 'update',
        data: { name: 'Test' },
        timestamp: Date.now(),
      });

      engine.start();
      await flushAllAsync();

      expect(mockExecutor).toHaveBeenCalledTimes(1);
    });
  });

  describe('processing', () => {
    it('should process pending operations', async () => {
      await queue.enqueue({
        entityType: 'player',
        entityId: 'player_1',
        operation: 'create',
        data: { name: 'Player 1' },
        timestamp: Date.now(),
      });

      await queue.enqueue({
        entityType: 'player',
        entityId: 'player_2',
        operation: 'create',
        data: { name: 'Player 2' },
        timestamp: Date.now() + 100,
      });

      engine.start();
      await flushAllAsync();

      expect(mockExecutor).toHaveBeenCalledTimes(2);

      const stats = await queue.getStats();
      expect(stats.total).toBe(0); // All completed
    });

    it('should remove completed operations from queue', async () => {
      const id = await queue.enqueue({
        entityType: 'game',
        entityId: 'game_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

      engine.start();
      await flushAllAsync();

      const op = await queue.getById(id);
      expect(op).toBeNull(); // Removed after completion
    });

    it('should mark failed operations', async () => {
      mockExecutor.mockRejectedValue(new Error('Network error'));

      const id = await queue.enqueue({
        entityType: 'player',
        entityId: 'player_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

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
        await queue.enqueue({
          entityType: 'player',
          entityId: `player_${i}`,
          operation: 'create',
          data: {},
          timestamp: Date.now() + i,
        });
      }

      engine.start();
      await flushAllAsync();

      // First batch of 5
      expect(mockExecutor).toHaveBeenCalledTimes(5);

      // Advance to next interval for second batch
      await jest.advanceTimersByTimeAsync(1000);
      await flushAllAsync();

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

      await queue.enqueue({
        entityType: 'player',
        entityId: 'player_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

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

      await queue.enqueue({
        entityType: 'player',
        entityId: 'player_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

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

      await queue.enqueue({
        entityType: 'player',
        entityId: 'player_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

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
      await queue.enqueue({
        entityType: 'player',
        entityId: 'player_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

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

      await queue.enqueue({
        entityType: 'player',
        entityId: 'player_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

      mockExecutor.mockClear();
      engine.nudge();
      await flushAllAsync();

      expect(mockExecutor).not.toHaveBeenCalled();
    });

    it('should not nudge when not running', async () => {
      await queue.enqueue({
        entityType: 'player',
        entityId: 'player_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

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
      await queue.enqueue({
        entityType: 'player',
        entityId: 'player_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

      // Don't start engine - operations stay pending
      const status = await engine.getStatus();
      expect(status.state).toBe('pending');
      expect(status.pendingCount).toBe(1);
    });

    it('should report error when operations have failed', async () => {
      const id = await queue.enqueue({
        entityType: 'player',
        entityId: 'player_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

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

      await queue.enqueue({
        entityType: 'player',
        entityId: 'player_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

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

      await queue.enqueue({
        entityType: 'player',
        entityId: 'player_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

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

      await queue.enqueue({
        entityType: 'player',
        entityId: 'player_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

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
      await queue.enqueue({
        entityType: 'player',
        entityId: 'player_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

      engine.nudge();
      await flushAllAsync();

      // Should not have received more events
      expect(statusChanges.length).toBe(countBefore);
    });
  });

  describe('edge cases', () => {
    it('should handle executor not set', async () => {
      const engineNoExecutor = new SyncEngine(queue, { syncIntervalMs: 1000 });

      await queue.enqueue({
        entityType: 'player',
        entityId: 'player_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

      engineNoExecutor.start();
      await flushAllAsync();

      // Should not throw, just skip
      const stats = await queue.getStats();
      expect(stats.pending).toBe(1); // Still pending

      engineNoExecutor.stop();
    });

    it('should handle executor set after start', async () => {
      const lateExecutorEngine = new SyncEngine(queue, { syncIntervalMs: 1000 });

      await queue.enqueue({
        entityType: 'player',
        entityId: 'player_late',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

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

      expect(engine.isCurrentlyOnline()).toBe(false);
    });
  });

  describe('stale syncing recovery', () => {
    it('should reset stale syncing operations on start', async () => {
      // Enqueue an operation and mark it as syncing (simulating crash during sync)
      const id = await queue.enqueue({
        entityType: 'player',
        entityId: 'player_stale',
        operation: 'update',
        data: { name: 'Stale' },
        timestamp: Date.now(),
      });

      await queue.markSyncing(id);

      // Verify it's stuck in syncing
      const op = await queue.getById(id);
      expect(op?.status).toBe('syncing');

      // Start engine - should reset stale ops and process them automatically
      engine.start();

      // Flush to let resetStaleSyncing complete and initial processQueue run
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
      // Spy on resetStaleSyncing to make it reject
      const resetSpy = jest.spyOn(queue, 'resetStaleSyncing').mockRejectedValueOnce(
        new Error('DB error')
      );

      // Engine should still start and function
      engine.start();
      expect(engine.isEngineRunning()).toBe(true);

      // Clean up spy
      resetSpy.mockRestore();
    });
  });

  describe('singleton', () => {
    it('should throw when getSyncEngine called without queue on first call', async () => {
      // Import getSyncEngine for this test
      const { getSyncEngine, resetSyncEngine: reset } = await import('../SyncEngine');

      // Reset to ensure no instance exists
      reset();

      expect(() => getSyncEngine()).toThrow('SyncEngine not initialized');
    });

    it('should return same instance on subsequent calls', async () => {
      const { getSyncEngine, resetSyncEngine: reset } = await import('../SyncEngine');

      reset();

      const instance1 = getSyncEngine(queue);
      const instance2 = getSyncEngine(); // No queue needed after first call

      expect(instance1).toBe(instance2);

      reset();
    });
  });
});
