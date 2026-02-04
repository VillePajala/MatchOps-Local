/**
 * Tests for ConflictResolver
 */

import {
  ConflictResolver,
  isAutoResolvableConflict,
  isConflictError, // Deprecated alias - imported to verify it still works
  isNotFoundError,
  type ConflictResolverOptions,
  type CloudRecord,
} from '../conflictResolution';
import { ConflictError, AlreadyExistsError } from '@/interfaces/DataStoreErrors';
import type { SyncOperation } from '../types';

describe('ConflictResolver', () => {
  // Mock functions
  let mockFetchFromCloud: jest.Mock;
  let mockWriteToCloud: jest.Mock;
  let mockDeleteFromCloud: jest.Mock;
  let mockWriteToLocal: jest.Mock;
  let resolver: ConflictResolver;

  // Test timestamps
  const NOW = 1700000000000; // Fixed timestamp for tests
  const OLDER = NOW - 10000; // 10 seconds older
  const NEWER = NOW + 10000; // 10 seconds newer

  beforeEach(() => {
    mockFetchFromCloud = jest.fn();
    mockWriteToCloud = jest.fn().mockResolvedValue(undefined);
    mockDeleteFromCloud = jest.fn().mockResolvedValue(undefined);
    mockWriteToLocal = jest.fn().mockResolvedValue(undefined);

    const options: ConflictResolverOptions = {
      fetchFromCloud: mockFetchFromCloud,
      writeToCloud: mockWriteToCloud,
      deleteFromCloud: mockDeleteFromCloud,
      writeToLocal: mockWriteToLocal,
    };

    resolver = new ConflictResolver(options);
  });

  // Helper to create a sync operation
  const createOperation = (
    overrides: Partial<SyncOperation> = {}
  ): SyncOperation => ({
    id: 'op-1',
    entityType: 'player',
    entityId: 'player-1',
    operation: 'update',
    data: { id: 'player-1', name: 'Test Player' },
    timestamp: NOW,
    status: 'syncing',
    retryCount: 0,
    maxRetries: 10,
    createdAt: NOW,
    ...overrides,
  });

  // Helper to create a cloud record
  const createCloudRecord = (
    overrides: Partial<CloudRecord> = {}
  ): CloudRecord => ({
    id: 'player-1',
    name: 'Cloud Player',
    updatedAt: new Date(NOW).toISOString(),
    ...overrides,
  });

  describe('Local Update vs Cloud Record', () => {
    it('should let local win when local timestamp is newer', async () => {
      const op = createOperation({ timestamp: NEWER });
      const cloudRecord = createCloudRecord({
        updatedAt: new Date(NOW).toISOString(),
      });
      mockFetchFromCloud.mockResolvedValue(cloudRecord);

      const result = await resolver.resolve(op);

      expect(result.resolution.winner).toBe('local');
      expect(result.actionTaken).toBe(true);
      expect(mockWriteToCloud).toHaveBeenCalledWith(
        'player',
        'player-1',
        op.data
      );
      expect(mockWriteToLocal).not.toHaveBeenCalled();
    });

    it('should let local win when timestamps are equal (tie-breaker)', async () => {
      const op = createOperation({ timestamp: NOW });
      const cloudRecord = createCloudRecord({
        updatedAt: new Date(NOW).toISOString(),
      });
      mockFetchFromCloud.mockResolvedValue(cloudRecord);

      const result = await resolver.resolve(op);

      expect(result.resolution.winner).toBe('local');
      expect(result.actionTaken).toBe(true);
      expect(mockWriteToCloud).toHaveBeenCalled();
    });

    it('should let cloud win when cloud timestamp is newer', async () => {
      const op = createOperation({ timestamp: OLDER });
      const cloudRecord = createCloudRecord({
        updatedAt: new Date(NOW).toISOString(),
      });
      mockFetchFromCloud.mockResolvedValue(cloudRecord);

      const result = await resolver.resolve(op);

      expect(result.resolution.winner).toBe('cloud');
      expect(result.actionTaken).toBe(true);
      expect(mockWriteToLocal).toHaveBeenCalledWith(
        'player',
        'player-1',
        cloudRecord
      );
      expect(mockWriteToCloud).not.toHaveBeenCalled();
    });

    it('should include timestamps in resolution', async () => {
      const op = createOperation({ timestamp: OLDER });
      const cloudRecord = createCloudRecord({
        updatedAt: new Date(NOW).toISOString(),
      });
      mockFetchFromCloud.mockResolvedValue(cloudRecord);

      const result = await resolver.resolve(op);

      expect(result.resolution.localTimestamp).toBe(OLDER);
      expect(result.resolution.cloudTimestamp).toBe(NOW);
      expect(result.resolution.entityType).toBe('player');
      expect(result.resolution.entityId).toBe('player-1');
    });
  });

  describe('Local Create vs Missing Cloud Record', () => {
    it('should push local create when cloud record is missing', async () => {
      const op = createOperation({ operation: 'create' });
      mockFetchFromCloud.mockResolvedValue(null);

      const result = await resolver.resolve(op);

      expect(result.resolution.winner).toBe('local');
      expect(result.actionTaken).toBe(true);
      expect(mockWriteToCloud).toHaveBeenCalledWith(
        'player',
        'player-1',
        op.data
      );
    });

    it('should set cloud timestamp to 0 when cloud record is missing', async () => {
      const op = createOperation({ operation: 'create' });
      mockFetchFromCloud.mockResolvedValue(null);

      const result = await resolver.resolve(op);

      expect(result.resolution.cloudTimestamp).toBe(0);
    });
  });

  describe('Local Delete Operations', () => {
    it('should delete from cloud when local delete is newer', async () => {
      const op = createOperation({
        operation: 'delete',
        timestamp: NEWER,
        data: null,
      });
      const cloudRecord = createCloudRecord({
        updatedAt: new Date(NOW).toISOString(),
      });
      mockFetchFromCloud.mockResolvedValue(cloudRecord);

      const result = await resolver.resolve(op);

      expect(result.resolution.winner).toBe('local');
      expect(result.actionTaken).toBe(true);
      // deleteFromCloud now receives context (op.data) as third parameter
      expect(mockDeleteFromCloud).toHaveBeenCalledWith('player', 'player-1', null);
      expect(mockWriteToLocal).not.toHaveBeenCalled();
    });

    it('should delete from cloud when timestamps are equal', async () => {
      const op = createOperation({
        operation: 'delete',
        timestamp: NOW,
        data: null,
      });
      const cloudRecord = createCloudRecord({
        updatedAt: new Date(NOW).toISOString(),
      });
      mockFetchFromCloud.mockResolvedValue(cloudRecord);

      const result = await resolver.resolve(op);

      expect(result.resolution.winner).toBe('local');
      expect(mockDeleteFromCloud).toHaveBeenCalled();
    });

    it('should resurrect locally when cloud update is newer than local delete', async () => {
      const op = createOperation({
        operation: 'delete',
        timestamp: OLDER,
        data: null,
      });
      const cloudRecord = createCloudRecord({
        updatedAt: new Date(NOW).toISOString(),
      });
      mockFetchFromCloud.mockResolvedValue(cloudRecord);

      const result = await resolver.resolve(op);

      expect(result.resolution.winner).toBe('cloud');
      expect(result.actionTaken).toBe(true);
      expect(mockWriteToLocal).toHaveBeenCalledWith(
        'player',
        'player-1',
        cloudRecord
      );
      expect(mockDeleteFromCloud).not.toHaveBeenCalled();
    });

    it('should report no action when both local and cloud have deleted', async () => {
      const op = createOperation({
        operation: 'delete',
        timestamp: NOW,
        data: null,
      });
      mockFetchFromCloud.mockResolvedValue(null);

      const result = await resolver.resolve(op);

      expect(result.resolution.winner).toBe('local');
      expect(result.actionTaken).toBe(false);
      expect(mockDeleteFromCloud).not.toHaveBeenCalled();
      expect(mockWriteToCloud).not.toHaveBeenCalled();
    });
  });

  describe('Different Entity Types', () => {
    const entityTypes = [
      'player',
      'team',
      'game',
      'season',
      'tournament',
      'personnel',
      'settings',
      'teamRoster',
      'playerAdjustment',
      'warmupPlan',
    ] as const;

    it.each(entityTypes)('should handle %s entity type', async (entityType) => {
      const op = createOperation({
        entityType,
        entityId: `${entityType}-1`,
        timestamp: NEWER,
      });
      const cloudRecord = createCloudRecord({
        id: `${entityType}-1`,
        updatedAt: new Date(NOW).toISOString(),
      });
      mockFetchFromCloud.mockResolvedValue(cloudRecord);

      const result = await resolver.resolve(op);

      expect(result.resolution.entityType).toBe(entityType);
      expect(result.resolution.entityId).toBe(`${entityType}-1`);
    });
  });

  describe('Error Handling', () => {
    it('should propagate fetch errors', async () => {
      const op = createOperation();
      mockFetchFromCloud.mockRejectedValue(new Error('Network error'));

      await expect(resolver.resolve(op)).rejects.toThrow('Network error');
    });

    it('should propagate write errors', async () => {
      const op = createOperation({ timestamp: NEWER });
      mockFetchFromCloud.mockResolvedValue(
        createCloudRecord({ updatedAt: new Date(NOW).toISOString() })
      );
      mockWriteToCloud.mockRejectedValue(new Error('Write failed'));

      await expect(resolver.resolve(op)).rejects.toThrow('Write failed');
    });

    it('should propagate delete errors', async () => {
      const op = createOperation({
        operation: 'delete',
        timestamp: NEWER,
        data: null,
      });
      mockFetchFromCloud.mockResolvedValue(
        createCloudRecord({ updatedAt: new Date(NOW).toISOString() })
      );
      mockDeleteFromCloud.mockRejectedValue(new Error('Delete failed'));

      await expect(resolver.resolve(op)).rejects.toThrow('Delete failed');
    });
  });

  describe('Input Validation', () => {
    it('should throw when entityId is empty', async () => {
      const op = createOperation({ entityId: '' });

      await expect(resolver.resolve(op)).rejects.toThrow('entityId is required');
    });

    it('should throw when entityId is whitespace only', async () => {
      const op = createOperation({ entityId: '   ' });

      await expect(resolver.resolve(op)).rejects.toThrow('entityId is required');
    });

    it('should throw when timestamp is NaN', async () => {
      const op = createOperation({ timestamp: NaN });

      await expect(resolver.resolve(op)).rejects.toThrow('timestamp must be a positive number');
    });

    it('should throw when timestamp is negative', async () => {
      const op = createOperation({ timestamp: -1 });

      await expect(resolver.resolve(op)).rejects.toThrow('timestamp must be a positive number');
    });

    it('should throw when timestamp is Infinity', async () => {
      const op = createOperation({ timestamp: Infinity });

      await expect(resolver.resolve(op)).rejects.toThrow('timestamp must be a positive number');
    });

    it('should throw when cloud record has invalid updatedAt', async () => {
      const op = createOperation({ timestamp: NOW });
      mockFetchFromCloud.mockResolvedValue(
        createCloudRecord({ updatedAt: 'not-a-date' })
      );

      await expect(resolver.resolve(op)).rejects.toThrow('is not a valid date');
    });

    it('should throw when cloud record has empty updatedAt', async () => {
      const op = createOperation({ timestamp: NOW });
      mockFetchFromCloud.mockResolvedValue(createCloudRecord({ updatedAt: '' }));

      await expect(resolver.resolve(op)).rejects.toThrow('is not a valid date');
    });
  });
});

