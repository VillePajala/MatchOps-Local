/**
 * Tests for Migration Mutex - Tab Coordination
 *
 * IMPORTANT: These tests do NOT use fake timers because the production
 * code uses real setTimeout in sleep() which causes deadlocks with fake timers.
 * Instead, we test the logic directly without timing dependencies.
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

    it('should release lock properly', async () => {
      // First acquire a lock
      mockLocalStorage.getItem.mockReturnValue(null);
      await mutex.acquireLock('test');

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
      // Tab 1 has existing lock with recent timestamp
      const existingLock: MigrationLock = {
        tabId: 'tab_1',
        timestamp: Date.now(),
        operation: 'migration',
        heartbeat: Date.now()
      };

      // Always return the existing lock (simulating another tab holding it)
      let callCount = 0;
      mockLocalStorage.getItem.mockImplementation(() => {
        callCount++;
        // Return lock for first few attempts, then give up (max wait reached)
        if (callCount <= 3) {
          return JSON.stringify(existingLock);
        }
        return JSON.stringify(existingLock); // Keep returning lock
      });

      const acquired = await mutex.acquireLock('test');

      expect(acquired).toBe(false);
      expect(mutex.isLockOwner()).toBe(false);
    });

    it('should detect and clean up stale locks from other tabs immediately', async () => {
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

  describe('cleanup behavior', () => {
    it('should cleanup on instance destruction', async () => {
      // Simulate owning a lock
      mockLocalStorage.getItem.mockReturnValue(null);
      await mutex.acquireLock('test');

      mutex.cleanup();

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('migration_lock');
    });

    it('should not cleanup if not lock owner', () => {
      // Don't acquire lock
      const removeCallsBefore = mockLocalStorage.removeItem.mock.calls.length;

      mutex.cleanup();

      // Should not have called removeItem
      expect(mockLocalStorage.removeItem.mock.calls.length).toBe(removeCallsBefore);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle quota exceeded errors', async () => {
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
      const tabId1 = (mutex1 as any).tabId;
      const tabId2 = (mutex2 as any).tabId;

      expect(tabId1).not.toBe(tabId2);
      expect(tabId1).toMatch(/^tab_\d+_[a-z0-9]+$/);
      expect(tabId2).toMatch(/^tab_\d+_[a-z0-9]+$/);
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

  describe('lock status checks', () => {
    it('should correctly report lock ownership status', async () => {
      expect(mutex.isLockOwner()).toBe(false);

      mockLocalStorage.getItem.mockReturnValue(null);
      await mutex.acquireLock('test');

      expect(mutex.isLockOwner()).toBe(true);

      mutex.releaseLock();

      expect(mutex.isLockOwner()).toBe(false);
    });

    it('should handle getCurrentLock with no lock', () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      // This is testing private method through its effects
      const acquired = mutex.isLockOwner();
      expect(acquired).toBe(false);
    });

    it('should handle getCurrentLock with invalid JSON', () => {
      mockLocalStorage.getItem.mockReturnValue('not json');

      const acquired = mutex.isLockOwner();
      expect(acquired).toBe(false);
    });
  });
});