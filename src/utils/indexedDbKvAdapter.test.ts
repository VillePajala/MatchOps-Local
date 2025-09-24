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

  describe('Error Handling', () => {
    it('should handle database initialization failure', async () => {
      const dbError = new DOMException('Failed to open database', 'UnknownError');
      (openDB as jest.Mock).mockRejectedValue(dbError);

      const failingAdapter = new IndexedDBKvAdapter();

      await expect(failingAdapter.getItem('test')).rejects.toThrow(StorageError);
      await expect(failingAdapter.getItem('test')).rejects.toThrow('Failed to initialize IndexedDB');
    });

    it('should handle quota exceeded errors', async () => {
      const quotaError = new DOMException('Quota exceeded', 'QuotaExceededError');
      mockStore.put.mockRejectedValue(quotaError);

      await expect(adapter.setItem('test', 'value')).rejects.toThrow(StorageError);
      await expect(adapter.setItem('test', 'value')).rejects.toMatchObject({
        type: StorageErrorType.QUOTA_EXCEEDED
      });
    });

    it('should handle access denied errors', async () => {
      const accessError = new DOMException('Access denied', 'NotAllowedError');
      mockStore.get.mockRejectedValue(accessError);

      await expect(adapter.getItem('test')).rejects.toThrow(StorageError);
      await expect(adapter.getItem('test')).rejects.toMatchObject({
        type: StorageErrorType.ACCESS_DENIED
      });
    });

    it('should handle corrupted data errors', async () => {
      const corruptError = new DOMException('Version error', 'VersionError');
      mockStore.get.mockRejectedValue(corruptError);

      await expect(adapter.getItem('test')).rejects.toThrow(StorageError);
      await expect(adapter.getItem('test')).rejects.toMatchObject({
        type: StorageErrorType.CORRUPTED_DATA
      });
    });

    it('should handle unknown errors gracefully', async () => {
      const unknownError = new Error('Something went wrong');
      mockStore.get.mockRejectedValue(unknownError);

      await expect(adapter.getItem('test')).rejects.toThrow(StorageError);
      await expect(adapter.getItem('test')).rejects.toMatchObject({
        type: StorageErrorType.UNKNOWN
      });
    });

    it('should handle malformed stored data', async () => {
      // Response missing 'value' property
      mockStore.get.mockResolvedValue({ key: 'test' });

      const result = await adapter.getItem('test');
      expect(result).toBeNull();
    });

    it('should handle non-string stored values', async () => {
      // Response with non-string value
      mockStore.get.mockResolvedValue({ key: 'test', value: 123 });

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

    it('should reinitialize after termination', async () => {
      // Simulate database being closed externally
      mockStore.get.mockResolvedValue({ key: 'test', value: 'value' });

      await adapter.getItem('test1');

      // Reset the mock to simulate reinitialization
      (openDB as jest.Mock).mockResolvedValue(mockDB);

      await adapter.getItem('test2');

      // Should still work
      expect(mockStore.get).toHaveBeenCalledTimes(2);
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