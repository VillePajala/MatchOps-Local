/**
 * Tests for LocalStorage Adapter Implementation
 *
 * Comprehensive test suite covering error scenarios, edge cases, and performance
 * requirements as specified in the implementation strategy.
 */

import { LocalStorageAdapter } from './localStorageAdapter';
import { StorageError, StorageErrorType } from './storageAdapter';
import { createLogger } from './logger';

// Mock the localStorage utilities
jest.mock('./localStorage', () => ({
  getStorage: jest.fn(),
  getLocalStorageItem: jest.fn(),
  setLocalStorageItem: jest.fn(),
  removeLocalStorageItem: jest.fn(),
  clearLocalStorage: jest.fn()
}));

// Mock the logger
jest.mock('./logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  }))
}));

import {
  getStorage,
  getLocalStorageItem,
  setLocalStorageItem,
  removeLocalStorageItem,
  clearLocalStorage
} from './localStorage';

const mockGetStorage = getStorage as jest.MockedFunction<typeof getStorage>;
const mockGetItem = getLocalStorageItem as jest.MockedFunction<typeof getLocalStorageItem>;
const mockSetItem = setLocalStorageItem as jest.MockedFunction<typeof setLocalStorageItem>;
const mockRemoveItem = removeLocalStorageItem as jest.MockedFunction<typeof removeLocalStorageItem>;
const mockClear = clearLocalStorage as jest.MockedFunction<typeof clearLocalStorage>;

