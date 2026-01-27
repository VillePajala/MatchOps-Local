/**
 * Backend Configuration
 *
 * Controls whether the app uses local (IndexedDB) or cloud (Supabase) storage.
 * Part of Phase 4: Supabase Cloud Backend implementation.
 *
 * @see docs/03-active-plans/supabase-implementation-guide.md
 * @updated 2026-01-27 - Cache bust v3 for Site URL trailing space fix
 */

import logger from '@/utils/logger';

// Safe logger wrapper for test environments
const log = {
  debug: (msg: string, ...data: unknown[]) => logger?.debug?.(msg, ...data),
  info: (msg: string) => logger?.info?.(msg),
  warn: (msg: string) => logger?.warn?.(msg),
};

// ============================================================================
// TYPES
// ============================================================================

export type BackendMode = 'local' | 'cloud';

export interface BackendConfig {
  mode: BackendMode;
  isCloudAvailable: boolean;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
}

/**
 * Result of a mode switch operation.
 * Provides details about why it failed if unsuccessful.
 */
export interface ModeSwitchResult {
  /** Whether the mode switch succeeded */
  success: boolean;
  /** Reason for failure (only set if success is false) */
  reason?: 'server_side' | 'storage_write_failed';
  /** Human-readable error message */
  message?: string;
}

// ============================================================================
// ENVIRONMENT VARIABLE DETECTION
// ============================================================================

/**
 * Check if Supabase environment variables are configured.
 *
 * Required vars:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * @returns true if both required Supabase env vars are present
 */
export function isCloudAvailable(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && key);
}

/**
 * Get Supabase URL from environment.
 *
 * @returns Supabase project URL or null if not configured
 */
export function getSupabaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || null;
}

/**
 * Get Supabase anon key from environment.
 *
 * @returns Supabase anonymous key or null if not configured
 */
export function getSupabaseAnonKey(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null;
}

// ============================================================================
// MODE MANAGEMENT
// ============================================================================

// Runtime mode override (localStorage key)
// NOTE: Using localStorage directly here is intentional and necessary because:
// 1. Backend mode must be determined synchronously at startup before DataStore is available
// 2. This is a simple UI preference, not application data that needs IndexedDB
// 3. The IndexedDB-based storage helpers require async access which isn't suitable here
/* eslint-disable no-restricted-globals */
const MODE_STORAGE_KEY = 'matchops_backend_mode';

/**
 * Safe localStorage access helpers.
 * Returns null/void on any error (SecurityError when storage blocked by policy, etc.)
 * This ensures the app falls back gracefully to local mode instead of crashing.
 */
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    log.warn('[backendConfig] localStorage access denied - treating as no override');
    return null;
  }
}

function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    log.warn('[backendConfig] localStorage write denied');
    return false;
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    log.warn('[backendConfig] localStorage remove denied');
  }
}

/**
 * Get the configured backend mode.
 *
 * Priority (highest to lowest):
 * 1. Runtime override (localStorage) - allows user to switch modes
 * 2. Environment variable (NEXT_PUBLIC_BACKEND_MODE)
 * 3. Default: 'local'
 *
 * If cloud mode is requested but Supabase is not configured,
 * falls back to local mode with a warning.
 *
 * @returns Current backend mode ('local' or 'cloud')
 */
export function getBackendMode(): BackendMode {
  // Check runtime override first (client-side only)
  if (typeof window !== 'undefined') {
    const runtimeMode = safeGetItem(MODE_STORAGE_KEY);
    if (runtimeMode === 'local' || runtimeMode === 'cloud') {
      // Validate cloud mode is actually available
      if (runtimeMode === 'cloud' && !isCloudAvailable()) {
        log.warn(
          '[backendConfig] Cloud mode requested via runtime override but Supabase not configured - falling back to local'
        );
        return 'local';
      }
      return runtimeMode;
    }
  }

  // Check environment variable
  const envMode = process.env.NEXT_PUBLIC_BACKEND_MODE;
  if (envMode === 'cloud') {
    if (!isCloudAvailable()) {
      log.warn(
        '[backendConfig] Cloud mode requested via env but Supabase not configured - falling back to local'
      );
      return 'local';
    }
    return 'cloud';
  }

  // Default to local mode
  return 'local';
}