describe('isAutoResolvableConflict', () => {
  /**
   * Issue #330: ConflictError from optimistic locking should NOT be auto-resolved.
   * These require user intervention (refresh to see latest changes).
   */
  it('should return false for ConflictError (optimistic locking)', () => {
    const conflictError = new ConflictError('game', 'game_123', 'Version mismatch');
    expect(isAutoResolvableConflict(conflictError)).toBe(false);
  });

  /**
   * Generic "conflict" messages should NOT trigger auto-resolution.
   * They could be ConflictError messages that need user intervention.
   */
  it('should NOT detect generic "conflict" in error message', () => {
    // Generic conflict errors should propagate to UI, not auto-resolve
    expect(isAutoResolvableConflict(new Error('Conflict detected'))).toBe(false);
    expect(isAutoResolvableConflict(new Error('A conflict occurred'))).toBe(false);
  });

  /**
   * "version mismatch" indicates optimistic locking conflict - NOT auto-resolvable.
   */
  it('should NOT detect "version mismatch" in error message', () => {
    expect(isAutoResolvableConflict(new Error('version mismatch'))).toBe(false);
  });

  // Unique constraint violations CAN be auto-resolved via timestamp-based last-write-wins
  it('should detect "already exists" in error message', () => {
    expect(isAutoResolvableConflict(new Error('Record already exists'))).toBe(true);
  });

  it('should detect "duplicate key" in error message', () => {
    expect(isAutoResolvableConflict(new Error('duplicate key value'))).toBe(true);
  });

  it('should detect "unique constraint" in error message', () => {
    expect(isAutoResolvableConflict(new Error('unique constraint violation'))).toBe(true);
  });

  it('should detect PostgreSQL error code 23505', () => {
    expect(isAutoResolvableConflict(new Error('error code 23505'))).toBe(true);
  });

  it('should be case-insensitive for unique constraint violations', () => {
    expect(isAutoResolvableConflict(new Error('ALREADY EXISTS'))).toBe(true);
    expect(isAutoResolvableConflict(new Error('Unique Constraint'))).toBe(true);
  });

  it('should return false for non-conflict errors', () => {
    expect(isAutoResolvableConflict(new Error('Network error'))).toBe(false);
    expect(isAutoResolvableConflict(new Error('Server timeout'))).toBe(false);
    expect(isAutoResolvableConflict(new Error('Permission denied'))).toBe(false);
  });

  it('should return false for non-Error values', () => {
    expect(isAutoResolvableConflict('conflict')).toBe(false);
    expect(isAutoResolvableConflict({ message: 'conflict' })).toBe(false);
    expect(isAutoResolvableConflict(null)).toBe(false);
    expect(isAutoResolvableConflict(undefined)).toBe(false);
  });

  /**
   * Verify the deprecated alias still works for backwards compatibility.
   */
  it('should work via deprecated isConflictError alias', () => {
    // Both should behave identically
    expect(isConflictError(new Error('already exists'))).toBe(true);
    expect(isConflictError(new ConflictError('game', 'id', 'msg'))).toBe(false);
  });
});

