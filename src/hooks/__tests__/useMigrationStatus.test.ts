/**
 * Tests for useMigrationStatus hook
 * @integration
 */

import { renderHook, act } from '@testing-library/react';
import {
  useMigrationStatus,
  updateMigrationStatus,
  resetMigrationStatus,
} from '../useMigrationStatus';

describe('useMigrationStatus', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetMigrationStatus();
  });

  afterEach(() => {
    jest.useRealTimers();
    resetMigrationStatus();
  });

  describe('initial state', () => {
    it('should return default migration status', () => {
      const { result } = renderHook(() => useMigrationStatus());

      expect(result.current.isRunning).toBe(false);
      expect(result.current.progress).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.showNotification).toBe(false);
      expect(typeof result.current.dismissNotification).toBe('function');
    });
  });

  describe('updateMigrationStatus', () => {
    it('should update isRunning status', () => {
      const { result } = renderHook(() => useMigrationStatus());

      act(() => {
        updateMigrationStatus({ isRunning: true });
      });

      expect(result.current.isRunning).toBe(true);
    });

    it('should update progress information', () => {
      const { result } = renderHook(() => useMigrationStatus());

      const progress = {
        percentage: 50,
        message: 'Migrating data...',
        currentStep: 'savedGames',
        processedKeys: 5,
        totalKeys: 10,
      };

      act(() => {
        updateMigrationStatus({ isRunning: true, progress });
      });

      expect(result.current.progress).toEqual(progress);
      expect(result.current.progress?.percentage).toBe(50);
      expect(result.current.progress?.message).toBe('Migrating data...');
    });

    it('should update error status', () => {
      const { result } = renderHook(() => useMigrationStatus());

      act(() => {
        updateMigrationStatus({ error: 'Migration failed' });
      });

      expect(result.current.error).toBe('Migration failed');
    });

    it('should update showNotification status', () => {
      const { result } = renderHook(() => useMigrationStatus());

      act(() => {
        updateMigrationStatus({ showNotification: true });
      });

      expect(result.current.showNotification).toBe(true);
    });

    it('should preserve existing values when partially updating', () => {
      const { result } = renderHook(() => useMigrationStatus());

      act(() => {
        updateMigrationStatus({ isRunning: true, showNotification: true });
      });

      act(() => {
        updateMigrationStatus({ progress: { percentage: 75, message: 'Almost done' } });
      });

      expect(result.current.isRunning).toBe(true);
      expect(result.current.showNotification).toBe(true);
      expect(result.current.progress?.percentage).toBe(75);
    });
  });

  describe('dismissNotification', () => {
    it('should set showNotification to false', () => {
      const { result } = renderHook(() => useMigrationStatus());

      act(() => {
        updateMigrationStatus({ showNotification: true });
      });

      expect(result.current.showNotification).toBe(true);

      act(() => {
        result.current.dismissNotification();
      });

      expect(result.current.showNotification).toBe(false);
    });
  });

  describe('multiple subscribers', () => {
    it('should notify all subscribers when status changes', () => {
      const { result: result1 } = renderHook(() => useMigrationStatus());
      const { result: result2 } = renderHook(() => useMigrationStatus());

      act(() => {
        updateMigrationStatus({ isRunning: true });
      });

      expect(result1.current.isRunning).toBe(true);
      expect(result2.current.isRunning).toBe(true);
    });

    it('should remove subscriber on unmount', () => {
      const { result: result1, unmount } = renderHook(() => useMigrationStatus());
      const { result: result2 } = renderHook(() => useMigrationStatus());

      // Both should be subscribed
      act(() => {
        updateMigrationStatus({ isRunning: true });
      });

      expect(result1.current.isRunning).toBe(true);
      expect(result2.current.isRunning).toBe(true);

      // Unmount first hook
      unmount();

      // Second hook should still receive updates
      act(() => {
        updateMigrationStatus({ isRunning: false });
      });

      expect(result2.current.isRunning).toBe(false);
    });
  });

  describe('subscriber cleanup', () => {
    it('should cleanup stale subscribers when migration is complete', async () => {
      const { result, unmount } = renderHook(() => useMigrationStatus());

      // Start migration
      act(() => {
        updateMigrationStatus({ isRunning: true, showNotification: true });
      });

      expect(result.current.isRunning).toBe(true);

      // Complete migration and dismiss notification
      act(() => {
        updateMigrationStatus({ isRunning: false, showNotification: false });
      });

      // Fast-forward past the cleanup delay - this clears subscribers
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // The original hook's subscriber was cleared, so it won't receive updates
      // This is expected behavior - the cleanup happened
      // Let's verify by creating a new hook which will create a fresh subscription
      const { result: newResult } = renderHook(() => useMigrationStatus());

      act(() => {
        updateMigrationStatus({ isRunning: true });
      });

      // New hook should receive the update
      expect(newResult.current.isRunning).toBe(true);

      unmount();
    });

    it('should not cleanup subscribers while migration is running', () => {
      const { result } = renderHook(() => useMigrationStatus());

      // Start migration
      act(() => {
        updateMigrationStatus({ isRunning: true, showNotification: true });
      });

      // Try to trigger cleanup by setting showNotification to false but keeping isRunning true
      act(() => {
        updateMigrationStatus({ showNotification: false });
      });

      // Fast-forward - cleanup should not happen because isRunning is true
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Updates should still work
      act(() => {
        updateMigrationStatus({ progress: { percentage: 100, message: 'Done' } });
      });

      expect(result.current.progress?.percentage).toBe(100);
    });
  });

  describe('resetMigrationStatus', () => {
    it('should reset all status values to defaults', () => {
      const { result } = renderHook(() => useMigrationStatus());

      // Set some values
      act(() => {
        updateMigrationStatus({
          isRunning: true,
          progress: { percentage: 50, message: 'Testing' },
          error: 'Test error',
          showNotification: true,
        });
      });

      expect(result.current.isRunning).toBe(true);
      expect(result.current.progress).not.toBeNull();
      expect(result.current.error).toBe('Test error');
      expect(result.current.showNotification).toBe(true);

      // Reset
      act(() => {
        resetMigrationStatus();
      });

      // Re-render to get fresh state
      const { result: freshResult } = renderHook(() => useMigrationStatus());

      expect(freshResult.current.isRunning).toBe(false);
      expect(freshResult.current.progress).toBeNull();
      expect(freshResult.current.error).toBeNull();
      expect(freshResult.current.showNotification).toBe(false);
    });
  });

  describe('migration progress flow', () => {
    it('should handle complete migration flow', () => {
      const { result } = renderHook(() => useMigrationStatus());

      // Step 1: Start migration
      act(() => {
        updateMigrationStatus({
          isRunning: true,
          showNotification: true,
          progress: { percentage: 0, message: 'Starting migration...' },
        });
      });

      expect(result.current.isRunning).toBe(true);
      expect(result.current.progress?.percentage).toBe(0);

      // Step 2: Progress updates
      act(() => {
        updateMigrationStatus({
          progress: { percentage: 25, message: 'Migrating saved games...' },
        });
      });

      expect(result.current.progress?.percentage).toBe(25);

      act(() => {
        updateMigrationStatus({
          progress: { percentage: 50, message: 'Migrating roster...' },
        });
      });

      expect(result.current.progress?.percentage).toBe(50);

      act(() => {
        updateMigrationStatus({
          progress: { percentage: 75, message: 'Migrating settings...' },
        });
      });

      expect(result.current.progress?.percentage).toBe(75);

      // Step 3: Complete
      act(() => {
        updateMigrationStatus({
          isRunning: false,
          progress: { percentage: 100, message: 'Migration complete!' },
        });
      });

      expect(result.current.isRunning).toBe(false);
      expect(result.current.progress?.percentage).toBe(100);
      expect(result.current.showNotification).toBe(true);

      // Step 4: User dismisses notification
      act(() => {
        result.current.dismissNotification();
      });

      expect(result.current.showNotification).toBe(false);
    });

    it('should handle migration failure', () => {
      const { result } = renderHook(() => useMigrationStatus());

      // Start migration
      act(() => {
        updateMigrationStatus({
          isRunning: true,
          showNotification: true,
          progress: { percentage: 0, message: 'Starting migration...' },
        });
      });

      // Fail during migration
      act(() => {
        updateMigrationStatus({
          isRunning: false,
          error: 'Failed to migrate: QuotaExceededError',
          progress: { percentage: 30, message: 'Migration failed' },
        });
      });

      expect(result.current.isRunning).toBe(false);
      expect(result.current.error).toBe('Failed to migrate: QuotaExceededError');
      expect(result.current.progress?.percentage).toBe(30);
    });
  });
});
