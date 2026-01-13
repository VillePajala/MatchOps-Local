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

  supabaseClient = createClient<Database>(url, anonKey, {
    auth: {
      // Persist session in localStorage
      persistSession: true,
      // Auto-refresh tokens before expiry
      autoRefreshToken: true,
      // Detect session from URL (for OAuth callbacks)
      detectSessionInUrl: true,
    },
    global: {
      // Add request headers for debugging
      headers: {
        'x-client-info': 'matchops-web',
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
 * Check if the Supabase client has been initialized.
 *
 * Useful for checking client state without triggering initialization.
 *
 * @returns True if the client has been created
 */
export function isSupabaseClientInitialized(): boolean {
  return supabaseClient !== null;
}
