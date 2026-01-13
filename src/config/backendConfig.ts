/**
 * Backend Configuration
 *
 * Controls whether the app uses local (IndexedDB) or cloud (Supabase) storage.
 * Part of Phase 4: Supabase Cloud Backend implementation.
 *
 * @see docs/03-active-plans/supabase-implementation-guide.md
 */

import logger from '@/utils/logger';

// Safe logger wrapper for test environments
const log = {
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
 */
export function disableCloudMode(): void {
  if (typeof window !== 'undefined') {
    if (safeSetItem(MODE_STORAGE_KEY, 'local')) {
      log.info('[backendConfig] Local mode enabled - will take effect on next initialization');
    }
  }
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
