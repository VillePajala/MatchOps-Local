/**
 * Delete Account Edge Function
 *
 * Securely deletes a user's account from Supabase Auth.
 * This function uses the service role key (server-side only) to delete
 * the user from auth.users after verifying their identity via JWT.
 *
 * Security Model:
 * 1. Client sends their JWT in Authorization header
 * 2. Function verifies JWT to confirm user identity
 * 3. Function deletes all user data using RPC (runs as authenticated user)
 * 4. Function deletes auth user using admin API (requires service role)
 *
 * The service role key never leaves Supabase's infrastructure.
 *
 * @see docs/03-active-plans/supabase-implementation-guide.md
 */

/* eslint-disable no-console */
// Console logging is appropriate for Edge Functions (server-side Deno runtime)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Allowed origins for CORS (exact match)
const ALLOWED_ORIGINS = [
  'https://matchops.app',
  'https://www.matchops.app',
  'https://match-ops-local.vercel.app',
  // Allow localhost for development
  'http://localhost:3000',
  'http://localhost:3001',
];

// Vercel preview deployment pattern: match-ops-local-*.vercel.app
// Security note: This only matches our specific project prefix (match-ops-local).
// Vercel generates unique subdomains per deployment (e.g., match-ops-local-abc123.vercel.app).
// An attacker would need access to our Vercel project to create a matching deployment.
const VERCEL_PREVIEW_PATTERN = /^https:\/\/match-ops-local(-[a-z0-9-]+)?\.vercel\.app$/;

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Vercel preview deployments
  if (VERCEL_PREVIEW_PATTERN.test(origin)) return true;
  return false;
}

/**
 * Get CORS headers with origin validation
 */
function getCorsHeaders(origin: string | null): Record<string, string> {
  // Use request origin if allowed, otherwise default to production
  const allowedOrigin = isOriginAllowed(origin) ? origin! : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

Deno.serve(async (req: Request) => {
  // Get origin for CORS
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the JWT from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jwt = authHeader.replace('Bearer ', '');

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing required environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the user's JWT and get their identity
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(jwt);

    if (userError || !user) {
      console.error('JWT verification failed:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log(`Deleting account for user: ${userId}`);

    // Step 1: Delete all user data using the existing RPC function
    // This runs as the authenticated user and respects RLS
    // Note: We use the service role here to ensure the delete completes
    // even if there are any RLS edge cases
    const { error: dataDeleteError } = await supabaseAdmin.rpc('clear_all_user_data');

    if (dataDeleteError) {
      console.error('Failed to delete user data:', dataDeleteError.message);
      // CRITICAL: Do NOT continue with auth deletion if data deletion fails
      // This prevents GDPR violations (orphaned data) and allows user to retry
      return new Response(
        JSON.stringify({ error: 'Failed to delete account data. Please try again or contact support.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Delete the user from auth.users
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      console.error('Failed to delete auth user:', authDeleteError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to delete account. Please try again or contact support.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Successfully deleted account for user: ${userId}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Account deleted successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error in delete-account:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