/**
 * Enable cloud mode at runtime.
 *
 * Stores preference in localStorage. Takes effect on next factory initialization.
 * Returns false if Supabase is not configured.
 *
 * @returns true if cloud mode was enabled, false if Supabase not available
 */
export function enableCloudMode(): boolean {
  if (!isCloudAvailable()) {
    log.warn('[backendConfig] Cannot enable cloud mode - Supabase not configured');
    return false;
  }

  if (typeof window !== 'undefined') {
    if (!safeSetItem(MODE_STORAGE_KEY, 'cloud')) {
      return false;
    }
    log.info('[backendConfig] Cloud mode enabled - will take effect on next initialization');
  }
  return true;
}

/**
 * Disable cloud mode at runtime (switch to local mode).
 *
 * Stores preference in localStorage. Takes effect on next factory initialization.
 *
 * @returns ModeSwitchResult with success status and reason if failed
 */
export function disableCloudMode(): ModeSwitchResult {
  if (typeof window === 'undefined') {
    return {
      success: false,
      reason: 'server_side',
      message: 'Cannot switch mode on server - localStorage not available',
    };
  }

  if (!safeSetItem(MODE_STORAGE_KEY, 'local')) {
    return {
      success: false,
      reason: 'storage_write_failed',
      message: 'Failed to save mode preference. Your browser may be in private mode or have storage restrictions.',
    };
  }

  log.info('[backendConfig] Local mode enabled - will take effect on next initialization');
  return { success: true };
}

/**
 * Clear runtime mode override.
 *
 * After calling this, getBackendMode() will use environment variable or default.
 */
export function clearModeOverride(): void {
  if (typeof window !== 'undefined') {
    safeRemoveItem(MODE_STORAGE_KEY);
    log.info('[backendConfig] Mode override cleared - using environment/default');
  }
}

/**
 * Check if there's a runtime mode override set.
 *
 * @returns true if user has explicitly set a mode preference
 */
export function hasModeOverride(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const mode = safeGetItem(MODE_STORAGE_KEY);
  return mode === 'local' || mode === 'cloud';
}
// ============================================================================
// MIGRATION COMPLETED FLAG
// ============================================================================

/**
 * Storage key prefix for migration completed flag.
 * Keyed by userId to support multiple users on same device.
 */
const MIGRATION_COMPLETED_PREFIX = 'matchops_cloud_migration_completed_';

/**
 * Check if migration has been completed for a specific user.
 *
 * This flag prevents the MigrationWizard from appearing on every login.
 * It's stored in localStorage (not IndexedDB) because:
 * - Checked BEFORE DataStore is initialized
 * - Per-device (migration is device-specific)
 * - Per-user (keyed by userId)
 * - Survives mode switches
 *
 * @param userId - The authenticated user's ID
 * @returns true if migration has been completed for this user on this device
 */
export function hasMigrationCompleted(userId: string): boolean {
  if (typeof window === 'undefined' || !userId) {
    return false;
  }
  const key = `${MIGRATION_COMPLETED_PREFIX}${userId}`;
  return safeGetItem(key) === 'true';
}

/**
 * Mark migration as completed for a specific user.
 *
 * Called after:
 * - Successful migration from local to cloud
 * - User skips migration (don't ask again)
 * - No local data found (nothing to migrate)
 *
 * @param userId - The authenticated user's ID
 * @returns true if the flag was set successfully
 */
