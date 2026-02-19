/**
 * Shared utility for reading Supabase's cached auth session from localStorage.
 *
 * Supabase stores sessions in localStorage with key: `sb-<projectRef>-auth-token`.
 * This is an **internal implementation detail** of the Supabase JS client.
 *
 * Used by:
 * - AuthProvider: Grace period identity (userId + email) when auth init fails offline
 * - SupabaseAuthService: Full session recovery on AbortError (Chrome Mobile Android)
 *
 * FRAGILITY NOTE: If Supabase changes the key format in a future major version,
 * this silently returns null. Both callers handle null gracefully.
 *
 * UPGRADE CHECKLIST: After any @supabase/supabase-js major version bump, verify
 * the storage key format hasn't changed (check node_modules/@supabase/gotrue-js).
 */

import * as Sentry from '@sentry/nextjs';
import logger from '@/utils/logger';

/**
 * Raw cached session data from Supabase's localStorage.
 * Fields are optional because we're parsing an internal format that may change.
 */
export interface CachedSupabaseSession {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number; // Unix timestamp in seconds
  user?: {
    id?: string;
    email?: string;
  };
}

/**
 * Read and parse Supabase's cached session from localStorage.
 *
 * Handles both storage formats:
 * - Direct: `{ access_token, user, ... }`
 * - Wrapped: `{ currentSession: { access_token, user, ... } }`
 *
 * @returns Parsed session or null if not found/unparseable
 */
export function readCachedSupabaseSession(): CachedSupabaseSession | null {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // eslint-disable-next-line no-restricted-globals -- Reading Supabase's internal auth token storage
    if (!supabaseUrl || typeof localStorage === 'undefined') return null;
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
    const storageKey = `sb-${projectRef}-auth-token`;
    // eslint-disable-next-line no-restricted-globals -- Reading Supabase's internal auth token storage
    const storedData = localStorage.getItem(storageKey);
    if (!storedData) return null;
    const parsed = JSON.parse(storedData);
    // Supabase stores session in different formats depending on version.
    // Check for both direct session and nested currentSession.
    const session = parsed?.currentSession || parsed;
    return session ?? null;
  } catch (error) {
    // Corrupted auth data in localStorage — surface at warn level for production observability
    logger.warn('[cachedSession] Failed to parse cached session from localStorage:', error);
    return null;
  }
}

/**
 * Get cached user identity (userId + email) for grace period display.
 * Rejects expired tokens — stale sessions don't justify grace period access.
 *
 * @returns User identity or null if no valid cached session
 */
export function getCachedUserIdentity(): { userId: string; email: string } | null {
  const session = readCachedSupabaseSession();
  if (!session) return null;

  // Reject expired tokens
  const expiresAt = session.expires_at;
  if (typeof expiresAt === 'number') {
    // Plausibility: reject values that look like milliseconds (> 1e12) or negative.
    // Supabase stores expires_at as Unix seconds. A value > 1e12 would be year 33658+
    // in seconds but is a plausible near-future timestamp in milliseconds.
    if (expiresAt > 1e12 || expiresAt < 0) {
      logger.debug('[cachedSession] expires_at looks implausible (ms? negative?):', expiresAt);
      return null;
    }
    if (expiresAt < Date.now() / 1000) {
      return null; // Expired
    }
  }
  // If expires_at is missing/non-numeric, proceed — better to grant grace period
  // access than lock user out. The token was written by Supabase and will be
  // re-validated when connectivity returns.

  const userId = session.user?.id;
  const email = session.user?.email;
  if (typeof userId === 'string' && userId.length > 0) {
    return { userId, email: typeof email === 'string' ? email : '' };
  }

  // Data found in localStorage but no valid userId — may indicate Supabase changed
  // the storage key format. Log breadcrumb for production observability.
  try {
    Sentry.addBreadcrumb({
      category: 'auth',
      message: 'Cached session parsed but no valid userId found',
      level: 'warning',
      data: { hasUser: !!session.user },
    });
  } catch (sentryError) {
    logger.debug('[cachedSession] Sentry breadcrumb failed:', sentryError);
  }
  return null;
}

/**
 * Get cached full session for API recovery (AbortError fallback).
 * Does NOT check expiry — the Supabase client will handle token refresh.
 *
 * @returns Session with access_token and user, or null
 */
export function getCachedFullSession(): CachedSupabaseSession | null {
  const session = readCachedSupabaseSession();
  if (!session) return null;

  if (session.access_token && session.refresh_token && session.user) {
    return session;
  }

  logger.debug('[cachedSession] Cached session found but missing required fields (access_token, refresh_token, or user)');
  return null;
}
