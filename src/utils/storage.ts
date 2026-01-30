/**
 * INDEXEDDB BRANCH CONTEXT (Branch 1/4):
 * - Current: IndexedDB storage foundation implementation
 * - Migration: Completed separately (not main focus)
 * - Review Focus: Storage architecture quality, async patterns, type safety
 * - Next: Branches 2-4 will build advanced features on this foundation
 */

import { createStorageAdapter, createUserAdapter } from './storageFactory';
import { StorageAdapter } from './storageAdapter';
import { MutexManager } from './storageMutex';
import logger from './logger';

/**
 * Extended interface for storage adapters that support connection disposal
 * Used for type-safe cleanup of IndexedDB connections
 */
interface DisposableAdapter extends StorageAdapter {
  close: () => Promise<void>;
}

/**
 * Type guard for checking if an adapter has a close method.
 * Prefer this over type assertions for safer runtime checks.
 */
function hasCloseMethod(adapter: StorageAdapter): adapter is DisposableAdapter {
  return 'close' in adapter && typeof (adapter as DisposableAdapter).close === 'function';
}

/**
 * Check if running in production environment
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Browser compatibility detection for IndexedDB
 * Checks for IndexedDB availability including private/incognito mode restrictions
 */
export function isIndexedDBAvailable(): boolean {
  try {
    // Basic availability check
    if (typeof window === 'undefined' || !window.indexedDB) {
      logger.warn('IndexedDB not available: window.indexedDB is undefined');
      return false;
    }

    // Note: Advanced quota checking is done asynchronously in checkStorageQuota()
    // This function only does synchronous checks for immediate availability
    return true;
  } catch (error) {
    logger.error('IndexedDB availability check failed', error);
    return false;
  }
}

/**
 * Check storage quota asynchronously (for detailed diagnostics)
 * Should be called after initial availability check
 */
export async function checkStorageQuota(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.estimate) {
      return;
    }

    const estimate = await navigator.storage.estimate();
    if (estimate.quota && estimate.quota < 1024 * 1024) {
      // Less than 1MB quota suggests severe restrictions (private mode)
      logger.warn('IndexedDB may be restricted: very low storage quota detected', {
        quota: estimate.quota,
        usage: estimate.usage
      });
    } else {
      logger.debug('Storage quota check passed', {
        quota: estimate.quota,
        usage: estimate.usage
      });
    }
  } catch (error) {
    logger.warn('Storage estimate check failed, IndexedDB may be restricted', error);
  }
}

/**
 * Get browser-specific IndexedDB limitation message
 */
export function getIndexedDBErrorMessage(): string {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isPrivateMode = !isIndexedDBAvailable();

  if (isPrivateMode) {
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      return 'Storage is not available in Safari Private Mode. Please use regular browsing mode or a different browser.';
    } else if (userAgent.includes('Firefox')) {
      return 'Storage may be restricted in Firefox Private Mode. Please use regular browsing mode for full functionality.';
    } else {
      return 'Storage is not available in private/incognito mode. Please use regular browsing mode for full functionality.';
    }
  }

  return 'Your browser does not support the required storage features. Please use a modern browser like Chrome, Firefox, Safari, or Edge.';
}

let adapterPromise: Promise<StorageAdapter> | null = null;
let adapterCreatedAt: number | null = null;
let adapterRetryCount: number = 0;
let lastFailureTime: number | null = null;

// Use proper mutex for thread-safe adapter creation
const adapterCreationMutex = new MutexManager({
  defaultTimeout: 30000, // 30 second timeout for adapter creation
  enableDebugLogging: false
});

// ==========================================================================
// USER-SCOPED ADAPTER MANAGEMENT
// ==========================================================================

/**
 * Maximum number of user adapters to keep in cache.
 * Prevents unbounded memory growth in multi-user scenarios.
 * When exceeded, oldest adapters are evicted (LRU-style).
 *
 * The value of 5 was chosen based on:
 * - Typical usage: 1-2 users (primary user + maybe a test account)
 * - Test scenarios: May create 3-4 user contexts in quick succession
 * - Memory overhead: ~1-2MB per IndexedDB connection is acceptable
 * - 5 provides buffer for edge cases without excessive memory usage
 */
const MAX_USER_ADAPTERS = 5;

/**
 * Cache for user-scoped storage adapters.
 * Key: userId, Value: { promise, lastAccessedAt }
 * lastAccessedAt is updated on every cache hit for true LRU eviction.
 */
const userAdapterCache = new Map<string, {
  promise: Promise<StorageAdapter>;
  lastAccessedAt: number;
}>();

/** Timeout for adapter close operations during eviction (5 seconds) */
const ADAPTER_CLOSE_TIMEOUT_MS = 5000;

/**
 * Timeout for adapter creation (25 seconds).
 * Set lower than mutex timeout (30s) so timeout error is thrown before mutex times out.
 * This prevents hung IndexedDB operations from blocking indefinitely.
 *
 * NOTE: The timeout uses Promise.race which doesn't actually cancel the underlying
 * IndexedDB operation. If timeout occurs:
 * 1. The hung adapter is NOT cached (removed in .catch handler)
 * 2. The hung connection will eventually close when the promise resolves/rejects
 * 3. Next retry gets a fresh connection attempt
 *
 * True cancellation would require AbortController support in IndexedDB, which
 * doesn't exist. This timeout prevents blocking callers, which is the critical goal.
 */
