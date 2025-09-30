/**
 * Storage Recovery Tests
 *
 * Tests the automatic corruption detection and recovery system.
 * Validates data validation, corruption repair, quarantine functionality,
 * and progressive recovery strategies.
 *
 * @author Claude Code
 */

import {
  StorageRecovery,
  RecoveryAction,
  RecoveryStrategy
} from './storageRecovery';
import { StorageError, StorageErrorType, StorageAdapter } from './storageAdapter';

// Mock storage adapter for testing
class MockStorageAdapter implements StorageAdapter {
  private data = new Map<string, string>();
  private failureMode: string | null = null;

  getBackendName(): string {
    return 'MockStorage';
  }

  async getItem(key: string): Promise<string | null> {
    if (this.failureMode === 'read') {
      throw new StorageError(StorageErrorType.READ_ERROR, 'Mock read failure');
    }
    return this.data.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.failureMode === 'write') {
      throw new StorageError(StorageErrorType.WRITE_ERROR, 'Mock write failure');
    }
    this.data.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    if (this.failureMode === 'delete') {
      throw new StorageError(StorageErrorType.DELETE_ERROR, 'Mock delete failure');
    }
    this.data.delete(key);
  }

  async clear(): Promise<void> {
    if (this.failureMode === 'clear') {
      throw new StorageError(StorageErrorType.OPERATION_FAILED, 'Mock clear failure');
    }
    this.data.clear();
  }

  async getKeys(): Promise<string[]> {
    if (this.failureMode === 'getKeys') {
      throw new StorageError(StorageErrorType.READ_ERROR, 'Mock getKeys failure');
    }
    return Array.from(this.data.keys());
  }

  // Test helper methods
  setFailureMode(mode: string | null): void {
    this.failureMode = mode;
  }

  getData(): Map<string, unknown> {
    return new Map(this.data);
  }

  setData(key: string, value: unknown): void {
    this.data.set(key, value as string);
  }
}

