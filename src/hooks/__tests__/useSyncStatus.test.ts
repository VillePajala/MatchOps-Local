/**
 * Tests for useSyncStatus hook
 *
 * @see src/hooks/useSyncStatus.ts
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import type { SyncStatusInfo } from '@/sync/types';

// Mock sync module - define mocks inline in factory
jest.mock('@/sync', () => ({
  getSyncEngine: jest.fn(() => ({
    getStatus: jest.fn(),
    onStatusChange: jest.fn(),
    processQueue: jest.fn(),
    retryFailed: jest.fn(),
    clearFailed: jest.fn(),
  })),
}));

// Mock backendConfig
jest.mock('@/config/backendConfig', () => ({
  getBackendMode: jest.fn(() => 'local'),
}));

// Mock logger - must use __esModule for default export
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// Import modules after mocks are set up
import { useSyncStatus } from '../useSyncStatus';
import { getSyncEngine } from '@/sync';
import { getBackendMode } from '@/config/backendConfig';
import logger from '@/utils/logger';

// Get typed references to mocks
const mockGetBackendMode = getBackendMode as jest.MockedFunction<typeof getBackendMode>;
const mockGetSyncEngine = getSyncEngine as jest.MockedFunction<typeof getSyncEngine>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('useSyncStatus', () => {
  // Mock engine methods - recreated fresh each test
  let mockGetStatus: jest.Mock;
  let mockOnStatusChange: jest.Mock;
  let mockProcessQueue: jest.Mock;
  let mockRetryFailed: jest.Mock;
  let mockClearFailed: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create fresh mocks for each test
    mockGetStatus = jest.fn();
    mockOnStatusChange = jest.fn().mockReturnValue(jest.fn()); // Return unsubscribe
    mockProcessQueue = jest.fn();
    mockRetryFailed = jest.fn();
    mockClearFailed = jest.fn();

    // Configure getSyncEngine to return our mocks
    mockGetSyncEngine.mockReturnValue({
      getStatus: mockGetStatus,
      onStatusChange: mockOnStatusChange,
      processQueue: mockProcessQueue,
      retryFailed: mockRetryFailed,
      clearFailed: mockClearFailed,
    } as unknown as ReturnType<typeof getSyncEngine>);

    // Default to local mode
    mockGetBackendMode.mockReturnValue('local');
  });

  describe('local mode', () => {
    it('should return static local status in local mode', () => {
      mockGetBackendMode.mockReturnValue('local');

      const { result } = renderHook(() => useSyncStatus());

      expect(result.current.mode).toBe('local');
      expect(result.current.state).toBe('local');
      expect(result.current.pendingCount).toBe(0);
      expect(result.current.failedCount).toBe(0);
      expect(result.current.lastSyncedAt).toBeNull();
      expect(result.current.isOnline).toBe(true);
      expect(result.current.isSyncing).toBe(false);
    });

    it('should provide no-op functions in local mode', async () => {
      mockGetBackendMode.mockReturnValue('local');

      const { result } = renderHook(() => useSyncStatus());

      // These should not throw
      await act(async () => {
        await result.current.syncNow();
        await result.current.retryFailed();
        await result.current.clearFailed();
      });

      // Sync module should not be called in local mode
      expect(mockProcessQueue).not.toHaveBeenCalled();
      expect(mockRetryFailed).not.toHaveBeenCalled();
      expect(mockClearFailed).not.toHaveBeenCalled();
    });

    it('should not subscribe to sync engine in local mode', () => {
      mockGetBackendMode.mockReturnValue('local');

      renderHook(() => useSyncStatus());

      expect(mockOnStatusChange).not.toHaveBeenCalled();
    });
  });

  describe('cloud mode', () => {
    const mockCloudStatus: SyncStatusInfo = {
      state: 'synced',
      pendingCount: 0,
      failedCount: 0,
      lastSyncedAt: Date.now(),
      isOnline: true,
    };

    beforeEach(() => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockGetStatus.mockResolvedValue(mockCloudStatus);
    });

    it('should return cloud status after initialization', async () => {
      const { result } = renderHook(() => useSyncStatus());

      await waitFor(() => {
        expect(result.current.mode).toBe('cloud');
        expect(result.current.state).toBe('synced');
      });
    });

    it('should show loading state before initialization', () => {
      // Make getStatus hang
      mockGetStatus.mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useSyncStatus());

      // Initial state before sync engine responds
      expect(result.current.mode).toBe('cloud');
      expect(result.current.state).toBe('synced'); // Default loading state
      expect(result.current.pendingCount).toBe(0);
    });

    it('should subscribe to status changes', async () => {
      renderHook(() => useSyncStatus());

      await waitFor(() => {
        expect(mockOnStatusChange).toHaveBeenCalled();
      });
    });

    it('should unsubscribe on unmount', async () => {
      const unsubscribe = jest.fn();
      mockOnStatusChange.mockReturnValue(unsubscribe);

      const { unmount } = renderHook(() => useSyncStatus());

      await waitFor(() => {
        expect(mockOnStatusChange).toHaveBeenCalled();
      });

      unmount();

      expect(unsubscribe).toHaveBeenCalled();
    });

    it('should update status when status changes', async () => {
      let statusChangeCallback: ((status: SyncStatusInfo) => void) | null = null;
      mockOnStatusChange.mockImplementation((callback) => {
        statusChangeCallback = callback;
        return jest.fn();
      });

      const { result } = renderHook(() => useSyncStatus());

      await waitFor(() => {
        expect(statusChangeCallback).not.toBeNull();
      });

      // Simulate status change
      act(() => {
        statusChangeCallback!({
          state: 'syncing',
          pendingCount: 5,
          failedCount: 0,
          lastSyncedAt: Date.now(),
          isOnline: true,
        });
      });

      expect(result.current.state).toBe('syncing');
      expect(result.current.pendingCount).toBe(5);
      expect(result.current.isSyncing).toBe(true);
    });
  });

  describe('sync states', () => {
    beforeEach(() => {
      mockGetBackendMode.mockReturnValue('cloud');
    });

    it.each([
      ['synced', { state: 'synced', pendingCount: 0, failedCount: 0, isOnline: true }],
      ['syncing', { state: 'syncing', pendingCount: 3, failedCount: 0, isOnline: true }],
      ['pending', { state: 'pending', pendingCount: 5, failedCount: 0, isOnline: true }],
      ['error', { state: 'error', pendingCount: 0, failedCount: 2, isOnline: true }],
      ['offline', { state: 'offline', pendingCount: 3, failedCount: 0, isOnline: false }],
    ] as const)('should handle %s state correctly', async (stateName, statusData) => {
      mockGetStatus.mockResolvedValue({
        ...statusData,
        lastSyncedAt: Date.now(),
      });

      const { result } = renderHook(() => useSyncStatus());

      await waitFor(() => {
        expect(result.current.state).toBe(stateName);
        expect(result.current.pendingCount).toBe(statusData.pendingCount);
        expect(result.current.failedCount).toBe(statusData.failedCount);
        expect(result.current.isOnline).toBe(statusData.isOnline);
      });
    });

    it('should compute isSyncing from state', async () => {
      mockGetStatus.mockResolvedValue({
        state: 'syncing',
        pendingCount: 3,
        failedCount: 0,
        lastSyncedAt: Date.now(),
        isOnline: true,
      });

      const { result } = renderHook(() => useSyncStatus());

      await waitFor(() => {
        expect(result.current.isSyncing).toBe(true);
      });
    });
  });

  describe('manual operations', () => {
    beforeEach(() => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockGetStatus.mockResolvedValue({
        state: 'pending',
        pendingCount: 3,
        failedCount: 0,
        lastSyncedAt: Date.now(),
        isOnline: true,
      });
    });

    it('should call processQueue on syncNow', async () => {
      const { result } = renderHook(() => useSyncStatus());

      await waitFor(() => {
        expect(result.current.mode).toBe('cloud');
      });

      await act(async () => {
        await result.current.syncNow();
      });

      expect(mockProcessQueue).toHaveBeenCalled();
    });

    it('should call retryFailed on retry', async () => {
      const { result } = renderHook(() => useSyncStatus());

      await waitFor(() => {
        expect(result.current.mode).toBe('cloud');
      });

      await act(async () => {
        await result.current.retryFailed();
      });

      expect(mockRetryFailed).toHaveBeenCalled();
    });

    it('should call clearFailed on clear', async () => {
      const { result } = renderHook(() => useSyncStatus());

      await waitFor(() => {
        expect(result.current.mode).toBe('cloud');
      });

      await act(async () => {
        await result.current.clearFailed();
      });

      expect(mockClearFailed).toHaveBeenCalled();
    });

    it('should handle errors in manual operations gracefully', async () => {
      mockProcessQueue.mockRejectedValue(new Error('Sync failed'));

      const { result } = renderHook(() => useSyncStatus());

      await waitFor(() => {
        expect(result.current.mode).toBe('cloud');
      });

      // Should not throw
      await act(async () => {
        await result.current.syncNow();
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[useSyncStatus] Sync now failed:',
        expect.any(Error)
      );
    });
  });

  describe('error handling', () => {
    it('should handle sync engine initialization failure', async () => {
      mockGetBackendMode.mockReturnValue('cloud');
      mockGetStatus.mockRejectedValue(new Error('Init failed'));

      const { result } = renderHook(() => useSyncStatus());

      await waitFor(() => {
        // Should still be initialized (graceful degradation)
        expect(result.current.mode).toBe('cloud');
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[useSyncStatus] Failed to initialize sync status:',
        expect.any(Error)
      );
    });
  });
});