const ADAPTER_CREATE_TIMEOUT_MS = 25000;

/**
 * Track timed-out adapter creations to prevent memory leaks.
 * When a creation times out, we track the promise so we can close it if it
 * eventually resolves (cleanup orphaned connections).
 */
const timedOutCreations = new Set<Promise<StorageAdapter>>();

/**
 * Maximum number of orphaned timed-out adapters to track before cleanup.
 * Prevents unbounded memory growth from tracking timed-out promises.
 */
const MAX_TRACKED_TIMEOUTS = 10;

/**
 * Evict least-recently-used user adapters if cache exceeds MAX_USER_ADAPTERS.
 * Uses lastAccessedAt timestamp for true LRU eviction.
 *
 * Close operations have a 5-second timeout to prevent blocking new adapter
 * creation if an adapter's close() hangs (e.g., IndexedDB unresponsive).
 *
 * Note: If close() times out, the connection may remain open until garbage
 * collected. This is acceptable because:
 * 1. IndexedDB connections are automatically closed when the page unloads
 * 2. Orphaned connections have no references and will be GC'd eventually
 * 3. The timeout prevents blocking, which is more critical than perfect cleanup
 */
async function evictOldestUserAdapters(): Promise<void> {
  if (userAdapterCache.size <= MAX_USER_ADAPTERS) {
    return;
  }

  // Sort entries by lastAccessedAt (least recently accessed first)
  const entries = Array.from(userAdapterCache.entries())
    .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

  // Evict oldest entries until we're at or below the limit
  const toEvict = entries.slice(0, userAdapterCache.size - MAX_USER_ADAPTERS);

  /** Threshold for logging slow evictions (100ms) */
  const SLOW_EVICTION_THRESHOLD_MS = 100;

  for (const [userId, entry] of toEvict) {
    const evictionStart = Date.now();
    logger.debug(`[storage] Evicting oldest user adapter: ${userId}`);
    try {
      const adapter = await entry.promise;
      if (hasCloseMethod(adapter)) {
        // Use timeout to prevent blocking if close() hangs
        const closePromise = adapter.close();
        const timeoutPromise = new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Adapter close timeout')), ADAPTER_CLOSE_TIMEOUT_MS)
        );
        await Promise.race([closePromise, timeoutPromise]);
      }
    } catch (error) {
      // If close() timed out or threw, the connection may still be open.
      // This is acceptable because:
      // 1. We remove from cache so no new code can access it
      // 2. Orphaned connections have no references and will be GC'd
      // 3. IndexedDB connections auto-close on page unload
      // 4. Timeout/error is logged for monitoring
      logger.warn(`[storage] Eviction close failed for ${userId}, relying on GC for cleanup`, { error });
    } finally {
      // Always remove from cache, even if close() failed or timed out
      // This prevents memory leaks from stuck entries and ensures
      // future requests get a fresh adapter instead of a potentially-closed one
      userAdapterCache.delete(userId);

      // Log slow evictions for production monitoring
      const evictionDuration = Date.now() - evictionStart;
      if (evictionDuration > SLOW_EVICTION_THRESHOLD_MS) {
        logger.warn(`[storage] Slow eviction detected`, {
          userId,
          durationMs: evictionDuration,
          thresholdMs: SLOW_EVICTION_THRESHOLD_MS,
        });
      }
    }
  }
}

// Mutex for user adapter creation (separate from global adapter mutex)
const userAdapterCreationMutex = new MutexManager({
  defaultTimeout: 30000,
  enableDebugLogging: false
});

/**
 * Get a user-scoped storage adapter.
 *
 * Creates and caches an IndexedDB adapter for the specified user.
 * Each user gets their own database for complete data isolation.
 *
 * @param userId - The authenticated user's ID
 * @returns Promise resolving to user-scoped storage adapter
 * @throws Error if userId is invalid or IndexedDB is unavailable
 *
 * @example
 * ```typescript
 * const adapter = await getUserStorageAdapter('user123');
 * await adapter.setItem('settings', JSON.stringify({ theme: 'dark' }));
 * ```
 */
