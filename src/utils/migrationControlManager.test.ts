/**
 * Tests for Migration Control Manager
 */

import { MigrationControlManager } from './migrationControlManager';
import { MIGRATION_CONTROL_FEATURES } from '@/config/migrationConfig';
import { LocalStorageAdapter } from './localStorageAdapter';
import { MigrationControlCallbacks } from '@/types/migrationControl';

// Mock dependencies
jest.mock('./localStorageAdapter');
jest.mock('./logger');

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

      expect(estimation.sampleSize).toBe(MIGRATION_CONTROL_FEATURES.ESTIMATION_SAMPLE_SIZE);
      expect(mockLocalStorageAdapter.getItem).toHaveBeenCalledTimes(
        MIGRATION_CONTROL_FEATURES.ESTIMATION_SAMPLE_SIZE
      );
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

      // Should limit sample size even for very large datasets
      expect(estimation.sampleSize).toBe(MIGRATION_CONTROL_FEATURES.ESTIMATION_SAMPLE_SIZE);
      expect(estimation.confidenceLevel).toBe('low'); // Large dataset should have low confidence
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
      const callCount = mockCallbacks.onCancel.mock.calls.length;

      // Request cancel again
      await manager.requestCancel();

      // Callback should not be called again
      expect(mockCallbacks.onCancel).toHaveBeenCalledTimes(callCount);
    });
  });
});