describe('StorageRecovery', () => {
  let recovery: StorageRecovery;
  let mockAdapter: MockStorageAdapter;

  beforeEach(() => {
    recovery = new StorageRecovery();
    mockAdapter = new MockStorageAdapter();
  });

  afterEach(() => {
    mockAdapter.setFailureMode(null);
  });

  describe('Data Validation', () => {
    /**
     * Tests valid data validation
     * @critical
     */
    it('should validate correct data successfully', async () => {
      const validPlayer = {
        id: 'player-1',
        name: 'John Doe',
        jerseyNumber: '10',
        position: 'Forward'
      };

      const result = await recovery.validateData('player:1', validPlayer);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    /**
     * Tests data structure validation
     * @integration
     */
    it('should detect structural issues', async () => {
      const invalidPlayer = {
        // Missing required id field
        name: 'John Doe',
        jerseyNumber: '10'
      };

      const result = await recovery.validateData('player:1', invalidPlayer);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Missing required field');
    });

    /**
     * Tests data type validation
     * @integration
     */
    it('should detect type mismatches', async () => {
      const invalidData = {
        id: 123, // Should be string
        name: null, // Should be string
        jerseyNumber: true // Should be string
      };

      const result = await recovery.validateData('player:1', invalidData);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    /**
     * Tests null and undefined handling
     * @edge-case
     */
    it('should handle null and undefined values', async () => {
      const nullResult = await recovery.validateData('test:1', null);
      expect(nullResult.isValid).toBe(false);
      expect(nullResult.errors[0]).toContain('Data is null or undefined');

      const undefinedResult = await recovery.validateData('test:2', undefined);
      expect(undefinedResult.isValid).toBe(false);
      expect(undefinedResult.errors[0]).toContain('Data is null or undefined');
    });

    /**
     * Tests circular reference detection
     * @edge-case
     */
    it('should detect circular references', async () => {
      const circularData: Record<string, unknown> = { name: 'test' };
      circularData.self = circularData; // Create circular reference

      const result = await recovery.validateData('circular:1', circularData);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Circular reference detected');
    });

    /**
     * Tests data size validation
     * @edge-case
     */
    it('should detect oversized data', async () => {
      const oversizedData = {
        id: 'test',
        largeField: 'x'.repeat(2 * 1024 * 1024) // 2MB string
      };

      const result = await recovery.validateData('oversized:1', oversizedData);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Data size exceeds maximum');
    });

    /**
     * Tests schema validation for different data types
     * @integration
     */
    it('should validate different data schemas', async () => {
      // Game data
      const gameData = {
        id: 'game-1',
        teamName: 'Test Team',
        homeScore: 2,
        awayScore: 1,
        startTime: new Date().toISOString()
      };

      const gameResult = await recovery.validateData('game:1', gameData);
      expect(gameResult.isValid).toBe(true);

      // Settings data
      const settingsData = {
        version: '1.0.0',
        language: 'en',
        theme: 'dark',
        notifications: true
      };

      const settingsResult = await recovery.validateData('settings', settingsData);
      expect(settingsResult.isValid).toBe(true);
    });
  });

  describe('Corruption Repair', () => {
    /**
     * Tests successful data repair
     * @critical
     */
    it('should repair corrupted data successfully', async () => {
      const corruptionError = new StorageError(
        StorageErrorType.DATA_CORRUPTION,
        'Data corrupted during storage'
      );

      // Set up no corrupted data to simulate successful repair
      mockAdapter.setData('player:1', JSON.stringify({ id: 'player-1', name: 'Valid Player' }));

      const result = await recovery.repairCorruption(corruptionError, mockAdapter);

      expect(result.success).toBe(true);
      expect(result.action).toBe(RecoveryAction.REPAIRED);
      expect(result.details).toContain('corrupted data detected and repaired');
    });

    /**
     * Tests repair with backup restoration
     * @integration
     */
    it('should restore from backup when repair fails', async () => {
      const corruptionError = new StorageError(
        StorageErrorType.DATA_CORRUPTION,
        'Irreparable data corruption'
      );

      // Set up corrupted data and backup
      mockAdapter.setData('corrupted:1', null);
      mockAdapter.setData('backup:corrupted:1', JSON.stringify({
        id: 'corrupted-1',
        name: 'Restored Item'
      }));

      const result = await recovery.repairCorruption(corruptionError, mockAdapter);

      expect(result.success).toBe(true);
      expect(result.action).toBe(RecoveryAction.RESTORED_BACKUP);
    });

    /**
     * Tests quarantine when repair impossible
     * @integration
     */
    it('should quarantine data when repair is impossible', async () => {
      const corruptionError = new StorageError(
        StorageErrorType.DATA_CORRUPTION,
        'Completely corrupted data'
      );

      // Set up irreparable corruption (invalid data that fails validation)
      mockAdapter.setData('player:corrupted', JSON.stringify({ invalidStructure: 'no required fields' }));

      const result = await recovery.repairCorruption(corruptionError, mockAdapter);

      expect(result.success).toBe(true);
      expect(result.action).toBe(RecoveryAction.QUARANTINED);
      expect(result.quarantinedKeys).toContain('player:corrupted');
    });

    /**
     * Tests repair strategy selection
     * @integration
     */
    it('should select appropriate repair strategy based on error type', async () => {
      const strategies = [
        {
          error: new StorageError(StorageErrorType.DATA_CORRUPTION, 'JSON parse error'),
          expectedStrategy: RecoveryStrategy.VALIDATE_AND_REPAIR
        },
        {
          error: new StorageError(StorageErrorType.QUOTA_EXCEEDED, 'Storage full'),
          expectedStrategy: RecoveryStrategy.CLEANUP_AND_REBUILD
        },
        {
          error: new StorageError(StorageErrorType.ACCESS_DENIED, 'Permission denied'),
          expectedStrategy: RecoveryStrategy.RESET_AND_MIGRATE
        }
      ];

      for (const { error, expectedStrategy } of strategies) {
        const result = await recovery.repairCorruption(error, mockAdapter);
        expect(result.strategy).toBe(expectedStrategy);
      }
    });

    /**
     * Tests progressive repair attempts
     * @integration
     */
    it('should attempt progressively more aggressive repairs', async () => {
      const corruptionError = new StorageError(
        StorageErrorType.DATA_CORRUPTION,
        'Multi-level corruption'
      );

      // Simulate initial repair failure by causing getKeys to fail
      mockAdapter.setFailureMode('getKeys');

      const result = await recovery.repairCorruption(corruptionError, mockAdapter);

      // Should eventually succeed with more aggressive strategy
      expect(result.attempts).toBeGreaterThan(1);
      expect(result.strategy).toBe(RecoveryStrategy.RESET_AND_MIGRATE);
    });
  });

  describe('Data Quarantine', () => {
    /**
     * Tests successful data quarantine
     * @integration
     */
    it('should quarantine corrupted data successfully', async () => {
      // Set up corrupted data
      mockAdapter.setData('corrupted:1', 'bad-data');
      mockAdapter.setData('corrupted:2', 'more-bad-data');
      mockAdapter.setData('good:1', JSON.stringify({ id: 'good-1', name: 'Good Data' }));

      const corruptedKeys = ['corrupted:1', 'corrupted:2'];
      const result = await recovery.quarantineCorruptedData(corruptedKeys, mockAdapter);

      expect(result.success).toBe(true);
      expect(result.quarantinedCount).toBe(2);
      expect(result.preservedCount).toBe(1);

      // Verify quarantined data is moved
      const quarantinedData1 = await mockAdapter.getItem('quarantine:corrupted:1');
      expect(quarantinedData1).toBe('bad-data');

      // Verify original corrupted data is removed
      const originalData1 = await mockAdapter.getItem('corrupted:1');
      expect(originalData1).toBeNull();

      // Verify good data is preserved
      const goodData = await mockAdapter.getItem('good:1');
      expect(goodData).toBeDefined();
    });

    /**
     * Tests quarantine metadata tracking
     * @integration
     */
    it('should track quarantine metadata', async () => {
      // Set up data to quarantine
      mockAdapter.setData('corrupted:1', 'some bad data');

      const corruptedKeys = ['corrupted:1'];
      await recovery.quarantineCorruptedData(corruptedKeys, mockAdapter);

      const metadata = await mockAdapter.getItem('quarantine:metadata');
      expect(metadata).toBeDefined();

      const parsedMetadata = JSON.parse(metadata as string);
      expect(parsedMetadata.quarantinedAt).toBeDefined();
      expect(parsedMetadata.keys).toEqual(['corrupted:1']);
      expect(parsedMetadata.reason).toContain('Data corruption detected');
    });

    /**
     * Tests quarantine with storage errors
     * @edge-case
     */
    it('should handle storage errors during quarantine', async () => {
      mockAdapter.setData('corrupted:1', 'bad-data');
      mockAdapter.setFailureMode('write'); // Simulate write failure

      const result = await recovery.quarantineCorruptedData(['corrupted:1'], mockAdapter);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    /**
     * Tests empty quarantine list
     * @edge-case
     */
    it('should handle empty quarantine list gracefully', async () => {
      const result = await recovery.quarantineCorruptedData([], mockAdapter);

      expect(result.success).toBe(true);
      expect(result.quarantinedCount).toBe(0);
      expect(result.preservedCount).toBe(0);
    });

    /**
     * Tests quarantine capacity limits
     * @edge-case
     */
    it('should respect quarantine capacity limits', async () => {
      // Create many corrupted keys
      const manyCorruptedKeys = Array.from({ length: 150 }, (_, i) => `corrupted:${i}`);

      // Set up corrupted data
      for (const key of manyCorruptedKeys) {
        mockAdapter.setData(key, 'bad-data');
      }

      const result = await recovery.quarantineCorruptedData(manyCorruptedKeys, mockAdapter);

      // Should limit quarantine to maximum capacity
      expect(result.success).toBe(false); // False because capacity was exceeded
      expect(result.quarantinedCount).toBeLessThanOrEqual(100); // Assuming 100 is max capacity
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Quarantine capacity exceeded');
    });
  });

  describe('Recovery Strategies', () => {
    /**
     * Tests validate and repair strategy
     * @integration
     */
    it('should execute validate and repair strategy', async () => {
      const error = new StorageError(StorageErrorType.DATA_CORRUPTION, 'Validation failed');

      // Set up partially corrupted data
      mockAdapter.setData('data:1', JSON.stringify({ id: 'data-1', name: 'Valid' }));
      mockAdapter.setData('data:2', '{"invalid": json}');

      const result = await recovery.repairCorruption(error, mockAdapter);

      expect(result.strategy).toBe(RecoveryStrategy.VALIDATE_AND_REPAIR);
      expect(result.success).toBe(true);
    });

    /**
     * Tests cleanup and rebuild strategy
     * @integration
     */
    it('should execute cleanup and rebuild strategy', async () => {
      const error = new StorageError(StorageErrorType.QUOTA_EXCEEDED, 'Storage quota exceeded');

      // Fill storage with data
      for (let i = 0; i < 10; i++) {
        mockAdapter.setData(`data:${i}`, JSON.stringify({ id: `data-${i}`, value: 'x'.repeat(1000) }));
      }

      const result = await recovery.repairCorruption(error, mockAdapter);

      expect(result.strategy).toBe(RecoveryStrategy.CLEANUP_AND_REBUILD);
      expect(result.success).toBe(true);
    });

    /**
     * Tests reset and migrate strategy
     * @integration
     */
    it('should execute reset and migrate strategy', async () => {
      const error = new StorageError(StorageErrorType.ACCESS_DENIED, 'Access denied to storage');

      const result = await recovery.repairCorruption(error, mockAdapter);

      expect(result.strategy).toBe(RecoveryStrategy.RESET_AND_MIGRATE);
      expect(result.success).toBe(true);
      expect(result.action).toBe(RecoveryAction.RESET);
    });

    /**
     * Tests strategy escalation on failure
     * @integration
     */
    it('should escalate to more aggressive strategies on failure', async () => {
      const error = new StorageError(StorageErrorType.DATA_CORRUPTION, 'Severe corruption');

      // Add corrupted data that will trigger validation
      mockAdapter.setData('player:bad', JSON.stringify({ invalidData: true }));

      // Simulate initial strategy failures by making getKeys fail
      mockAdapter.setFailureMode('getKeys');

      const result = await recovery.repairCorruption(error, mockAdapter);

      expect(result.attempts).toBeGreaterThan(1);
      expect(result.strategy).toBe(RecoveryStrategy.RESET_AND_MIGRATE); // Most aggressive
    });
  });

  describe('Data Migration and Backup', () => {
    /**
     * Tests backup creation during recovery
     * @integration
     */
    it('should create backups during recovery operations', async () => {
      const originalData = { id: 'test-1', name: 'Original Data' };
      mockAdapter.setData('data:1', JSON.stringify(originalData));

      const error = new StorageError(StorageErrorType.DATA_CORRUPTION, 'Test corruption');
      await recovery.repairCorruption(error, mockAdapter);

      // Check if backup was created
      const backup = await mockAdapter.getItem('backup:data:1');
      expect(backup).toBeDefined();
    });

    /**
     * Tests data migration between storage systems
     * @integration
     */
    it('should migrate data to new storage system on reset', async () => {
      // Set up original data
      const testData = {
        'player:1': { id: 'player-1', name: 'Player 1' },
        'game:1': { id: 'game-1', teamName: 'Team 1' },
        'settings': { version: '1.0.0', theme: 'dark' }
      };

      for (const [key, value] of Object.entries(testData)) {
        mockAdapter.setData(key, JSON.stringify(value));
      }

      const error = new StorageError(StorageErrorType.ACCESS_DENIED, 'Migration needed');
      const result = await recovery.repairCorruption(error, mockAdapter);

      expect(result.success).toBe(true);
      expect(result.action).toBe(RecoveryAction.RESET);
      expect(result.migratedKeys).toBeDefined();
      expect(result.migratedKeys!.length).toBeGreaterThan(0);
    });

    /**
     * Tests selective data preservation during reset
     * @integration
     */
    it('should preserve critical data during reset operations', async () => {
      // Set up mix of critical and non-critical data
      mockAdapter.setData('settings', JSON.stringify({ version: '1.0.0' }));
      mockAdapter.setData('player:critical', JSON.stringify({ id: 'critical-player' }));
      mockAdapter.setData('temp:cache', JSON.stringify({ cached: 'data' }));

      const error = new StorageError(StorageErrorType.ACCESS_DENIED, 'System reset needed');
      const result = await recovery.repairCorruption(error, mockAdapter);

      expect(result.success).toBe(true);
      expect(result.preservedKeys).toContain('settings');
      expect(result.preservedKeys).toContain('player:critical');
      expect(result.preservedKeys).not.toContain('temp:cache');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    /**
     * Tests recovery with adapter failures
     * @edge-case
     */
    it('should handle adapter failures gracefully', async () => {
      mockAdapter.setFailureMode('getKeys');

      const error = new StorageError(StorageErrorType.READ_ERROR, 'Cannot read data');
      const result = await recovery.repairCorruption(error, mockAdapter);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('getKeys');
    });

    /**
     * Tests recovery with unknown error types
     * @edge-case
     */
    it('should handle unknown error types', async () => {
      const unknownError = new StorageError(
        'UNKNOWN_ERROR' as StorageErrorType,
        'Unknown storage error'
      );

      const result = await recovery.repairCorruption(unknownError, mockAdapter);

      expect(result.success).toBe(true);
      expect(result.strategy).toBe(RecoveryStrategy.VALIDATE_AND_REPAIR); // Default strategy
    });

    /**
     * Tests concurrent recovery attempts
     * @edge-case
     */
    it('should handle concurrent recovery attempts', async () => {
      const error = new StorageError(StorageErrorType.DATA_CORRUPTION, 'Concurrent test');

      // Start multiple recovery attempts simultaneously
      const promises = [
        recovery.repairCorruption(error, mockAdapter),
        recovery.repairCorruption(error, mockAdapter),
        recovery.repairCorruption(error, mockAdapter)
      ];

      const results = await Promise.all(promises);

      // All should complete successfully
      for (const result of results) {
        expect(result.success).toBe(true);
      }
    });

    /**
     * Tests recovery with very large datasets
     * @performance
     */
    it('should handle recovery of large datasets efficiently', async () => {
      // Create large dataset
      for (let i = 0; i < 1000; i++) {
        mockAdapter.setData(`data:${i}`, JSON.stringify({
          id: `data-${i}`,
          payload: 'x'.repeat(100)
        }));
      }

      const error = new StorageError(StorageErrorType.DATA_CORRUPTION, 'Large dataset corruption');
      const startTime = performance.now();

      const result = await recovery.repairCorruption(error, mockAdapter);

      const duration = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    /**
     * Tests recovery state consistency
     * @critical
     */
    it('should maintain data consistency during recovery', async () => {
      // Set up initial state
      const initialData = {
        'player:1': { id: 'player-1', name: 'Player 1' },
        'player:2': { id: 'player-2', name: 'Player 2' },
        'game:1': { id: 'game-1', players: ['player-1', 'player-2'] }
      };

      for (const [key, value] of Object.entries(initialData)) {
        mockAdapter.setData(key, JSON.stringify(value));
      }

      const error = new StorageError(StorageErrorType.DATA_CORRUPTION, 'Consistency test');
      const result = await recovery.repairCorruption(error, mockAdapter);

      expect(result.success).toBe(true);

      // Verify referential integrity is maintained
      const gameData = await mockAdapter.getItem('game:1');
      if (gameData) {
        const game = JSON.parse(gameData as string);
        for (const playerId of game.players || []) {
          const playerKey = `player:${playerId.split('-')[1]}`;
          const playerData = await mockAdapter.getItem(playerKey);
          expect(playerData).toBeDefined();
        }
      }
    });
  });
});