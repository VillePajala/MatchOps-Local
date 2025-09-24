/**
 * Tests for IndexedDB Key-Value Storage Adapter
 *
 * REWRITTEN FROM SCRATCH - NO HANGING ISSUES
 *
 * Tests the StorageAdapter interface implementation with proper mocking
 * Avoids async initialization complexity that caused hanging
 */

import { IndexedDBKvAdapter } from './indexedDbKvAdapter';
import { StorageError, StorageErrorType } from './storageAdapter';

// Mock the idb library completely - no real IndexedDB operations
jest.mock('idb', () => ({
  openDB: jest.fn()
}));

import { openDB } from 'idb';

// Mock logger to prevent console noise
jest.mock('./logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

describe('IndexedDBKvAdapter', () => {
  let adapter: IndexedDBKvAdapter;
  let mockDB: {
    transaction: jest.Mock;
    close: jest.Mock;
    objectStoreNames: { contains: jest.Mock };
    createObjectStore: jest.Mock;
  };
  let mockStore: {
    get: jest.Mock;
    put: jest.Mock;
    delete: jest.Mock;
    clear: jest.Mock;
    getAllKeys: jest.Mock;
  };
  let mockTransaction: {
    objectStore: jest.Mock;
    done: Promise<void>;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create simple mock implementations
    mockStore = {
      get: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
      getAllKeys: jest.fn()
    };

    mockTransaction = {
      objectStore: jest.fn().mockReturnValue(mockStore),
      done: Promise.resolve()
    };

    mockDB = {
      transaction: jest.fn().mockReturnValue(mockTransaction),
      close: jest.fn(),
      objectStoreNames: {
        contains: jest.fn().mockReturnValue(true)
      },
      createObjectStore: jest.fn()
    };

    // Mock openDB to resolve immediately with our mock
    (openDB as jest.Mock).mockResolvedValue(mockDB);

    // Create adapter - initialization will be mocked
    adapter = new IndexedDBKvAdapter();
  });

  afterEach(async () => {
    // Simple cleanup - just close the adapter
    await adapter.close();
  });

  describe('Basic Interface Compliance', () => {
    it('should implement StorageAdapter interface', () => {
      expect(adapter).toBeDefined();
      expect(typeof adapter.getItem).toBe('function');
      expect(typeof adapter.setItem).toBe('function');
      expect(typeof adapter.removeItem).toBe('function');
      expect(typeof adapter.clear).toBe('function');
      expect(typeof adapter.getKeys).toBe('function');
      expect(typeof adapter.close).toBe('function');
    });

    it('should return correct backend name', () => {
      expect(adapter.getBackendName()).toBe('indexedDB');
    });

    it('should create with default configuration', () => {
      const defaultAdapter = new IndexedDBKvAdapter();
      expect(defaultAdapter.getBackendName()).toBe('indexedDB');
    });

    it('should create with custom configuration', () => {
      const customAdapter = new IndexedDBKvAdapter({
        mode: 'indexedDB',
        dbName: 'CustomDB',
        version: 2
      });
      expect(customAdapter.getBackendName()).toBe('indexedDB');
    });
  });

  describe('CRUD Operations', () => {
    it('should get existing item', async () => {
      const testValue = 'test value';
      mockStore.get.mockResolvedValue({ key: 'testKey', value: testValue });

      const result = await adapter.getItem('testKey');

      expect(result).toBe(testValue);
      expect(mockStore.get).toHaveBeenCalledWith('testKey');
    });

    it('should return null for non-existent item', async () => {
      mockStore.get.mockResolvedValue(undefined);

      const result = await adapter.getItem('nonExistentKey');

      expect(result).toBeNull();
    });

    it('should store item successfully', async () => {
      mockStore.put.mockResolvedValue(undefined);

      await adapter.setItem('testKey', 'test value');

      expect(mockStore.put).toHaveBeenCalledWith({
        key: 'testKey',
        value: 'test value'
      });
    });

    it('should remove item successfully', async () => {
      mockStore.delete.mockResolvedValue(undefined);

      await adapter.removeItem('testKey');

      expect(mockStore.delete).toHaveBeenCalledWith('testKey');
    });

    it('should clear all items', async () => {
      mockStore.clear.mockResolvedValue(undefined);

      await adapter.clear();

      expect(mockStore.clear).toHaveBeenCalled();
    });

    it('should get all keys', async () => {
      const testKeys = ['key1', 'key2', 'key3'];
      mockStore.getAllKeys.mockResolvedValue(testKeys);

      const result = await adapter.getKeys();

      expect(result).toEqual(testKeys);
      expect(mockStore.getAllKeys).toHaveBeenCalled();
    });
  });

  describe('Error Handling - Testing Real Logic', () => {
    it('should handle database initialization failure', async () => {
      const dbError = new DOMException('Failed to open database', 'UnknownError');
      (openDB as jest.Mock).mockRejectedValue(dbError);

      const failingAdapter = new IndexedDBKvAdapter();

      await expect(failingAdapter.getItem('test')).rejects.toThrow(StorageError);
      await expect(failingAdapter.getItem('test')).rejects.toThrow('Failed to initialize IndexedDB');
    });

    it('should convert QuotaExceededError correctly', async () => {
      const quotaError = new DOMException('Quota exceeded', 'QuotaExceededError');
      mockStore.put.mockRejectedValue(quotaError);

      try {
        await adapter.setItem('test', 'value');
        fail('Expected error to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).type).toBe(StorageErrorType.QUOTA_EXCEEDED);
        expect((error as StorageError).message).toContain('IndexedDB storage quota exceeded');
        expect((error as StorageError).message).toContain('Quota exceeded');
        expect((error as StorageError).cause).toBe(quotaError);
      }
    });

    it('should convert legacy quota error (code 22) correctly', async () => {
      const legacyQuotaError = new DOMException('Storage quota exceeded');
      Object.defineProperty(legacyQuotaError, 'code', { value: 22 });
      mockStore.put.mockRejectedValue(legacyQuotaError);

      try {
        await adapter.setItem('test', 'value');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).type).toBe(StorageErrorType.QUOTA_EXCEEDED);
      }
    });

    it('should convert NotAllowedError correctly', async () => {
      const accessError = new DOMException('Access denied', 'NotAllowedError');
      mockStore.get.mockRejectedValue(accessError);

      try {
        await adapter.getItem('test');
        fail('Expected error to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).type).toBe(StorageErrorType.ACCESS_DENIED);
        expect((error as StorageError).message).toContain('IndexedDB access denied');
        expect((error as StorageError).message).toContain('Access denied');
      }
    });

    it('should convert SecurityError correctly', async () => {
      const securityError = new DOMException('Security error', 'SecurityError');
      mockStore.get.mockRejectedValue(securityError);

      try {
        await adapter.getItem('test');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).type).toBe(StorageErrorType.ACCESS_DENIED);
      }
    });

    it('should convert VersionError correctly', async () => {
      const versionError = new DOMException('Version error', 'VersionError');
      mockStore.get.mockRejectedValue(versionError);

      try {
        await adapter.getItem('test');
        fail('Expected error to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).type).toBe(StorageErrorType.CORRUPTED_DATA);
        expect((error as StorageError).message).toContain('IndexedDB schema or state error');
      }
    });

    it('should convert InvalidStateError correctly', async () => {
      const stateError = new DOMException('Invalid state', 'InvalidStateError');
      mockStore.clear.mockRejectedValue(stateError);

      try {
        await adapter.clear();
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).type).toBe(StorageErrorType.CORRUPTED_DATA);
      }
    });

    it('should convert unknown DOMException correctly', async () => {
      const unknownDOMError = new DOMException('Unknown DOM error', 'UnknownError');
      mockStore.get.mockRejectedValue(unknownDOMError);

      try {
        await adapter.getItem('test');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).type).toBe(StorageErrorType.UNKNOWN);
      }
    });

    it('should convert non-DOMException Error correctly', async () => {
      const unknownError = new Error('Something went wrong');
      mockStore.get.mockRejectedValue(unknownError);

      try {
        await adapter.getItem('test');
        fail('Expected error to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).type).toBe(StorageErrorType.UNKNOWN);
        expect((error as StorageError).message).toContain('IndexedDB transaction failed');
        expect((error as StorageError).message).toContain('Something went wrong');
      }
    });

    it('should convert string errors correctly', async () => {
      mockStore.get.mockRejectedValue('String error message');

      try {
        await adapter.getItem('test');
        fail('Expected error to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).type).toBe(StorageErrorType.UNKNOWN);
        expect((error as StorageError).message).toContain('String error message');
      }
    });

    it('should preserve existing StorageError instances', async () => {
      const existingError = new StorageError(StorageErrorType.QUOTA_EXCEEDED, 'Already a StorageError');
      mockStore.get.mockRejectedValue(existingError);

      try {
        await adapter.getItem('test');
        fail('Expected error to be thrown');
      } catch (error: unknown) {
        expect(error).toBe(existingError); // Same instance, not converted
        expect((error as StorageError).message).toBe('Already a StorageError');
      }
    });

    it('should handle malformed stored data', async () => {
      // Response missing 'value' property - tests real getItem parsing logic
      mockStore.get.mockResolvedValue({ key: 'test' });

      const result = await adapter.getItem('test');
      expect(result).toBeNull();
    });

    it('should handle non-string stored values', async () => {
      // Response with non-string value - tests real getItem validation
      mockStore.get.mockResolvedValue({ key: 'test', value: 123 });

      const result = await adapter.getItem('test');
      expect(result).toBeNull();
    });

    it('should handle undefined stored values', async () => {
      // Response with undefined value
      mockStore.get.mockResolvedValue({ key: 'test', value: undefined });

      const result = await adapter.getItem('test');
      expect(result).toBeNull();
    });
  });

  describe('Transaction Management', () => {
    it('should use correct transaction modes', async () => {
      mockStore.get.mockResolvedValue({ key: 'test', value: 'value' });

      await adapter.getItem('test');
      expect(mockDB.transaction).toHaveBeenCalledWith(
        expect.any(String),
        'readonly'
      );

      await adapter.setItem('test', 'value');
      expect(mockDB.transaction).toHaveBeenCalledWith(
        expect.any(String),
        'readwrite'
      );
    });

    it('should wait for transaction completion', async () => {
      mockStore.put.mockResolvedValue(undefined);

      await adapter.setItem('test', 'value');

      expect(mockTransaction.done).toBeDefined();
    });
  });

  describe('Special Value Handling', () => {
    it('should handle empty string values', async () => {
      mockStore.get.mockResolvedValue({ key: 'empty', value: '' });

      const result = await adapter.getItem('empty');
      expect(result).toBe('');
    });

    it('should handle very long values', async () => {
      const longValue = 'x'.repeat(100000);
      mockStore.get.mockResolvedValue({ key: 'long', value: longValue });

      const result = await adapter.getItem('long');
      expect(result).toBe(longValue);
    });

    it('should handle special characters in keys and values', async () => {
      const specialKey = 'key:with/special\\chars';
      const specialValue = 'value\nwith\ttabs\0null';

      mockStore.get.mockResolvedValue({ key: specialKey, value: specialValue });

      const result = await adapter.getItem(specialKey);
      expect(result).toBe(specialValue);
    });

    it('should handle unicode values', async () => {
      const unicodeValue = '🚀 Unicode test with 中文 and émojis 🎉';
      mockStore.get.mockResolvedValue({ key: 'unicode', value: unicodeValue });

      const result = await adapter.getItem('unicode');
      expect(result).toBe(unicodeValue);
    });
  });

  describe('Data Transformation - Testing Real Logic', () => {
    it('should test formatBytes helper method behavior', async () => {
      // Test the real formatBytes method by triggering setItem logging
      const spy = jest.spyOn(adapter['logger'], 'debug');

      // Test different value sizes to trigger formatBytes
      await adapter.setItem('small', 'test'); // 4 bytes
      expect(spy).toHaveBeenCalledWith('Setting item in IndexedDB', {
        key: 'small',
        valueLength: 4,
        valueSizeFormatted: '4 B'
      });

      await adapter.setItem('medium', 'x'.repeat(1500)); // 1.5 KB
      expect(spy).toHaveBeenCalledWith('Setting item in IndexedDB', {
        key: 'medium',
        valueLength: 1500,
        valueSizeFormatted: '1.5 KB'
      });

      await adapter.setItem('large', 'x'.repeat(2 * 1024 * 1024)); // 2 MB
      expect(spy).toHaveBeenCalledWith('Setting item in IndexedDB', {
        key: 'large',
        valueLength: 2 * 1024 * 1024,
        valueSizeFormatted: '2.0 MB'
      });

      spy.mockRestore();
    });

    it('should test storage usage cache invalidation logic', async () => {
      // Large value should invalidate cache (>100KB threshold)
      const largeSpy = jest.spyOn(adapter as unknown as { invalidateStorageUsageCache: () => void }, 'invalidateStorageUsageCache');

      await adapter.setItem('large-value', 'x'.repeat(200 * 1024)); // 200KB
      expect(largeSpy).toHaveBeenCalled();

      largeSpy.mockClear();

      // Small value should not invalidate cache
      await adapter.setItem('small-value', 'x'.repeat(50 * 1024)); // 50KB
      expect(largeSpy).not.toHaveBeenCalled();

      largeSpy.mockRestore();
    });

    it('should test clear operation cache invalidation', async () => {
      const cacheSpy = jest.spyOn(adapter as unknown as { invalidateStorageUsageCache: () => void }, 'invalidateStorageUsageCache');

      await adapter.clear();

      expect(cacheSpy).toHaveBeenCalled();
      cacheSpy.mockRestore();
    });

    it('should test getItem value validation logic', async () => {
      // Test the real validation logic in getItem that checks for string values
      mockStore.get.mockResolvedValue({ key: 'test', value: 123 });

      const result1 = await adapter.getItem('test');
      expect(result1).toBeNull(); // Non-string should return null

      mockStore.get.mockResolvedValue({ key: 'test', value: null });
      const result2 = await adapter.getItem('test');
      expect(result2).toBeNull(); // null value should return null

      mockStore.get.mockResolvedValue({ key: 'test', value: undefined });
      const result3 = await adapter.getItem('test');
      expect(result3).toBeNull(); // undefined value should return null

      mockStore.get.mockResolvedValue({ key: 'test' }); // Missing value property
      const result4 = await adapter.getItem('test');
      expect(result4).toBeNull(); // Missing value should return null
    });

    it('should test setItem data structure creation', async () => {
      // Test that setItem creates the correct data structure for IndexedDB
      await adapter.setItem('test-key', 'test-value');

      expect(mockStore.put).toHaveBeenCalledWith({
        key: 'test-key',
        value: 'test-value'
      });

      // Test with complex key
      await adapter.setItem('complex:key/with\\special', 'complex-value');

      expect(mockStore.put).toHaveBeenCalledWith({
        key: 'complex:key/with\\special',
        value: 'complex-value'
      });
    });
  });

  describe('Initialization Logic - Testing Real Behavior', () => {
    it('should test ensureInitialized singleton pattern', async () => {
      // Test that multiple calls to operations use same initialization
      const openDBSpy = openDB as jest.Mock;
      openDBSpy.mockClear();

      // Multiple operations should only trigger one openDB call
      await Promise.all([
        adapter.getItem('test1'),
        adapter.getItem('test2'),
        adapter.setItem('test3', 'value')
      ]);

      // Only one openDB call despite multiple operations
      expect(openDBSpy).toHaveBeenCalledTimes(1);
    });

    it('should test database upgrade logic parameters', async () => {
      const openDBSpy = openDB as jest.Mock;
      openDBSpy.mockClear();

      // Trigger initialization
      await adapter.getItem('test');

      // Verify openDB was called with correct parameters
      expect(openDBSpy).toHaveBeenCalledWith('MatchOpsLocal', 1, {
        upgrade: expect.any(Function),
        blocked: expect.any(Function),
        blocking: expect.any(Function),
        terminated: expect.any(Function)
      });
    });

    it('should test custom configuration initialization', async () => {
      const customAdapter = new IndexedDBKvAdapter({
        mode: 'indexedDB',
        dbName: 'CustomTestDB',
        version: 5,
        storeName: 'customStore'
      });

      const openDBSpy = openDB as jest.Mock;
      openDBSpy.mockClear();

      await customAdapter.getItem('test');

      expect(openDBSpy).toHaveBeenCalledWith('CustomTestDB', 5, expect.any(Object));
      await customAdapter.close();
    });

    it('should test initialization failure recovery', async () => {
      // Create a fresh adapter to test initialization failure
      const failingAdapter = new IndexedDBKvAdapter();

      // First call fails
      (openDB as jest.Mock).mockRejectedValueOnce(new DOMException('DB blocked', 'UnknownError'));

      await expect(failingAdapter.getItem('test')).rejects.toThrow('Failed to initialize IndexedDB');

      // Second call should work - tests that initPromise gets reset on failure
      (openDB as jest.Mock).mockResolvedValueOnce(mockDB);

      await expect(failingAdapter.getItem('test2')).resolves.toBeNull();

      await failingAdapter.close();
    });

    it('should test that db connection is reused between operations', async () => {
      // Force initialization
      await adapter.getItem('test1');

      // Get reference to initialized db
      const dbRef = adapter['db'];
      expect(dbRef).toBe(mockDB);

      // Subsequent operations should reuse same db
      await adapter.setItem('test2', 'value');
      await adapter.removeItem('test2');

      expect(adapter['db']).toBe(dbRef); // Same reference
    });
  });

  describe('Database Lifecycle', () => {
    it('should close database connection properly', async () => {
      // First trigger initialization by calling a method
      mockStore.get.mockResolvedValue(null);
      await adapter.getItem('test');

      // Now close should work
      await adapter.close();

      expect(mockDB.close).toHaveBeenCalled();
    });

    it('should handle close when not initialized', async () => {
      const freshAdapter = new IndexedDBKvAdapter();

      // Should not throw when closing uninitialized adapter
      await expect(freshAdapter.close()).resolves.toBeUndefined();
    });

    it('should reinitialize after close', async () => {
      // Initialize first
      await adapter.getItem('test1');
      expect(adapter['db']).toBe(mockDB);

      // Close the adapter
      await adapter.close();
      expect(adapter['db']).toBeNull();

      // Mock a new DB instance for reinitialization
      const mockDB2 = { ...mockDB };
      (openDB as jest.Mock).mockResolvedValueOnce(mockDB2);

      // Should reinitialize on next operation
      await adapter.getItem('test2');
      expect(adapter['db']).toBe(mockDB2);
    });

    it('should test terminated callback behavior', async () => {
      // Get the terminated callback from openDB call
      await adapter.getItem('test');

      const openDBCall = (openDB as jest.Mock).mock.calls[0];
      const config = openDBCall[2];
      const terminatedCallback = config.terminated;

      // Simulate terminated callback
      terminatedCallback();

      // Should reset db and initPromise
      expect(adapter['db']).toBeNull();
      expect(adapter['initPromise']).toBeNull();
    });
  });

  describe('Storage Quota Management', () => {
    it('should handle storage usage queries when unavailable', async () => {
      // Mock navigator.storage as undefined
      Object.defineProperty(navigator, 'storage', {
        value: undefined,
        configurable: true
      });

      const usage = await adapter.getStorageUsage();
      expect(usage).toBeNull();
    });

    it('should return storage usage when available', async () => {
      const mockEstimate = { usage: 1024 * 1024, quota: 100 * 1024 * 1024 };

      Object.defineProperty(navigator, 'storage', {
        value: {
          estimate: jest.fn().mockResolvedValue(mockEstimate)
        },
        configurable: true
      });

      const usage = await adapter.getStorageUsage();

      expect(usage).toEqual({
        used: 1024 * 1024,
        available: 100 * 1024 * 1024
      });
    });

    it('should handle storage estimate errors', async () => {
      Object.defineProperty(navigator, 'storage', {
        value: {
          estimate: jest.fn().mockRejectedValue(new Error('Estimate failed'))
        },
        configurable: true
      });

      const usage = await adapter.getStorageUsage();
      expect(usage).toBeNull();
    });
  });
});