describe('LocalStorageAdapter', () => {
  let adapter: LocalStorageAdapter;
  let mockLogger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    adapter = new LocalStorageAdapter();
    // Get reference to the mock logger for testing formatted sizes
    mockLogger = (adapter as unknown as { logger: ReturnType<typeof createLogger> }).logger;
    jest.clearAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should implement StorageAdapter interface correctly', () => {
      expect(adapter.getItem).toBeDefined();
      expect(adapter.setItem).toBeDefined();
      expect(adapter.removeItem).toBeDefined();
      expect(adapter.clear).toBeDefined();
      expect(adapter.getBackendName).toBeDefined();
      expect(adapter.getKeys).toBeDefined();
    });

    it('should return correct backend name', () => {
      expect(adapter.getBackendName()).toBe('localStorage');
    });

    it('should get items successfully', async () => {
      mockGetItem.mockReturnValue('test-value');

      const result = await adapter.getItem('test-key');

      expect(result).toBe('test-value');
      expect(mockGetItem).toHaveBeenCalledWith('test-key');
    });

    it('should return null for non-existent items', async () => {
      mockGetItem.mockReturnValue(null);

      const result = await adapter.getItem('non-existent');

      expect(result).toBeNull();
    });

    it('should set items successfully', async () => {
      mockSetItem.mockImplementation(() => {});

      await adapter.setItem('test-key', 'test-value');

      expect(mockSetItem).toHaveBeenCalledWith('test-key', 'test-value');
    });

    it('should remove items successfully', async () => {
      mockRemoveItem.mockImplementation(() => {});

      await adapter.removeItem('test-key');

      expect(mockRemoveItem).toHaveBeenCalledWith('test-key');
    });

    it('should clear storage successfully', async () => {
      mockClear.mockImplementation(() => {});

      await adapter.clear();

      expect(mockClear).toHaveBeenCalled();
    });
  });

  describe('Error Handling - Critical Scenarios', () => {
    describe('Quota Exceeded Errors', () => {
      it('should handle DOMException quota exceeded errors', async () => {
        const quotaError = new DOMException('Storage quota exceeded', 'QuotaExceededError');
        mockSetItem.mockImplementation(() => {
          throw quotaError;
        });

        await expect(adapter.setItem('key', 'value')).rejects.toThrow(StorageError);

        try {
          await adapter.setItem('key', 'value');
        } catch (error) {
          expect(error).toBeInstanceOf(StorageError);
          expect((error as StorageError).type).toBe(StorageErrorType.QUOTA_EXCEEDED);
          expect((error as StorageError).message).toBe('localStorage quota exceeded (key: key, size: 5B)');
          expect((error as StorageError).cause).toBe(quotaError);
        }
      });

      it('should handle legacy quota exceeded errors with code 22', async () => {
        const quotaError = new DOMException('Storage quota exceeded');
        Object.defineProperty(quotaError, 'code', { value: 22 });
        mockSetItem.mockImplementation(() => {
          throw quotaError;
        });

        await expect(adapter.setItem('key', 'value')).rejects.toThrow(StorageError);

        try {
          await adapter.setItem('key', 'value');
        } catch (error) {
          expect((error as StorageError).type).toBe(StorageErrorType.QUOTA_EXCEEDED);
        }
      });

      it('should handle string quota exceeded errors', async () => {
        mockSetItem.mockImplementation(() => {
          throw 'localStorage quota exceeded';
        });

        await expect(adapter.setItem('key', 'value')).rejects.toThrow(StorageError);

        try {
          await adapter.setItem('key', 'value');
        } catch (error) {
          expect((error as StorageError).type).toBe(StorageErrorType.QUOTA_EXCEEDED);
        }
      });

      it('should handle Error objects with quota-related messages', async () => {
        const quotaError = new Error('Storage is full and quota has been exceeded');
        mockSetItem.mockImplementation(() => {
          throw quotaError;
        });

        await expect(adapter.setItem('key', 'value')).rejects.toThrow(StorageError);

        try {
          await adapter.setItem('key', 'value');
        } catch (error) {
          expect((error as StorageError).type).toBe(StorageErrorType.QUOTA_EXCEEDED);
        }
      });
    });

    describe('Access Denied Errors', () => {
      it('should handle localStorage access denied in getItem', async () => {
        const accessError = new Error('localStorage is disabled');
        mockGetItem.mockImplementation(() => {
          throw accessError;
        });

        await expect(adapter.getItem('key')).rejects.toThrow(StorageError);

        try {
          await adapter.getItem('key');
        } catch (error) {
          expect((error as StorageError).type).toBe(StorageErrorType.ACCESS_DENIED);
          expect((error as StorageError).message).toContain('Failed to get localStorage item: key');
        }
      });

      it('should handle localStorage access denied in setItem (non-quota)', async () => {
        const accessError = new Error('localStorage is disabled');
        mockSetItem.mockImplementation(() => {
          throw accessError;
        });

        await expect(adapter.setItem('key', 'value')).rejects.toThrow(StorageError);

        try {
          await adapter.setItem('key', 'value');
        } catch (error) {
          expect((error as StorageError).type).toBe(StorageErrorType.ACCESS_DENIED);
        }
      });

      it('should handle localStorage not available in getKeys', async () => {
        mockGetStorage.mockReturnValue(null);

        await expect(adapter.getKeys()).rejects.toThrow(StorageError);

        try {
          await adapter.getKeys();
        } catch (error) {
          expect((error as StorageError).type).toBe(StorageErrorType.ACCESS_DENIED);
          expect((error as StorageError).message).toBe('localStorage not available (getKeys operation failed)');
        }
      });
    });

    describe('Data Corruption Scenarios', () => {
      it('should handle unexpected errors gracefully', async () => {
        mockGetItem.mockImplementation(() => {
          throw new TypeError('Unexpected error');
        });

        await expect(adapter.getItem('key')).rejects.toThrow(StorageError);

        try {
          await adapter.getItem('key');
        } catch (error) {
          expect((error as StorageError).type).toBe(StorageErrorType.ACCESS_DENIED);
          expect((error as StorageError).cause).toBeInstanceOf(TypeError);
        }
      });

      it('should handle null/undefined errors', async () => {
        mockSetItem.mockImplementation(() => {
          throw null;
        });

        await expect(adapter.setItem('key', 'value')).rejects.toThrow(StorageError);
      });
    });
  });

  describe('Edge Cases', () => {
    describe('Special Characters and Values', () => {
      const testCases = [
        { name: 'empty string', value: '' },
        { name: 'null byte', value: '\0' },
        { name: 'unicode emoji', value: '🎉' },
        { name: 'newlines and tabs', value: '\n\t' },
        { name: 'string "null"', value: 'null' },
        { name: 'string "undefined"', value: 'undefined' },
        { name: 'JSON string', value: '{"test": "value"}' },
        { name: 'very long string', value: 'x'.repeat(10000) }
      ];

      testCases.forEach(({ name, value }) => {
        it(`should handle ${name}`, async () => {
          mockSetItem.mockImplementation(() => {});
          mockGetItem.mockReturnValue(value);

          await adapter.setItem('test', value);
          const result = await adapter.getItem('test');

          expect(mockSetItem).toHaveBeenCalledWith('test', value);
          expect(result).toBe(value);
        });
      });
    });

    describe('Large Values', () => {
      it('should handle 1KB values efficiently', async () => {
        const largeValue = 'x'.repeat(1024); // 1KB
        mockSetItem.mockImplementation(() => {});
        mockGetItem.mockReturnValue(largeValue);

        const start = performance.now();
        await adapter.setItem('large-key', largeValue);
        const result = await adapter.getItem('large-key');
        const end = performance.now();

        expect(result).toBe(largeValue);
        expect(end - start).toBeLessThan(10); // Should be very fast for 1KB
      });

      it('should handle 100KB values', async () => {
        const veryLargeValue = 'x'.repeat(100 * 1024); // 100KB
        mockSetItem.mockImplementation(() => {});
        mockGetItem.mockReturnValue(veryLargeValue);

        const start = performance.now();
        await adapter.setItem('very-large-key', veryLargeValue);
        const result = await adapter.getItem('very-large-key');
        const end = performance.now();

        expect(result).toBe(veryLargeValue);
        expect(end - start).toBeLessThan(100); // Should complete within 100ms
      });
    });
  });

  describe('getKeys() Implementation', () => {
    it('should return all localStorage keys', async () => {
      const mockStorage: Partial<Storage> = {
        length: 3,
        key: jest.fn()
          .mockReturnValueOnce('key1')
          .mockReturnValueOnce('key2')
          .mockReturnValueOnce('key3'),
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn()
      };
      mockGetStorage.mockReturnValue(mockStorage as Storage);

      const keys = await adapter.getKeys();

      expect(keys).toEqual(['key1', 'key2', 'key3']);
      expect(mockStorage.key).toHaveBeenCalledTimes(3);
    });

    it('should handle empty storage', async () => {
      const mockStorage: Partial<Storage> = {
        length: 0,
        key: jest.fn(),
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn()
      };
      mockGetStorage.mockReturnValue(mockStorage as Storage);

      const keys = await adapter.getKeys();

      expect(keys).toEqual([]);
      expect(mockStorage.key).not.toHaveBeenCalled();
    });

    it('should filter out null keys', async () => {
      const mockStorage: Partial<Storage> = {
        length: 3,
        key: jest.fn()
          .mockReturnValueOnce('key1')
          .mockReturnValueOnce(null)
          .mockReturnValueOnce('key3'),
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn()
      };
      mockGetStorage.mockReturnValue(mockStorage as Storage);

      const keys = await adapter.getKeys();

      expect(keys).toEqual(['key1', 'key3']);
    });

    it('should perform efficiently with many keys', async () => {
      const keyCount = 1000;
      const mockStorage: Partial<Storage> = {
        length: keyCount,
        key: jest.fn().mockImplementation((index: number) => `key${index}`),
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn()
      };
      mockGetStorage.mockReturnValue(mockStorage as Storage);

      const start = performance.now();
      const keys = await adapter.getKeys();
      const end = performance.now();

      expect(keys.length).toBe(keyCount);
      expect(end - start).toBeLessThan(50); // Should complete within 50ms
    });

    it('should handle getStorage throwing errors', async () => {
      mockGetStorage.mockImplementation(() => {
        throw new Error('Storage access failed');
      });

      await expect(adapter.getKeys()).rejects.toThrow(StorageError);

      try {
        await adapter.getKeys();
      } catch (error) {
        expect((error as StorageError).type).toBe(StorageErrorType.ACCESS_DENIED);
      }
    });
  });

  describe('Performance Requirements', () => {
    it('should meet timing requirements for small operations', async () => {
      mockSetItem.mockImplementation(() => {});
      mockGetItem.mockReturnValue('test-value');

      // Small values (< 1KB): expect < 1ms per operation
      const smallValue = 'x'.repeat(500);

      const start = performance.now();
      await adapter.setItem('perf-test', smallValue);
      await adapter.getItem('perf-test');
      const end = performance.now();

      expect(end - start).toBeLessThan(5); // Allow some overhead for mocking
    });

    it('should handle concurrent-like operations', async () => {
      mockSetItem.mockImplementation(() => {});
      mockGetItem.mockReturnValue('test-value');
      mockRemoveItem.mockImplementation(() => {});

      // Simulate rapid operations
      const operations = [
        adapter.setItem('key1', 'value1'),
        adapter.setItem('key2', 'value2'),
        adapter.getItem('key1'),
        adapter.removeItem('key2'),
        adapter.getItem('key3')
      ];

      // Should handle multiple operations without errors
      await expect(Promise.all(operations)).resolves.toBeDefined();
    });
  });

  describe('Size Formatting', () => {
    it('should format small values in bytes', async () => {
      const smallValue = 'x'.repeat(512); // 512 bytes
      mockSetItem.mockImplementation(() => {});

      await adapter.setItem('small', smallValue);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Setting item in localStorage',
        expect.objectContaining({
          key: 'small',
          valueSize: '512B'
        })
      );
    });

    it('should format medium values in KB', async () => {
      const mediumValue = 'x'.repeat(10 * 1024); // 10KB
      mockSetItem.mockImplementation(() => {});

      await adapter.setItem('medium', mediumValue);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Setting item in localStorage',
        expect.objectContaining({
          key: 'medium',
          valueSize: '10.0KB'
        })
      );
    });

    it('should format large values in MB', async () => {
      const largeValue = 'x'.repeat(2.5 * 1024 * 1024); // 2.5MB
      mockSetItem.mockImplementation(() => {});

      await adapter.setItem('large', largeValue);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Setting item in localStorage',
        expect.objectContaining({
          key: 'large',
          valueSize: '2.5MB'
        })
      );
    });

    it('should format quota error sizes correctly', async () => {
      const largeValue = 'x'.repeat(100 * 1024); // 100KB
      const quotaError = new DOMException('Storage quota exceeded', 'QuotaExceededError');
      mockSetItem.mockImplementation(() => {
        throw quotaError;
      });

      try {
        await adapter.setItem('quota-test', largeValue);
      } catch {
        // Expected to throw
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        'localStorage quota exceeded',
        expect.objectContaining({
          key: 'quota-test',
          valueSize: '100.0KB',
          error: quotaError
        })
      );
    });

    it('should handle edge cases in size formatting', async () => {
      // Test empty string (0 bytes)
      const emptyValue = '';
      mockSetItem.mockImplementation(() => {});

      await adapter.setItem('empty', emptyValue);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Setting item in localStorage',
        expect.objectContaining({
          key: 'empty',
          valueSize: '0B'
        })
      );
    });
  });

  describe('Integration with Existing Utilities', () => {
    it('should use existing localStorage utilities correctly', async () => {
      mockGetItem.mockReturnValue('existing-value');
      mockSetItem.mockImplementation(() => {});
      mockRemoveItem.mockImplementation(() => {});
      mockClear.mockImplementation(() => {});

      // Test that we're calling the existing utilities, not reinventing
      await adapter.getItem('test');
      await adapter.setItem('test', 'value');
      await adapter.removeItem('test');
      await adapter.clear();

      expect(mockGetItem).toHaveBeenCalledWith('test');
      expect(mockSetItem).toHaveBeenCalledWith('test', 'value');
      expect(mockRemoveItem).toHaveBeenCalledWith('test');
      expect(mockClear).toHaveBeenCalled();
    });
  });
});