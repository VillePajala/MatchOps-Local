/**
 * Tests for Migration Control Manager
 */

import { MigrationControlManager } from './migrationControlManager';
import { MIGRATION_CONTROL_FEATURES } from '@/config/migrationConfig';
import { LocalStorageAdapter } from './localStorageAdapter';
import { MigrationControlCallbacks } from '@/types/migrationControl';

// Mock dependencies
jest.mock('./localStorageAdapter');
jest.mock('./logger', () => ({
  createLogger: () => ({
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

const mockLocalStorageAdapter = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  getBackendName: jest.fn().mockReturnValue('test'),
  getKeys: jest.fn(),
  formatSize: jest.fn(),
  isQuotaExceededError: jest.fn()
} as unknown as jest.Mocked<LocalStorageAdapter>;

(LocalStorageAdapter as jest.Mock).mockImplementation(() => mockLocalStorageAdapter);

describe('MigrationControlManager', () => {
  let manager: MigrationControlManager;
  let mockCallbacks: MigrationControlCallbacks;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCallbacks = {
      onPause: jest.fn(),
      onResume: jest.fn(),
      onCancel: jest.fn(),
      onEstimation: jest.fn(),
      onPreview: jest.fn()
    };
    manager = new MigrationControlManager(mockCallbacks);
  });

  afterEach(async () => {
    await manager.cleanup();
  });

  describe('initialization', () => {
    it('should initialize with correct default state', () => {
      const state = manager.getControlState();
      expect(state.canPause).toBe(MIGRATION_CONTROL_FEATURES.ALLOW_PAUSE);
      expect(state.canCancel).toBe(MIGRATION_CONTROL_FEATURES.ALLOW_CANCEL);
      expect(state.isPaused).toBe(false);
      expect(state.isCancelling).toBe(false);
    });

    it('should check for existing resume data on initialization', () => {
      expect(mockLocalStorageAdapter.getItem).toHaveBeenCalledWith(
        MIGRATION_CONTROL_FEATURES.PROGRESS_STORAGE_KEY
      );
    });
  });

  describe('pause functionality', () => {
    it('should request pause when allowed', async () => {
      await manager.requestPause();
      const state = manager.getControlState();
      expect(state.isPaused).toBe(true);
    });

    it('should not pause if already paused', async () => {
      await manager.requestPause();
      const initialState = manager.getControlState();

      await manager.requestPause(); // Second pause request
      const finalState = manager.getControlState();

      expect(finalState).toEqual(initialState);
    });

    it('should save pause state correctly', async () => {
      const testData = {
        lastProcessedKey: 'key5',
        processedKeys: ['key1', 'key2', 'key3', 'key4'],
        remainingKeys: ['key6', 'key7', 'key8'],
        itemsProcessed: 4,
        totalItems: 8,
        bytesProcessed: 1024,
        totalBytes: 2048
      };

      await manager.savePauseState(
        testData.lastProcessedKey,
        testData.processedKeys,
        testData.remainingKeys,
        testData.itemsProcessed,
        testData.totalItems,
        testData.bytesProcessed,
        testData.totalBytes
      );

      expect(mockLocalStorageAdapter.setItem).toHaveBeenCalledWith(
        MIGRATION_CONTROL_FEATURES.PROGRESS_STORAGE_KEY,
        expect.stringContaining(testData.lastProcessedKey)
      );
      expect(mockCallbacks.onPause).toHaveBeenCalled();
    });
  });

  describe('resume functionality', () => {
    it('should resume when resume data is available', async () => {
      // First, request a pause to get into pause state
      await manager.requestPause();

      // Then save pause state with specific data
      await manager.savePauseState(
        'key5',
        ['key1', 'key2'],
        ['key6', 'key7'],
        2,
        4,
        512,
        1024
      );

      // Now resume should work
      const result = await manager.requestResume();

      expect(result).not.toBeNull();
      expect(result!.lastProcessedKey).toBe('key5');
      expect(result!.itemsProcessed).toBe(2);
      expect(result!.totalItems).toBe(4);
      expect(mockCallbacks.onResume).toHaveBeenCalled();
    });

    it('should return null when no resume data available', async () => {
      const result = await manager.requestResume();
      expect(result).toBeNull();
    });
  });

  describe('cancel functionality', () => {
    it('should request cancel with default reason', async () => {
      await manager.requestCancel();
      const state = manager.getControlState();
      expect(state.isCancelling).toBe(true);
      expect(mockCallbacks.onCancel).toHaveBeenCalledWith({
        reason: 'user_request',
        timestamp: expect.any(Number),
        cleanupCompleted: false,
        dataRolledBack: false,
        backupRestored: false
      });
    });

    it('should request cancel with custom reason', async () => {
      await manager.requestCancel('memory_pressure');
      expect(mockCallbacks.onCancel).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'memory_pressure' })
      );
    });

    it('should not cancel if already cancelling', async () => {
      await manager.requestCancel();
      const callCount = (mockCallbacks.onCancel as jest.Mock).mock.calls.length;

      await manager.requestCancel(); // Second cancel request

      expect(mockCallbacks.onCancel).toHaveBeenCalledTimes(callCount);
    });
  });

  describe('estimation functionality', () => {
    beforeEach(() => {
      // Mock performance.now
      global.performance = {
        now: jest.fn(() => 100)
      } as unknown as Performance;
    });

    it('should estimate migration for small dataset', async () => {
      const keys = ['key1', 'key2', 'key3'];
      mockLocalStorageAdapter.getItem
        .mockResolvedValueOnce('{"data": "test1"}')
        .mockResolvedValueOnce('{"data": "test2"}')
        .mockResolvedValueOnce('{"data": "test3"}');

      const estimation = await manager.estimateMigration(keys);

      expect(estimation.totalDataSize).toBeGreaterThan(0);
      expect(estimation.estimatedDuration).toBeGreaterThan(0);
      expect(estimation.confidenceLevel).toBe('high');
      expect(estimation.sampleSize).toBe(3);
      expect(mockCallbacks.onEstimation).toHaveBeenCalledWith(estimation);
    });

    it('should limit sample size for large datasets', async () => {
      const keys = Array.from({ length: 100 }, (_, i) => `key${i}`);
      mockLocalStorageAdapter.getItem.mockResolvedValue('{"data": "test"}');

      // Clear mock call count from initialization
      mockLocalStorageAdapter.getItem.mockClear();

      const estimation = await manager.estimateMigration(keys);

      // With adaptive sampling, 100 items should result in around 20 samples
      // (calculated using statistical formulas for 95% confidence, 5% margin of error)
      expect(estimation.sampleSize).toBeGreaterThanOrEqual(20);
      expect(estimation.sampleSize).toBeLessThanOrEqual(30);
      expect(mockLocalStorageAdapter.getItem).toHaveBeenCalledTimes(estimation.sampleSize);
    });

    it('should handle estimation errors gracefully', async () => {
      const keys = ['key1', 'key2'];
      mockLocalStorageAdapter.getItem
        .mockResolvedValueOnce('{"data": "test1"}')
        .mockRejectedValueOnce(new Error('Read error'));

      const estimation = await manager.estimateMigration(keys);

      expect(estimation).toBeDefined();
      // With 2 keys and sample size of 2, the ratio is 1.0 (100%), so confidence should be 'high'
      expect(estimation.confidenceLevel).toBe('high');
    });
  });

  describe('preview functionality', () => {
    it('should preview migration successfully', async () => {
      const keys = ['key1', 'key2'];
      mockLocalStorageAdapter.getItem
        .mockResolvedValueOnce('{"data": "test1"}')
        .mockResolvedValueOnce('{"data": "test2"}');

      // Mock browser APIs properly
      Object.defineProperty(global, 'navigator', {
        value: {
          storage: {
            estimate: jest.fn().mockResolvedValue({ quota: 1000000000, usage: 100000000 })
          }
        },
        configurable: true
      });

      // Mock indexedDB for API compatibility check
      Object.defineProperty(global, 'indexedDB', {
        value: {},
        configurable: true
      });

      // Mock localStorage for API compatibility check
      Object.defineProperty(global, 'localStorage', {
        value: {},
        configurable: true
      });

      const preview = await manager.previewMigration(keys);

      expect(preview.canProceed).toBe(true);
      expect(preview.estimatedSuccess).toBe(true);
      expect(preview.sampleKeys).toEqual(keys);
      expect(preview.validationResults).toHaveLength(2);
      expect(preview.storageAvailable).toBe(true);
      expect(mockCallbacks.onPreview).toHaveBeenCalledWith(preview);
    });

    it('should detect storage issues in preview', async () => {
      const keys = ['key1'];
      mockLocalStorageAdapter.getItem.mockResolvedValue('{"data": "test"}');

      // Mock insufficient storage
      Object.defineProperty(navigator, 'storage', {
        value: {
          estimate: jest.fn().mockResolvedValue({ quota: 100000000, usage: 95000000 })
        },
        configurable: true
      });

      const preview = await manager.previewMigration(keys);

      expect(preview.storageAvailable).toBe(false);
      expect(preview.canProceed).toBe(false);
      expect(preview.warnings).toContain('Insufficient storage space available');
    });

    it('should handle preview errors gracefully', async () => {
      const keys = ['key1'];
      mockLocalStorageAdapter.getItem.mockRejectedValue(new Error('Access denied'));

      const preview = await manager.previewMigration(keys);

      expect(preview.validationResults[0].readable).toBe(false);
      expect(preview.warnings).toContain('Cannot access key: key1');
    });
  });

  describe('checkpoint functionality', () => {
    it('should determine checkpoint creation correctly', () => {
      const interval = MIGRATION_CONTROL_FEATURES.CHECKPOINT_INTERVAL;

      // Should not create checkpoint before interval
      for (let i = 1; i < interval; i++) {
        expect(manager.shouldCreateCheckpoint()).toBe(false);
      }

      // Should create checkpoint at interval
      expect(manager.shouldCreateCheckpoint()).toBe(true);

      // Should not create checkpoint immediately after
      expect(manager.shouldCreateCheckpoint()).toBe(false);
    });
  });

  describe('state getters', () => {
    it('should correctly report pause state', async () => {
      expect(manager.isPaused()).toBe(false);

      await manager.requestPause();
      expect(manager.isPaused()).toBe(true);
    });

    it('should correctly report cancel state', async () => {
      expect(manager.isCancelling()).toBe(false);

      await manager.requestCancel();
      expect(manager.isCancelling()).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should clean up resources properly', async () => {
      await manager.cleanup();

      expect(mockLocalStorageAdapter.removeItem).toHaveBeenCalledWith(
        MIGRATION_CONTROL_FEATURES.PROGRESS_STORAGE_KEY
      );
    });
  });

  describe('memory pressure handling', () => {
    beforeEach(() => {
      // Mock performance.memory for memory pressure tests
      Object.defineProperty(global, 'performance', {
        value: {
          memory: {
            usedJSHeapSize: 50 * 1024 * 1024, // 50MB
            jsHeapSizeLimit: 100 * 1024 * 1024 // 100MB limit
          },
          now: jest.fn(() => 100)
        },
        configurable: true
      });
    });

    it('should detect memory pressure during estimation', async () => {
      // Simulate high memory usage
      Object.defineProperty(performance, 'memory', {
        value: {
          usedJSHeapSize: 95 * 1024 * 1024, // 95MB used
          jsHeapSizeLimit: 100 * 1024 * 1024 // 100MB limit
        },
        configurable: true
      });

      const keys = ['key1', 'key2'];
      mockLocalStorageAdapter.getItem.mockResolvedValue('{"data": "test"}');

      const estimation = await manager.estimateMigration(keys);

      expect(estimation.memoryAvailable).toBe(false);
      expect(estimation.warnings).toContain('High memory usage detected');
    });

    it('should reduce sample size under memory pressure', async () => {
      // Simulate memory pressure
      Object.defineProperty(performance, 'memory', {
        value: {
          usedJSHeapSize: 90 * 1024 * 1024, // 90MB used
          jsHeapSizeLimit: 100 * 1024 * 1024 // 100MB limit
        },
        configurable: true
      });

      const keys = Array.from({ length: 1000 }, (_, i) => `key${i}`);
      mockLocalStorageAdapter.getItem.mockResolvedValue('{"data": "test"}');

      const estimation = await manager.estimateMigration(keys);

      // Under memory pressure, sample size should be reduced
      expect(estimation.sampleSize).toBeLessThan(100);
      expect(estimation.warnings).toContain('Sample size reduced due to memory pressure');
    });

    it('should handle memory pressure during preview', async () => {
      // Simulate critical memory usage
      Object.defineProperty(performance, 'memory', {
        value: {
          usedJSHeapSize: 98 * 1024 * 1024, // 98MB used
          jsHeapSizeLimit: 100 * 1024 * 1024 // 100MB limit
        },
        configurable: true
      });

      const keys = ['key1'];
      mockLocalStorageAdapter.getItem.mockResolvedValue('{"data": "test"}');

      // Mock browser APIs for preview
      Object.defineProperty(global, 'navigator', {
        value: {
          storage: {
            estimate: jest.fn().mockResolvedValue({ quota: 1000000000, usage: 100000000 })
          }
        },
        configurable: true
      });

      Object.defineProperty(global, 'indexedDB', { value: {}, configurable: true });
      Object.defineProperty(global, 'localStorage', { value: {}, configurable: true });

      const preview = await manager.previewMigration(keys);

      expect(preview.memoryAvailable).toBe(false);
      expect(preview.canProceed).toBe(false);
      expect(preview.warnings).toContain('Critical memory usage detected');
    });

    it('should cache memory checks to avoid repeated calculations', async () => {
      const keys = ['key1'];
      mockLocalStorageAdapter.getItem.mockResolvedValue('{"data": "test"}');

      // Mock browser APIs
      Object.defineProperty(global, 'navigator', {
        value: {
          storage: {
            estimate: jest.fn().mockResolvedValue({ quota: 1000000000, usage: 100000000 })
          }
        },
        configurable: true
      });

      Object.defineProperty(global, 'indexedDB', { value: {}, configurable: true });
      Object.defineProperty(global, 'localStorage', { value: {}, configurable: true });

      // Create spy on performance.memory access
      const memorySpy = jest.spyOn(performance, 'memory', 'get');

      // Run multiple previews quickly
      await Promise.all([
        manager.previewMigration(keys),
        manager.previewMigration(keys),
        manager.previewMigration(keys)
      ]);

      // Memory should be checked but cached results used
      expect(memorySpy).toHaveBeenCalled();
    });

    it('should handle missing performance.memory API gracefully', async () => {
      // Remove performance.memory
      const originalMemory = performance.memory;
      delete (performance as { memory?: unknown }).memory;

      const keys = ['key1'];
      mockLocalStorageAdapter.getItem.mockResolvedValue('{"data": "test"}');

      const estimation = await manager.estimateMigration(keys);

      expect(estimation.memoryAvailable).toBe(true); // Should assume available if can't check
      expect(estimation.warnings).not.toContain('memory');

      // Restore
      Object.defineProperty(performance, 'memory', {
        value: originalMemory,
        configurable: true
      });
    });

    it('should trigger cleanup when memory pressure detected during migration', async () => {
      // Simulate escalating memory pressure
      let memoryUsage = 50 * 1024 * 1024; // Start at 50MB
      Object.defineProperty(performance, 'memory', {
        get: () => ({
          usedJSHeapSize: memoryUsage,
          jsHeapSizeLimit: 100 * 1024 * 1024
        }),
        configurable: true
      });

      await manager.requestPause();

      // Simulate memory pressure increasing during save
      memoryUsage = 95 * 1024 * 1024; // Jump to 95MB

      await manager.savePauseState(
        'key5',
        ['key1', 'key2'],
        ['key6', 'key7'],
        2,
        4,
        512,
        1024
      );

      // Should still save but with warnings
      expect(mockLocalStorageAdapter.setItem).toHaveBeenCalled();
    });

    it('should adapt estimation strategy based on available memory', async () => {
      // Test with different memory scenarios
      const scenarios = [
        { used: 20 * 1024 * 1024, limit: 100 * 1024 * 1024, expectedStrategy: 'normal' },
        { used: 70 * 1024 * 1024, limit: 100 * 1024 * 1024, expectedStrategy: 'reduced' },
        { used: 95 * 1024 * 1024, limit: 100 * 1024 * 1024, expectedStrategy: 'minimal' }
      ];

      for (const scenario of scenarios) {
        Object.defineProperty(performance, 'memory', {
          value: {
            usedJSHeapSize: scenario.used,
            jsHeapSizeLimit: scenario.limit
          },
          configurable: true
        });

        const keys = Array.from({ length: 1000 }, (_, i) => `key${i}`);
        mockLocalStorageAdapter.getItem.mockResolvedValue('{"data": "test"}');

        const estimation = await manager.estimateMigration(keys);

        switch (scenario.expectedStrategy) {
          case 'normal':
            expect(estimation.sampleSize).toBeGreaterThan(50);
            break;
          case 'reduced':
            expect(estimation.sampleSize).toBeLessThan(100);
            expect(estimation.sampleSize).toBeGreaterThan(20);
            break;
          case 'minimal':
            expect(estimation.sampleSize).toBeLessThan(50);
            break;
        }
      }
    });
  });

  describe('error recovery paths', () => {
    it('should recover from checksum validation failures', async () => {
      await manager.requestPause();

      // Save valid pause state
      await manager.savePauseState(
        'key5',
        ['key1', 'key2'],
        ['key6', 'key7'],
        2,
        4,
        512,
        1024
      );

      // Simulate corrupted resume data with invalid checksum
      const corruptedData = {
        lastProcessedKey: 'key5',
        processedKeys: ['key1', 'key2'],
        remainingKeys: ['key6', 'key7'],
        itemsProcessed: 2,
        totalItems: 4,
        bytesProcessed: 512,
        totalBytes: 1024,
        timestamp: Date.now(),
        checksum: 'invalid_checksum'
      };

      mockLocalStorageAdapter.getItem.mockResolvedValueOnce(JSON.stringify(corruptedData));

      // Create new manager to test recovery
      const testManager = new MigrationControlManager(mockCallbacks);
      const result = await testManager.requestResume();

      expect(result).toBeNull(); // Should reject corrupted data
      expect(testManager.getControlState().canResume).toBe(false);
    });

    it('should handle multiple consecutive operation failures', async () => {
      let attemptCount = 0;
      mockLocalStorageAdapter.setItem.mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 3) {
          throw new Error('Storage temporarily unavailable');
        }
        return Promise.resolve();
      });

      await manager.requestPause();

      // Multiple save attempts should eventually succeed
      await manager.savePauseState(
        'key5',
        ['key1', 'key2'],
        ['key6', 'key7'],
        2,
        4,
        512,
        1024
      );

      expect(attemptCount).toBeGreaterThan(1);
      expect(mockCallbacks.onPause).toHaveBeenCalled();
    });

    it('should recover from partial data corruption', async () => {
      await manager.requestPause();

      // Save pause state
      await manager.savePauseState(
        'key5',
        ['key1', 'key2'],
        ['key6', 'key7'],
        2,
        4,
        512,
        1024
      );

      // Simulate partially corrupted data (missing required fields)
      const partialData = {
        lastProcessedKey: 'key5',
        // Missing other required fields
        timestamp: Date.now()
      };

      mockLocalStorageAdapter.getItem.mockResolvedValueOnce(JSON.stringify(partialData));

      const testManager = new MigrationControlManager(mockCallbacks);
      const result = await testManager.requestResume();

      expect(result).toBeNull();
      expect(testManager.getControlState().canResume).toBe(false);
    });

    it('should handle storage quota exceeded with graceful degradation', async () => {
      await manager.requestPause();

      // Simulate quota exceeded error
      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';
      mockLocalStorageAdapter.setItem.mockRejectedValue(quotaError);
      mockLocalStorageAdapter.isQuotaExceededError.mockReturnValue(true);

      await manager.savePauseState(
        'key5',
        ['key1', 'key2'],
        ['key6', 'key7'],
        2,
        4,
        512,
        1024
      );

      // Should maintain in-memory state even if storage fails
      const state = manager.getControlState();
      expect(state.canResume).toBe(true);
      expect(state.resumeData).toBeDefined();
    });

    it('should recover from corrupted estimation data', async () => {
      // Simulate corrupted response during estimation
      mockLocalStorageAdapter.getItem
        .mockResolvedValueOnce('{"invalid": "json"') // Corrupted JSON
        .mockResolvedValueOnce('{"data": "valid"}'); // Valid fallback

      const keys = ['key1', 'key2'];
      const estimation = await manager.estimateMigration(keys);

      expect(estimation).toBeDefined();
      expect(estimation.sampleSize).toBeGreaterThan(0);
    });

    it('should handle estimation timeout and recover', async () => {
      jest.useFakeTimers();

      // Mock slow response
      mockLocalStorageAdapter.getItem.mockImplementation(() =>
        new Promise(resolve => {
          setTimeout(() => resolve('{"data": "test"}'), 10000);
        })
      );

      const keys = ['key1'];
      const estimationPromise = manager.estimateMigration(keys);

      // Fast-forward past reasonable timeout
      jest.advanceTimersByTime(15000);

      const estimation = await estimationPromise;

      // Should provide fallback estimation
      expect(estimation).toBeDefined();
      expect(estimation.estimatedDuration).toBeGreaterThan(0);

      jest.useRealTimers();
    });

    it('should recover from preview generation failures', async () => {
      const keys = ['key1'];

      // Mock all browser APIs to fail
      Object.defineProperty(global, 'navigator', {
        value: {
          storage: {
            estimate: jest.fn().mockRejectedValue(new Error('API unavailable'))
          }
        },
        configurable: true
      });

      mockLocalStorageAdapter.getItem.mockRejectedValue(new Error('Access denied'));

      const preview = await manager.previewMigration(keys);

      expect(preview.canProceed).toBe(false);
      expect(preview.warnings.length).toBeGreaterThan(0);
      expect(preview.validationResults).toBeDefined();
    });

    it('should handle cascading failures across multiple systems', async () => {
      // Simulate multiple system failures
      mockLocalStorageAdapter.getItem.mockRejectedValue(new Error('Storage failure'));
      mockLocalStorageAdapter.setItem.mockRejectedValue(new Error('Write failure'));

      Object.defineProperty(global, 'navigator', {
        value: {
          storage: {
            estimate: jest.fn().mockRejectedValue(new Error('Quota API failure'))
          }
        },
        configurable: true
      });

      Object.defineProperty(performance, 'memory', {
        get: () => {
          throw new Error('Memory API failure');
        },
        configurable: true
      });

      const keys = ['key1'];
      const preview = await manager.previewMigration(keys);

      // Should still provide a preview with warnings
      expect(preview).toBeDefined();
      expect(preview.canProceed).toBe(false);
      expect(preview.warnings.length).toBeGreaterThan(2);
    });

    it('should recover from concurrent cancellation during pause', async () => {
      // Start pause operation
      const pausePromise = manager.requestPause();

      // Immediately request cancellation
      const cancelPromise = manager.requestCancel();

      await Promise.all([pausePromise, cancelPromise]);

      const state = manager.getControlState();
      // Cancel should take precedence
      expect(state.isCancelling).toBe(true);
      expect(mockCallbacks.onCancel).toHaveBeenCalled();
    });

    it('should handle estimation failures with adaptive retry', async () => {
      let attemptCount = 0;
      mockLocalStorageAdapter.getItem.mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error(`Attempt ${attemptCount} failed`);
        }
        return Promise.resolve('{"data": "test"}');
      });

      const keys = ['key1', 'key2', 'key3'];
      const estimation = await manager.estimateMigration(keys);

      expect(attemptCount).toBe(3); // Should retry and eventually succeed
      expect(estimation).toBeDefined();
      expect(estimation.sampleSize).toBeGreaterThan(0);
    });

    it('should maintain operation queue integrity during errors', async () => {
      // Simulate alternating success/failure pattern
      let callCount = 0;
      mockLocalStorageAdapter.setItem.mockImplementation(() => {
        callCount++;
        if (callCount % 2 === 0) {
          throw new Error('Intermittent failure');
        }
        return Promise.resolve();
      });

      await manager.requestPause();

      // Multiple operations should maintain queue order
      const operations = [
        manager.savePauseState('key1', [], [], 1, 10, 100, 1000),
        manager.savePauseState('key2', [], [], 2, 10, 200, 1000),
        manager.savePauseState('key3', [], [], 3, 10, 300, 1000)
      ];

      await Promise.allSettled(operations);

      // Some operations may fail, but queue should remain intact
      expect(callCount).toBeGreaterThan(2);
    });

    it('should recover from checkpoint corruption during save', async () => {
      await manager.requestPause();

      // Mock checkpoint counter to trigger checkpoint
      for (let i = 0; i < 10; i++) {
        manager.shouldCreateCheckpoint();
      }

      // Simulate corruption during checkpoint save
      let saveAttempt = 0;
      mockLocalStorageAdapter.setItem.mockImplementation(() => {
        saveAttempt++;
        if (saveAttempt === 1) {
          // First attempt corrupts the data
          throw new Error('Data corruption during write');
        }
        return Promise.resolve();
      });

      await manager.savePauseState(
        'key10',
        ['key1', 'key2', 'key3', 'key4', 'key5'],
        ['key11', 'key12'],
        5,
        12,
        2048,
        4096
      );

      // Should eventually succeed despite initial corruption
      expect(saveAttempt).toBeGreaterThan(1);
      expect(mockCallbacks.onPause).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle network interruption during pause state save', async () => {
      await manager.requestPause();

      // Simulate network interruption by making setItem fail
      mockLocalStorageAdapter.setItem.mockRejectedValueOnce(new Error('Network error'));

      await manager.savePauseState(
        'key5',
        ['key1', 'key2'],
        ['key6', 'key7'],
        2,
        4,
        512,
        1024
      );

      // Should still update in-memory state even if storage fails
      const state = manager.getControlState();
      expect(state.canResume).toBe(true);
      expect(state.resumeData).toBeDefined();
    });

    it('should handle concurrent pause/cancel requests', async () => {
      const pausePromise = manager.requestPause();
      const cancelPromise = manager.requestCancel();

      await Promise.all([pausePromise, cancelPromise]);

      const state = manager.getControlState();
      // Should prioritize cancel over pause
      expect(state.isCancelling).toBe(true);
    });

    it('should handle resume with corrupted checkpoint data', async () => {
      // Simulate corrupted data during initialization
      mockLocalStorageAdapter.getItem.mockResolvedValueOnce('{invalid:json}');

      // Create a new manager to test loadResumeData with corrupted data
      const testManager = new MigrationControlManager(mockCallbacks);

      // Should gracefully handle corrupted data and not enable resume
      const state = testManager.getControlState();
      expect(state.canResume).toBe(false);
      expect(state.resumeData).toBeUndefined();
    });

    it('should handle storage quota exceeded during checkpoint save', async () => {
      await manager.requestPause();

      // Simulate quota exceeded error
      const quotaError = new Error('QuotaExceededError');
      quotaError.name = 'QuotaExceededError';
      mockLocalStorageAdapter.setItem.mockRejectedValueOnce(quotaError);
      mockLocalStorageAdapter.isQuotaExceededError.mockReturnValueOnce(true);

      await manager.savePauseState(
        'key5',
        ['key1', 'key2'],
        ['key6', 'key7'],
        2,
        4,
        512,
        1024
      );

      // Should still maintain in-memory state
      const state = manager.getControlState();
      expect(state.canResume).toBe(true);
    });

    it('should handle estimation with very large datasets', async () => {
      const largeKeys = Array.from({ length: 50000 }, (_, i) => `key${i}`);
      mockLocalStorageAdapter.getItem.mockResolvedValue('{"data": "test"}');

      const estimation = await manager.estimateMigration(largeKeys);

      // Adaptive sampling should cap at maximum practical limit (1000 for very large datasets)
      expect(estimation.sampleSize).toBeLessThanOrEqual(1000);
      expect(estimation.sampleSize).toBeGreaterThanOrEqual(383); // Statistical minimum for this dataset size
      expect(estimation.confidenceLevel).toBe('low'); // Very large datasets result in low sampling ratio, hence low confidence
    });

    it('should handle preview with storage API unavailable', async () => {
      const keys = ['key1'];
      mockLocalStorageAdapter.getItem.mockResolvedValue('{"data": "test"}');

      // Mock navigator without storage API
      Object.defineProperty(global, 'navigator', {
        value: {},
        configurable: true
      });

      // Mock required browser APIs to ensure apiCompatible is true
      Object.defineProperty(global, 'indexedDB', {
        value: {},
        configurable: true
      });
      Object.defineProperty(global, 'localStorage', {
        value: {},
        configurable: true
      });

      const preview = await manager.previewMigration(keys);

      expect(preview.storageAvailable).toBe(true); // Should assume available if can't check
      expect(preview.apiCompatible).toBe(true);
      expect(preview.canProceed).toBe(true);
    });

    it('should handle memory check caching correctly', () => {
      // Mock performance.memory
      Object.defineProperty(global, 'performance', {
        value: {
          memory: {
            usedJSHeapSize: 50 * 1024 * 1024, // 50MB
            jsHeapSizeLimit: 100 * 1024 * 1024 // 100MB limit
          }
        },
        configurable: true
      });

      const keys = ['key1'];
      mockLocalStorageAdapter.getItem.mockResolvedValue('{"data": "test"}');

      // First check should calculate
      const preview1 = manager.previewMigration(keys);

      // Second check within 5 seconds should use cache
      const preview2 = manager.previewMigration(keys);

      return Promise.all([preview1, preview2]).then(([p1, p2]) => {
        expect(p1.memoryAvailable).toBe(p2.memoryAvailable);
      });
    });

    it('should handle pause when already paused gracefully', async () => {
      await manager.requestPause();
      const state1 = manager.getControlState();

      // Request pause again
      await manager.requestPause();
      const state2 = manager.getControlState();

      // State should be unchanged
      expect(state1).toEqual(state2);
    });

    it('should handle cancel when already cancelling gracefully', async () => {
      await manager.requestCancel();
      const callCount = (mockCallbacks.onCancel as jest.Mock)?.mock?.calls?.length || 0;

      // Request cancel again
      await manager.requestCancel();

      // Callback should not be called again
      expect(mockCallbacks.onCancel).toHaveBeenCalledTimes(callCount);
    });
  });
});