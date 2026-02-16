/**
 * Shared error patterns for transient failure detection.
 *
 * Used by both:
 * - src/utils/retry.ts (general-purpose retry utilities)
 * - src/datastore/supabase/retry.ts (Supabase-specific retry utilities)
 *
 * This centralized definition ensures both modules detect the same transient
 * errors and eliminates the need for manual synchronization.
 *
 * @see src/utils/retry.ts
 * @see src/datastore/supabase/retry.ts
 */

/**
 * Error message patterns that indicate transient failures.
 *
 * These are errors that may succeed on retry due to:
 * - Network instability (mobile, wifi handoff)
 * - Server overload (503, 429)
 * - Temporary connection issues
 * - Browser fetch cancellation (AbortError on Chrome Mobile Android)
 */
export const TRANSIENT_ERROR_PATTERNS = [
  // AbortError from browser fetch cancellation (common on Chrome Mobile Android)
  'aborterror',
  'signal is aborted',
  // Network errors
  'fetch failed',
  'network error',
  'network request failed',
  'failed to fetch',
  'load failed',
  'networkerror',
  // Connection errors
  'connection refused',
  'connection reset',
  'connection timed out',
  'econnrefused',
  'econnreset',
  'etimedout',
  'socket hang up',
  // Server overload
  'service unavailable',
  'too many requests',
  // Note: HTTP 503/429 are handled by explicit status code checks in both retry
  // modules (TRANSIENT_STATUS_CODES set). Bare '503'/'429' strings are NOT included
  // here to avoid false positives (e.g., "Error in record 503").
  // Timeout
  'timeout',
  'timed out',
  'request timeout',
  // Temporary failures
  'temporary failure',
  'try again',
  'temporarily unavailable',
] as const;

/**
 * HTTP status codes that indicate transient failures worth retrying.
 *
 * Shared between:
 * - src/utils/retry.ts (general-purpose retry)
 * - src/datastore/supabase/retry.ts (Supabase-specific retry)
 */
export const TRANSIENT_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error (sometimes transient)
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/**
 * Extract error message from various error types.
 *
 * Shared between retry modules to ensure consistent error message extraction.
 */
export function getErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;
    if (typeof errorObj.message === 'string') return errorObj.message;
    if (typeof errorObj.error === 'string') return errorObj.error;
    // HTTP error objects (e.g., raw Supabase responses)
    if (typeof errorObj.status === 'number') {
      return `HTTP ${errorObj.status}${typeof errorObj.statusText === 'string' ? ': ' + errorObj.statusText : ''}`;
    }
  }
  return String(error);
}