export async function getUserStorageAdapter(userId: string): Promise<StorageAdapter> {
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error('userId is required and must be a non-empty string');
  }

  const trimmedUserId = userId.trim();

  // IMPORTANT: No fast path outside mutex!
  // A fast path that reads cache and updates lastAccessedAt without holding the mutex
  // creates a race condition where:
  // 1. Fast path finds cached adapter X
  // 2. Concurrent eviction (triggered by another user's creation) decides to evict X
  // 3. Eviction closes adapter X
  // 4. Fast path returns closed adapter X -> user gets errors
  //
  // The mutex overhead (~microseconds) is negligible compared to IndexedDB operations (~milliseconds).

  // Use mutex to prevent concurrent adapter creation AND cache access races
  try {
    await userAdapterCreationMutex.acquire();

    // Check for cached adapter (mutex-protected)
    const cached = userAdapterCache.get(trimmedUserId);
    if (cached && !isUserAdapterExpired(cached.lastAccessedAt)) {
      // Update lastAccessedAt for true LRU eviction (safe: we hold the mutex)
      cached.lastAccessedAt = Date.now();
      return cached.promise;
    }

    // Close and remove expired adapter if exists
    if (cached) {
      logger.debug('Closing expired user adapter', { userId: trimmedUserId });
      try {
        const oldAdapter = await cached.promise;
        if (hasCloseMethod(oldAdapter)) {
          await oldAdapter.close();
        }
      } catch (error) {
        logger.warn('Failed to close expired user adapter', { userId: trimmedUserId, error });
      }
      userAdapterCache.delete(trimmedUserId);
    }

    // Create new adapter with timeout to prevent indefinite hangs
    const lastAccessedAt = Date.now();
    const createPromise = createUserAdapter(trimmedUserId);

    // Track the original promise for cleanup if timeout occurs
    let didTimeout = false;
    const timeoutPromise = new Promise<StorageAdapter>((_, reject) =>
      setTimeout(() => {
        didTimeout = true;
        reject(new Error(`Adapter creation timeout after ${ADAPTER_CREATE_TIMEOUT_MS}ms`));
      }, ADAPTER_CREATE_TIMEOUT_MS)
    );

    // Race between creation and timeout
    const promise = Promise.race([createPromise, timeoutPromise]);

    // Handle timeout cleanup: if creation times out, track the original promise
    // so we can close the orphaned connection when it eventually resolves
    promise.catch(() => {
      if (didTimeout) {
        // Track timed-out creation for cleanup
        timedOutCreations.add(createPromise);

        // Clean up orphaned connection when it eventually resolves
        createPromise.then(adapter => {
          timedOutCreations.delete(createPromise);
          if (hasCloseMethod(adapter)) {
            adapter.close().catch(err => {
              logger.warn('[storage] Error closing orphaned timed-out adapter', { error: err });
            });
          }
        }).catch(() => {
          // Creation failed anyway - just remove from tracking
          timedOutCreations.delete(createPromise);
        });

        // Prevent unbounded tracking if too many timeouts
        if (timedOutCreations.size > MAX_TRACKED_TIMEOUTS) {
          logger.warn('[storage] Too many timed-out adapter creations - possible IndexedDB issue');
          // Remove oldest (first added) to prevent memory leak
          const oldest = timedOutCreations.values().next().value;
          if (oldest) timedOutCreations.delete(oldest);
        }
      }
    });

    // Cache the promise (not the resolved adapter) to handle concurrent requests
    userAdapterCache.set(trimmedUserId, { promise, lastAccessedAt });

    // Evict oldest adapters if cache is full (LRU eviction)
    // IMPORTANT: Must await eviction while holding the mutex to prevent race:
    // - Without await: mutex released, another thread gets adapter, eviction closes it
    // - With await: eviction completes before any thread can access evicted adapters
    // The eviction overhead is acceptable (~5ms for close) and happens rarely (only when cache full).
    try {
      await evictOldestUserAdapters();
    } catch (error) {
      logger.warn('[storage] Error during user adapter eviction', { error });
      // Continue - eviction failure shouldn't block adapter creation
    }

    // Handle creation failure (async, outside mutex - just cleans up our own entry)
    promise.catch(() => {
      // Remove from cache on failure
      userAdapterCache.delete(trimmedUserId);
    });

    return promise;
  } finally {
    userAdapterCreationMutex.release();
  }
}

/**
 * Close and remove a user's storage adapter from cache.
 *
 * Call this when a user signs out to release resources and
 * ensure data isolation when another user signs in.
 *
 * @param userId - The user's ID whose adapter should be closed
 *
 * @example
 * ```typescript
 * // On sign out
 * await closeUserStorageAdapter(currentUserId);
 * ```
 */
export async function closeUserStorageAdapter(userId: string): Promise<void> {
  // Validate userId - consistent with getUserStorageAdapter validation
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error('userId is required and must be a non-empty string');
  }

  const trimmedUserId = userId.trim();
  const cached = userAdapterCache.get(trimmedUserId);

  if (!cached) {
    logger.debug('No cached adapter to close for user', { userId: trimmedUserId });
    return;
  }

  logger.debug('Closing user storage adapter', { userId: trimmedUserId });

  try {
    const adapter = await cached.promise;
    if (hasCloseMethod(adapter)) {
      await adapter.close();
    }
    logger.debug('User adapter closed successfully', { userId: trimmedUserId });
  } catch (error) {
    logger.warn('Error closing user adapter', { userId: trimmedUserId, error });
  } finally {
    userAdapterCache.delete(trimmedUserId);
  }
}

