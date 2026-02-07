/**
 * Delete Account Edge Function
 *
 * Securely deletes a user's account from Supabase Auth.
 * This function uses the service role key (server-side only) to delete
 * the user from auth.users after verifying their identity via JWT.
 *
 * Security Model:
 * 1. Client sends their JWT in Authorization header
 * 2. Function verifies JWT using admin client to confirm user identity
 * 3. Function calls clear_all_user_data RPC using user-scoped client (JWT)
 *    - CRITICAL: RPC uses auth.uid() which requires user JWT context
 *    - Service role client would make auth.uid() return NULL
 * 4. Function deletes auth user using admin API (requires service role)
 *
 * The service role key never leaves Supabase's infrastructure.
 *
 * JWT Verification:
 * Deployed with verify_jwt=false because Supabase's gateway-level JWT check
 * is incompatible with the new asymmetric JWT Signing Keys (2025+).
 * JWT verification is handled in-function via supabaseAdmin.auth.getUser(jwt).
 *
 * @see docs/03-active-plans/supabase-implementation-guide.md
 */

/* eslint-disable no-console */
// Console logging is appropriate for Edge Functions (server-side Deno runtime)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 5; // Max 5 requests per minute per IP (stricter for destructive operation)

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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      console.error('Missing required environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client with service role key (for auth.admin operations)
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Distributed rate limiting via PostgreSQL (works across all Edge Function instances)
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'unknown';

    const { data: isAllowed, error: rateLimitError } = await supabaseAdmin.rpc('check_rate_limit', {
      p_key: `delete-acct:${clientIP}`,
      p_window_ms: RATE_LIMIT_WINDOW_MS,
      p_max_requests: RATE_LIMIT_MAX_REQUESTS,
    });

    if (rateLimitError) {
      // Fail-closed for delete-account: if rate limiting check fails, block the request.
      // Unlike verify-subscription (which has additional Google token validation),
      // delete-account has no secondary validation and must not be brute-forced.
      console.error('Rate limit check failed:', rateLimitError.message);
      return new Response(
        JSON.stringify({ error: 'Service temporarily unavailable. Please try again.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (isAllowed === false) {
      console.warn(`Rate limit exceeded for IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } }
      );
    }

    // Create user-scoped client with anon key + user's JWT
    // CRITICAL: The clear_all_user_data RPC uses auth.uid() which returns NULL
    // with service role. We need the user's JWT context for auth.uid() to work.
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      },
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
    // CRITICAL: Use user-scoped client so auth.uid() returns the correct user ID.
    // The RPC uses auth.uid() internally - service role would return NULL.
    const { error: dataDeleteError } = await supabaseUser.rpc('clear_all_user_data');

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
    // KNOWN EDGE CASE: If Step 1 succeeds but Step 2 fails, user data is deleted
    // but the auth account remains. This is acceptable — the user can retry deletion,
    // and the empty auth account poses no data or security risk.
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
