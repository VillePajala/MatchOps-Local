/**
 * Tests for Storage Adapter Interface
 *
 * These tests verify the interface definitions and type safety,
 * not actual implementations (those will be tested separately).
 */

import type { StorageAdapter, StorageAdapterConfig, StorageMode } from './storageAdapter';
import { StorageError, StorageErrorType } from './storageAdapter';

describe('StorageAdapter Interface', () => {
  describe('Type Safety', () => {
    it('should define proper async method signatures', () => {
      // This test verifies TypeScript compilation and interface structure
      const mockAdapter: StorageAdapter = {
        getItem: async (key: string): Promise<string | null> => {
          return key === 'test' ? 'value' : null;
        },
        setItem: async (): Promise<void> => {
          // Mock implementation
        },
        removeItem: async (): Promise<void> => {
          // Mock implementation
        },
        clear: async (): Promise<void> => {
          // Mock implementation
        },
        getBackendName: (): string => {
          return 'mock';
        },
        getKeys: async (): Promise<string[]> => {
          return ['key1', 'key2'];
        }
      };

      // Verify all methods exist and have correct signatures
      expect(typeof mockAdapter.getItem).toBe('function');
      expect(typeof mockAdapter.setItem).toBe('function');
      expect(typeof mockAdapter.removeItem).toBe('function');
      expect(typeof mockAdapter.clear).toBe('function');
      expect(typeof mockAdapter.getBackendName).toBe('function');
      expect(typeof mockAdapter.getKeys).toBe('function');
    });

    it('should support async/await pattern', async () => {
      const mockAdapter: StorageAdapter = {
        getItem: async (key: string) => `value-${key}`,
        setItem: async () => {},
        removeItem: async () => {},
        clear: async () => {},
        getBackendName: () => 'mock',
        getKeys: async () => ['key1', 'key2']
      };

      // Verify async/await works
      const result = await mockAdapter.getItem('test');
      expect(result).toBe('value-test');

      // Verify Promise interface
      const promise = mockAdapter.getItem('test2');
      expect(promise).toBeInstanceOf(Promise);

      const result2 = await promise;
      expect(result2).toBe('value-test2');
    });

    it('should handle null returns from getItem', async () => {
      const mockAdapter: StorageAdapter = {
        getItem: async (key: string) => key === 'exists' ? 'value' : null,
        setItem: async () => {},
        removeItem: async () => {},
        clear: async () => {},
        getBackendName: () => 'mock',
        getKeys: async () => ['exists']
      };

      const existingValue = await mockAdapter.getItem('exists');
      const missingValue = await mockAdapter.getItem('missing');

      expect(existingValue).toBe('value');
      expect(missingValue).toBeNull();
    });

    it('should support getKeys operation', async () => {
      const mockAdapter: StorageAdapter = {
        getItem: async () => 'value',
        setItem: async () => {},
        removeItem: async () => {},
        clear: async () => {},
        getBackendName: () => 'mock',
        getKeys: async () => ['user:123', 'settings', 'cache:data']
      };

      const keys = await mockAdapter.getKeys();
      expect(Array.isArray(keys)).toBe(true);
      expect(keys).toEqual(['user:123', 'settings', 'cache:data']);
    });
  });

  describe('StorageMode Type', () => {
    it('should define valid storage modes', () => {
      const localMode: StorageMode = 'localStorage';
      const idbMode: StorageMode = 'indexedDB';

      expect(localMode).toBe('localStorage');
      expect(idbMode).toBe('indexedDB');

      // TypeScript should prevent invalid values
      // const invalidMode: StorageMode = 'invalid'; // Should cause TS error
    });
  });

  describe('StorageAdapterConfig Type', () => {
    it('should define proper config interface', () => {
      const localConfig: StorageAdapterConfig = {
        mode: 'localStorage'
      };

      const idbConfig: StorageAdapterConfig = {
        mode: 'indexedDB',
        dbName: 'MatchOpsLocal',
        version: 1
      };

      expect(localConfig.mode).toBe('localStorage');
      expect(idbConfig.mode).toBe('indexedDB');
      expect(idbConfig.dbName).toBe('MatchOpsLocal');
      expect(idbConfig.version).toBe(1);
    });

    it('should allow optional properties', () => {
      // Config with only required properties
      const minimalConfig: StorageAdapterConfig = {
        mode: 'localStorage'
      };

      // Config with optional properties
      const fullConfig: StorageAdapterConfig = {
        mode: 'indexedDB',
        dbName: 'TestDB',
        version: 2
      };

      expect(minimalConfig.dbName).toBeUndefined();
      expect(minimalConfig.version).toBeUndefined();
      expect(fullConfig.dbName).toBeDefined();
      expect(fullConfig.version).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should define StorageErrorType enum values', () => {
      expect(StorageErrorType.QUOTA_EXCEEDED).toBe('QUOTA_EXCEEDED');
      expect(StorageErrorType.ACCESS_DENIED).toBe('ACCESS_DENIED');
      expect(StorageErrorType.CORRUPTED_DATA).toBe('CORRUPTED_DATA');
      expect(StorageErrorType.UNKNOWN).toBe('UNKNOWN');
    });

    it('should create StorageError with type and message', () => {
      const error = new StorageError(StorageErrorType.QUOTA_EXCEEDED, 'Storage quota exceeded');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(StorageError);
      expect(error.name).toBe('StorageError');
      expect(error.type).toBe(StorageErrorType.QUOTA_EXCEEDED);
      expect(error.message).toBe('Storage quota exceeded');
      expect(error.cause).toBeUndefined();
    });

    it('should create StorageError with original error cause', () => {
      const originalError = new Error('DOMException: QuotaExceededError');
      const storageError = new StorageError(
        StorageErrorType.QUOTA_EXCEEDED,
        'Failed to save data due to quota limits',
        originalError
      );

      expect(storageError.type).toBe(StorageErrorType.QUOTA_EXCEEDED);
      expect(storageError.message).toBe('Failed to save data due to quota limits');
      expect(storageError.cause).toBe(originalError);
    });
  });

  describe('Interface Contract', () => {
    it('should define expected behavior contracts in JSDoc', () => {
      // This test documents the expected behavior that implementations should follow

      // getItem should return null for non-existent keys
      // setItem should throw StorageError on storage errors
      // removeItem should be idempotent (safe to call multiple times)
      // clear should remove all items
      // getBackendName should return a descriptive string
      // getKeys should return all currently stored keys

      // These contracts will be tested in individual adapter implementations
      expect(true).toBe(true); // Placeholder for interface contract documentation
    });
  });
});