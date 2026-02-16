/**
 * Supabase Client Singleton
 *
 * Provides a single Supabase client instance for cloud mode operations.
 * Uses lazy initialization to avoid bundling Supabase code in local mode.
 *
 * IMPORTANT: This module must only be imported dynamically in cloud mode.
 * Import like: const { getSupabaseClient } = await import('@/datastore/supabase');
 * This ensures Supabase is not bundled in local mode builds via tree-shaking.
 *
 * @module datastore/supabase/client
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import logger from '@/utils/logger';

let supabaseClient: SupabaseClient<Database> | null = null;

/**
 * Get the Supabase client singleton.
 *
 * Creates a single client instance that's reused across the app.
 * Includes automatic session management and token refresh.
 *
 * @throws {Error} If NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY are missing
 * @returns The Supabase client instance
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (supabaseClient) {
    return supabaseClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.'
    );
  }

  // Default request timeout (30s) prevents indefinite hangs on slow/unreachable servers
  const REQUEST_TIMEOUT_MS = 30000;

  supabaseClient = createClient<Database>(url, anonKey, {
    auth: {
      // Persist session in localStorage
      persistSession: true,
      // Auto-refresh tokens before expiry
      autoRefreshToken: true,
      // No OAuth or magic links — email/password + OTP only, no URL-based tokens
      detectSessionInUrl: false,
    },
    global: {
      // Add request headers for debugging
      headers: {
        'x-client-info': 'matchops-web',
      },
      // Custom fetch with timeout to prevent requests from hanging indefinitely
      fetch: (input, init) => {
        // If caller already provided a signal, respect it and skip our timeout
        // (the caller is managing their own abort lifecycle)
        if (init?.signal) {
          return fetch(input, init);
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
      },
    },
    // Realtime configured but not used (rate-limited to 2 events/sec if enabled later)
    realtime: {
      params: {
        eventsPerSecond: 2,
      },
    },
  });

  logger.info('[Supabase] Client initialized');
  return supabaseClient;
}

/**
 * Reset the Supabase client singleton.
 *
 * Used for testing to ensure clean state between tests.
 * Should NOT be called in production code.
 */
export function resetSupabaseClient(): void {
  supabaseClient = null;
}

/**
 * Clean up the Supabase client for DataStore user switches.
 *
 * This function cleans up the Supabase client's realtime resources when switching
 * between users or DataStore instances:
 * 1. Removes all realtime subscriptions
 *
 * IMPORTANT: This does NOT reset the client singleton or sign out the user!
 * - The user's auth session persists across DataStore switches
 * - The client singleton is preserved to avoid session loading delays
 * - Sign out only happens when the user explicitly calls signOut() via AuthProvider
 *
 * Call this before switching users/modes to prevent:
 * - Memory leaks from realtime channels
 * - Stale subscriptions
 *
 * @returns Promise that resolves when cleanup is complete
 */
export async function cleanupSupabaseClient(): Promise<void> {
  if (!supabaseClient) {
    return;
  }

  try {
    // Remove all realtime subscriptions
    // NOTE: We do NOT sign out here - user session must persist across DataStore switches!
    // NOTE: We do NOT reset the singleton - this preserves the authenticated session
    //       and avoids delays when the next request needs to load session from localStorage.
    await supabaseClient.removeAllChannels();

    logger.info('[Supabase] Client cleaned up (session preserved, singleton kept)');
  } catch (err) {
    // Log but don't throw - cleanup is best-effort
    logger.warn('[Supabase] Error during client cleanup:', err);
  }
  // NOTE: We intentionally do NOT set supabaseClient = null here.
  // Resetting the singleton would cause the next getSupabaseClient() call to create
  // a new client, which needs time to load the session from localStorage. This causes
  // race conditions where requests are made before the session is ready (406 errors).
}

/**
 * Check if the Supabase client has been initialized.
 *
 * Useful for checking client state without triggering initialization.
 *
 * @returns True if the client has been created
 */
export function isSupabaseClientInitialized(): boolean {
  return supabaseClient !== null;
}