describe('Context Parameter for Efficient Lookups', () => {
  let mockFetchFromCloud: jest.Mock;
  let mockWriteToCloud: jest.Mock;
  let mockDeleteFromCloud: jest.Mock;
  let mockWriteToLocal: jest.Mock;
  let resolver: ConflictResolver;

  const NOW = 1700000000000;

  beforeEach(() => {
    mockFetchFromCloud = jest.fn();
    mockWriteToCloud = jest.fn().mockResolvedValue(undefined);
    mockDeleteFromCloud = jest.fn().mockResolvedValue(undefined);
    mockWriteToLocal = jest.fn().mockResolvedValue(undefined);

    resolver = new ConflictResolver({
      fetchFromCloud: mockFetchFromCloud,
      writeToCloud: mockWriteToCloud,
      deleteFromCloud: mockDeleteFromCloud,
      writeToLocal: mockWriteToLocal,
    });
  });

  it('should pass context (op.data) to fetchFromCloud', async () => {
    const contextData = { id: 'adj-1', playerId: 'player-123' };
    const op: SyncOperation = {
      id: 'op-1',
      entityType: 'playerAdjustment',
      entityId: 'adj-1',
      operation: 'update',
      data: contextData,
      timestamp: NOW,
      status: 'syncing',
      retryCount: 0,
      maxRetries: 10,
      createdAt: NOW,
    };

    const cloudRecord: CloudRecord = {
      id: 'adj-1',
      updatedAt: new Date(NOW - 1000).toISOString(),
    };
    mockFetchFromCloud.mockResolvedValue(cloudRecord);

    await resolver.resolve(op);

    // Verify context was passed as third argument
    expect(mockFetchFromCloud).toHaveBeenCalledWith(
      'playerAdjustment',
      'adj-1',
      contextData // context is the operation data
    );
  });

  it('should work correctly without context (backwards compatibility)', async () => {
    const op: SyncOperation = {
      id: 'op-1',
      entityType: 'player',
      entityId: 'player-1',
      operation: 'create',
      data: null, // No data
      timestamp: NOW,
      status: 'syncing',
      retryCount: 0,
      maxRetries: 10,
      createdAt: NOW,
    };

    mockFetchFromCloud.mockResolvedValue(null);

    const result = await resolver.resolve(op);

    expect(result.resolution.winner).toBe('local');
    expect(mockFetchFromCloud).toHaveBeenCalledWith('player', 'player-1', null);
  });
});

