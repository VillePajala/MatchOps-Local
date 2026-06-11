/**
 * Delete Account Edge Function — entrypoint
 *
 * Wires the real Supabase clients and environment into the handler and
 * starts the server. All request logic lives in handler.ts so unit tests
 * can exercise the actual handler with injected mock clients.
 *
 * JWT Verification:
 * Deployed with verify_jwt=false because Supabase's gateway-level JWT check
 * is incompatible with the new asymmetric JWT Signing Keys (2025+).
 * JWT verification is handled in-handler via supabaseAdmin.auth.getUser(jwt).
 *
 * @see handler.ts for the security model
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHandler, type AdminClient, type UserClient } from './handler.ts';

Deno.serve(createHandler({
  getEnv: (key) => Deno.env.get(key),
  createAdminClient: (url, serviceRoleKey) =>
    createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      // Structural cast: the handler only uses auth.getUser, auth.admin.deleteUser
      // and awaited rpc(), all of which supabase-js provides.
    }) as unknown as AdminClient,
  createUserClient: (url, anonKey, jwt) =>
    createClient(url, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }) as unknown as UserClient,
}));