/**
 * Close all user storage adapters and clear the cache.
 *
 * Call this during:
 * - Application shutdown (ensures clean IndexedDB disconnect)
 * - Test cleanup (prevents state leakage between tests)
 * - Factory reset (part of resetFactory() cleanup)
 *
 * This function is safe to call even if no adapters are cached.
 * Errors closing individual adapters are logged but don't fail the operation.
 *
 * @example
 * ```typescript
 * // In test cleanup
 * afterEach(async () => {
 *   await closeAllUserStorageAdapters();
 * });
 *
 * // During app shutdown
 * window.addEventListener('beforeunload', async () => {
 *   await closeAllUserStorageAdapters();
 * });
 * ```
 */
export async function closeAllUserStorageAdapters(): Promise<void> {
  logger.debug('Closing all user storage adapters', {
    cachedCount: userAdapterCache.size,
    timedOutCount: timedOutCreations.size
  });

  const closePromises = Array.from(userAdapterCache.keys()).map(userId =>
    closeUserStorageAdapter(userId).catch(error => {
      logger.warn('Error closing user adapter during bulk close', { userId, error });
    })
  );

  await Promise.all(closePromises);
  userAdapterCache.clear();

  // Also clear timed-out creation tracking (they'll close themselves when resolved)
  timedOutCreations.clear();
}

/**
 * Check if a user adapter has expired based on TTL.
 */
function isUserAdapterExpired(createdAt: number): boolean {
  return Date.now() - createdAt > ADAPTER_TTL;
}

// Configurable TTL for adapter caching (default: 15 minutes)
// Longer TTL improves performance for active users while still ensuring fresh connections
// Can be overridden via NEXT_PUBLIC_STORAGE_ADAPTER_TTL_MS environment variable
const ADAPTER_TTL = parseInt(
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_STORAGE_ADAPTER_TTL_MS) || '900000',
  10
);
// Retry configuration with exponential backoff
// This prevents overwhelming IndexedDB when it's temporarily unavailable
const MAX_RETRY_ATTEMPTS = 3;      // Maximum number of retry attempts before giving up
const BASE_RETRY_DELAY = 1000;     // 1 second - initial retry delay
const MAX_RETRY_DELAY = 10000;     // 10 seconds - maximum delay to prevent excessive waiting

/**
 * Security limits for storage keys and values
 *
 * MAX_KEY_LENGTH: Our keys are constants (MASTER_ROSTER_KEY, SAVED_GAMES_KEY, etc.)
 *   so 1KB is more than sufficient. Prevents accidental corruption from malformed keys.
 *
 * MAX_VALUE_SIZE: Typical usage is 50-100 games × ~5KB = ~500KB total.
 *   10MB limit allows for reasonable growth (200+ games) while preventing quota exhaustion
 *   from corrupted data or runaway storage.
 */
const MAX_KEY_LENGTH = 1024;       // 1KB max key size
const MAX_VALUE_SIZE = 10 * 1024 * 1024; // 10MB max value size

/**
 * Prototype pollution prevention patterns
 *
 * IMPORTANT: XSS validation removed - not needed for local-first app
 *
 * Rationale:
 * - Keys are application constants (MASTER_ROSTER_KEY, SAVED_GAMES_KEY, etc.)
 * - Values are application-generated JSON (game stats, player data)
 * - Browser origin isolation is the security boundary
 * - No HTML rendering = no XSS risk
 * - Local-first PWA with single user = no injection attack vector
 * - See CLAUDE.md "Security & Privacy Context" for architecture details
 *
 * We keep prototype pollution checks as a reasonable baseline since they're
 * cheap and protect against accidental corruption from malformed data.
 */
const SUSPICIOUS_KEY_PATTERNS = [
  // Prototype pollution (reasonable baseline protection)
  /__proto__/i,
  /constructor/i,
  /prototype/i
];

/**
 * Check if cached adapter has expired based on TTL
 */
function isAdapterExpired(): boolean {
  if (!adapterCreatedAt) return true;
  return Date.now() - adapterCreatedAt > ADAPTER_TTL;
}

// Old queue-based functions removed - now using MutexManager for proper synchronization

/**
 * Sanitize error messages for production to prevent information disclosure
 * In development, shows detailed errors. In production, shows generic messages.
 */
function sanitizeErrorMessage(detailedMessage: string, genericMessage: string): string {
  if (isProduction()) {
    // Log detailed error for debugging but return generic message to user
    logger.debug('Error details (production)', { detailedMessage });
    return genericMessage;
  }

  return detailedMessage;
}

/**
 * Validate storage key for security and size limits
 */
function validateStorageKey(key: string): void {
  if (!key || typeof key !== 'string') {
    throw new Error('Storage key must be a non-empty string');
  }

  if (key.length > MAX_KEY_LENGTH) {
    const detailed = `Storage key is too long (${key.length} characters). Maximum allowed is ${MAX_KEY_LENGTH} characters.`;
    const generic = 'Storage key exceeds maximum allowed length';
    throw new Error(sanitizeErrorMessage(detailed, generic));
  }

  // Check for suspicious patterns that might indicate injection attempts
  for (const pattern of SUSPICIOUS_KEY_PATTERNS) {
    if (pattern.test(key)) {
      logger.warn('Suspicious key pattern detected', { keyLength: key.length, pattern: pattern.source });
      throw new Error('Invalid storage key: contains restricted patterns');
    }
  }
}