export function setMigrationCompleted(userId: string): boolean {
  if (typeof window === 'undefined' || !userId) {
    return false;
  }
  const key = `${MIGRATION_COMPLETED_PREFIX}${userId}`;
  const success = safeSetItem(key, 'true');
  if (success) {
    log.info(`[backendConfig] Migration marked as completed for user ${userId.slice(0, 8)}...`);
  }
  return success;
}

/**
 * Clear migration completed flag for a specific user.
 *
 * Useful for:
 * - Testing migration flow
 * - Allowing user to re-migrate if needed
 *
 * @param userId - The authenticated user's ID
 */
export function clearMigrationCompleted(userId: string): void {
  if (typeof window === 'undefined' || !userId) {
    return;
  }
  const key = `${MIGRATION_COMPLETED_PREFIX}${userId}`;
  safeRemoveItem(key);
  log.info(`[backendConfig] Migration completed flag cleared for user ${userId.slice(0, 8)}...`);
}
// ============================================================================
// CLOUD ACCOUNT INFO
// ============================================================================

/**
 * Storage key for cloud account information.
 * Stores minimal info about the user's cloud account for:
 * - Showing cloud account status in settings (even when in local mode)
 * - Enabling "Delete Cloud Data" from local mode
 * - Displaying last sync time
 */
const CLOUD_ACCOUNT_KEY = 'matchops_cloud_account';

/**
 * Cloud account information stored locally.
 * This persists even after switching to local mode.
 */
export interface CloudAccountInfo {
  /** User's email from Supabase auth */
  email: string;
  /** User's UUID from Supabase */
  userId: string;
  /** ISO timestamp of last successful sync/migration */
  lastSyncedAt: string;
  /** Whether user has data in cloud (set after migration/sync) */
  hasCloudData: boolean;
}

/**
 * Get stored cloud account information.
 *
 * Returns info about the user's cloud account even when in local mode.
 * Used to show "You have cloud data" in settings.
 *
 * @returns CloudAccountInfo or null if never connected to cloud
 */
export function getCloudAccountInfo(): CloudAccountInfo | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const stored = safeGetItem(CLOUD_ACCOUNT_KEY);
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as CloudAccountInfo;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    // Log preview of malformed data for debugging (safe to log - not sensitive auth data)
    const preview = stored.length > 100 ? stored.substring(0, 100) + '...' : stored;
    log.warn(`[backendConfig] Failed to parse cloud account info: ${errorMsg} (length: ${stored.length}, preview: ${preview})`);
    return null;
  }
}

/**
 * Store cloud account information.
 *
 * Call this after:
 * - Successful authentication
 * - Successful migration
 * - Successful sync operations
 *
 * @param info - Cloud account information to store
 * @returns true if stored successfully
 */
export function setCloudAccountInfo(info: CloudAccountInfo): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const success = safeSetItem(CLOUD_ACCOUNT_KEY, JSON.stringify(info));
  if (success) {
    log.info(`[backendConfig] Cloud account info saved for ${info.email}`);
  }
  return success;
}

/**
 * Update cloud account info partially.
 * Preserves existing fields not provided in the update.
 *
 * @param update - Partial cloud account info to update
 * @returns true if updated successfully
 */
export function updateCloudAccountInfo(update: Partial<CloudAccountInfo>): boolean {
  const existing = getCloudAccountInfo();
  if (!existing) {
    log.warn('[backendConfig] Cannot update cloud account info: no existing info found');
    return false;
  }
  return setCloudAccountInfo({ ...existing, ...update });
}

/**
 * Clear stored cloud account information.
 *
 * Call this after:
 * - User deletes all cloud data
 * - User explicitly signs out from cloud
 */
export function clearCloudAccountInfo(): void {
  if (typeof window === 'undefined') {
    return;
  }
  safeRemoveItem(CLOUD_ACCOUNT_KEY);
  log.info('[backendConfig] Cloud account info cleared');
}

// ============================================================================
// PENDING POST-LOGIN CHECK FLAG
// ============================================================================

