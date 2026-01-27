/**
 * SyncQueue Tests
 *
 * Tests for the persistent sync operation queue.
 * These tests verify the core functionality of the local-first sync system.
 *
 * @critical Core sync system - these tests protect against data loss
 * @see src/sync/SyncQueue.ts
 * @see docs/03-active-plans/local-first-sync-plan.md
 */

// Polyfill structuredClone for Node.js < 17 (required by fake-indexeddb)
if (typeof structuredClone === 'undefined') {
  global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj));
}

// Mock IndexedDB using fake-indexeddb - must be before other imports
import 'fake-indexeddb/auto';

import { SyncQueue } from '../SyncQueue';
import { SyncOperationInput, SyncError } from '../types';

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

describe('SyncQueue', () => {
  let queue: SyncQueue;

  beforeEach(async () => {
    // Create fresh queue for each test
    queue = new SyncQueue({
      maxRetries: 3,
      backoffBaseMs: 100,
      backoffMaxMs: 1000,
    });
    await queue.initialize();
  });

  afterEach(async () => {
    // Timeout wrapper to prevent indefinite hanging due to fake-indexeddb race conditions
    const cleanup = async () => {
      await queue.clear();
      await queue.close();
    };
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Cleanup timeout')), 3000)
    );
    try {
      await Promise.race([cleanup(), timeout]);
    } catch {
      // If cleanup times out, just close the database to release resources
      try {
        await queue.close();
      } catch {
        // Ignore close errors in cleanup
      }
    }
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const newQueue = new SyncQueue();
      await newQueue.initialize();
      expect(newQueue.isInitialized()).toBe(true);
      await newQueue.close();
    });

    it('should handle multiple initialize calls', async () => {
      const newQueue = new SyncQueue();
      await Promise.all([
        newQueue.initialize(),
        newQueue.initialize(),
        newQueue.initialize(),
      ]);
      expect(newQueue.isInitialized()).toBe(true);
      await newQueue.close();
    });

    it('should throw when operations called before initialize', async () => {
      const uninitializedQueue = new SyncQueue();

      await expect(uninitializedQueue.enqueue({
        entityType: 'game',
        entityId: 'game_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      })).rejects.toThrow(SyncError);
    });
  });

  describe('enqueue', () => {
    it('should enqueue an operation and return an ID', async () => {
      const input: SyncOperationInput = {
        entityType: 'game',
        entityId: 'game_123',
        operation: 'update',
        data: { name: 'Test Game' },
        timestamp: Date.now(),
      };

      const id = await queue.enqueue(input);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');

      const op = await queue.getById(id);
      expect(op).not.toBeNull();
      expect(op?.entityType).toBe('game');
      expect(op?.entityId).toBe('game_123');
      expect(op?.status).toBe('pending');
      expect(op?.retryCount).toBe(0);
    });

    it('should deduplicate pending operations for same entity', async () => {
      const timestamp1 = Date.now();
      const timestamp2 = timestamp1 + 1000;

      const id1 = await queue.enqueue({
        entityType: 'player',
        entityId: 'player_1',
        operation: 'update',
        data: { name: 'First' },
        timestamp: timestamp1,
      });

      const id2 = await queue.enqueue({
        entityType: 'player',
        entityId: 'player_1',
        operation: 'update',
        data: { name: 'Second' },
        timestamp: timestamp2,
      });

      // Second enqueue should replace first (same ID)
      expect(id2).toBe(id1);

      const stats = await queue.getStats();
      expect(stats.total).toBe(1);

      const op = await queue.getById(id2);
      expect(op?.data).toEqual({ name: 'Second' });
      expect(op?.timestamp).toBe(timestamp2);
    });

    it('should preserve original createdAt when deduplicating', async () => {
      // First enqueue creates operation with createdAt = now
      const id1 = await queue.enqueue({
        entityType: 'player',
        entityId: 'player_preserve',
        operation: 'update',
        data: { name: 'First' },
        timestamp: Date.now(),
      });

      const op1 = await queue.getById(id1);
      const originalCreatedAt = op1?.createdAt;
      expect(originalCreatedAt).toBeDefined();

      // Wait to ensure different createdAt timestamps between enqueue operations.
      // This is necessary because the test verifies that the original createdAt is
      // preserved when a pending operation is deduplicated (updated with new data).
      // Without this delay, both enqueue operations could have identical timestamps,
      // making it impossible to verify that createdAt was actually preserved.
      await new Promise(resolve => setTimeout(resolve, 50));

      // Second enqueue replaces but should keep original createdAt
      const id2 = await queue.enqueue({
        entityType: 'player',
        entityId: 'player_preserve',
        operation: 'update',
        data: { name: 'Second' },
        timestamp: Date.now() + 1000,
      });

      expect(id2).toBe(id1);

      const op2 = await queue.getById(id2);
      expect(op2?.data).toEqual({ name: 'Second' });
      // createdAt should be preserved from original
      expect(op2?.createdAt).toBe(originalCreatedAt);
    });

    it('should merge CREATE + UPDATE into CREATE with new data', async () => {
      // First: create operation
      const id1 = await queue.enqueue({
        entityType: 'player',
        entityId: 'player_merge_1',
        operation: 'create',
        data: { name: 'Original Name', jerseyNumber: '10' },
        timestamp: Date.now(),
      });

      // Second: update operation for same entity
      const id2 = await queue.enqueue({
        entityType: 'player',
        entityId: 'player_merge_1',
        operation: 'update',
        data: { name: 'Updated Name', jerseyNumber: '10' },
        timestamp: Date.now() + 1000,
      });

      // Should keep same ID
      expect(id2).toBe(id1);

      // Should have only one operation
      const stats = await queue.getStats();
      expect(stats.total).toBe(1);

      // Operation type should be CREATE (not UPDATE)
      const op = await queue.getById(id2);
      expect(op?.operation).toBe('create');
      // Data should be from the update
      expect(op?.data).toEqual({ name: 'Updated Name', jerseyNumber: '10' });
    });

    it('should merge CREATE + DELETE by removing both', async () => {
      // First: create operation
      await queue.enqueue({
        entityType: 'player',
        entityId: 'player_merge_2',
        operation: 'create',
        data: { name: 'Will Be Deleted' },
        timestamp: Date.now(),
      });

      let stats = await queue.getStats();
      expect(stats.total).toBe(1);

      // Second: delete operation for same entity
      await queue.enqueue({
        entityType: 'player',
        entityId: 'player_merge_2',
        operation: 'delete',
        data: null,
        timestamp: Date.now() + 1000,
      });

      // Both should be removed - entity never existed on server
      stats = await queue.getStats();
      expect(stats.total).toBe(0);
    });

    it('should merge UPDATE + DELETE into DELETE', async () => {
      // First: update operation
      const id1 = await queue.enqueue({
        entityType: 'player',
        entityId: 'player_merge_3',
        operation: 'update',
        data: { name: 'Updated' },
        timestamp: Date.now(),
      });

      // Second: delete operation
      const id2 = await queue.enqueue({
        entityType: 'player',
        entityId: 'player_merge_3',
        operation: 'delete',
        data: null,
        timestamp: Date.now() + 1000,
      });

      // Should keep same ID
      expect(id2).toBe(id1);

      // Should have only one operation
      const stats = await queue.getStats();
      expect(stats.total).toBe(1);

      // Operation type should be DELETE
      const op = await queue.getById(id2);
      expect(op?.operation).toBe('delete');
    });

    it('should not deduplicate operations for different entities', async () => {
      await queue.enqueue({
        entityType: 'player',
        entityId: 'player_1',
        operation: 'update',
        data: { name: 'Player 1' },
        timestamp: Date.now(),
      });

      await queue.enqueue({
        entityType: 'player',
        entityId: 'player_2',
        operation: 'update',
        data: { name: 'Player 2' },
        timestamp: Date.now(),
      });

      const stats = await queue.getStats();
      expect(stats.total).toBe(2);
    });

    it('should not deduplicate different entity types', async () => {
      await queue.enqueue({
        entityType: 'game',
        entityId: 'id_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

      await queue.enqueue({
        entityType: 'player',
        entityId: 'id_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

      const stats = await queue.getStats();
      expect(stats.total).toBe(2);
    });
  });

  describe('getPending', () => {
    it('should return pending operations oldest first', async () => {
      const now = Date.now();

      await queue.enqueue({
        entityType: 'game',
        entityId: 'game_3',
        operation: 'create',
        data: {},
        timestamp: now + 2000,
      });

      await queue.enqueue({
        entityType: 'game',
        entityId: 'game_1',
        operation: 'create',
        data: {},
        timestamp: now,
      });

      await queue.enqueue({
        entityType: 'game',
        entityId: 'game_2',
        operation: 'create',
        data: {},
        timestamp: now + 1000,
      });

      const pending = await queue.getPending(10);

      expect(pending).toHaveLength(3);
      expect(pending[0].entityId).toBe('game_1');
      expect(pending[1].entityId).toBe('game_2');
      expect(pending[2].entityId).toBe('game_3');
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await queue.enqueue({
          entityType: 'game',
          entityId: `game_${i}`,
          operation: 'create',
          data: {},
          timestamp: Date.now() + i,
        });
      }

      const pending = await queue.getPending(3);
      expect(pending).toHaveLength(3);
    });

    it('should not return operations in syncing status', async () => {
      const id = await queue.enqueue({
        entityType: 'game',
        entityId: 'game_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

      await queue.markSyncing(id);

      const pending = await queue.getPending(10);
      expect(pending).toHaveLength(0);
    });

    it('should respect backoff timing for failed operations', async () => {
      const id = await queue.enqueue({
        entityType: 'game',
        entityId: 'game_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

      // Mark as failed - this sets lastAttempt and increments retryCount
      await queue.markFailed(id, 'Test error');

      // Immediately after failure, operation should not be ready (backoff)
      const pendingImmediate = await queue.getPending(10);
      expect(pendingImmediate).toHaveLength(0);

      // After sufficient time (> backoffBaseMs), it should be ready
      // We'll modify the operation directly to simulate time passing
      const op = await queue.getById(id);
      expect(op).not.toBeNull();
      expect(op?.retryCount).toBe(1);
    });
  });

  describe('status transitions', () => {
    it('should mark operation as syncing', async () => {
      const id = await queue.enqueue({
        entityType: 'game',
        entityId: 'game_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

      await queue.markSyncing(id);

      const op = await queue.getById(id);
      expect(op?.status).toBe('syncing');
      expect(op?.lastAttempt).toBeDefined();
    });

    it('should mark operation as failed and increment retry count', async () => {
      const id = await queue.enqueue({
        entityType: 'game',
        entityId: 'game_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

      await queue.markFailed(id, 'Network error');

      let op = await queue.getById(id);
      expect(op?.status).toBe('pending'); // Not final failure yet
      expect(op?.retryCount).toBe(1);
      expect(op?.lastError).toBe('Network error');

      // Fail twice more to reach maxRetries (3)
      await queue.markFailed(id, 'Error 2');
      await queue.markFailed(id, 'Error 3');

      op = await queue.getById(id);
      expect(op?.status).toBe('failed'); // Final failure
      expect(op?.retryCount).toBe(3);
    });

    it('should remove operation when marked completed', async () => {
      const id = await queue.enqueue({
        entityType: 'game',
        entityId: 'game_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

      await queue.markCompleted(id);

      const op = await queue.getById(id);
      expect(op).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      // Add some operations with different states
      const id1 = await queue.enqueue({
        entityType: 'game',
        entityId: 'game_1',
        operation: 'create',
        data: {},
        timestamp: Date.now(),
      });

      await queue.enqueue({
        entityType: 'game',
        entityId: 'game_2',
        operation: 'create',
        data: {},
        timestamp: Date.now() + 100,
      });

      const id3 = await queue.enqueue({
        entityType: 'game',
        entityId: 'game_3',
        operation: 'create',
        data: {},
        timestamp: Date.now() + 200,
      });

      await queue.markSyncing(id1);

      // Mark failed enough times to reach final failure
      await queue.markFailed(id3, 'Error 1');
      await queue.markFailed(id3, 'Error 2');
      await queue.markFailed(id3, 'Error 3');

      const stats = await queue.getStats();

      expect(stats.total).toBe(3);
      expect(stats.syncing).toBe(1);
      expect(stats.pending).toBe(1);
      expect(stats.failed).toBe(1);
    });
  });

  describe('getFailed', () => {
    it('should return only failed operations', async () => {
      const id1 = await queue.enqueue({
        entityType: 'game',
        entityId: 'game_1',
        operation: 'create',
        data: {},
        timestamp: Date.now(),
      });

      await queue.enqueue({
        entityType: 'game',
        entityId: 'game_2',
        operation: 'create',
        data: {},
        timestamp: Date.now(),
      });

      // Fail id1 to max retries
      for (let i = 0; i < 3; i++) {
        await queue.markFailed(id1, `Error ${i}`);
      }

      const failed = await queue.getFailed();
      expect(failed).toHaveLength(1);
      expect(failed[0].entityId).toBe('game_1');
    });
  });

  describe('retryFailed', () => {
    it('should reset failed operations to pending', async () => {
      const id = await queue.enqueue({
        entityType: 'game',
        entityId: 'game_1',
        operation: 'create',
        data: {},
        timestamp: Date.now(),
      });

      // Fail to max
      for (let i = 0; i < 3; i++) {
        await queue.markFailed(id, `Error ${i}`);
      }

      let op = await queue.getById(id);
      expect(op?.status).toBe('failed');

      const count = await queue.retryFailed();
      expect(count).toBe(1);

      op = await queue.getById(id);
      expect(op?.status).toBe('pending');
      expect(op?.retryCount).toBe(0);
      expect(op?.lastError).toBeUndefined();
    });
  });

  describe('discardFailed', () => {
    it('should remove failed operations', async () => {
      const id1 = await queue.enqueue({
        entityType: 'game',
        entityId: 'game_1',
        operation: 'create',
        data: {},
        timestamp: Date.now(),
      });

      await queue.enqueue({
        entityType: 'game',
        entityId: 'game_2',
        operation: 'create',
        data: {},
        timestamp: Date.now(),
      });

      // Fail id1 to max
      for (let i = 0; i < 3; i++) {
        await queue.markFailed(id1, `Error ${i}`);
      }

      const count = await queue.discardFailed();
      expect(count).toBe(1);

      const stats = await queue.getStats();
      expect(stats.total).toBe(1);
      expect(stats.failed).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all operations', async () => {
      for (let i = 0; i < 5; i++) {
        await queue.enqueue({
          entityType: 'game',
          entityId: `game_${i}`,
          operation: 'create',
          data: {},
          timestamp: Date.now(),
        });
      }

      let stats = await queue.getStats();
      expect(stats.total).toBe(5);

      await queue.clear();

      stats = await queue.getStats();
      expect(stats.total).toBe(0);
    });
  });

  describe('resetStaleSyncing', () => {
    it('should reset syncing operations back to pending', async () => {
      const id = await queue.enqueue({
        entityType: 'game',
        entityId: 'game_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

      // Mark as syncing (simulating app crash during sync)
      await queue.markSyncing(id);

      let op = await queue.getById(id);
      expect(op?.status).toBe('syncing');

      // Reset stale syncing operations
      const resetCount = await queue.resetStaleSyncing();
      expect(resetCount).toBe(1);

      op = await queue.getById(id);
      expect(op?.status).toBe('pending');
      expect(op?.lastError).toContain('Reset from stale syncing');
    });

    it('should append to existing lastError when resetting', async () => {
      const id = await queue.enqueue({
        entityType: 'game',
        entityId: 'game_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

      // Fail once to set lastError
      await queue.markFailed(id, 'Network error');
      // Mark as syncing again
      await queue.markSyncing(id);

      // Reset stale syncing
      await queue.resetStaleSyncing();

      const op = await queue.getById(id);
      expect(op?.lastError).toBe('Network error (reset from stale syncing)');
    });

    it('should return 0 when no syncing operations exist', async () => {
      await queue.enqueue({
        entityType: 'game',
        entityId: 'game_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

      const resetCount = await queue.resetStaleSyncing();
      expect(resetCount).toBe(0);
    });

    it('should reset multiple syncing operations', async () => {
      const id1 = await queue.enqueue({
        entityType: 'game',
        entityId: 'game_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

      const id2 = await queue.enqueue({
        entityType: 'player',
        entityId: 'player_1',
        operation: 'create',
        data: {},
        timestamp: Date.now() + 100,
      });

      await queue.markSyncing(id1);
      await queue.markSyncing(id2);

      const resetCount = await queue.resetStaleSyncing();
      expect(resetCount).toBe(2);

      const op1 = await queue.getById(id1);
      const op2 = await queue.getById(id2);
      expect(op1?.status).toBe('pending');
      expect(op2?.status).toBe('pending');
    });

    it('should not affect pending or failed operations', async () => {
      const pendingId = await queue.enqueue({
        entityType: 'game',
        entityId: 'game_pending',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

      const failedId = await queue.enqueue({
        entityType: 'game',
        entityId: 'game_failed',
        operation: 'create',
        data: {},
        timestamp: Date.now() + 100,
      });

      // Fail to max retries
      for (let i = 0; i < 3; i++) {
        await queue.markFailed(failedId, `Error ${i}`);
      }

      const resetCount = await queue.resetStaleSyncing();
      expect(resetCount).toBe(0);

      const pendingOp = await queue.getById(pendingId);
      const failedOp = await queue.getById(failedId);
      expect(pendingOp?.status).toBe('pending');
      expect(failedOp?.status).toBe('failed');
    });

    it('should increment retryCount when resetting stale operations', async () => {
      // Suppress expected console.warn when max retries reached
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        // Using main queue with maxRetries: 3 (set in beforeEach)
        const id = await queue.enqueue({
          entityType: 'game',
          entityId: 'game_retry_stale',
          operation: 'update',
          data: {},
          timestamp: Date.now(),
        });

        // Mark as syncing
        await queue.markSyncing(id);
        let op = await queue.getById(id);
        expect(op?.retryCount).toBe(0);

        // Reset stale - should increment retryCount
        await queue.resetStaleSyncing();
        op = await queue.getById(id);
        expect(op?.retryCount).toBe(1);
        expect(op?.status).toBe('pending');

        // Mark as syncing again and reset - retryCount should be 2
        await queue.markSyncing(id);
        await queue.resetStaleSyncing();
        op = await queue.getById(id);
        expect(op?.retryCount).toBe(2);
        expect(op?.status).toBe('pending'); // Not failed yet (maxRetries=3)

        // Mark as syncing one more time and reset - should reach failed
        await queue.markSyncing(id);
        await queue.resetStaleSyncing();
        op = await queue.getById(id);
        expect(op?.retryCount).toBe(3);
        expect(op?.status).toBe('failed'); // maxRetries reached
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('resetOperationToPending', () => {
    it('should reset a syncing operation back to pending', async () => {
      const id = await queue.enqueue({
        entityType: 'game',
        entityId: 'game_1',
        operation: 'update',
        data: {},
        timestamp: Date.now(),
      });

      await queue.markSyncing(id);
      let op = await queue.getById(id);
      expect(op?.status).toBe('syncing');

      const result = await queue.resetOperationToPending(id);
      expect(result).toBe(true);

      op = await queue.getById(id);
      expect(op?.status).toBe('pending');
      expect(op?.lastError?.toLowerCase()).toContain('emergency reset');
    });

    it('should increment retryCount to prevent infinite loops', async () => {
      // Suppress expected console.warn when max retries reached
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        // Using main queue with maxRetries: 3 (set in beforeEach)
        const id = await queue.enqueue({
          entityType: 'game',
          entityId: 'game_retry_pending',
          operation: 'update',
          data: {},
          timestamp: Date.now(),
        });

        await queue.markSyncing(id);
        let op = await queue.getById(id);
        expect(op?.retryCount).toBe(0);

        // Reset - should increment
        await queue.resetOperationToPending(id);
        op = await queue.getById(id);
        expect(op?.retryCount).toBe(1);
        expect(op?.status).toBe('pending');

        // Mark syncing and reset again
        await queue.markSyncing(id);
        await queue.resetOperationToPending(id);
        op = await queue.getById(id);
        expect(op?.retryCount).toBe(2);
        expect(op?.status).toBe('pending'); // Not failed yet (maxRetries=3)

        // Mark syncing one more time and reset - should reach failed
        await queue.markSyncing(id);
        await queue.resetOperationToPending(id);
        op = await queue.getById(id);
        expect(op?.retryCount).toBe(3);
        expect(op?.status).toBe('failed'); // maxRetries reached
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('should return false for non-existent operation', async () => {
      // Suppress expected console.warn when operation not found
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const result = await queue.resetOperationToPending('non_existent_id');
        expect(result).toBe(false);
      } finally {
        warnSpy.mockRestore();
      }
    });
  });

  describe('edge cases', () => {
    it('should throw SyncError when marking non-existent operation as syncing', async () => {
      // Suppress expected console.error from logger when operation not found
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        // Should throw SyncError for consistency with markFailed
        await expect(queue.markSyncing('non_existent_id')).rejects.toThrow(SyncError);
        await expect(queue.markSyncing('non_existent_id')).rejects.toThrow(
          'Operation non_existent_id not found in queue'
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('should throw SyncError when marking non-existent operation as failed', async () => {
      // Suppress expected console.error from logger when operation not found
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        // Should throw SyncError to catch bugs where operation IDs become mismatched
        await expect(queue.markFailed('non_existent_id', 'Error')).rejects.toThrow(SyncError);
        await expect(queue.markFailed('non_existent_id', 'Error')).rejects.toThrow(
          'Operation non_existent_id not found in queue'
        );
      } finally {
        errorSpy.mockRestore();
      }
    });

    it('should handle marking non-existent operation as completed', async () => {
      // Should not throw - delete is idempotent (already gone = success)
      await queue.markCompleted('non_existent_id');
    });

    it('should handle empty queue gracefully', async () => {
      const pending = await queue.getPending(10);
      expect(pending).toHaveLength(0);

      const stats = await queue.getStats();
      expect(stats.total).toBe(0);

      const failed = await queue.getFailed();
      expect(failed).toHaveLength(0);
    });

    it('should preserve operation data through status changes', async () => {
      const data = { complex: { nested: 'data' }, array: [1, 2, 3] };

      const id = await queue.enqueue({
        entityType: 'game',
        entityId: 'game_1',
        operation: 'update',
        data,
        timestamp: Date.now(),
      });

      await queue.markSyncing(id);
      await queue.markFailed(id, 'Error');

      const op = await queue.getById(id);
      expect(op?.data).toEqual(data);
    });
  });
});