/**
 * Validate storage value for security and size limits
 */
function validateStorageValue(value: string): void {
  if (typeof value !== 'string') {
    throw new Error('Storage value must be a string');
  }

  const byteSize = new Blob([value]).size;
  if (byteSize > MAX_VALUE_SIZE) {
    const detailed = `Storage value is too large (${(byteSize / 1024 / 1024).toFixed(2)}MB). Maximum allowed is ${MAX_VALUE_SIZE / 1024 / 1024}MB.`;
    const generic = 'Storage value exceeds maximum allowed size';
    throw new Error(sanitizeErrorMessage(detailed, generic));
  }
}

/**
 * Convert technical error messages to user-friendly ones
 */
function getUserFriendlyErrorMessage(technicalMessage: string): string {
  const lowerMessage = technicalMessage.toLowerCase();

  if (lowerMessage.includes('quota') || lowerMessage.includes('storage full')) {
    return 'Your browser\'s storage is full. Please clear some browser data (Settings → Privacy → Clear browsing data) and try again.';
  }

  if (lowerMessage.includes('blocked') || lowerMessage.includes('access denied')) {
    return 'Storage access is blocked. Please check your browser settings or disable private/incognito mode.';
  }

  if (lowerMessage.includes('not supported') || lowerMessage.includes('indexeddb not available')) {
    return getIndexedDBErrorMessage();
  }

  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return 'Storage operation took too long. Please refresh the page and try again.';
  }

  if (lowerMessage.includes('corruption') || lowerMessage.includes('corrupted')) {
    return 'Storage data appears corrupted. Please clear browser data and restart the application.';
  }

  // Default fallback message
  return 'Storage is temporarily unavailable. Please refresh the page or try using a different browser.';
}

/**
 * Calculate exponential backoff delay for retry attempts
 *
 * Implements exponential backoff pattern: delay = baseDelay * (2 ^ retryCount)
 * - Attempt 0: 1000ms (1s)
 * - Attempt 1: 2000ms (2s)
 * - Attempt 2: 4000ms (4s)
 * - Attempt 3+: 10000ms (10s max)
 *
 * This prevents overwhelming a struggling IndexedDB connection while allowing
 * reasonable retry intervals for transient failures.
 *
 * @param retryCount Current retry attempt number (0-based)
 * @returns Delay in milliseconds before next retry attempt
 */
function calculateRetryDelay(retryCount: number): number {
  const exponentialDelay = BASE_RETRY_DELAY * Math.pow(2, retryCount);
  return Math.min(exponentialDelay, MAX_RETRY_DELAY);
}

/**
 * Check if enough time has passed since last failure to allow retry
 *
 * Implements retry gating to prevent rapid-fire retry attempts that could
 * worsen the underlying issue. Respects exponential backoff timing.
 *
 * Recovery Strategy:
 * 1. First failure: immediate retry allowed (no previous failures)
 * 2. Subsequent failures: must wait for exponential backoff delay
 * 3. After MAX_RETRY_ATTEMPTS: no more retries until TTL reset
 * 4. TTL expiration: retry state reset, fresh attempts allowed
 *
 * @returns true if retry is allowed now, false if still in backoff period
 */
function canRetryNow(): boolean {
  if (!lastFailureTime) return true;
  if (adapterRetryCount >= MAX_RETRY_ATTEMPTS) return false;

  const requiredDelay = calculateRetryDelay(adapterRetryCount);
  return Date.now() - lastFailureTime >= requiredDelay;
}

/**
 * Get IndexedDB storage adapter (IndexedDB-only, no localStorage fallback)
 * Implements TTL-based caching to prevent memory leaks and ensure fresh connections.
 * Uses MutexManager for proper thread-safe adapter creation.
 * @returns Promise resolving to IndexedDB storage adapter
 * @throws Error if IndexedDB is unavailable
 */
