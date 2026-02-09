/**
 * Retry Logic with Exponential Backoff (Supabase-specific)
 *
 * Provides retry functionality for transient network errors in Supabase operations.
 * Improves resilience on mobile devices with flaky connections.
 *
 * Includes Supabase-specific helpers like throwIfTransient() for {data, error} results.
 *
 * Note: See also src/utils/retry.ts for general-purpose retry utilities
 * (used by fullBackup.ts and SyncedDataStore bulk operations).
 * Both utilities use aligned error detection patterns.
 *
 * @module datastore/supabase/retry
 */

import logger from '@/utils/logger';
import { TRANSIENT_ERROR_PATTERNS, TRANSIENT_STATUS_CODES, getErrorMessage } from '@/utils/transientErrors';

/**
 * Configuration for retry behavior.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts AFTER the initial try (default: 3).
   *  maxRetries=3 means 4 total attempts (1 initial + 3 retries).
   *  Note: src/utils/retry.ts uses different semantics where maxRetries means
   *  total attempts including the initial one. */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay cap in milliseconds (default: 10000) */
  maxDelayMs?: number;
  /** Whether to log retry attempts (default: true) */
  logRetries?: boolean;
  /** Optional operation name for clearer log messages */
  operationName?: string;
}

const DEFAULT_CONFIG: Required<Omit<RetryConfig, 'operationName'>> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  logRetries: true,
};

/**
 * Determine if an error is transient and worth retrying.
 *
 * @param error - The error to check
 * @returns True if the error is likely transient
 */
export function isTransientError(error: unknown): boolean {
  if (!error) return false;

  // Check for explicit status code
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;

    // Supabase error format: { status, statusCode, code, message }
    const status = errorObj.status ?? errorObj.statusCode;
    if (typeof status === 'number' && TRANSIENT_STATUS_CODES.has(status)) {
      return true;
    }

    // PostgrestError code
    const code = errorObj.code;
    if (code === 'PGRST000') {
      // PGRST000 = PostgREST connection error (transient)
      // Note: PGRST301 (JWT expired/invalid) is NOT transient — it must reach
      // classifyAndThrowError() to be properly classified as AuthError
      return true;
    }
  }

  // Check error message patterns
  const message = getErrorMessage(error).toLowerCase();
  return TRANSIENT_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

/**
 * Sleep for a specified duration.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter.
 *
 * Formula: min(baseDelay * 2^attempt + jitter, maxDelay)
 * Jitter adds randomness to prevent thundering herd.
 */
function calculateDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelayMs * 0.5; // 0-50% of base delay
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * Execute an operation with retry logic and exponential backoff.
 *
 * Only retries on transient errors (network issues, server overload).
 * Non-transient errors (validation, auth, not found) are thrown immediately.
 *
 * @param operation - Async function to execute
 * @param config - Retry configuration options
 * @returns Result of the operation
 * @throws The last error if all retries are exhausted
 *
 * @example
 * ```typescript
 * // Basic usage
 * const result = await withRetry(() => client.from('players').select());
 *
 * // Custom config
 * const result = await withRetry(
 *   () => client.rpc('save_game_with_relations', params),
 *   { maxRetries: 5, baseDelayMs: 500 }
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs, logRetries, operationName } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const opLabel = operationName ? `[Retry:${operationName}]` : '[Retry]';
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry non-transient errors
      if (!isTransientError(error)) {
        throw error;
      }

      // Don't retry if we've exhausted attempts
      if (attempt === maxRetries) {
        if (logRetries) {
          logger.warn(
            `${opLabel} All ${maxRetries + 1} attempts failed:`,
            getErrorMessage(error)
          );
        }
        throw error;
      }

      // Calculate delay and wait
      const delayMs = calculateDelay(attempt, baseDelayMs, maxDelayMs);

      if (logRetries) {
        logger.info(
          `${opLabel} Attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${Math.round(delayMs)}ms:`,
          getErrorMessage(error)
        );
      }

      await delay(delayMs);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Create a retry-wrapped version of an async function.
 *
 * Useful for wrapping multiple related operations with the same config.
 *
 * @param fn - Async function to wrap
 * @param config - Retry configuration
 * @returns Wrapped function with retry logic
 *
 * @example
 * ```typescript
 * const retryableRpc = wrapWithRetry(
 *   (name: string, params: object) => client.rpc(name, params),
 *   { maxRetries: 3 }
 * );
 *
 * await retryableRpc('save_game', { p_game: gameData });
 * ```
 */
export function wrapWithRetry<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  config: RetryConfig = {}
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => withRetry(() => fn(...args), config);
}

/**
 * Error class for transient Supabase errors that should trigger retry.
 */
export class TransientSupabaseError extends Error {
  constructor(
    public readonly originalError: { message: string; code?: string; status?: number },
    message?: string
  ) {
    super(message ?? originalError.message);
    this.name = 'TransientSupabaseError';
  }
}

/**
 * Supabase result type with data and error.
 */
interface SupabaseResult<T> {
  data: T | null;
  error: { message: string; code?: string; status?: number } | null;
}

/**
 * Throw if the Supabase result contains a transient error.
 *
 * Use inside withRetry callbacks to enable retry on transient errors.
 * Supabase resolves with { data, error } instead of throwing, so this
 * helper converts transient errors to thrown exceptions.
 *
 * @param result - Supabase query result
 * @returns The same result if no transient error
 * @throws TransientSupabaseError if error is transient (triggers retry)
 *
 * @example
 * ```typescript
 * const result = await withRetry(async () => {
 *   const res = await client.from('players').select('*');
 *   return throwIfTransient(res);
 * });
 * // Now check result.error for non-transient errors
 * ```
 */
export function throwIfTransient<T>(result: SupabaseResult<T>): SupabaseResult<T> {
  if (result.error && isTransientError(result.error)) {
    throw new TransientSupabaseError(result.error);
  }
  return result;
}
