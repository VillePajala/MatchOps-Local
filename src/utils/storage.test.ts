/**
 * Tests for storage.ts - IndexedDB storage layer
 * @critical - Core data persistence layer
 *
 * Note: Functions that interact with IndexedDB are tested via integration tests
 * and the existing storage adapter tests. This file focuses on type guards
 * and utility functions that don't require complex async mocking.
 */

// Import fake-indexeddb BEFORE any other imports to polyfill IndexedDB
import 'fake-indexeddb/auto';

import {
  typeGuards,
  isIndexedDBAvailable,
  getIndexedDBErrorMessage,
  clearAdapterCache,
  getStorageMemoryStats,
} from './storage';

// Mock the logger
jest.mock('./logger', () => {
  const mockLogger = {
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockLogger,
    createLogger: jest.fn(() => mockLogger),
  };
});

describe('storage utilities', () => {

  // ============================================
  // typeGuards
  // ============================================
  describe('typeGuards', () => {
    describe('isString', () => {
      it('should return true for strings', () => {
        expect(typeGuards.isString('hello')).toBe(true);
        expect(typeGuards.isString('')).toBe(true);
        expect(typeGuards.isString('  ')).toBe(true);
      });

      it('should return false for non-strings', () => {
        expect(typeGuards.isString(123)).toBe(false);
        expect(typeGuards.isString(null)).toBe(false);
        expect(typeGuards.isString(undefined)).toBe(false);
        expect(typeGuards.isString({})).toBe(false);
        expect(typeGuards.isString([])).toBe(false);
      });
    });

    describe('isNumber', () => {
      it('should return true for valid numbers', () => {
        expect(typeGuards.isNumber(42)).toBe(true);
        expect(typeGuards.isNumber(0)).toBe(true);
        expect(typeGuards.isNumber(-1)).toBe(true);
        expect(typeGuards.isNumber(3.14)).toBe(true);
        expect(typeGuards.isNumber(Infinity)).toBe(true);
        expect(typeGuards.isNumber(-Infinity)).toBe(true);
      });

      it('should return false for NaN', () => {
        expect(typeGuards.isNumber(NaN)).toBe(false);
      });

      it('should return false for non-numbers', () => {
        expect(typeGuards.isNumber('42')).toBe(false);
        expect(typeGuards.isNumber(null)).toBe(false);
        expect(typeGuards.isNumber(undefined)).toBe(false);
      });
    });

    describe('isBoolean', () => {
      it('should return true for booleans', () => {
        expect(typeGuards.isBoolean(true)).toBe(true);
        expect(typeGuards.isBoolean(false)).toBe(true);
      });

      it('should return false for non-booleans', () => {
        expect(typeGuards.isBoolean(1)).toBe(false);
        expect(typeGuards.isBoolean(0)).toBe(false);
        expect(typeGuards.isBoolean('true')).toBe(false);
        expect(typeGuards.isBoolean('false')).toBe(false);
        expect(typeGuards.isBoolean(null)).toBe(false);
      });
    });

    describe('isArray', () => {
      it('should return true for arrays', () => {
        expect(typeGuards.isArray([])).toBe(true);
        expect(typeGuards.isArray([1, 2, 3])).toBe(true);
        expect(typeGuards.isArray(['a', 'b'])).toBe(true);
        expect(typeGuards.isArray(new Array(5))).toBe(true);
      });

      it('should return false for non-arrays', () => {
        expect(typeGuards.isArray({})).toBe(false);
        expect(typeGuards.isArray('array')).toBe(false);
        expect(typeGuards.isArray(null)).toBe(false);
        expect(typeGuards.isArray(undefined)).toBe(false);
        // Array-like objects are not arrays
        expect(typeGuards.isArray({ length: 0 })).toBe(false);
      });
    });

    describe('isObject', () => {
      it('should return true for plain objects', () => {
        expect(typeGuards.isObject({})).toBe(true);
        expect(typeGuards.isObject({ key: 'value' })).toBe(true);
        expect(typeGuards.isObject({ nested: { deep: true } })).toBe(true);
      });

      it('should return false for arrays', () => {
        expect(typeGuards.isObject([])).toBe(false);
        expect(typeGuards.isObject([1, 2, 3])).toBe(false);
      });

      it('should return false for null', () => {
        expect(typeGuards.isObject(null)).toBe(false);
      });

      it('should return false for primitives', () => {
        expect(typeGuards.isObject('string')).toBe(false);
        expect(typeGuards.isObject(42)).toBe(false);
        expect(typeGuards.isObject(true)).toBe(false);
        expect(typeGuards.isObject(undefined)).toBe(false);
      });
    });

    describe('isPlayer', () => {
      it('should return true for valid player objects', () => {
        const player = { id: '1', name: 'John Doe', jerseyNumber: '10' };
        expect(typeGuards.isPlayer(player)).toBe(true);
      });

      it('should return true for player with extra properties', () => {
        const player = {
          id: '1',
          name: 'John Doe',
          jerseyNumber: '10',
          position: 'forward',
          teamId: 'team-1'
        };
        expect(typeGuards.isPlayer(player)).toBe(true);
      });

      it('should return false for missing id', () => {
        const player = { name: 'John Doe', jerseyNumber: '10' };
        expect(typeGuards.isPlayer(player)).toBe(false);
      });

      it('should return false for missing name', () => {
        const player = { id: '1', jerseyNumber: '10' };
        expect(typeGuards.isPlayer(player)).toBe(false);
      });

      it('should return false for missing jerseyNumber', () => {
        const player = { id: '1', name: 'John Doe' };
        expect(typeGuards.isPlayer(player)).toBe(false);
      });

      it('should return false for non-string id', () => {
        const player = { id: 1, name: 'John Doe', jerseyNumber: '10' };
        expect(typeGuards.isPlayer(player)).toBe(false);
      });

      it('should return false for non-string name', () => {
        const player = { id: '1', name: null, jerseyNumber: '10' };
        expect(typeGuards.isPlayer(player)).toBe(false);
      });

      it('should return false for non-string jerseyNumber', () => {
        const player = { id: '1', name: 'John Doe', jerseyNumber: 10 };
        expect(typeGuards.isPlayer(player)).toBe(false);
      });

      it('should return false for null', () => {
        expect(typeGuards.isPlayer(null)).toBe(false);
      });

      it('should return false for arrays', () => {
        expect(typeGuards.isPlayer([])).toBe(false);
      });
    });

    describe('isGameSession', () => {
      it('should return true for valid game session objects', () => {
        const session = {
          id: '1',
          teamName: 'Team A',
          periods: 2,
          periodDuration: 20
        };
        expect(typeGuards.isGameSession(session)).toBe(true);
      });

      it('should return true for session with extra properties', () => {
        const session = {
          id: '1',
          teamName: 'Team A',
          periods: 2,
          periodDuration: 20,
          score: 5,
          opponent: 'Team B'
        };
        expect(typeGuards.isGameSession(session)).toBe(true);
      });

      it('should return false for missing id', () => {
        const session = { teamName: 'Team A', periods: 2, periodDuration: 20 };
        expect(typeGuards.isGameSession(session)).toBe(false);
      });

      it('should return false for missing teamName', () => {
        const session = { id: '1', periods: 2, periodDuration: 20 };
        expect(typeGuards.isGameSession(session)).toBe(false);
      });

      it('should return false for missing periods', () => {
        const session = { id: '1', teamName: 'Team A', periodDuration: 20 };
        expect(typeGuards.isGameSession(session)).toBe(false);
      });

      it('should return false for missing periodDuration', () => {
        const session = { id: '1', teamName: 'Team A', periods: 2 };
        expect(typeGuards.isGameSession(session)).toBe(false);
      });

      it('should return false for non-number periods', () => {
        const session = { id: '1', teamName: 'Team A', periods: '2', periodDuration: 20 };
        expect(typeGuards.isGameSession(session)).toBe(false);
      });

      it('should return false for non-number periodDuration', () => {
        const session = { id: '1', teamName: 'Team A', periods: 2, periodDuration: '20' };
        expect(typeGuards.isGameSession(session)).toBe(false);
      });

      it('should return false for NaN periods', () => {
        const session = { id: '1', teamName: 'Team A', periods: NaN, periodDuration: 20 };
        expect(typeGuards.isGameSession(session)).toBe(false);
      });

      it('should return false for null', () => {
        expect(typeGuards.isGameSession(null)).toBe(false);
      });
    });
  });

  // ============================================
  // isIndexedDBAvailable
  // ============================================
  describe('isIndexedDBAvailable', () => {
    /**
     * Tests IndexedDB availability check
     * @critical - Storage layer depends on this check
     */
    it('should return true when indexedDB is available', () => {
      // With fake-indexeddb polyfill, indexedDB is available
      expect(isIndexedDBAvailable()).toBe(true);
    });

    /**
     * Tests that function handles various environments
     * @integration - Environment detection
     */
    it('should be a function that returns a boolean', () => {
      const result = isIndexedDBAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  // ============================================
  // getIndexedDBErrorMessage
  // ============================================
  describe('getIndexedDBErrorMessage', () => {
    /**
     * Tests error message generation
     * @integration - User-facing error messages
     */
    it('should return a non-empty string message', () => {
      const message = getIndexedDBErrorMessage();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    });

    /**
     * Tests message content
     * @integration - User-facing error messages
     */
    it('should mention storage or browser compatibility', () => {
      const message = getIndexedDBErrorMessage();
      // The message should be helpful and mention storage or browser
      expect(
        message.toLowerCase().includes('storage') ||
        message.toLowerCase().includes('browser') ||
        message.toLowerCase().includes('indexeddb') ||
        message.toLowerCase().includes('mode')
      ).toBe(true);
    });
  });

  // ============================================
  // clearAdapterCache
  // ============================================
  describe('clearAdapterCache', () => {
    it('should clear the adapter cache without throwing', () => {
      expect(() => clearAdapterCache()).not.toThrow();
    });
  });

  // ============================================
  // getStorageMemoryStats
  // ============================================
  describe('getStorageMemoryStats', () => {
    it('should return memory stats object', async () => {
      const stats = await getStorageMemoryStats();

      expect(stats).toHaveProperty('adapterAge');
      expect(stats).toHaveProperty('retryCount');
      expect(stats).toHaveProperty('hasAdapter');
      expect(stats).toHaveProperty('mutexStatus');

      expect(typeof stats.retryCount).toBe('number');
      expect(typeof stats.hasAdapter).toBe('boolean');
      expect(typeof stats.mutexStatus).toBe('string');
    });

    it('should return null adapterAge when no adapter exists', async () => {
      clearAdapterCache(); // Ensure no adapter
      const stats = await getStorageMemoryStats();

      expect(stats.adapterAge).toBeNull();
      expect(stats.hasAdapter).toBe(false);
    });
  });
});
