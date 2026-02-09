/**
 * Tests for transientErrors shared module
 * @critical - Ensures transient error detection patterns are consistent
 *
 * This module provides the centralized list of error message patterns used by
 * both src/utils/retry.ts and src/datastore/supabase/retry.ts. Changes to these
 * patterns affect retry behavior across the entire application.
 *
 * Tests cover:
 * - Array is non-empty
 * - All entries are lowercase strings
 * - Expected patterns are present (network, abort, timeout, etc.)
 * - No accidental HTTP status code strings (avoids false positives)
 */

import { TRANSIENT_ERROR_PATTERNS } from '../transientErrors';

describe('TRANSIENT_ERROR_PATTERNS', () => {
  describe('array integrity', () => {
    it('should be a non-empty array', () => {
      expect(Array.isArray(TRANSIENT_ERROR_PATTERNS)).toBe(true);
      expect(TRANSIENT_ERROR_PATTERNS.length).toBeGreaterThan(0);
    });

    it('should contain only string entries', () => {
      for (const pattern of TRANSIENT_ERROR_PATTERNS) {
        expect(typeof pattern).toBe('string');
      }
    });

    it('should contain only lowercase strings', () => {
      for (const pattern of TRANSIENT_ERROR_PATTERNS) {
        expect(pattern).toBe(pattern.toLowerCase());
      }
    });

    it('should contain no empty strings', () => {
      for (const pattern of TRANSIENT_ERROR_PATTERNS) {
        expect(pattern.length).toBeGreaterThan(0);
      }
    });

    it('should have no duplicate entries', () => {
      const unique = new Set(TRANSIENT_ERROR_PATTERNS);
      expect(unique.size).toBe(TRANSIENT_ERROR_PATTERNS.length);
    });
  });

  describe('expected AbortError patterns', () => {
    it('should contain "aborterror" for Chrome Mobile Android fetch cancellation', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('aborterror');
    });

    it('should contain "signal is aborted" for AbortController signal errors', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('signal is aborted');
    });
  });

  describe('expected network error patterns', () => {
    it('should contain "fetch failed"', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('fetch failed');
    });

    it('should contain "network error"', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('network error');
    });

    it('should contain "failed to fetch"', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('failed to fetch');
    });

    it('should contain "networkerror"', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('networkerror');
    });

    it('should contain "network request failed"', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('network request failed');
    });

    it('should contain "load failed"', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('load failed');
    });
  });

  describe('expected connection error patterns', () => {
    it('should contain "connection refused"', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('connection refused');
    });

    it('should contain "connection reset"', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('connection reset');
    });

    it('should contain "econnrefused"', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('econnrefused');
    });

    it('should contain "econnreset"', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('econnreset');
    });

    it('should contain "etimedout"', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('etimedout');
    });
  });

  describe('expected timeout patterns', () => {
    it('should contain "timeout"', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('timeout');
    });

    it('should contain "timed out"', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('timed out');
    });

    it('should contain "request timeout"', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('request timeout');
    });
  });

  describe('expected server overload patterns', () => {
    it('should contain "service unavailable"', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('service unavailable');
    });

    it('should contain "too many requests"', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('too many requests');
    });
  });

  describe('expected temporary failure patterns', () => {
    it('should contain "temporary failure"', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('temporary failure');
    });

    it('should contain "try again"', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('try again');
    });

    it('should contain "temporarily unavailable"', () => {
      expect(TRANSIENT_ERROR_PATTERNS).toContain('temporarily unavailable');
    });
  });

  describe('safety: no bare HTTP status codes', () => {
    /**
     * HTTP status codes like '503' and '429' should NOT be in the patterns
     * because they cause false positives (e.g., "Error in record 503").
     * Status codes are handled by explicit TRANSIENT_STATUS_CODES sets
     * in the retry modules.
     * @edge-case
     */
    it('should NOT contain bare "503" string', () => {
      expect(TRANSIENT_ERROR_PATTERNS).not.toContain('503');
    });

    it('should NOT contain bare "429" string', () => {
      expect(TRANSIENT_ERROR_PATTERNS).not.toContain('429');
    });

    it('should NOT contain bare "500" string', () => {
      expect(TRANSIENT_ERROR_PATTERNS).not.toContain('500');
    });
  });

  describe('pattern matching usability', () => {
    /**
     * Verifies that patterns work correctly for case-insensitive substring matching,
     * which is the expected usage in retry.ts modules.
     * @integration
     */
    it('should match common real-world error messages when used with toLowerCase().includes()', () => {
      const realWorldErrors = [
        'AbortError: signal is aborted without reason',
        'TypeError: Failed to fetch',
        'TypeError: NetworkError when attempting to fetch resource',
        'Error: Network request failed',
        'Error: Request timeout after 30000ms',
        'Error: connect ECONNREFUSED 127.0.0.1:5432',
        'Error: Service Unavailable',
      ];

      for (const errorMessage of realWorldErrors) {
        const lowerMessage = errorMessage.toLowerCase();
        const matched = TRANSIENT_ERROR_PATTERNS.some(
          (pattern) => lowerMessage.includes(pattern)
        );
        expect(matched).toBe(true);
      }
    });

    it('should NOT match non-transient errors', () => {
      const nonTransientErrors = [
        'Error: Invalid input: name is required',
        'RangeError: Maximum call stack size exceeded',
        'TypeError: Cannot read properties of undefined',
        'Error: User not found',
        'Error: Permission denied',
        'SyntaxError: Unexpected token',
      ];

      for (const errorMessage of nonTransientErrors) {
        const lowerMessage = errorMessage.toLowerCase();
        const matched = TRANSIENT_ERROR_PATTERNS.some(
          (pattern) => lowerMessage.includes(pattern)
        );
        expect(matched).toBe(false);
      }
    });
  });
});
