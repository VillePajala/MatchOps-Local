/**
 * Tests for retry utility with exponential backoff.
 *
 * @see src/utils/retry.ts
 */

import { isTransientError, retryWithBackoff, chunkArray, countPushFailures, PushFailures } from '@/utils/retry';

// Mock logger to suppress output during tests
jest.mock('@/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
}));

describe('retry utility', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('isTransientError', () => {
    describe('status code detection', () => {
      it('should return true for HTTP 408 Request Timeout', () => {
        expect(isTransientError({ status: 408 })).toBe(true);
      });

      it('should return true for HTTP 429 Too Many Requests', () => {
        expect(isTransientError({ status: 429 })).toBe(true);
        expect(isTransientError({ statusCode: 429 })).toBe(true);
      });

      it('should return true for HTTP 500 Internal Server Error', () => {
        expect(isTransientError({ status: 500 })).toBe(true);
      });

      it('should return true for HTTP 502 Bad Gateway', () => {
        expect(isTransientError({ status: 502 })).toBe(true);
      });

      it('should return true for HTTP 503 Service Unavailable', () => {
        expect(isTransientError({ status: 503 })).toBe(true);
      });

      it('should return true for HTTP 504 Gateway Timeout', () => {
        expect(isTransientError({ status: 504 })).toBe(true);
      });

      it('should return false for HTTP 400 Bad Request', () => {
        expect(isTransientError({ status: 400 })).toBe(false);
      });

      it('should return false for HTTP 401 Unauthorized', () => {
        expect(isTransientError({ status: 401 })).toBe(false);
      });

      it('should return false for HTTP 404 Not Found', () => {
        expect(isTransientError({ status: 404 })).toBe(false);
      });
    });

    describe('PostgreSQL error code detection', () => {
      it('should return true for PGRST301 (PostgREST connection error)', () => {
        expect(isTransientError({ code: 'PGRST301' })).toBe(true);
      });

      it('should return true for PGRST000 (PostgREST connection error)', () => {
        expect(isTransientError({ code: 'PGRST000' })).toBe(true);
      });

      it('should return false for 40001 (optimistic locking conflict)', () => {
        // Critical: optimistic locking conflicts must NOT be retried
        expect(isTransientError({ code: '40001' })).toBe(false);
        expect(isTransientError({ code: '40001', message: 'serialization_failure' })).toBe(false);
      });
    });

    describe('error message pattern detection', () => {
      it('should return true for AbortError (Supabase auth locks)', () => {
        expect(isTransientError(new Error('AbortError: signal is aborted'))).toBe(true);
        expect(isTransientError(new Error('signal is aborted without reason'))).toBe(true);
      });

      it('should return true for network errors', () => {
        expect(isTransientError(new Error('fetch failed'))).toBe(true);
        expect(isTransientError(new Error('Network error'))).toBe(true);
        expect(isTransientError(new Error('Failed to fetch'))).toBe(true);
        expect(isTransientError(new Error('Load failed'))).toBe(true);
      });

      it('should return true for connection errors', () => {
        expect(isTransientError(new Error('Connection refused'))).toBe(true);
        expect(isTransientError(new Error('Connection reset'))).toBe(true);
        expect(isTransientError(new Error('ECONNREFUSED'))).toBe(true);
        expect(isTransientError(new Error('ETIMEDOUT'))).toBe(true);
        expect(isTransientError(new Error('socket hang up'))).toBe(true);
      });

      it('should return true for timeout errors', () => {
        expect(isTransientError(new Error('Request timeout'))).toBe(true);
        expect(isTransientError(new Error('Operation timed out'))).toBe(true);
      });

      it('should return true for server overload messages', () => {
        expect(isTransientError(new Error('Service unavailable'))).toBe(true);
        expect(isTransientError(new Error('Too many requests'))).toBe(true);
        expect(isTransientError(new Error('Temporarily unavailable'))).toBe(true);
      });

      it('should return false for non-transient errors', () => {
        expect(isTransientError(new Error('Validation failed'))).toBe(false);
        expect(isTransientError(new Error('Invalid input'))).toBe(false);
        expect(isTransientError(new Error('Not found'))).toBe(false);
        expect(isTransientError(new Error('Permission denied'))).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should return false for null', () => {
        expect(isTransientError(null)).toBe(false);
      });

      it('should return false for undefined', () => {
        expect(isTransientError(undefined)).toBe(false);
      });

      it('should handle string errors', () => {
        expect(isTransientError('Network error')).toBe(true);
        expect(isTransientError('Some random error')).toBe(false);
      });

      it('should handle objects with error property', () => {
        expect(isTransientError({ error: 'Connection timed out' })).toBe(true);
      });
    });
  });

  describe('retryWithBackoff', () => {
    it('should return result on first successful attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await retryWithBackoff(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient error and succeed', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      const resultPromise = retryWithBackoff(operation, {
        operationName: 'testOp',
        maxRetries: 3,
        initialDelayMs: 100,
      });

      // Advance through first retry delay
      await jest.advanceTimersByTimeAsync(150);

      const result = await resultPromise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should throw immediately for non-transient errors', async () => {
      const validationError = new Error('Validation failed');
      const operation = jest.fn().mockRejectedValue(validationError);

      await expect(retryWithBackoff(operation, { operationName: 'testOp' }))
        .rejects.toThrow('Validation failed');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw after exhausting all retries', async () => {
      // Use real timers for this test to avoid async race conditions
      jest.useRealTimers();

      const networkError = new Error('Network error');
      const operation = jest.fn().mockRejectedValue(networkError);

      await expect(
        retryWithBackoff(operation, {
          operationName: 'testOp',
          maxRetries: 3,
          initialDelayMs: 10, // Short delay for test speed
        })
      ).rejects.toThrow('Network error');

      expect(operation).toHaveBeenCalledTimes(3); // 3 total attempts

      // Restore fake timers for other tests
      jest.useFakeTimers();
    });

    it('should use exponential backoff', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockResolvedValue('success');

      const resultPromise = retryWithBackoff(operation, {
        operationName: 'testOp',
        maxRetries: 4,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
      });

      // After 500ms, still only 1 attempt (waiting for first delay of 1000ms)
      await jest.advanceTimersByTimeAsync(500);
      expect(operation).toHaveBeenCalledTimes(1);

      // After 1000ms total (first delay), second attempt
      await jest.advanceTimersByTimeAsync(600);
      expect(operation).toHaveBeenCalledTimes(2);

      // After 2000ms more (second delay = 1000 * 2^1), third attempt
      await jest.advanceTimersByTimeAsync(2100);

      const result = await resultPromise;
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should respect maxDelayMs cap', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue('success');

      const resultPromise = retryWithBackoff(operation, {
        operationName: 'testOp',
        maxRetries: 5,
        initialDelayMs: 5000,
        maxDelayMs: 6000, // Cap at 6 seconds
      });

      // Advance through capped delays
      await jest.advanceTimersByTimeAsync(25000);

      const result = await resultPromise;
      expect(result).toBe('success');
    });

    it('should use custom shouldRetry function', async () => {
      const customShouldRetry = jest.fn().mockReturnValue(false);
      const operation = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        retryWithBackoff(operation, {
          operationName: 'testOp',
          shouldRetry: customShouldRetry,
        })
      ).rejects.toThrow('Network error');

      expect(operation).toHaveBeenCalledTimes(1);
      expect(customShouldRetry).toHaveBeenCalledTimes(1);
    });

    it('should check status codes on error objects', async () => {
      // Use real timers for this test
      jest.useRealTimers();

      const rateLimitError = { status: 429, message: 'Rate limit exceeded' };
      const operation = jest.fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue('success');

      const result = await retryWithBackoff(operation, {
        operationName: 'testOp',
        maxRetries: 3,
        initialDelayMs: 10,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);

      jest.useFakeTimers();
    });
  });

  describe('chunkArray', () => {
    it('should split array into chunks of specified size', () => {
      const result = chunkArray([1, 2, 3, 4, 5], 2);
      expect(result).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should handle array smaller than chunk size', () => {
      const result = chunkArray([1, 2], 5);
      expect(result).toEqual([[1, 2]]);
    });

    it('should handle empty array', () => {
      const result = chunkArray([], 3);
      expect(result).toEqual([]);
    });

    it('should handle array exactly divisible by chunk size', () => {
      const result = chunkArray([1, 2, 3, 4, 5, 6], 3);
      expect(result).toEqual([[1, 2, 3], [4, 5, 6]]);
    });

    it('should handle chunk size of 1', () => {
      const result = chunkArray([1, 2, 3], 1);
      expect(result).toEqual([[1], [2], [3]]);
    });

    it('should throw error for chunk size of 0', () => {
      expect(() => chunkArray([1, 2, 3], 0)).toThrow('chunkSize must be positive');
    });

    it('should throw error for negative chunk size', () => {
      expect(() => chunkArray([1, 2, 3], -1)).toThrow('chunkSize must be positive');
    });

    it('should preserve object references', () => {
      const obj1 = { id: 1 };
      const obj2 = { id: 2 };
      const result = chunkArray([obj1, obj2], 1);
      expect(result[0][0]).toBe(obj1);
      expect(result[1][0]).toBe(obj2);
    });
  });

  describe('countPushFailures', () => {
    const emptyFailures: PushFailures = {
      players: [],
      teams: [],
      seasons: [],
      tournaments: [],
      personnel: [],
      games: [],
      rosters: [],
      adjustments: [],
      settings: false,
      warmupPlan: false,
    };

    it('should return 0 for no failures', () => {
      expect(countPushFailures(emptyFailures)).toBe(0);
    });

    it('should count array failures correctly', () => {
      const failures: PushFailures = {
        ...emptyFailures,
        players: ['p1', 'p2'],
        teams: ['t1'],
        games: ['g1', 'g2', 'g3'],
      };
      expect(countPushFailures(failures)).toBe(6);
    });

    it('should count boolean failures correctly', () => {
      const failures: PushFailures = {
        ...emptyFailures,
        settings: true,
        warmupPlan: true,
      };
      expect(countPushFailures(failures)).toBe(2);
    });

    it('should count both array and boolean failures', () => {
      const failures: PushFailures = {
        ...emptyFailures,
        players: ['p1'],
        rosters: ['r1', 'r2'],
        settings: true,
      };
      expect(countPushFailures(failures)).toBe(4);
    });

    it('should count all entity types', () => {
      const failures: PushFailures = {
        players: ['1'],
        teams: ['2'],
        seasons: ['3'],
        tournaments: ['4'],
        personnel: ['5'],
        games: ['6'],
        rosters: ['7'],
        adjustments: ['8'],
        settings: true,
        warmupPlan: true,
      };
      expect(countPushFailures(failures)).toBe(10);
    });
  });
});