/**
 * Storage key for pending post-login premium check.
 * Set when user initiates cloud sign-in from WelcomeScreen.
 * Cleared after post-login premium check completes.
 *
 * This flag persists through the page reload that happens when enabling cloud mode,
 * allowing us to gate cloud access AFTER authentication succeeds.
 */
const PENDING_POST_LOGIN_CHECK_KEY = 'matchops_pending_post_login_check';

/**
 * Check if there's a pending post-login premium check.
 *
 * This is set when user clicks "Sign in to cloud" on WelcomeScreen
 * and cleared after the post-login premium check completes (or user cancels).
 *
 * @returns true if a post-login premium check is pending
 */
export function hasPendingPostLoginCheck(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const value = safeGetItem(PENDING_POST_LOGIN_CHECK_KEY);
  const result = value === 'true';
  log.debug('[backendConfig] hasPendingPostLoginCheck:', { value, result });
  return result;
}

/**
 * Set the pending post-login premium check flag.
 *
 * Called when user initiates cloud sign-in from WelcomeScreen,
 * before enabling cloud mode and reloading.
 *
 * @returns true if flag was set successfully
 */
export function setPendingPostLoginCheck(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const success = safeSetItem(PENDING_POST_LOGIN_CHECK_KEY, 'true');
  if (success) {
    log.info('[backendConfig] Pending post-login check flag set');
  }
  return success;
}

/**
 * Clear the pending post-login premium check flag.
 *
 * Called after:
 * - Post-login premium check completes (user has subscription)
 * - User successfully subscribes via upgrade modal
 * - User cancels and returns to local mode
 */
export function clearPendingPostLoginCheck(): void {
  if (typeof window === 'undefined') {
    return;
  }
  safeRemoveItem(PENDING_POST_LOGIN_CHECK_KEY);
  log.info('[backendConfig] Pending post-login check flag cleared');
}

// ============================================================================
// WELCOME SCREEN FLAG
// ============================================================================

/**
 * Storage key for welcome screen completion flag.
 * When true, user has completed the first-install welcome screen.
 */
const WELCOME_SEEN_KEY = 'matchops_welcome_seen';

/**
 * Check if user has seen/completed the welcome screen.
 *
 * The welcome screen shows on first install and lets user choose:
 * - Start Fresh (local mode)
 * - Sign In to Cloud
 * - Import Backup
 *
 * @returns true if welcome screen has been completed
 */
export function hasSeenWelcome(): boolean {
  if (typeof window === 'undefined') {
    // SSR: skip welcome screen
    return true;
  }
  return safeGetItem(WELCOME_SEEN_KEY) === 'true';
}

/**
 * Mark welcome screen as seen/completed.
 *
 * Called after user makes any choice on the welcome screen:
 * - Starts in local mode
 * - Signs in to cloud
 * - Successfully imports backup
 *
 * @returns true if flag was set successfully
 */
export function setWelcomeSeen(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const success = safeSetItem(WELCOME_SEEN_KEY, 'true');
  if (success) {
    log.info('[backendConfig] Welcome screen marked as seen');
  }
  return success;
}

/**
 * Reset welcome screen flag (for testing).
 *
 * After calling this, the welcome screen will show again on next app load.
 */
export function clearWelcomeSeen(): void {
  if (typeof window === 'undefined') {
    return;
  }
  safeRemoveItem(WELCOME_SEEN_KEY);
  log.info('[backendConfig] Welcome screen flag cleared');
}
/* eslint-enable no-restricted-globals */

// ============================================================================
// FULL CONFIG
// ============================================================================

/**
 * Get the complete backend configuration.
 *
 * @returns Full backend config including mode and Supabase settings
 */
export function getBackendConfig(): BackendConfig {
  return {
    mode: getBackendMode(),
    isCloudAvailable: isCloudAvailable(),
    supabaseUrl: getSupabaseUrl(),
    supabaseAnonKey: getSupabaseAnonKey(),
  };
}
