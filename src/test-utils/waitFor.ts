/**
 * Test utility for condition-based waiting (non-React tests)
 *
 * This replaces fixed setTimeout delays with actual condition checking.
 * See CLAUDE.md testing guidelines (lines 355-372) for rationale.
 *
 * @example
 * // ❌ FORBIDDEN - Fixed timeout
 * await new Promise(resolve => setTimeout(resolve, 100));
 * expect(queue.size).toBe(3);
 *
 * // ✅ CORRECT - Condition-based waiting
 * await waitFor(() => expect(queue.size).toBe(3));
 */

export interface WaitForOptions {
  /**
   * Maximum time to wait for condition (ms)
   * @default 5000
   */
  timeout?: number;

  /**
   * Interval between condition checks (ms)
   * @default 50
   */
  interval?: number;

  /**
   * Custom error message on timeout
   */
  onTimeout?: (error: Error) => string;
}

/**
 * Wait for a condition to be truthy or an assertion to pass
 *
 * @param condition - Function that returns truthy value or throws assertion error
 * @param options - Configuration options
 * @returns Promise resolving to condition's return value
 * @throws Error if condition doesn't pass within timeout
 */
export async function waitFor<T>(
  condition: () => T | Promise<T>,
  options: WaitForOptions = {}
): Promise<T> {
  const {
    timeout = 5000,
    interval = 50,
    onTimeout
  } = options;

  const startTime = Date.now();
  let lastError: Error | null = null;

  while (Date.now() - startTime < timeout) {
    try {
      const result = await condition();

      // Condition passed successfully
      if (result !== false && result !== null && result !== undefined) {
        return result;
      }

      // If result is explicitly false, keep waiting
    } catch (error) {
      // Assertion failed, save error and retry
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  // Timeout reached
  const elapsedTime = Date.now() - startTime;
  const errorMessage = onTimeout
    ? onTimeout(lastError!)
    : `Timeout waiting for condition after ${elapsedTime}ms. ${lastError ? `Last error: ${lastError.message}` : 'Condition never became truthy'}`;

  throw new Error(errorMessage);
}

/**
 * Wait for a specific value to match (with optional custom matcher)
 *
 * @example
 * await waitForValue(() => queue.size, 3); // Wait for queue.size === 3
 * await waitForValue(() => status.isReady, true, { timeout: 1000 });
 */
export async function waitForValue<T>(
  getValue: () => T | Promise<T>,
  expectedValue: T,
  options: WaitForOptions = {}
): Promise<T> {
  return waitFor(async () => {
    const value = await getValue();
    if (value === expectedValue) {
      return value;
    }
    throw new Error(`Expected ${expectedValue}, got ${value}`);
  }, {
    ...options,
    onTimeout: (error) => `Timeout waiting for value to equal ${expectedValue}. ${error.message}`
  });
}

/**
 * Wait for an async function to resolve (useful for promise-based conditions)
 *
 * @example
 * await waitForAsync(async () => {
 *   const data = await fetchData();
 *   return data.length > 0;
 * });
 */
export async function waitForAsync<T>(
  asyncCondition: () => Promise<T>,
  options: WaitForOptions = {}
): Promise<T> {
  return waitFor(asyncCondition, options);
}