describe('Epoch Timestamp Edge Cases', () => {
  let mockFetchFromCloud: jest.Mock;
  let mockWriteToCloud: jest.Mock;
  let mockDeleteFromCloud: jest.Mock;
  let mockWriteToLocal: jest.Mock;
  let resolver: ConflictResolver;

  const NOW = 1700000000000;
  const EPOCH = new Date(0).toISOString(); // 1970-01-01

  beforeEach(() => {
    mockFetchFromCloud = jest.fn();
    mockWriteToCloud = jest.fn().mockResolvedValue(undefined);
    mockDeleteFromCloud = jest.fn().mockResolvedValue(undefined);
    mockWriteToLocal = jest.fn().mockResolvedValue(undefined);

    resolver = new ConflictResolver({
      fetchFromCloud: mockFetchFromCloud,
      writeToCloud: mockWriteToCloud,
      deleteFromCloud: mockDeleteFromCloud,
      writeToLocal: mockWriteToLocal,
    });
  });

  it('should let local win when cloud has epoch timestamp (no updatedAt)', async () => {
    const op: SyncOperation = {
      id: 'op-1',
      entityType: 'settings',
      entityId: 'app',
      operation: 'update',
      data: { currentGameId: 'game-1' },
      timestamp: NOW,
      status: 'syncing',
      retryCount: 0,
      maxRetries: 10,
      createdAt: NOW,
    };

    // Cloud record with epoch timestamp (simulating missing updatedAt)
    const cloudRecord: CloudRecord = {
      id: 'app',
      updatedAt: EPOCH,
    };
    mockFetchFromCloud.mockResolvedValue(cloudRecord);

    const result = await resolver.resolve(op);

    expect(result.resolution.winner).toBe('local');
    expect(result.resolution.cloudTimestamp).toBe(0);
    expect(mockWriteToCloud).toHaveBeenCalled();
  });

  it('should let cloud win when local timestamp is before epoch (edge case)', async () => {
    // This should not happen in practice, but tests defensive behavior
    const op: SyncOperation = {
      id: 'op-1',
      entityType: 'settings',
      entityId: 'app',
      operation: 'update',
      data: { currentGameId: 'game-1' },
      timestamp: 0, // Epoch timestamp
      status: 'syncing',
      retryCount: 0,
      maxRetries: 10,
      createdAt: NOW,
    };

    const cloudRecord: CloudRecord = {
      id: 'app',
      updatedAt: new Date(NOW).toISOString(),
    };
    mockFetchFromCloud.mockResolvedValue(cloudRecord);

    const result = await resolver.resolve(op);

    expect(result.resolution.winner).toBe('cloud');
    expect(mockWriteToLocal).toHaveBeenCalled();
  });

  it('should handle both sides with epoch timestamp (tie goes to local)', async () => {
    const op: SyncOperation = {
      id: 'op-1',
      entityType: 'warmupPlan',
      entityId: 'default',
      operation: 'update',
      data: { exercises: [] },
      timestamp: 0, // Epoch
      status: 'syncing',
      retryCount: 0,
      maxRetries: 10,
      createdAt: NOW,
    };

    const cloudRecord: CloudRecord = {
      id: 'default',
      updatedAt: EPOCH, // Also epoch
    };
    mockFetchFromCloud.mockResolvedValue(cloudRecord);

    const result = await resolver.resolve(op);

    // Tie goes to local (>= comparison)
    expect(result.resolution.winner).toBe('local');
  });
});

