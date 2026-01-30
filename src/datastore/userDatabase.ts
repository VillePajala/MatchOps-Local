/**
 * User-Scoped Database Naming
 *
 * Provides functions for generating user-specific IndexedDB database names.
 * This enables complete data isolation between users in the same browser.
 *
 * Database naming convention:
 * - Legacy (anonymous): `MatchOpsLocal` (single global database)
 * - User-scoped: `matchops_user_{userId}` (per-user database)
 *
 * ## Migration Path (Steps 7-11 of plan)
 *
 * 1. Anonymous user has data in `MatchOpsLocal` (legacy)
 * 2. User signs in → `getDataStore(userId)` creates `matchops_user_{userId}`
 * 3. App detects legacy data via `legacyDatabaseExists()` and offers migration
 * 4. Copy data from `MatchOpsLocal` to `matchops_user_{userId}`
 * 5. Delete `MatchOpsLocal` after successful migration
 * 6. User signs out → `getDataStore()` falls back to `MatchOpsLocal`
 *
 * ## Implementation Status
 *
 * This module implements Steps 1-4 of the plan (storage layer).
 * Steps 5-6 (updating callers to pass userId) are in a separate PR.
 * Until callers are updated, all users share the legacy database.
 *
 * @see docs/03-active-plans/user-scoped-storage-plan-v2.md
 */

import logger from '@/utils/logger';

/**
 * Default database name for legacy/anonymous mode.
 * Used when no user is authenticated (local-only mode without account).
 */
export const LEGACY_DATABASE_NAME = 'MatchOpsLocal';

/**
 * Prefix for user-scoped databases.
 * Full name format: `matchops_user_{userId}`
 */
const USER_DATABASE_PREFIX = 'matchops_user_';

/**
 * Maximum allowed length for userId.
 * Supabase UUIDs are 36 characters (e.g., 'f47ac10b-58cc-4372-a567-0e02b2c3d479').
 * We use 255 to allow for future flexibility while preventing DoS attacks
 * from extremely long strings that could cause memory issues or exceed
 * IndexedDB database name limits.
 */
const MAX_USER_ID_LENGTH = 255;

/**
 * Get the database name for a specific user.
 *
 * IMPORTANT: userId is expected to be a UUID from Supabase Auth (e.g., 'f47ac10b-58cc-4372-a567-0e02b2c3d479').
 * Supabase UUIDs are safe for database names (alphanumeric + hyphens only).
 * Do NOT pass user-controlled input directly - always use the authenticated user's ID from Supabase.
 *
 * @param userId - The authenticated user's ID (UUID from Supabase Auth)
 * @returns Database name in format `matchops_user_{userId}`
 * @throws {Error} If userId is empty or contains invalid characters
 *
 * @example
 * ```typescript
 * const dbName = getUserDatabaseName('f47ac10b-58cc-4372-a567-0e02b2c3d479');
 * // Returns: 'matchops_user_f47ac10b-58cc-4372-a567-0e02b2c3d479'
 * ```
 */
export function getUserDatabaseName(userId: string): string {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required and must be a non-empty string');
  }

  const trimmedId = userId.trim();
  if (trimmedId.length === 0) {
    throw new Error('userId cannot be empty or whitespace');
  }

  // Security: Prevent DoS attacks from extremely long userIds
  // that could cause memory issues or exceed IndexedDB limits
  if (trimmedId.length > MAX_USER_ID_LENGTH) {
    throw new Error(`userId exceeds maximum length of ${MAX_USER_ID_LENGTH} characters`);
  }

  // Validate userId format (alphanumeric, hyphens, underscores only)
  // Supabase UUIDs match this pattern. This validation prevents:
  // 1. Path traversal attacks (no slashes, dots, etc.)
  // 2. Database name injection
  // 3. Reserved/confusing names (validation is sufficient since UUIDs are opaque)
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmedId)) {
    throw new Error('userId contains invalid characters. Only alphanumeric characters, hyphens, and underscores are allowed.');
  }

  return `${USER_DATABASE_PREFIX}${trimmedId}`;
}

/**
 * Check if a database name is user-scoped (vs legacy).
 *
 * @param databaseName - The database name to check
 * @returns true if the database is user-scoped
 */
export function isUserScopedDatabase(databaseName: string): boolean {
  return databaseName.startsWith(USER_DATABASE_PREFIX);
}

/**
 * Extract userId from a user-scoped database name.
 *
 * @param databaseName - The database name
 * @returns The userId, or null if not a user-scoped database
 */
export function extractUserIdFromDatabaseName(databaseName: string): string | null {
  if (!isUserScopedDatabase(databaseName)) {
    return null;
  }
  return databaseName.slice(USER_DATABASE_PREFIX.length);
}

/** Timeout for legacy database check (5 seconds) */
const LEGACY_DB_CHECK_TIMEOUT_MS = 5000;

/**
 * Check if the legacy database exists.
 * Used during migration to detect if there's data to migrate.
 *
 * ## Timing Consideration
 *
 * This function uses a 5-second timeout. Response times vary:
 * - Fast response: database exists (or doesn't, from onupgradeneeded)
 * - Timeout: IndexedDB unresponsive (returns false)
 *
 * This timing variance is acceptable because:
 * 1. This is for migration UX, not security-critical operations
 * 2. IndexedDB databases can already be enumerated via browser APIs
 * 3. Knowing whether a legacy database exists reveals no sensitive data
 *
 * @returns Promise resolving to true if legacy database exists
 */
export async function legacyDatabaseExists(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return false;
  }

  return new Promise((resolve) => {
    let resolved = false;
    let request: IDBOpenDBRequest | null = null;

    // Timeout to prevent hanging if IndexedDB is unresponsive
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        logger.warn('[userDatabase] legacyDatabaseExists timed out after 5 seconds');
        resolve(false);
      }
    }, LEGACY_DB_CHECK_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeoutId);
    };

    try {
      request = window.indexedDB.open(LEGACY_DATABASE_NAME);
      let existed = true;

      request.onupgradeneeded = () => {
        // Database didn't exist, was just created
        existed = false;
      };

      request.onsuccess = () => {
        if (resolved) return;
        resolved = true;
        cleanup();

        try {
          request!.result.close();
          if (!existed) {
            // Clean up the database we just created
            window.indexedDB.deleteDatabase(LEGACY_DATABASE_NAME);
          }
        } catch (closeError) {
          logger.warn('[userDatabase] Error closing legacy database check', closeError);
        }
        resolve(existed);
      };

      request.onerror = (event) => {
        if (resolved) return;
        resolved = true;
        cleanup();

        const error = (event.target as IDBOpenDBRequest)?.error;
        logger.warn('[userDatabase] Error checking legacy database existence', error);
        resolve(false);
      };
    } catch (error) {
      if (!resolved) {
        resolved = true;
        cleanup();
        logger.warn('[userDatabase] Exception checking legacy database existence', error);
        resolve(false);
      }
    }
  });
}