export async function getStorageAdapter(): Promise<StorageAdapter> {
  // Return existing valid adapter immediately (fast path)
  if (adapterPromise && !isAdapterExpired()) {
    return adapterPromise;
  }

  // Use mutex to ensure only one adapter creation happens at a time
  try {
    await adapterCreationMutex.acquire();

    // Double-check after acquiring mutex (another call might have created it)
    if (adapterPromise && !isAdapterExpired()) {
      return adapterPromise;
    }

    // Clear expired adapter with proper connection cleanup
    if (adapterPromise && isAdapterExpired()) {
      logger.debug('Storage adapter TTL expired, creating fresh adapter');
      // Await cleanup to prevent race conditions with parallel adapter instances
      try {
        await clearAdapterCacheWithCleanup();
      } catch (error) {
        logger.warn('Failed to cleanup expired adapter', { error });
        // Continue with new adapter creation even if cleanup fails
      }
    }

    // Check if we can retry now (respects exponential backoff)
    if (!canRetryNow()) {
      const nextRetryDelay = calculateRetryDelay(adapterRetryCount);
      const timeUntilRetry = lastFailureTime ? (lastFailureTime + nextRetryDelay - Date.now()) : 0;

      logger.warn(`Storage adapter creation still in backoff period. Next retry in ${Math.max(0, timeUntilRetry)}ms`);
      const waitMessage = `Storage is temporarily unavailable. Please wait ${Math.ceil(Math.max(0, timeUntilRetry) / 1000)} seconds and try again.`;
      throw new Error(waitMessage);
    }

    // Force IndexedDB only - no localStorage fallback with retry logic
    // Capture timestamp before async operation to prevent race conditions
    const creationTimestamp = Date.now();

    // Store promise in temp variable to prevent race condition
    const tempPromise = createStorageAdapter('indexedDB').then(adapter => {
      // Success: reset retry state (timestamp already set)
      adapterRetryCount = 0;
      lastFailureTime = null;
      logger.debug('Storage adapter created successfully');
      return adapter;
    }).catch(error => {
      // Failure: update retry state and clear promise atomically
      adapterRetryCount++;
      lastFailureTime = Date.now();
      adapterPromise = null;
      adapterCreatedAt = null;

      const nextDelay = calculateRetryDelay(adapterRetryCount);
      logger.error(`Storage adapter creation failed (attempt ${adapterRetryCount}/${MAX_RETRY_ATTEMPTS}). Next retry in ${nextDelay}ms`, error);

      // Include retry information in error message with user-friendly suggestions
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const userFriendlyError = getUserFriendlyErrorMessage(errorMessage);
      const finalError = new Error(`${userFriendlyError} (Retry ${adapterRetryCount}/${MAX_RETRY_ATTEMPTS} in ${Math.ceil(nextDelay / 1000)}s)`);

      throw finalError;
    });

    // Set timestamp and promise atomically
    adapterCreatedAt = creationTimestamp;
    adapterPromise = tempPromise;

    return adapterPromise;
  } finally {
    // Always release the mutex
    adapterCreationMutex.release();
  }
}

/**
 * Get item from IndexedDB storage with retry logic
 * @param key Storage key
 * @param options Configuration for error handling
 * @returns Promise resolving to stored value or null
 * @throws Error if IndexedDB is unavailable after retries (IndexedDB-only, no fallback)
 */
export async function getStorageItem(
  key: string,
  options: { retryCount?: number } = {}
): Promise<string | null> {
  const { retryCount = 2 } = options;

  // Validate key for security
  try {
    validateStorageKey(key);
  } catch (validationError) {
    logger.error('Invalid storage key', { key, error: validationError });
    throw validationError;
  }

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const adapter = await getStorageAdapter();
      return adapter.getItem(key);
    } catch (error) {
      logger.error(`IndexedDB read failed for key "${key}" (attempt ${attempt + 1}/${retryCount + 1}):`, error);

      // If this is the last attempt, throw error (IndexedDB-only, no fallback)
      if (attempt === retryCount) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const userFriendlyMessage = getUserFriendlyErrorMessage(errorMessage);
        throw new Error(userFriendlyMessage);
      }

      // Wait before retry with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return null; // Should never reach here
}

/**
 * Set item in IndexedDB storage with retry logic
 * @param key Storage key
 * @param value Value to store
 * @param options Configuration for error handling
 * @returns Promise resolving when storage is complete
 * @throws Error if IndexedDB is unavailable after retries
 */
export async function setStorageItem(
  key: string,
  value: string,
  options: { retryCount?: number } = {}
): Promise<void> {
  const { retryCount = 2 } = options;

  // Validate key and value for security
  validateStorageKey(key);
  validateStorageValue(value);

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const adapter = await getStorageAdapter();
      return adapter.setItem(key, value);
    } catch (error) {
      logger.error(`IndexedDB write failed for key "${key}" (attempt ${attempt + 1}/${retryCount + 1}):`, error);

      // If this is the last attempt, throw the error
      if (attempt === retryCount) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const userFriendlyMessage = getUserFriendlyErrorMessage(errorMessage);
        throw new Error(`Unable to save data: ${userFriendlyMessage}`);
      }

      // Wait before retry with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Remove item from IndexedDB storage with retry logic
 * @param key Storage key to remove
 * @param options Configuration for error handling
 * @returns Promise resolving when removal is complete
 * @throws Error if IndexedDB is unavailable after retries
 */
export async function removeStorageItem(
  key: string,
  options: { retryCount?: number } = {}
): Promise<void> {
  const { retryCount = 2 } = options;

  // Validate key for security
  validateStorageKey(key);

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const adapter = await getStorageAdapter();
      return adapter.removeItem(key);
    } catch (error) {
      logger.error(`IndexedDB remove failed for key "${key}" (attempt ${attempt + 1}/${retryCount + 1}):`, error);

      // If this is the last attempt, throw the error
      if (attempt === retryCount) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const userFriendlyMessage = getUserFriendlyErrorMessage(errorMessage);
        throw new Error(`Unable to remove data: ${userFriendlyMessage}`);
      }

      // Wait before retry with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Clear all items from IndexedDB storage with retry logic
 * @param options Configuration for error handling
 * @returns Promise resolving when clear is complete
 * @throws Error if IndexedDB is unavailable after retries
 */
