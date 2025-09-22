/**
 * Tests for Migration Control Manager
 */

import { MigrationControlManager } from './migrationControlManager';
import { MIGRATION_CONTROL_FEATURES } from '@/config/migrationConfig';
import { LocalStorageAdapter } from './indexedDbAdapters';

// Mock dependencies
jest.mock('./indexedDbAdapters');
jest.mock('./logger');

const mockLocalStorageAdapter = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn()
} as jest.Mocked<LocalStorageAdapter>;

(LocalStorageAdapter as jest.Mock).mockImplementation(() => mockLocalStorageAdapter);

describe('MigrationControlManager', () => {
  let manager: MigrationControlManager;
  let mockCallbacks: any;

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
      const resumeData = {
        lastProcessedKey: 'key5',
        processedKeys: ['key1', 'key2'],
        remainingKeys: ['key6', 'key7'],
        itemsProcessed: 2,
        totalItems: 4,
        bytesProcessed: 512,
        totalBytes: 1024,
        checkpointId: 'checkpoint_123',
        checkpointTimestamp: Date.now(),
        sessionId: 'session_123',
        startTime: Date.now() - 5000,
        pauseTime: Date.now() - 1000
      };

      // Set up existing resume data
      manager.getControlState().resumeData = resumeData;
      manager.getControlState().canResume = true;

      const result = await manager.requestResume();

      expect(result).toEqual(resumeData);
      expect(mockCallbacks.onResume).toHaveBeenCalled();
      expect(mockLocalStorageAdapter.removeItem).toHaveBeenCalledWith(
        MIGRATION_CONTROL_FEATURES.PROGRESS_STORAGE_KEY
      );
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
      const callCount = mockCallbacks.onCancel.mock.calls.length;

      await manager.requestCancel(); // Second cancel request

      expect(mockCallbacks.onCancel).toHaveBeenCalledTimes(callCount);
    });
  });

  describe('estimation functionality', () => {
    beforeEach(() => {
      // Mock performance.now
      global.performance = {
        now: jest.fn(() => 100)
      } as any;
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
      expect(estimation.confidenceLevel).toBe('low');
    });
  });

  describe('preview functionality', () => {
    it('should preview migration successfully', async () => {
      const keys = ['key1', 'key2'];
      mockLocalStorageAdapter.getItem
        .mockResolvedValueOnce('{"data": "test1"}')
        .mockResolvedValueOnce('{"data": "test2"}');

      // Mock browser APIs
      Object.defineProperty(navigator, 'storage', {
        value: {
          estimate: jest.fn().mockResolvedValue({ quota: 1000000000, usage: 100000000 })
        },
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
});