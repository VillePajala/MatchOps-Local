/**
 * Tests for Migration Mutex - Tab Coordination
 */

import { MigrationMutex, MigrationLock } from './migrationMutex';

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};

Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
  writable: true
});

// Mock performance.now for consistent timing
const mockPerformance = {
  now: jest.fn(() => 1000)
};

Object.defineProperty(global, 'performance', {
  value: mockPerformance,
  writable: true
});

describe('MigrationMutex', () => {
  let mutex: MigrationMutex;
  let originalDateNow: typeof Date.now;

  beforeEach(() => {
    jest.clearAllMocks();
    mutex = new MigrationMutex();

    // Mock Date.now for consistent timestamps
    originalDateNow = Date.now;
    Date.now = jest.fn(() => 1000);
  });

  afterEach(() => {
    Date.now = originalDateNow;
    mutex.cleanup();
  });

  describe('single tab operations', () => {
    it('should acquire lock when no existing lock', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      mockLocalStorage.setItem.mockImplementation(() => {});

      const acquired = await mutex.acquireLock('test-operation');

      expect(acquired).toBe(true);
      expect(mutex.isLockOwner()).toBe(true);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'migration_lock',
        expect.stringContaining('test-operation')
      );
    });

    it('should release lock properly', () => {
      // First acquire a lock
      mockLocalStorage.getItem.mockReturnValue(null);
      mutex.acquireLock('test');

      mutex.releaseLock();

      expect(mutex.isLockOwner()).toBe(false);
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('migration_lock');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('migration_heartbeat');
    });

    it('should handle storage errors gracefully', async () => {
      mockLocalStorage.getItem.mockImplementation(() => {
        throw new Error('Storage access denied');
      });

      const acquired = await mutex.acquireLock('test');

      expect(acquired).toBe(false);
      expect(mutex.isLockOwner()).toBe(false);
    });
  });

  describe('concurrent tab scenarios', () => {
    it('should prevent concurrent lock acquisition from multiple tabs', async () => {
      // Tab 1 has existing lock
      const existingLock: MigrationLock = {
        tabId: 'tab_1',
        timestamp: Date.now(),
        operation: 'migration',
        heartbeat: Date.now()
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(existingLock));

      // Tab 2 tries to acquire lock
      const acquired = await mutex.acquireLock('test');

      expect(acquired).toBe(false);
      expect(mutex.isLockOwner()).toBe(false);
    });

    it('should detect and clean up stale locks from other tabs', async () => {
      // Stale lock from 35 seconds ago (timeout is 30s)
      const staleLock: MigrationLock = {
        tabId: 'tab_1',
        timestamp: Date.now() - 35000,
        operation: 'migration',
        heartbeat: Date.now() - 35000
      };

      mockLocalStorage.getItem
        .mockReturnValueOnce(JSON.stringify(staleLock)) // First check - stale lock
        .mockReturnValueOnce(null); // After cleanup - no lock

      const acquired = await mutex.acquireLock('test');

      expect(acquired).toBe(true);
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('migration_lock');
    });

    it('should handle heartbeat timeout from other tabs', async () => {
      // Lock with stale heartbeat (11 seconds ago, timeout is 10s)
      const lockWithStaleHeartbeat: MigrationLock = {
        tabId: 'tab_1',
        timestamp: Date.now(),
        operation: 'migration',
        heartbeat: Date.now() - 11000
      };

      mockLocalStorage.getItem
        .mockReturnValueOnce(JSON.stringify(lockWithStaleHeartbeat))
        .mockReturnValueOnce(null);

      const acquired = await mutex.acquireLock('test');

      expect(acquired).toBe(true);
    });

    it('should handle race condition during lock creation', async () => {
      let callCount = 0;
      mockLocalStorage.getItem.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return null; // No lock initially
        // Simulate another tab creating lock between check and create
        return JSON.stringify({
          tabId: 'other_tab',
          timestamp: Date.now(),
          operation: 'migration',
          heartbeat: Date.now()
        });
      });

      mockLocalStorage.setItem.mockImplementation(() => {
        // Simulate successful write but verification shows different tab won
      });

      const acquired = await mutex.acquireLock('test');

      expect(acquired).toBe(false);
    });

    it('should wait and retry for lock acquisition', async () => {
      jest.useFakeTimers();

      // Mock active lock that becomes stale after 2 seconds
      let attempt = 0;
      mockLocalStorage.getItem.mockImplementation(() => {
        attempt++;
        if (attempt <= 2) {
          // First two attempts - active lock
          return JSON.stringify({
            tabId: 'other_tab',
            timestamp: Date.now(),
            operation: 'migration',
            heartbeat: Date.now()
          });
        }
        // Third attempt - no lock
        return null;
      });

      const acquirePromise = mutex.acquireLock('test');

      // Fast-forward through retry attempts
      jest.advanceTimersByTime(3000);

      const acquired = await acquirePromise;

      expect(acquired).toBe(true);

      jest.useRealTimers();
    });

    it('should timeout after maximum wait time', async () => {
      jest.useFakeTimers();

      // Always return active lock (never becomes available)
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify({
        tabId: 'persistent_tab',
        timestamp: Date.now(),
        operation: 'migration',
        heartbeat: Date.now()
      }));

      const acquirePromise = mutex.acquireLock('test');

      // Fast-forward past maximum wait time (60 seconds)
      jest.advanceTimersByTime(65000);

      const acquired = await acquirePromise;

      expect(acquired).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('heartbeat mechanism', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should update heartbeat periodically when lock owner', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      const acquired = await mutex.acquireLock('test');
      expect(acquired).toBe(true);

      // Fast-forward through one heartbeat interval
      jest.advanceTimersByTime(5000);

      // Should have updated heartbeat
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'migration_lock',
        expect.stringContaining('"heartbeat":')
      );
    });

    it('should stop heartbeat when lock is released', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      await mutex.acquireLock('test');
      mutex.releaseLock();

      const setItemCallsBefore = mockLocalStorage.setItem.mock.calls.length;

      // Fast-forward - should not update heartbeat after release
      jest.advanceTimersByTime(10000);

      expect(mockLocalStorage.setItem.mock.calls.length).toBe(setItemCallsBefore);
    });

    it('should handle heartbeat update errors gracefully', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      await mutex.acquireLock('test');

      // Make heartbeat update fail
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      // Should not crash on heartbeat update error
      expect(() => {
        jest.advanceTimersByTime(5000);
      }).not.toThrow();
    });
  });

  describe('force release scenarios', () => {
    it('should force release any existing lock', () => {
      mutex.forceReleaseLock();

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('migration_lock');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('migration_heartbeat');
    });

    it('should handle force release errors', () => {
      mockLocalStorage.removeItem.mockImplementation(() => {
        throw new Error('Storage error');
      });

      // Should not throw
      expect(() => {
        mutex.forceReleaseLock();
      }).not.toThrow();
    });
  });

  describe('lock information retrieval', () => {
    it('should return current lock information', () => {
      const lockData: MigrationLock = {
        tabId: 'test_tab',
        timestamp: Date.now(),
        operation: 'test_operation',
        heartbeat: Date.now()
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(lockData));

      const currentLock = mutex.getCurrentLock();

      expect(currentLock).toEqual(lockData);
    });

    it('should return null for corrupted lock data', () => {
      mockLocalStorage.getItem.mockReturnValue('{invalid json}');

      const currentLock = mutex.getCurrentLock();

      expect(currentLock).toBeNull();
    });

    it('should return null when no lock exists', () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      const currentLock = mutex.getCurrentLock();

      expect(currentLock).toBeNull();
    });
  });

  describe('cleanup behavior', () => {
    it('should cleanup on instance destruction', () => {
      // Simulate owning a lock
      mockLocalStorage.getItem.mockReturnValue(null);
      mutex.acquireLock('test');

      mutex.cleanup();

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('migration_lock');
    });

    it('should not cleanup if not lock owner', () => {
      // Don't acquire lock
      const removeCallsBefore = mockLocalStorage.removeItem.mock.calls.length;

      mutex.cleanup();

      expect(mockLocalStorage.removeItem.mock.calls.length).toBe(removeCallsBefore);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle localStorage quota exceeded during lock creation', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      mockLocalStorage.setItem.mockImplementation(() => {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      });

      const acquired = await mutex.acquireLock('test');

      expect(acquired).toBe(false);
      expect(mutex.isLockOwner()).toBe(false);
    });

    it('should handle corrupted lock data during acquisition', async () => {
      mockLocalStorage.getItem.mockReturnValue('{corrupted json');

      const acquired = await mutex.acquireLock('test');

      // Should treat corrupted data as no lock and try to acquire
      expect(acquired).toBe(true);
    });

    it('should generate unique tab IDs', () => {
      const mutex1 = new MigrationMutex();
      const mutex2 = new MigrationMutex();

      // Access private tabId through type assertion for testing
      const tabId1 = (mutex1 as { tabId: string }).tabId;
      const tabId2 = (mutex2 as { tabId: string }).tabId;

      expect(tabId1).not.toBe(tabId2);
      expect(tabId1).toMatch(/^tab_\d+_[a-z0-9]+$/);
      expect(tabId2).toMatch(/^tab_\d+_[a-z0-9]+$/);

      mutex1.cleanup();
      mutex2.cleanup();
    });

    it('should handle rapid consecutive lock attempts', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      // Try to acquire lock multiple times rapidly
      const promises = Array.from({ length: 5 }, () => mutex.acquireLock('test'));
      const results = await Promise.all(promises);

      // Only one should succeed
      const successCount = results.filter(Boolean).length;
      expect(successCount).toBe(1);
    });
  });
});