export async function clearStorage(
  options: { retryCount?: number } = {}
): Promise<void> {
  const { retryCount = 2 } = options;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const adapter = await getStorageAdapter();
      return adapter.clear();
    } catch (error) {
      logger.error(`IndexedDB clear failed (attempt ${attempt + 1}/${retryCount + 1}):`, error);

      // If this is the last attempt, throw the error
      if (attempt === retryCount) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const userFriendlyMessage = getUserFriendlyErrorMessage(errorMessage);
        throw new Error(`Unable to clear storage: ${userFriendlyMessage}`);
      }

      // Wait before retry with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Batch read multiple keys in parallel for improved performance
 * @param keys Array of storage keys to read
 * @param options Configuration for parallelism
 * @returns Promise resolving to map of key-value pairs (null for failed reads)
 */
export async function getStorageItems(
  keys: string[],
  options: { batchSize?: number } = {}
): Promise<Record<string, string | null>> {
  const { batchSize = 10 } = options;
  const results: Record<string, string | null> = {};

  // Process keys in batches to avoid overwhelming IndexedDB
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);

    // Read batch in parallel
    const batchPromises = batch.map(async (key) => {
      try {
        const value = await getStorageItem(key);
        return { key, value };
      } catch (error) {
        logger.error(`Failed to read key "${key}" in batch:`, error);
        return { key, value: null };
      }
    });

    const batchResults = await Promise.all(batchPromises);

    // Merge results
    for (const { key, value } of batchResults) {
      results[key] = value;
    }

    // Small delay between batches to prevent overwhelming IndexedDB
    if (i + batchSize < keys.length) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  return results;
}

/**
 * Batch write multiple key-value pairs for improved performance
 * @param items Record of key-value pairs to write
 * @param options Configuration for error handling and parallelism
 * @returns Promise resolving when all writes complete
 */
export async function setStorageItems(
  items: Record<string, string>,
  options: { batchSize?: number } = {}
): Promise<void> {
  const { batchSize = 10 } = options;
  const entries = Object.entries(items);

  // Process entries in batches
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);

    // Write batch in parallel
    const batchPromises = batch.map(async ([key, value]) => {
      try {
        await setStorageItem(key, value);
        return { key, success: true };
      } catch (error) {
        logger.error(`Failed to write key "${key}" in batch:`, error);
        return { key, success: false, error };
      }
    });

    const batchResults = await Promise.all(batchPromises);

    // Check for failures
    const failures = batchResults.filter(result => !result.success);
    if (failures.length > 0) {
      const failedKeys = failures.map(f => f.key).join(', ');
      logger.warn(`Batch write had ${failures.length} failures for keys: ${failedKeys}`);
    }

    // Small delay between batches
    if (i + batchSize < entries.length) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}

/**
 * Get all storage data in parallel for bulk operations (e.g., backup/export)
 * @param options Configuration for filtering and performance
 * @returns Promise resolving to all key-value pairs
 */
export async function getAllStorageData(
  options: { keyPrefix?: string; batchSize?: number } = {}
): Promise<Record<string, string | null>> {
  const { keyPrefix, batchSize = 20 } = options;

  try {
    const adapter = await getStorageAdapter();
    const allKeys = await adapter.getKeys();

    // Filter keys if prefix specified
    const filteredKeys = keyPrefix
      ? allKeys.filter(key => key.startsWith(keyPrefix))
      : allKeys;

    logger.debug(`Reading ${filteredKeys.length} keys in parallel batches of ${batchSize}`);

    return await getStorageItems(filteredKeys, { batchSize });
  } catch (error) {
    logger.error('Failed to get all storage data:', error);
    throw new Error('Failed to retrieve storage data for bulk operation');
  }
}

/**
 * Type-safe JSON operations with validation
 */

/**
 * Get and parse JSON data with type safety
 * @param key Storage key
 * @param options Configuration for validation and default values
 * @returns Promise resolving to parsed JSON data, defaultValue on parse errors, or null
 * @throws Error if IndexedDB read fails (storage errors always throw in IndexedDB-only mode)
 */
