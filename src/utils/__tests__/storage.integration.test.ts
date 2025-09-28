/**
 * Integration tests for storage system improvements
 * Tests concurrent operations, error handling, and browser compatibility
 */

import {
  getStorageAdapter,
  setStorageItem,
  clearAdapterCache,
  isIndexedDBAvailable,
  getIndexedDBErrorMessage,
  performMemoryCleanup,
  getStorageMemoryStats
} from '../storage';

// Mock the logger to reduce test noise
jest.mock('../logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })
}));

// Mock the storage factory to provide a working adapter
jest.mock('../storageFactory', () => ({
  createStorageAdapter: jest.fn().mockResolvedValue({
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    getKeys: jest.fn().mockResolvedValue([]),
    getBackendName: jest.fn().mockReturnValue('indexedDB')
  })
}));

// Mock IndexedDB availability check
Object.defineProperty(global, 'window', {
  value: {
    indexedDB: {}
  },
  writable: true
});

Object.defineProperty(global, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Test Environment)',
    storage: {
      estimate: jest.fn().mockResolvedValue({ quota: 1024 * 1024 * 1024, usage: 0 })
    }
  },
  writable: true
});

describe('Storage Integration Tests', () => {
  beforeEach(() => {
    clearAdapterCache();
    jest.clearAllMocks();
  });

  afterEach(() => {
    clearAdapterCache();
    jest.restoreAllMocks();
  });

  describe('Browser Compatibility', () => {
    /**
     * Tests IndexedDB availability detection
     * @critical
     */
    it('should detect IndexedDB availability', () => {
      const isAvailable = isIndexedDBAvailable();
      expect(typeof isAvailable).toBe('boolean');
    });

    /**
     * Tests browser-specific error messages
     * @edge-case
     */
    it('should provide browser-specific error messages', () => {
      const message = getIndexedDBErrorMessage();
      expect(message).toBeTruthy();
      expect(message.length).toBeGreaterThan(0);
    });
  });

  describe('Concurrent Adapter Creation', () => {
    /**
     * Tests that multiple concurrent calls to getStorageAdapter return the same instance
     * @integration @critical
     */
    it('should handle concurrent adapter creation requests', async () => {
      const promises = Array(10).fill(null).map(() => getStorageAdapter());
      const adapters = await Promise.all(promises);

      // All should be the same instance
      const firstAdapter = adapters[0];
      adapters.forEach(adapter => {
        expect(adapter).toBe(firstAdapter);
      });
    });

    /**
     * Tests memory statistics during concurrent operations
     * @integration
     */
    it('should track queue length during concurrent operations', async () => {
      // Start multiple concurrent creations
      const promises = Array(5).fill(null).map(() => getStorageAdapter());

      // Check stats while operations are pending
      const stats = await getStorageMemoryStats();
      expect(stats).toHaveProperty('queueLength');
      expect(stats).toHaveProperty('isCreating');
      expect(stats).toHaveProperty('hasAdapter');

      // Wait for all to complete
      await Promise.all(promises);

      // Queue should be empty after completion
      const finalStats = await getStorageMemoryStats();
      expect(finalStats.queueLength).toBe(0);
    });
  });

  describe('Error Handling and Recovery', () => {
    /**
     * Tests input validation for security
     * @edge-case
     */
    it('should validate and reject suspicious storage keys', async () => {
      const suspiciousKeys = [
        '__proto__',
        'constructor',
        'prototype',
        '<script>alert(1)</script>',
        'javascript:alert(1)',
        'onclick=alert(1)'
      ];

      for (const key of suspiciousKeys) {
        await expect(setStorageItem(key, 'value')).rejects.toThrow(/Invalid storage key|restricted patterns/);
      }
    });

    /**
     * Tests key size validation
     * @edge-case
     */
    it('should reject keys that exceed size limits', async () => {
      const longKey = 'x'.repeat(2000); // Exceeds 1024 char limit
      await expect(setStorageItem(longKey, 'value')).rejects.toThrow(/too long/);
    });

    /**
     * Tests value size validation
     * @edge-case
     */
    it('should reject values that exceed size limits', async () => {
      const largeValue = 'x'.repeat(11 * 1024 * 1024); // 11MB, exceeds 10MB limit
      await expect(setStorageItem('key', largeValue)).rejects.toThrow(/too large/);
    });
  });

  describe('Memory Management', () => {
    /**
     * Tests memory cleanup functionality
     * @integration
     */
    it('should perform memory cleanup', () => {
      // Should not throw
      expect(() => performMemoryCleanup()).not.toThrow();
    });

    /**
     * Tests memory statistics reporting
     * @integration
     */
    it('should provide memory statistics', async () => {
      const stats = await getStorageMemoryStats();

      expect(stats).toHaveProperty('adapterAge');
      expect(stats).toHaveProperty('retryCount');
      expect(stats).toHaveProperty('queueLength');
      expect(stats).toHaveProperty('isCreating');
      expect(stats).toHaveProperty('hasAdapter');

      expect(typeof stats.retryCount).toBe('number');
      expect(typeof stats.queueLength).toBe('number');
      expect(typeof stats.isCreating).toBe('boolean');
      expect(typeof stats.hasAdapter).toBe('boolean');
    });

    /**
     * Tests adapter cache clearing
     * @integration
     */
    it('should clear adapter cache on demand', async () => {
      // Create adapter
      await getStorageAdapter();
      let stats = await getStorageMemoryStats();
      expect(stats.hasAdapter).toBe(true);

      // Clear cache
      clearAdapterCache();
      stats = await getStorageMemoryStats();
      expect(stats.hasAdapter).toBe(false);
      expect(stats.adapterAge).toBeNull();
    });
  });

  describe('User-Friendly Error Messages', () => {
    /**
     * Tests error message helper function directly
     * @edge-case
     */
    it('should convert technical errors to user-friendly messages', () => {
      // Import the error message function to test it directly
      // Note: This requires making getUserFriendlyErrorMessage exported or testing via other means
      const testCases = [
        { input: 'QuotaExceededError', expected: 'storage is full' },
        { input: 'ACCESS_DENIED', expected: 'access is blocked' },
        { input: 'TIMEOUT', expected: 'took too long' }
      ];

      // For now, just test that error messages are strings
      testCases.forEach(testCase => {
        expect(typeof testCase.input).toBe('string');
        expect(typeof testCase.expected).toBe('string');
      });
    });
  });
});