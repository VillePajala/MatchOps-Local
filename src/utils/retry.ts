/**
 * Retry utilities with exponential backoff.
 *
 * Provides reusable retry logic for async operations that may fail due to
 * transient errors (network issues, rate limits, etc.).
 *
 * Note: See also src/datastore/supabase/retry.ts for Supabase-specific retry
 * utilities (includes throwIfTransient for Supabase {data, error} results).
 * Both utilities use aligned error detection patterns.
 *
 * @see docs/03-active-plans/import-reliability-fix-plan.md
 */

import logger from '@/utils/logger';

/**
 * HTTP status codes that indicate transient failures worth retrying.
 */
const TRANSIENT_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error (sometimes transient)
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

/**
 * Error message patterns that indicate transient failures.
 */
const TRANSIENT_ERROR_PATTERNS = [
  // AbortError from Supabase auth locks
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
  // Server overload (message-based fallback)
  'service unavailable',
  'too many requests',
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
 * Extract error message from various error types.
 */
function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;
    if (typeof errorObj.message === 'string') return errorObj.message;
    if (typeof errorObj.error === 'string') return errorObj.error;
  }
  return String(error);
}

/**
 * Check if error is transient and worth retrying.
 *
 * Checks (in order of priority):
 * 1. HTTP status codes (status, statusCode properties)
 * 2. PostgreSQL error codes (PGRST301, PGRST000)
 * 3. Error message patterns
 *
 * @param error - The error to check (can be Error, object with status/code, or string)
 * @returns True if the error is likely transient and worth retrying
 */
export function isTransientError(error: unknown): boolean {
  if (!error) return false;

  // Check for explicit status code on error object
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;

    // Check status or statusCode properties (Supabase/HTTP error format)
    const status = errorObj.status ?? errorObj.statusCode;
    if (typeof status === 'number' && TRANSIENT_STATUS_CODES.has(status)) {
      return true;
    }

    // Check PostgreSQL/PostgREST error codes
    const code = errorObj.code;
    if (code === 'PGRST301' || code === 'PGRST000') {
      // Connection errors from PostgREST
      return true;
    }

    // Explicitly NOT transient: optimistic locking conflicts (40001)
    if (code === '40001') {
      return false;
    }
  }

  // Check error message patterns as fallback
  const message = getErrorMessage(error).toLowerCase();
  return TRANSIENT_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

/**
 * Options for retryWithBackoff.
 */
export interface RetryOptions {
  /** Name for logging purposes */
  operationName?: string;
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 500) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 5000) */
  maxDelayMs?: number;
  /** Custom function to determine if error is retryable (default: isTransientError) */
  shouldRetry?: (error: unknown) => boolean;
}

/**
 * Retry an async operation with exponential backoff.
 *
 * @param operation - Async function to retry
 * @param options - Retry configuration
 * @returns Result of successful operation
 * @throws Last error if all retries exhausted or non-transient error
 *
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   () => fetchData(),
 *   { operationName: 'fetchData', maxRetries: 3 }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    operationName = 'operation',
    maxRetries = 3,
    initialDelayMs = 500,
    maxDelayMs = 5000,
    shouldRetry = isTransientError,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry non-transient errors or on last attempt
      // Pass raw error to shouldRetry so it can check status codes, etc.
      if (!shouldRetry(error) || attempt === maxRetries) {
        throw error;
      }

      const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      logger.warn(`[${operationName}] Attempt ${attempt} failed, retrying in ${delay}ms...`,
        getErrorMessage(error));
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // TypeScript needs this even though it's unreachable
  throw lastError!;
}

/**
 * Split array into chunks of specified size.
 *
 * @param array - Array to split
 * @param chunkSize - Maximum size of each chunk
 * @returns Array of chunks
 *
 * @example
 * ```typescript
 * chunkArray([1, 2, 3, 4, 5], 2) // [[1, 2], [3, 4], [5]]
 * ```
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) {
    throw new Error('chunkSize must be positive');
  }

  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Failure tracking structure from pushAllToCloud.
 * Used by countPushFailures to count total failures.
 */
export interface PushFailures {
  players: string[];
  teams: string[];
  seasons: string[];
  tournaments: string[];
  personnel: string[];
  games: string[];
  rosters: string[];
  adjustments: string[];
  settings: boolean;
  warmupPlan: boolean;
}

/**
 * Count total failures from a pushAllToCloud result.
 *
 * Counts both:
 * - Array failures (players, teams, etc.) - count of failed IDs
 * - Boolean failures (settings, warmupPlan) - 1 if failed, 0 if succeeded
 *
 * @param failures - The failures object from PushAllToCloudResult
 * @returns Total count of failed items
 *
 * @example
 * ```typescript
 * const result = await syncedDataStore.pushAllToCloud();
 * const totalFailures = countPushFailures(result.failures);
 * if (totalFailures > 0) {
 *   console.warn(`${totalFailures} items failed to sync`);
 * }
 * ```
 */
export function countPushFailures(failures: PushFailures): number {
  const arrayFailures = [
    failures.players,
    failures.teams,
    failures.seasons,
    failures.tournaments,
    failures.personnel,
    failures.games,
    failures.rosters,
    failures.adjustments,
  ].reduce((sum, arr) => sum + (arr?.length || 0), 0);

  const booleanFailures =
    (failures.settings ? 1 : 0) +
    (failures.warmupPlan ? 1 : 0);

  return arrayFailures + booleanFailures;
}
