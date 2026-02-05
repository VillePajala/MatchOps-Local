/**
 * Retry utilities with exponential backoff.
 *
 * Provides reusable retry logic for async operations that may fail due to
 * transient errors (network issues, rate limits, etc.).
 *
 * @see docs/03-active-plans/import-reliability-fix-plan.md
 */

import logger from '@/utils/logger';

/**
 * Check if error is transient and worth retrying.
 * Extended from original AbortError-only check to include common transient failures.
 */
export function isTransientError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    // AbortError from Supabase auth locks
    message.includes('aborterror') ||
    message.includes('signal is aborted') ||
    // Network errors
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('fetch failed') ||
    message.includes('failed to fetch') ||
    // HTTP status codes that indicate transient issues
    message.includes('429') ||  // Rate limit
    message.includes('503') ||  // Service unavailable
    message.includes('504')     // Gateway timeout
  );
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
  shouldRetry?: (error: Error) => boolean;
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

  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry non-transient errors or on last attempt
      if (!shouldRetry(lastError) || attempt === maxRetries) {
        throw lastError;
      }

      const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      logger.warn(`[${operationName}] Attempt ${attempt} failed, retrying in ${delay}ms...`,
        lastError.message);
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
