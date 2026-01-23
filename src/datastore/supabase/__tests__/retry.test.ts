/**
 * Tests for retry utility with exponential backoff.
 */

import { withRetry, isTransientError, wrapWithRetry, throwIfTransient, TransientSupabaseError } from '../retry';

// Mock logger to suppress output during tests
jest.mock('@/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
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
    it('should return true for network errors', () => {
      expect(isTransientError(new Error('fetch failed'))).toBe(true);
      expect(isTransientError(new Error('Network error'))).toBe(true);
      expect(isTransientError(new Error('Failed to fetch'))).toBe(true);
      expect(isTransientError(new Error('Connection refused'))).toBe(true);
      expect(isTransientError(new Error('ETIMEDOUT'))).toBe(true);
    });

    it('should return true for server overload errors', () => {
      expect(isTransientError({ status: 503 })).toBe(true);
      expect(isTransientError({ status: 429 })).toBe(true);
      expect(isTransientError({ statusCode: 502 })).toBe(true);
      expect(isTransientError(new Error('Service unavailable'))).toBe(true);
      expect(isTransientError(new Error('Too many requests'))).toBe(true);
    });

    it('should return true for timeout errors', () => {
      expect(isTransientError(new Error('Request timeout'))).toBe(true);
      expect(isTransientError(new Error('Operation timed out'))).toBe(true);
    });

    it('should return true for PostgreSQL connection errors', () => {
      expect(isTransientError({ code: 'PGRST301' })).toBe(true);
      expect(isTransientError({ code: 'PGRST000' })).toBe(true);
    });

    it('should return false for non-transient errors', () => {
      expect(isTransientError(new Error('Validation failed'))).toBe(false);
      expect(isTransientError({ status: 400 })).toBe(false);
      expect(isTransientError({ status: 401 })).toBe(false);
      expect(isTransientError({ status: 404 })).toBe(false);
      expect(isTransientError(new Error('Not found'))).toBe(false);
      expect(isTransientError(new Error('Invalid input'))).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isTransientError(null)).toBe(false);
      expect(isTransientError(undefined)).toBe(false);
    });
  });

  describe('withRetry', () => {
    it('should return result on first successful attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await withRetry(operation, { logRetries: false });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient error and succeed', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      const resultPromise = withRetry(operation, {
        maxRetries: 3,
        baseDelayMs: 100,
        logRetries: false
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

      await expect(withRetry(operation, { logRetries: false }))
        .rejects.toThrow('Validation failed');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw after exhausting all retries', async () => {
      // Use real timers for this test to avoid async race conditions
      jest.useRealTimers();

      const networkError = new Error('Network error');
      const operation = jest.fn().mockRejectedValue(networkError);

      await expect(
        withRetry(operation, {
          maxRetries: 2,
          baseDelayMs: 10, // Short delay for test speed
          logRetries: false
        })
      ).rejects.toThrow('Network error');

      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries

      // Restore fake timers for other tests
      jest.useFakeTimers();
    });

    it('should use exponential backoff', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockResolvedValue('success');

      const resultPromise = withRetry(operation, {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        logRetries: false
      });

      // After 500ms, still only 1 attempt (waiting for first delay)
      await jest.advanceTimersByTimeAsync(500);
      expect(operation).toHaveBeenCalledTimes(1);

      // After 1500ms (1000ms delay + jitter), second attempt
      await jest.advanceTimersByTimeAsync(1500);
      expect(operation).toHaveBeenCalledTimes(2);

      // After 3000ms more (2000ms delay + jitter), third attempt
      await jest.advanceTimersByTimeAsync(3000);

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

      const resultPromise = withRetry(operation, {
        maxRetries: 5,
        baseDelayMs: 5000,
        maxDelayMs: 8000, // Cap at 8 seconds
        logRetries: false
      });

      // Advance through capped delays
      await jest.advanceTimersByTimeAsync(30000);

      const result = await resultPromise;
      expect(result).toBe('success');
    });
  });

  describe('wrapWithRetry', () => {
    it('should create a wrapped function with retry logic', async () => {
      const originalFn = jest.fn()
        .mockRejectedValueOnce(new Error('Connection reset'))
        .mockResolvedValue('wrapped success');

      const wrappedFn = wrapWithRetry(originalFn, {
        maxRetries: 2,
        baseDelayMs: 100,
        logRetries: false
      });

      const resultPromise = wrappedFn('arg1', 123);
      await jest.advanceTimersByTimeAsync(200);
      const result = await resultPromise;

      expect(result).toBe('wrapped success');
      expect(originalFn).toHaveBeenCalledTimes(2);
      expect(originalFn).toHaveBeenCalledWith('arg1', 123);
    });
  });

  describe('throwIfTransient', () => {
    it('should return result when no error', () => {
      const result = { data: [{ id: '1' }], error: null };
      expect(throwIfTransient(result)).toBe(result);
    });

    it('should return result when error is not transient', () => {
      const result = { data: null, error: { message: 'Invalid input' } };
      expect(throwIfTransient(result)).toBe(result);
    });

    it('should throw TransientSupabaseError for transient errors', () => {
      const result = { data: null, error: { message: 'Network error' } };
      expect(() => throwIfTransient(result)).toThrow(TransientSupabaseError);
    });

    it('should throw TransientSupabaseError for connection timeout', () => {
      const result = { data: null, error: { message: 'Connection timed out' } };
      expect(() => throwIfTransient(result)).toThrow(TransientSupabaseError);
    });

    it('should throw TransientSupabaseError for 503 status', () => {
      const result = { data: null, error: { message: 'Service unavailable', status: 503 } };
      expect(() => throwIfTransient(result)).toThrow(TransientSupabaseError);
    });

    it('should preserve original error in TransientSupabaseError', () => {
      const originalError = { message: 'Fetch failed', code: 'NETWORK_ERROR' };
      const result = { data: null, error: originalError };

      try {
        throwIfTransient(result);
        fail('Expected TransientSupabaseError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TransientSupabaseError);
        expect((error as TransientSupabaseError).originalError).toBe(originalError);
      }
    });
  });
});