describe('isNotFoundError', () => {
  it('should detect "not found" in error message', () => {
    expect(isNotFoundError(new Error('Record not found'))).toBe(true);
    expect(isNotFoundError(new Error('Player not found'))).toBe(true);
  });

  it('should detect "does not exist" in error message', () => {
    expect(isNotFoundError(new Error('Record does not exist'))).toBe(true);
  });

  it('should detect "no rows" in error message', () => {
    expect(isNotFoundError(new Error('Query returned no rows'))).toBe(true);
  });

  it('should detect "404" in error message', () => {
    expect(isNotFoundError(new Error('HTTP 404'))).toBe(true);
    expect(isNotFoundError(new Error('Error: 404 Not Found'))).toBe(true);
  });

  it('should be case-insensitive', () => {
    expect(isNotFoundError(new Error('NOT FOUND'))).toBe(true);
    expect(isNotFoundError(new Error('Does Not Exist'))).toBe(true);
  });

  it('should return false for non-not-found errors', () => {
    expect(isNotFoundError(new Error('Network error'))).toBe(false);
    expect(isNotFoundError(new Error('Permission denied'))).toBe(false);
    expect(isNotFoundError(new Error('Conflict'))).toBe(false);
  });

  it('should return false for non-Error values', () => {
    expect(isNotFoundError('not found')).toBe(false);
    expect(isNotFoundError({ message: 'not found' })).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
  });
});

