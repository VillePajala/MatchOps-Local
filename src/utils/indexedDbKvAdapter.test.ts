/**
 * Tests for IndexedDB Key-Value Storage Adapter
 *
 * Professional test suite using real IndexedDB operations via fake-indexeddb
 */

// Polyfill structuredClone for Node.js < 17
if (typeof structuredClone === 'undefined') {
  global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj));
}

// Import fake-indexeddb BEFORE any other imports to polyfill IndexedDB
import 'fake-indexeddb/auto';

import { IndexedDBKvAdapter } from './indexedDbKvAdapter';
import { StorageError, StorageErrorType } from './storageAdapter';

// Mock logger to prevent console noise
jest.mock('./logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}));

/**
 * IndexedDBKvAdapter tests using real IndexedDB (fake-indexeddb polyfill)
 * Tests core functionality with actual async operations
 */
describe('IndexedDBKvAdapter', () => {
  let adapter: IndexedDBKvAdapter;

  beforeEach(async () => {
    // Close existing adapter first
    if (adapter) {
      await adapter.close();
    }

    // Create fresh adapter
    adapter = new IndexedDBKvAdapter();

    // Clear all existing data
    await adapter.clear();
  });

  afterEach(async () => {
    // Clean up adapter
    if (adapter) {
      await adapter.close();
    }
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

      // First set an item
      await adapter.setItem('testKey', testValue);

      // Then get it
      const result = await adapter.getItem('testKey');

      expect(result).toBe(testValue);
    });

    it('should return null for non-existent item', async () => {
      const result = await adapter.getItem('nonExistentKey');

      expect(result).toBeNull();
    });

    it('should store item successfully', async () => {
      await adapter.setItem('testKey', 'test value');

      // Verify by reading it back
      const result = await adapter.getItem('testKey');
      expect(result).toBe('test value');
    });

    it('should update existing item', async () => {
      // Set initial value
      await adapter.setItem('testKey', 'initial value');

      // Update value
      await adapter.setItem('testKey', 'updated value');

      // Verify new value
      const result = await adapter.getItem('testKey');
      expect(result).toBe('updated value');
    });

    it('should remove item successfully', async () => {
      // First set an item
      await adapter.setItem('testKey', 'test value');

      // Then remove it
      await adapter.removeItem('testKey');

      // Verify it's gone
      const result = await adapter.getItem('testKey');
      expect(result).toBeNull();
    });

    it('should handle removing non-existent item', async () => {
      // Should not throw error
      await expect(adapter.removeItem('nonExistentKey')).resolves.not.toThrow();
    });

    it('should clear all items', async () => {
      // Set multiple items
      await adapter.setItem('key1', 'value1');
      await adapter.setItem('key2', 'value2');
      await adapter.setItem('key3', 'value3');

      // Clear all
      await adapter.clear();

      // Verify all are gone
      const result1 = await adapter.getItem('key1');
      const result2 = await adapter.getItem('key2');
      const result3 = await adapter.getItem('key3');
      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(result3).toBeNull();
    });

    it('should get all keys', async () => {
      // Set multiple items
      await adapter.setItem('key1', 'value1');
      await adapter.setItem('key2', 'value2');
      await adapter.setItem('key3', 'value3');

      const result = await adapter.getKeys();

      expect(result).toContain('key1');
      expect(result).toContain('key2');
      expect(result).toContain('key3');
      expect(result.length).toBe(3);
    });

    it('should return empty array when no keys exist', async () => {
      const result = await adapter.getKeys();
      expect(result).toEqual([]);
    });
  });

  describe('Data Type Handling', () => {
    it('should handle string values', async () => {
      const testValue = 'test string';
      await adapter.setItem('stringKey', testValue);
      const result = await adapter.getItem('stringKey');
      expect(result).toBe(testValue);
    });

    it('should handle numeric values', async () => {
      const testValue = '42';
      await adapter.setItem('numberKey', testValue);
      const result = await adapter.getItem('numberKey');
      expect(result).toBe(testValue);
    });

    it('should handle empty string values', async () => {
      await adapter.setItem('emptyKey', '');
      const result = await adapter.getItem('emptyKey');
      expect(result).toBe('');
    });

    it('should handle long string values', async () => {
      const longValue = 'x'.repeat(10000);
      await adapter.setItem('longKey', longValue);
      const result = await adapter.getItem('longKey');
      expect(result).toBe(longValue);
    });

    it('should handle special characters in keys', async () => {
      const specialKey = 'key-with_special.chars:123';
      const specialValue = 'special value';
      await adapter.setItem(specialKey, specialValue);
      const result = await adapter.getItem(specialKey);
      expect(result).toBe(specialValue);
    });

    it('should handle unicode values', async () => {
      const unicodeValue = '测试 тест テスト 🎉';
      await adapter.setItem('unicodeKey', unicodeValue);
      const result = await adapter.getItem('unicodeKey');
      expect(result).toBe(unicodeValue);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple concurrent writes', async () => {
      const operations = [];
      for (let i = 0; i < 10; i++) {
        operations.push(adapter.setItem(`key${i}`, `value${i}`));
      }

      await Promise.all(operations);

      // Verify all were written
      const keys = await adapter.getKeys();
      expect(keys.length).toBe(10);
    });

    it('should handle concurrent reads and writes', async () => {
      // Setup initial data
      await adapter.setItem('key1', 'value1');
      await adapter.setItem('key2', 'value2');

      // Concurrent operations
      const operations = [
        adapter.getItem('key1'),
        adapter.setItem('key3', 'value3'),
        adapter.getItem('key2'),
        adapter.removeItem('key1'),
        adapter.getItem('key3')
      ];

      await Promise.all(operations);

      // Verify final state
      const key1 = await adapter.getItem('key1');
      const key2 = await adapter.getItem('key2');
      const key3 = await adapter.getItem('key3');

      expect(key1).toBeNull(); // Was removed
      expect(key2).toBe('value2'); // Unchanged
      expect(key3).toBe('value3'); // Was added
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid successive operations on same key', async () => {
      await adapter.setItem('key', 'value1');
      await adapter.setItem('key', 'value2');
      await adapter.setItem('key', 'value3');

      const result = await adapter.getItem('key');
      expect(result).toBe('value3');
    });

    it('should handle clear after some items removed', async () => {
      await adapter.setItem('key1', 'value1');
      await adapter.setItem('key2', 'value2');
      await adapter.setItem('key3', 'value3');

      await adapter.removeItem('key2');
      await adapter.clear();

      const keys = await adapter.getKeys();
      expect(keys).toEqual([]);
    });

    it('should handle operations after clear', async () => {
      await adapter.setItem('key1', 'value1');
      await adapter.clear();
      await adapter.setItem('key2', 'value2');

      const result = await adapter.getItem('key2');
      expect(result).toBe('value2');

      const keys = await adapter.getKeys();
      expect(keys).toEqual(['key2']);
    });
  });

  describe('Database Lifecycle', () => {
    it('should close database connection properly', async () => {
      // Trigger initialization by calling a method
      await adapter.setItem('test', 'value');

      // Close should work
      await expect(adapter.close()).resolves.not.toThrow();
    });

    it('should reinitialize after close', async () => {
      // Initialize first
      await adapter.setItem('test1', 'value1');

      // Close the adapter
      await adapter.close();

      // Should be able to use again (reinitializes automatically)
      await adapter.setItem('test2', 'value2');

      const result = await adapter.getItem('test2');
      expect(result).toBe('value2');
    });

    it('should handle multiple close calls', async () => {
      await adapter.setItem('test', 'value');
      await adapter.close();

      // Second close should not throw
      await expect(adapter.close()).resolves.not.toThrow();
    });
  });

  describe('Storage Integration', () => {
    it('should persist data across adapter instances', async () => {
      const dbName = 'PersistenceTestDB';

      // Create first adapter and store data
      const adapter1 = new IndexedDBKvAdapter({ mode: 'indexedDB', dbName });
      await adapter1.setItem('persistKey', 'persistValue');
      await adapter1.close();

      // Create second adapter with same DB name
      const adapter2 = new IndexedDBKvAdapter({ mode: 'indexedDB', dbName });
      const result = await adapter2.getItem('persistKey');

      expect(result).toBe('persistValue');

      await adapter2.close();

      // Cleanup
      indexedDB.deleteDatabase(dbName);
    });

    it('should isolate data between different database names', async () => {
      const adapter1 = new IndexedDBKvAdapter({ mode: 'indexedDB', dbName: 'DB1' });
      const adapter2 = new IndexedDBKvAdapter({ mode: 'indexedDB', dbName: 'DB2' });

      await adapter1.setItem('key', 'value1');
      await adapter2.setItem('key', 'value2');

      const result1 = await adapter1.getItem('key');
      const result2 = await adapter2.getItem('key');

      expect(result1).toBe('value1');
      expect(result2).toBe('value2');

      await adapter1.close();
      await adapter2.close();

      // Cleanup
      indexedDB.deleteDatabase('DB1');
      indexedDB.deleteDatabase('DB2');
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle large number of items efficiently', async () => {
      const itemCount = 100;
      const startTime = Date.now();

      // Write items
      for (let i = 0; i < itemCount; i++) {
        await adapter.setItem(`key${i}`, `value${i}`);
      }

      // Read items
      for (let i = 0; i < itemCount; i++) {
        await adapter.getItem(`key${i}`);
      }

      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 5 seconds for 100 items)
      expect(duration).toBeLessThan(5000);

      // Verify all items exist
      const keys = await adapter.getKeys();
      expect(keys.length).toBe(itemCount);
    }, 10000); // 10 second timeout for performance test
  });
});