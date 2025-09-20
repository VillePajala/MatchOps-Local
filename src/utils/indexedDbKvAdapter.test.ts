/**
 * Tests for IndexedDB Key-Value Storage Adapter
 *
 * Comprehensive test suite covering:
 * - Basic CRUD operations
 * - Error handling scenarios
 * - IndexedDB-specific behaviors
 * - Performance requirements
 * - Browser compatibility
 * - Transaction management
 *
 * @see IndexedDBKvAdapter in ./indexedDbKvAdapter.ts
 */

import { IndexedDBKvAdapter } from './indexedDbKvAdapter';
import { StorageError, StorageErrorType } from './storageAdapter';

// Mock the idb library for controlled testing
jest.mock('idb', () => ({
  openDB: jest.fn()
}));

import { openDB } from 'idb';

// Mock logger to prevent console noise during tests
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
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock store
    mockStore = {
      get: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
      getAllKeys: jest.fn()
    };

    // Create mock transaction
    mockTransaction = {
      objectStore: jest.fn().mockReturnValue(mockStore),
      done: Promise.resolve()
    };

    // Create mock database
    mockDB = {
      transaction: jest.fn().mockReturnValue(mockTransaction),
      close: jest.fn(),
      objectStoreNames: {
        contains: jest.fn().mockReturnValue(false)
      },
      createObjectStore: jest.fn().mockReturnValue({
        createIndex: jest.fn()
      })
    };

    // Mock openDB to return our mock database
    (openDB as jest.Mock).mockResolvedValue(mockDB);

    // Create fresh adapter instance
    adapter = new IndexedDBKvAdapter();
  });

  afterEach(async () => {
    // Clean up adapter
    await adapter.close();
  });

  describe('Initialization', () => {
    it('should create adapter with default configuration', () => {
      const defaultAdapter = new IndexedDBKvAdapter();
      expect(defaultAdapter).toBeInstanceOf(IndexedDBKvAdapter);
      expect(defaultAdapter.getBackendName()).toBe('indexedDB');
    });

    it('should create adapter with custom configuration', () => {
      const customAdapter = new IndexedDBKvAdapter({
        mode: 'indexedDB',
        dbName: 'CustomDB',
        version: 2,
        storeName: 'customStore'
      });

      expect(customAdapter).toBeInstanceOf(IndexedDBKvAdapter);
      expect(customAdapter.getBackendName()).toBe('indexedDB');
    });

    it('should initialize database on first operation', async () => {
      mockStore.get.mockResolvedValue({ key: 'test', value: 'testValue' });

      const result = await adapter.getItem('test');

      expect(openDB).toHaveBeenCalledWith('MatchOpsLocal', 1, expect.any(Object));
      expect(result).toBe('testValue');
    });

    it('should handle database upgrade scenario', async () => {
      let upgradeCallback: (db: { objectStoreNames: { contains: jest.Mock }; createObjectStore: jest.Mock }, oldVersion: number, newVersion: number, transaction: unknown) => void = () => {};

      (openDB as jest.Mock).mockImplementation((name, version, options) => {
        upgradeCallback = options.upgrade;
        return Promise.resolve(mockDB);
      });

      await adapter.getItem('test');

      // Simulate upgrade callback
      const mockUpgradeDB = {
        objectStoreNames: { contains: jest.fn().mockReturnValue(false) },
        createObjectStore: jest.fn().mockReturnValue({
          createIndex: jest.fn()
        })
      };

      upgradeCallback(mockUpgradeDB, 0, 1, mockTransaction);

      expect(mockUpgradeDB.createObjectStore).toHaveBeenCalledWith('keyValueStore', {
        keyPath: 'key'
      });
    });
  });

  describe('Basic Functionality', () => {
    it('should implement StorageAdapter interface correctly', () => {
      expect(typeof adapter.getItem).toBe('function');
      expect(typeof adapter.setItem).toBe('function');
      expect(typeof adapter.removeItem).toBe('function');
      expect(typeof adapter.clear).toBe('function');
      expect(typeof adapter.getKeys).toBe('function');
      expect(typeof adapter.getBackendName).toBe('function');
    });

    it('should return correct backend name', () => {
      expect(adapter.getBackendName()).toBe('indexedDB');
    });

    it('should get items successfully', async () => {
      const testValue = 'test value';
      mockStore.get.mockResolvedValue({ key: 'testKey', value: testValue });

      const result = await adapter.getItem('testKey');

      expect(mockStore.get).toHaveBeenCalledWith('testKey');
      expect(result).toBe(testValue);
    });

    it('should return null for non-existent items', async () => {
      mockStore.get.mockResolvedValue(undefined);

      const result = await adapter.getItem('nonExistentKey');

      expect(result).toBeNull();
    });

    it('should set items successfully', async () => {
      const testKey = 'testKey';
      const testValue = 'test value';

      await adapter.setItem(testKey, testValue);

      expect(mockStore.put).toHaveBeenCalledWith({ key: testKey, value: testValue });
      expect(mockTransaction.done).toBeDefined();
    });

    it('should remove items successfully', async () => {
      const testKey = 'testKey';

      await adapter.removeItem(testKey);

      expect(mockStore.delete).toHaveBeenCalledWith(testKey);
    });

    it('should clear storage successfully', async () => {
      await adapter.clear();

      expect(mockStore.clear).toHaveBeenCalled();
    });

    it('should get all keys successfully', async () => {
      const testKeys = ['key1', 'key2', 'key3'];
      mockStore.getAllKeys.mockResolvedValue(testKeys);

      const result = await adapter.getKeys();

      expect(mockStore.getAllKeys).toHaveBeenCalled();
      expect(result).toEqual(testKeys);
    });
  });

  describe('Error Handling - IndexedDB Specific', () => {
    describe('Database Initialization Errors', () => {
      it('should handle database connection failure', async () => {
        const dbError = new DOMException('Failed to open database', 'UnknownError');
        (openDB as jest.Mock).mockRejectedValue(dbError);

        await expect(adapter.getItem('test')).rejects.toThrow(StorageError);
        await expect(adapter.getItem('test')).rejects.toThrow('Failed to initialize IndexedDB');
      });

      it('should handle quota exceeded during database creation', async () => {
        const quotaError = new DOMException('Quota exceeded', 'QuotaExceededError');
        (openDB as jest.Mock).mockRejectedValue(quotaError);

        await expect(adapter.getItem('test')).rejects.toThrow(StorageError);
        await expect(adapter.getItem('test')).rejects.toMatchObject({
          type: StorageErrorType.QUOTA_EXCEEDED
        });
      });

      it('should handle access denied during database creation', async () => {
        const accessError = new DOMException('Access denied', 'NotAllowedError');
        (openDB as jest.Mock).mockRejectedValue(accessError);

        await expect(adapter.getItem('test')).rejects.toThrow(StorageError);
        await expect(adapter.getItem('test')).rejects.toMatchObject({
          type: StorageErrorType.ACCESS_DENIED
        });
      });
    });

    describe('Transaction Errors', () => {
      beforeEach(async () => {
        // Ensure adapter is initialized for transaction tests
        await adapter.getItem('init');
        jest.clearAllMocks();
      });

      it('should handle quota exceeded errors in transactions', async () => {
        const quotaError = new DOMException('Quota exceeded', 'QuotaExceededError');
        mockStore.put.mockRejectedValue(quotaError);

        await expect(adapter.setItem('test', 'value')).rejects.toThrow(StorageError);
        await expect(adapter.setItem('test', 'value')).rejects.toMatchObject({
          type: StorageErrorType.QUOTA_EXCEEDED
        });
      });

      it('should handle legacy quota exceeded errors (code 22)', async () => {
        const legacyQuotaError = new DOMException('Storage quota exceeded');
        Object.defineProperty(legacyQuotaError, 'code', { value: 22 });
        mockStore.put.mockRejectedValue(legacyQuotaError);

        await expect(adapter.setItem('test', 'value')).rejects.toThrow(StorageError);
        await expect(adapter.setItem('test', 'value')).rejects.toMatchObject({
          type: StorageErrorType.QUOTA_EXCEEDED
        });
      });

      it('should handle version errors as corruption', async () => {
        const versionError = new DOMException('Version error', 'VersionError');
        mockStore.get.mockRejectedValue(versionError);

        await expect(adapter.getItem('test')).rejects.toThrow(StorageError);
        await expect(adapter.getItem('test')).rejects.toMatchObject({
          type: StorageErrorType.CORRUPTED_DATA
        });
      });

      it('should handle invalid state errors as corruption', async () => {
        const stateError = new DOMException('Invalid state', 'InvalidStateError');
        mockStore.clear.mockRejectedValue(stateError);

        await expect(adapter.clear()).rejects.toThrow(StorageError);
        await expect(adapter.clear()).rejects.toMatchObject({
          type: StorageErrorType.CORRUPTED_DATA
        });
      });

      it('should handle security errors as access denied', async () => {
        const securityError = new DOMException('Security error', 'SecurityError');
        mockStore.get.mockRejectedValue(securityError);

        await expect(adapter.getItem('test')).rejects.toThrow(StorageError);
        await expect(adapter.getItem('test')).rejects.toMatchObject({
          type: StorageErrorType.ACCESS_DENIED
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
    });

    describe('Error Message Pattern Recognition', () => {
      beforeEach(async () => {
        await adapter.getItem('init');
        jest.clearAllMocks();
      });

      it('should recognize quota-related error messages', async () => {
        const quotaMessage = new Error('Storage quota exceeded for this domain');
        mockStore.put.mockRejectedValue(quotaMessage);

        await expect(adapter.setItem('test', 'value')).rejects.toMatchObject({
          type: StorageErrorType.QUOTA_EXCEEDED
        });
      });

      it('should recognize access-related error messages', async () => {
        const accessMessage = new Error('Access to storage was denied');
        mockStore.get.mockRejectedValue(accessMessage);

        await expect(adapter.getItem('test')).rejects.toMatchObject({
          type: StorageErrorType.ACCESS_DENIED
        });
      });

      it('should handle non-Error objects', async () => {
        const stringError = 'Something went wrong';
        mockStore.get.mockRejectedValue(stringError);

        await expect(adapter.getItem('test')).rejects.toThrow(StorageError);
      });
    });
  });

  describe('Edge Cases and Special Values', () => {
    beforeEach(async () => {
      await adapter.getItem('init');
      jest.clearAllMocks();
    });

    it('should handle empty string values', async () => {
      mockStore.get.mockResolvedValue({ key: 'empty', value: '' });

      const result = await adapter.getItem('empty');
      expect(result).toBe('');
    });

    it('should handle very long string values', async () => {
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

    it('should handle unicode and emoji values', async () => {
      const unicodeValue = '🚀 Unicode test with 中文 and émojis 🎉';
      mockStore.get.mockResolvedValue({ key: 'unicode', value: unicodeValue });

      const result = await adapter.getItem('unicode');
      expect(result).toBe(unicodeValue);
    });

    it('should handle malformed store responses', async () => {
      // Response missing 'value' property
      mockStore.get.mockResolvedValue({ key: 'test' });

      const result = await adapter.getItem('test');
      expect(result).toBeNull();
    });

    it('should handle non-string value responses', async () => {
      // Response with non-string value
      mockStore.get.mockResolvedValue({ key: 'test', value: 123 });

      const result = await adapter.getItem('test');
      expect(result).toBeNull();
    });
  });

  describe('Performance Requirements', () => {
    beforeEach(async () => {
      await adapter.getItem('init');
      jest.clearAllMocks();
    });

    it('should handle small operations efficiently', async () => {
      const startTime = Date.now();

      // Simulate fast IndexedDB operations
      mockStore.get.mockResolvedValue({ key: 'test', value: 'small value' });
      mockStore.put.mockResolvedValue(undefined);

      await adapter.setItem('test', 'small value');
      const result = await adapter.getItem('test');

      const duration = Date.now() - startTime;

      expect(result).toBe('small value');
      expect(duration).toBeLessThan(100); // Should be very fast with mocks
    });

    it('should handle concurrent-like operations', async () => {
      mockStore.get.mockImplementation((key: string) =>
        Promise.resolve({ key, value: `value-${key}` })
      );

      const promises = Array.from({ length: 10 }, (_, i) =>
        adapter.getItem(`key-${i}`)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result).toBe(`value-key-${i}`);
      });
    });

    it('should handle getKeys operation efficiently', async () => {
      const manyKeys = Array.from({ length: 1000 }, (_, i) => `key-${i}`);
      mockStore.getAllKeys.mockResolvedValue(manyKeys);

      const startTime = Date.now();
      const keys = await adapter.getKeys();
      const duration = Date.now() - startTime;

      expect(keys).toHaveLength(1000);
      expect(duration).toBeLessThan(100); // Should be fast with mocks
    });
  });

  describe('Transaction Management', () => {
    beforeEach(async () => {
      await adapter.getItem('init');
      jest.clearAllMocks();
    });

    it('should use readonly transactions for read operations', async () => {
      mockStore.get.mockResolvedValue({ key: 'test', value: 'value' });

      await adapter.getItem('test');

      expect(mockDB.transaction).toHaveBeenCalledWith('keyValueStore', 'readonly');
    });

    it('should use readwrite transactions for write operations', async () => {
      await adapter.setItem('test', 'value');

      expect(mockDB.transaction).toHaveBeenCalledWith('keyValueStore', 'readwrite');
    });

    it('should use readwrite transactions for delete operations', async () => {
      await adapter.removeItem('test');

      expect(mockDB.transaction).toHaveBeenCalledWith('keyValueStore', 'readwrite');
    });

    it('should wait for transaction completion', async () => {
      let resolveTx: () => void;
      mockTransaction.done = new Promise<void>(resolve => {
        resolveTx = resolve;
      });

      const setPromise = adapter.setItem('test', 'value');

      // Transaction should not complete yet
      await new Promise(resolve => setTimeout(resolve, 10));

      // Complete the transaction
      resolveTx!();

      await expect(setPromise).resolves.toBeUndefined();
    });
  });

  describe('Database Lifecycle', () => {
    it('should initialize database only once', async () => {
      await adapter.getItem('test1');
      await adapter.getItem('test2');
      await adapter.setItem('test3', 'value');

      // openDB should only be called once
      expect(openDB).toHaveBeenCalledTimes(1);
    });

    it('should handle database termination', async () => {
      let terminatedCallback: () => void;

      (openDB as jest.Mock).mockImplementation((name, version, options) => {
        terminatedCallback = options.terminated;
        return Promise.resolve(mockDB);
      });

      await adapter.getItem('test');

      // Simulate database termination
      terminatedCallback!();

      // Next operation should reinitialize
      await adapter.getItem('test2');

      expect(openDB).toHaveBeenCalledTimes(2);
    });

    it('should close database connection properly', async () => {
      await adapter.getItem('test'); // Initialize
      await adapter.close();

      expect(mockDB.close).toHaveBeenCalled();
    });
  });

  describe('Storage Usage Information', () => {
    it('should get storage usage when available', async () => {
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

    it('should return null when storage API unavailable', async () => {
      delete (navigator as { storage?: unknown }).storage;

      const usage = await adapter.getStorageUsage();

      expect(usage).toBeNull();
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

    it('should cache storage usage estimates', async () => {
      const mockEstimate = { usage: 1024 * 1024, quota: 100 * 1024 * 1024 };
      const estimateFn = jest.fn().mockResolvedValue(mockEstimate);

      Object.defineProperty(navigator, 'storage', {
        value: { estimate: estimateFn },
        configurable: true
      });

      // First call should fetch
      const usage1 = await adapter.getStorageUsage();
      expect(estimateFn).toHaveBeenCalledTimes(1);
      expect(usage1).toEqual({
        used: 1024 * 1024,
        available: 100 * 1024 * 1024
      });

      // Second call should use cache
      const usage2 = await adapter.getStorageUsage();
      expect(estimateFn).toHaveBeenCalledTimes(1); // Still only called once
      expect(usage2).toEqual(usage1);
    });

    it('should allow force refresh of storage usage cache', async () => {
      const mockEstimate = { usage: 1024 * 1024, quota: 100 * 1024 * 1024 };
      const estimateFn = jest.fn().mockResolvedValue(mockEstimate);

      Object.defineProperty(navigator, 'storage', {
        value: { estimate: estimateFn },
        configurable: true
      });

      // First call
      await adapter.getStorageUsage();
      expect(estimateFn).toHaveBeenCalledTimes(1);

      // Force refresh should fetch again
      await adapter.getStorageUsage(true);
      expect(estimateFn).toHaveBeenCalledTimes(2);
    });

    it('should invalidate cache after large setItem operations', async () => {
      const mockEstimate = { usage: 1024 * 1024, quota: 100 * 1024 * 1024 };
      const estimateFn = jest.fn().mockResolvedValue(mockEstimate);

      Object.defineProperty(navigator, 'storage', {
        value: { estimate: estimateFn },
        configurable: true
      });

      // Initialize adapter and get initial usage
      await adapter.getItem('init');
      await adapter.getStorageUsage();
      expect(estimateFn).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      // Large value (>100KB) should invalidate cache
      const largeValue = 'x'.repeat(101 * 1024);
      await adapter.setItem('large', largeValue);

      // Next call should fetch fresh data
      await adapter.getStorageUsage();
      expect(estimateFn).toHaveBeenCalledTimes(1);
    });

    it('should invalidate cache after clear operation', async () => {
      const mockEstimate = { usage: 1024 * 1024, quota: 100 * 1024 * 1024 };
      const estimateFn = jest.fn().mockResolvedValue(mockEstimate);

      Object.defineProperty(navigator, 'storage', {
        value: { estimate: estimateFn },
        configurable: true
      });

      // Initialize adapter and get initial usage
      await adapter.getItem('init');
      await adapter.getStorageUsage();
      expect(estimateFn).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      // Clear should invalidate cache
      await adapter.clear();

      // Next call should fetch fresh data
      await adapter.getStorageUsage();
      expect(estimateFn).toHaveBeenCalledTimes(1);
    });

    it('should not invalidate cache for small setItem operations', async () => {
      const mockEstimate = { usage: 1024 * 1024, quota: 100 * 1024 * 1024 };
      const estimateFn = jest.fn().mockResolvedValue(mockEstimate);

      Object.defineProperty(navigator, 'storage', {
        value: { estimate: estimateFn },
        configurable: true
      });

      // Initialize adapter and get initial usage
      await adapter.getItem('init');
      await adapter.getStorageUsage();
      expect(estimateFn).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      // Small value should not invalidate cache
      await adapter.setItem('small', 'small value');

      // Next call should use cache (no new fetch)
      await adapter.getStorageUsage();
      expect(estimateFn).toHaveBeenCalledTimes(0);
    });
  });

  describe('Error Recovery', () => {
    it('should retry initialization after database error', async () => {
      // First call fails
      (openDB as jest.Mock)
        .mockRejectedValueOnce(new Error('Database busy'))
        .mockResolvedValueOnce(mockDB);

      await expect(adapter.getItem('test')).rejects.toThrow();

      // Second call should succeed
      mockStore.get.mockResolvedValue({ key: 'test', value: 'value' });
      const result = await adapter.getItem('test');

      expect(result).toBe('value');
      expect(openDB).toHaveBeenCalledTimes(2);
    });

    it('should handle database unavailable scenario', async () => {
      // Mock adapter with null database
      const adapter = new IndexedDBKvAdapter();
      (adapter as unknown as { db: null }).db = null;

      // Mock ensureInitialized to keep database null
      jest.spyOn(adapter as unknown as { ensureInitialized: () => Promise<void> }, 'ensureInitialized').mockResolvedValue(undefined);

      await expect(adapter.getItem('test')).rejects.toThrow(StorageError);
      await expect(adapter.getItem('test')).rejects.toMatchObject({
        type: StorageErrorType.ACCESS_DENIED
      });
    });
  });
});