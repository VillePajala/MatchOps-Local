/**
 * Supabase DataStore Module
 *
 * Barrel export for Supabase-related functionality.
 * Use lazy imports in application code to avoid bundling
 * Supabase dependencies in local mode.
 *
 * @module datastore/supabase
 */

export {
  getSupabaseClient,
  resetSupabaseClient,
  isSupabaseClientInitialized,
} from './client';
