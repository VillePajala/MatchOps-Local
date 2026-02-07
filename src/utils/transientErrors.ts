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
  '503',
  'too many requests',
  '429',
  // Timeout
  'timeout',
  'timed out',
  'request timeout',
  // Temporary failures
  'temporary failure',
  'try again',
  'temporarily unavailable',
] as const;