describe('AlreadyExistsError Handling', () => {
  // Mock functions
  let mockFetchFromCloud: jest.Mock;
  let mockWriteToCloud: jest.Mock;
  let mockDeleteFromCloud: jest.Mock;
  let mockWriteToLocal: jest.Mock;
  let resolver: ConflictResolver;

  // Test timestamps
  const NOW = 1700000000000;
  const OLDER = NOW - 10000;

  beforeEach(() => {
    mockFetchFromCloud = jest.fn();
    mockWriteToCloud = jest.fn();
    mockDeleteFromCloud = jest.fn().mockResolvedValue(undefined);
    mockWriteToLocal = jest.fn().mockResolvedValue(undefined);

    const options: ConflictResolverOptions = {
      fetchFromCloud: mockFetchFromCloud,
      writeToCloud: mockWriteToCloud,
      deleteFromCloud: mockDeleteFromCloud,
      writeToLocal: mockWriteToLocal,
    };

    resolver = new ConflictResolver(options);
  });

  // Helper to create a sync operation
  const createOperation = (
    overrides: Partial<SyncOperation> = {}
  ): SyncOperation => ({
    id: 'op-1',
    entityType: 'player',
    entityId: 'player-1',
    operation: 'update',
    data: { id: 'player-1', name: 'Test' },
    timestamp: NOW,
    status: 'pending',
    retryCount: 0,
    maxRetries: 10,
    createdAt: NOW,
    ...overrides,
  });

  describe('handleMissingCloudRecord', () => {
    it('should treat AlreadyExistsError as success (race condition)', async () => {
      // Simulate: cloud record missing on fetch, but writeToCloud fails with AlreadyExistsError
      // This happens when another process creates the record between our fetch and write
      mockFetchFromCloud.mockResolvedValue(null);
      mockWriteToCloud.mockRejectedValue(new AlreadyExistsError('player', 'player-1'));

      const op = createOperation({ operation: 'create' });
      const result = await resolver.resolve(op);

      expect(result.resolution.winner).toBe('local');
      expect(result.actionTaken).toBe(true);
      expect(mockWriteToCloud).toHaveBeenCalledTimes(1);
      // No error should propagate - treated as success
    });

    it('should still propagate non-AlreadyExistsError errors', async () => {
      mockFetchFromCloud.mockResolvedValue(null);
      mockWriteToCloud.mockRejectedValue(new Error('Network timeout'));

      const op = createOperation({ operation: 'create' });

      await expect(resolver.resolve(op)).rejects.toThrow('Network timeout');
    });
  });

  describe('handleLocalWrite', () => {
    it('should treat AlreadyExistsError as success when local wins (RPC UPSERT issue)', async () => {
      // Simulate: cloud record exists, local timestamp is newer, but writeToCloud fails
      // This happens when RPC doesn't properly support UPSERT semantics
      const cloudRecord: CloudRecord = {
        id: 'player-1',
        updatedAt: new Date(OLDER).toISOString(),
      };
      mockFetchFromCloud.mockResolvedValue(cloudRecord);
      mockWriteToCloud.mockRejectedValue(new AlreadyExistsError('player', 'player-1'));

      // Expect the warning log about RPC UPSERT issue
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const op = createOperation({ timestamp: NOW }); // Local is newer than OLDER
      const result = await resolver.resolve(op);

      expect(result.resolution.winner).toBe('local');
      expect(result.actionTaken).toBe(true);
      expect(mockWriteToCloud).toHaveBeenCalledTimes(1);
      // No error should propagate - treated as success

      // Verify warning was logged
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should still propagate non-AlreadyExistsError errors when local wins', async () => {
      const cloudRecord: CloudRecord = {
        id: 'player-1',
        updatedAt: new Date(OLDER).toISOString(),
      };
      mockFetchFromCloud.mockResolvedValue(cloudRecord);
      mockWriteToCloud.mockRejectedValue(new Error('Connection reset'));

      const op = createOperation({ timestamp: NOW });

      await expect(resolver.resolve(op)).rejects.toThrow('Connection reset');
    });

    it('should not call writeToCloud when cloud wins (no AlreadyExistsError possible)', async () => {
      // When cloud is newer, we write to local, not to cloud
      const cloudRecord: CloudRecord = {
        id: 'player-1',
        updatedAt: new Date(NOW + 10000).toISOString(), // Cloud is newer
      };
      mockFetchFromCloud.mockResolvedValue(cloudRecord);

      const op = createOperation({ timestamp: NOW });
      const result = await resolver.resolve(op);

      expect(result.resolution.winner).toBe('cloud');
      expect(mockWriteToCloud).not.toHaveBeenCalled();
      expect(mockWriteToLocal).toHaveBeenCalledTimes(1);
    });
  });
});
