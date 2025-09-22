/**
 * Tests for useMigrationControl Hook
 */

import { renderHook, act } from '@testing-library/react';
import { useMigrationControl, UseMigrationControlOptions } from './useMigrationControl';
import { MigrationControlManager } from '@/utils/migrationControlManager';
import { MigrationEstimation } from '@/types/migrationControl';

// Mock the MigrationControlManager
jest.mock('@/utils/migrationControlManager');
jest.mock('@/utils/logger');

const MockMigrationControlManager = MigrationControlManager as jest.MockedClass<typeof MigrationControlManager>;

describe('useMigrationControl', () => {
  let mockManager: jest.Mocked<MigrationControlManager>;
  let mockCallbacks: UseMigrationControlOptions;

  beforeEach(() => {
    mockCallbacks = {
      onPause: jest.fn(),
      onResume: jest.fn(),
      onCancel: jest.fn(),
      onEstimation: jest.fn(),
      onPreview: jest.fn()
    };

    mockManager = {
      requestPause: jest.fn(),
      requestResume: jest.fn(),
      requestCancel: jest.fn(),
      estimateMigration: jest.fn(),
      previewMigration: jest.fn(),
      getControlState: jest.fn(),
      cleanup: jest.fn(),
      savePauseState: jest.fn(),
      shouldCreateCheckpoint: jest.fn(),
      isPaused: jest.fn(),
      isCancelling: jest.fn()
    } as unknown as jest.Mocked<MigrationControlManager>;

    MockMigrationControlManager.mockImplementation(() => mockManager);

    // Default control state
    mockManager.getControlState.mockReturnValue({
      canPause: true,
      canCancel: true,
      canResume: false,
      isPaused: false,
      isCancelling: false
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useMigrationControl());

      expect(result.current.control.canPause).toBe(true);
      expect(result.current.control.canCancel).toBe(true);
      expect(result.current.control.canResume).toBe(false);
      expect(result.current.control.isPaused).toBe(false);
      expect(result.current.estimation).toBeNull();
      expect(result.current.preview).toBeNull();
      expect(result.current.isEstimating).toBe(false);
      expect(result.current.isPreviewing).toBe(false);
    });

    it('should create MigrationControlManager with callbacks', () => {
      renderHook(() => useMigrationControl(mockCallbacks));

      expect(MockMigrationControlManager).toHaveBeenCalledWith(
        expect.objectContaining({
          onPause: expect.any(Function),
          onResume: expect.any(Function),
          onCancel: expect.any(Function),
          onEstimation: expect.any(Function),
          onPreview: expect.any(Function)
        })
      );
    });

    it('should load initial control state', () => {
      mockManager.getControlState.mockReturnValue({
        canPause: false,
        canCancel: true,
        canResume: true,
        isPaused: true,
        isCancelling: false
      });

      const { result } = renderHook(() => useMigrationControl());

      expect(result.current.control.isPaused).toBe(true);
      expect(result.current.control.canResume).toBe(true);
    });
  });

  describe('pause functionality', () => {
    it('should pause migration successfully', async () => {
      mockManager.requestPause.mockResolvedValue(undefined);

      const { result } = renderHook(() => useMigrationControl());

      // Ensure initial state has canPause enabled
      expect(result.current.control.canPause).toBe(true);

      // Simulate the actual pause flow
      await act(async () => {
        await result.current.pauseMigration();
      });

      expect(mockManager.requestPause).toHaveBeenCalled();
      // State is updated via the manager callback, not directly in pauseMigration
      // We test the callback flow separately in the "should trigger onPause callback" test
    });

    it('should handle pause errors gracefully', async () => {
      mockManager.requestPause.mockRejectedValue(new Error('Pause failed'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const { result } = renderHook(() => useMigrationControl());

      await act(async () => {
        await result.current.pauseMigration();
      });

      expect(mockManager.requestPause).toHaveBeenCalled();
      // Should not update state on error
      expect(result.current.control.isPaused).toBe(false);

      consoleSpy.mockRestore();
    });

    it('should trigger onPause callback', async () => {
      const { result } = renderHook(() => useMigrationControl(mockCallbacks));

      // Simulate manager calling the callback
      const managerCallbacks = MockMigrationControlManager.mock.calls[0]?.[0];

      act(() => {
        managerCallbacks?.onPause?.();
      });

      expect(result.current.control.isPaused).toBe(true);
      expect(result.current.control.canResume).toBe(true);
      expect(mockCallbacks.onPause).toHaveBeenCalled();
    });
  });

  describe('resume functionality', () => {
    it('should resume migration successfully', async () => {
      const resumeData = {
        itemsProcessed: 50,
        totalItems: 100,
        lastProcessedKey: 'key50',
        processedKeys: [],
        remainingKeys: [],
        bytesProcessed: 1024,
        totalBytes: 2048,
        checkpointId: 'checkpoint_123',
        checkpointTimestamp: Date.now(),
        sessionId: 'session_123',
        startTime: Date.now() - 10000,
        pauseTime: Date.now() - 5000
      };

      mockManager.requestResume.mockResolvedValue(resumeData);

      const { result } = renderHook(() => useMigrationControl());

      await act(async () => {
        await result.current.resumeMigration();
      });

      expect(mockManager.requestResume).toHaveBeenCalled();
    });

    it('should handle resume with no data', async () => {
      mockManager.requestResume.mockResolvedValue(null);

      const { result } = renderHook(() => useMigrationControl());

      await act(async () => {
        await result.current.resumeMigration();
      });

      expect(mockManager.requestResume).toHaveBeenCalled();
    });

    it('should trigger onResume callback', async () => {
      const { result } = renderHook(() => useMigrationControl(mockCallbacks));

      // Simulate manager calling the callback
      const managerCallbacks = MockMigrationControlManager.mock.calls[0]?.[0];

      act(() => {
        managerCallbacks?.onResume?.();
      });

      expect(result.current.control.isPaused).toBe(false);
      expect(result.current.control.canResume).toBe(false);
      expect(mockCallbacks.onResume).toHaveBeenCalled();
    });
  });

  describe('cancel functionality', () => {
    it('should cancel migration successfully', async () => {
      mockManager.requestCancel.mockResolvedValue();

      const { result } = renderHook(() => useMigrationControl());

      await act(async () => {
        await result.current.cancelMigration();
      });

      expect(mockManager.requestCancel).toHaveBeenCalled();
      // State cancelling flag is cleared via the manager callback after completion
      // The isCancelling state is managed by the callback flow
    });

    it('should handle cancel errors gracefully', async () => {
      mockManager.requestCancel.mockRejectedValue(new Error('Cancel failed'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const { result } = renderHook(() => useMigrationControl());

      await act(async () => {
        await result.current.cancelMigration();
      });

      expect(mockManager.requestCancel).toHaveBeenCalled();
      // Should reset cancelling state on error
      expect(result.current.control.isCancelling).toBe(false);

      consoleSpy.mockRestore();
    });

    it('should trigger onCancel callback', async () => {
      const cancellation = {
        reason: 'user_request' as const,
        timestamp: Date.now(),
        cleanupCompleted: false,
        dataRolledBack: false,
        backupRestored: false
      };

      const { result } = renderHook(() => useMigrationControl(mockCallbacks));

      // Simulate manager calling the callback
      const managerCallbacks = MockMigrationControlManager.mock.calls[0]?.[0];

      act(() => {
        managerCallbacks?.onCancel?.(cancellation);
      });

      expect(result.current.control.isCancelling).toBe(false);
      expect(mockCallbacks.onCancel).toHaveBeenCalledWith(cancellation);
    });
  });

  describe('estimation functionality', () => {
    it('should estimate migration successfully', async () => {
      const estimation = {
        totalDataSize: 1024000,
        estimatedCompressedSize: 921600,
        estimatedDuration: 5000,
        estimatedCompletionTime: new Date(),
        averageItemProcessingTime: 50,
        estimatedThroughput: 204800,
        confidenceLevel: 'high' as const,
        sampleSize: 10,
        memoryAvailable: true,
        warnings: []
      };

      mockManager.estimateMigration.mockResolvedValue(estimation);

      const { result } = renderHook(() => useMigrationControl());
      const keys = ['key1', 'key2', 'key3'];

      await act(async () => {
        await result.current.estimateMigration(keys);
      });

      expect(mockManager.estimateMigration).toHaveBeenCalledWith(keys);
      expect(result.current.estimation).toEqual(estimation);
      expect(result.current.isEstimating).toBe(false);
    });

    it('should handle estimation in progress', async () => {
      let resolveEstimation: (value: unknown) => void;
      const estimationPromise = new Promise(resolve => {
        resolveEstimation = resolve;
      });

      mockManager.estimateMigration.mockReturnValue(estimationPromise as Promise<MigrationEstimation>);

      const { result } = renderHook(() => useMigrationControl());

      act(() => {
        result.current.estimateMigration(['key1']);
      });

      expect(result.current.isEstimating).toBe(true);

      await act(async () => {
        resolveEstimation({});
        await estimationPromise;
      });

      expect(result.current.isEstimating).toBe(false);
    });

    it('should prevent multiple concurrent estimations', async () => {
      mockManager.estimateMigration.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useMigrationControl());

      act(() => {
        result.current.estimateMigration(['key1']);
      });

      expect(result.current.isEstimating).toBe(true);

      // Second call should be ignored
      act(() => {
        result.current.estimateMigration(['key2']);
      });

      expect(mockManager.estimateMigration).toHaveBeenCalledTimes(1);
    });
  });

  describe('preview functionality', () => {
    it('should preview migration successfully', async () => {
      const preview = {
        canProceed: true,
        estimatedSuccess: true,
        sampleKeys: ['key1', 'key2'],
        validationResults: [
          { key: 'key1', readable: true, writable: true, size: 100 },
          { key: 'key2', readable: true, writable: true, size: 150 }
        ],
        warnings: [],
        storageAvailable: true,
        memoryAvailable: true,
        apiCompatible: true
      };

      mockManager.previewMigration.mockResolvedValue(preview);

      const { result } = renderHook(() => useMigrationControl());
      const keys = ['key1', 'key2'];

      await act(async () => {
        await result.current.previewMigration(keys);
      });

      expect(mockManager.previewMigration).toHaveBeenCalledWith(keys);
      expect(result.current.preview).toEqual(preview);
      expect(result.current.isPreviewing).toBe(false);
    });

    it('should prevent multiple concurrent previews', async () => {
      mockManager.previewMigration.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useMigrationControl());

      act(() => {
        result.current.previewMigration(['key1']);
      });

      expect(result.current.isPreviewing).toBe(true);

      // Second call should be ignored
      act(() => {
        result.current.previewMigration(['key2']);
      });

      expect(mockManager.previewMigration).toHaveBeenCalledTimes(1);
    });
  });

  describe('reset functionality', () => {
    it('should reset all state', () => {
      const { result } = renderHook(() => useMigrationControl());

      act(() => {
        result.current.resetControl();
      });

      expect(result.current.control.canPause).toBe(false);
      expect(result.current.control.canCancel).toBe(false);
      expect(result.current.control.canResume).toBe(false);
      expect(result.current.estimation).toBeNull();
      expect(result.current.preview).toBeNull();
      expect(result.current.isEstimating).toBe(false);
      expect(result.current.isPreviewing).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should cleanup manager on unmount', () => {
      const { unmount } = renderHook(() => useMigrationControl());

      unmount();

      expect(mockManager.cleanup).toHaveBeenCalled();
    });
  });
});