export async function getStorageJSON<T = unknown>(
  key: string,
  options: {
    validator?: (data: unknown) => data is T;
    defaultValue?: T;
  } = {}
): Promise<T | null> {
  const { validator, defaultValue } = options;

  // getStorageItem now always throws on storage errors (IndexedDB-only mode)
  const value = await getStorageItem(key);
  if (value === null) {
    return defaultValue ?? null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (parseError) {
    // Return default on parse errors (corrupted data is recoverable)
    logger.warn(`Failed to parse JSON for key "${key}":`, parseError);
    return defaultValue ?? null;
  }

  // Type validation if validator provided
  if (validator) {
    if (validator(parsed)) {
      return parsed;
    } else {
      // Return default on validation errors (schema mismatch is recoverable)
      logger.warn(`Type validation failed for key "${key}"`);
      return defaultValue ?? null;
    }
  }

  return parsed as T;
}

/**
 * Set JSON data with type safety
 * @param key Storage key
 * @param value Value to store (will be JSON.stringify'd)
 * @param options Configuration for error handling
 * @returns Promise resolving when storage is complete
 */
export async function setStorageJSON<T>(
  key: string,
  value: T,
  options: { retryCount?: number } = {}
): Promise<void> {
  try {
    const jsonString = JSON.stringify(value);
    await setStorageItem(key, jsonString, options);
  } catch (error) {
    logger.error(`Failed to set JSON for key "${key}":`, error);
    throw new Error(`Failed to store JSON data for key "${key}"`);
  }
}

/**
 * Type guards for common data types
 */
export const typeGuards = {
  isString: (value: unknown): value is string => typeof value === 'string',
  isNumber: (value: unknown): value is number => typeof value === 'number' && !isNaN(value),
  isBoolean: (value: unknown): value is boolean => typeof value === 'boolean',
  isArray: (value: unknown): value is unknown[] => Array.isArray(value),
  isObject: (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value),

  // App-specific type guards
  isPlayer: (value: unknown): value is { id: string; name: string; jerseyNumber: string } => {
    return typeGuards.isObject(value) &&
           typeGuards.isString((value as Record<string, unknown>).id) &&
           typeGuards.isString((value as Record<string, unknown>).name) &&
           typeGuards.isString((value as Record<string, unknown>).jerseyNumber);
  },

  isGameSession: (value: unknown): value is {
    id: string;
    teamName: string;
    periods: number;
    periodDuration: number;
  } => {
    return typeGuards.isObject(value) &&
           typeGuards.isString((value as Record<string, unknown>).id) &&
           typeGuards.isString((value as Record<string, unknown>).teamName) &&
           typeGuards.isNumber((value as Record<string, unknown>).periods) &&
           typeGuards.isNumber((value as Record<string, unknown>).periodDuration);
  }
};

/**
 * Clear cached adapter to force fresh connection on next access
 * Useful for testing, error recovery, or manual refresh scenarios
 */
/**
 * Clear cached adapter with proper connection cleanup
 * Useful for testing, error recovery, or manual refresh scenarios
 */
export async function clearAdapterCacheWithCleanup(): Promise<void> {
  logger.debug('Clearing storage adapter cache with connection cleanup');

  // Close existing adapter connection if available
  if (adapterPromise) {
    try {
      const adapter = await adapterPromise;
      // Check if adapter has close method (IndexedDB connections)
      if (adapter && typeof (adapter as unknown as { close?: () => Promise<void> }).close === 'function') {
        await (adapter as unknown as { close: () => Promise<void> }).close();
        logger.debug('Closed adapter connection during cache clear');
      }
    } catch (error) {
      logger.warn('Failed to close adapter connection during cache clear', { error });
      // Continue with cleanup even if close fails
    }
  }

  // Clear cache state
  adapterPromise = null;
  adapterCreatedAt = null;
  // Also reset retry state to allow immediate retry
  adapterRetryCount = 0;
  lastFailureTime = null;
  // Mutex is self-managing, no manual reset needed
}

/**
 * Clear cached adapter to force fresh connection on next access
 * Synchronous version for backward compatibility
 * @deprecated Use clearAdapterCacheWithCleanup() for proper connection cleanup
 */
export function clearAdapterCache(): void {
  logger.debug('Manually clearing storage adapter cache (sync)');
  adapterPromise = null;
  adapterCreatedAt = null;
  // Also reset retry state to allow immediate retry
  adapterRetryCount = 0;
  lastFailureTime = null;
  // Mutex is self-managing, no manual reset needed
}

/**
 * Get current memory usage statistics for monitoring
 */
export async function getStorageMemoryStats(): Promise<{
  adapterAge: number | null;
  retryCount: number;
  hasAdapter: boolean;
  mutexStatus: string;
}> {
  return {
    adapterAge: adapterCreatedAt ? Date.now() - adapterCreatedAt : null,
    retryCount: adapterRetryCount,
    hasAdapter: adapterPromise !== null,
    mutexStatus: 'managed by MutexManager'
  };
}

/**
 * Perform periodic cleanup of module-level state
 * Call this in long-running sessions to prevent memory accumulation
 */
export async function performMemoryCleanup(): Promise<void> {
  const now = Date.now();

  // Clear expired adapter with proper lifecycle management
  if (isAdapterExpired()) {
    logger.debug('Performing memory cleanup: clearing expired adapter');
    await clearAdapterCacheWithCleanup();
  }

  // Log memory stats for monitoring
  logger.debug('Memory cleanup completed', {
    adapterAge: adapterCreatedAt ? now - adapterCreatedAt : null,
    retryCount: adapterRetryCount
  });
}

/**
 * Set up automatic memory cleanup interval
 * Returns cleanup function to stop the interval
 */
export function setupAutoMemoryCleanup(intervalMs = 5 * 60 * 1000): () => void {
  const intervalId = setInterval(async () => {
    try {
      await performMemoryCleanup();
    } catch (error) {
      logger.warn('Error during automatic memory cleanup', { error });
    }
  }, intervalMs);

  logger.debug(`Auto memory cleanup scheduled every ${intervalMs / 1000} seconds`);

  // Return cleanup function
  return () => {
    clearInterval(intervalId);
    logger.debug('Auto memory cleanup stopped');
  };
}