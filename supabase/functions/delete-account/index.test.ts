// @ts-nocheck - This is a Deno file, not Node.js. Run with: deno test
/**
 * Deno tests for delete-account Edge Function
 *
 * Run with: deno test --allow-env index.test.ts
 *
 * Tests exercise the REAL handler from handler.ts (via createHandler with
 * injected mock Supabase clients) and the REAL CORS module from _shared/cors.ts.
 * No logic is re-implemented here, so handler changes cannot drift past these
 * tests unnoticed.
 *
 * @critical - Security-critical function: account deletion
 */

import {
  assertEquals,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';

import {
  createHandler,
  RATE_LIMIT_MAX_REQUESTS,
  type Deps,
} from './handler.ts';
import { isOriginAllowed } from '../_shared/cors.ts';

// =============================================================================
// Mock Infrastructure
// =============================================================================

interface MockConfig {
  /** auth.getUser result: user id, or null for "no user" */
  userId?: string | null;
  /** auth.getUser error message */
  authError?: string | null;
  /** clear_all_user_data RPC error message */
  rpcError?: string | null;
  /** auth.admin.deleteUser error message */
  deleteUserError?: string | null;
  /** check_rate_limit RPC result (true = allowed, false = limited) */
  rateLimitAllowed?: boolean;
  /** check_rate_limit RPC error message (triggers fail-closed path) */
  rateLimitError?: string | null;
  /** Simulate missing environment variables */
  missingEnv?: boolean;
}

/** Records the order of side-effecting operations for invariant tests */
let operationLog: string[] = [];

function createMockDeps(config: MockConfig = {}): Deps {
  const {
    userId = 'user-123',
    authError = null,
    rpcError = null,
    deleteUserError = null,
    rateLimitAllowed = true,
    rateLimitError = null,
    missingEnv = false,
  } = config;

  operationLog = [];

  return {
    getEnv: (key: string) => {
      if (missingEnv) return undefined;
      const env: Record<string, string> = {
        SUPABASE_URL: 'http://localhost:54321',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        SUPABASE_ANON_KEY: 'test-anon-key',
      };
      return env[key];
    },
    createAdminClient: () => ({
      auth: {
        getUser: async () => {
          if (authError) {
            return { data: { user: null }, error: { message: authError } };
          }
          if (!userId) {
            return { data: { user: null }, error: null };
          }
          return { data: { user: { id: userId } }, error: null };
        },
        admin: {
          deleteUser: async () => {
            operationLog.push('auth:deleteUser');
            if (deleteUserError) {
              return { error: { message: deleteUserError } };
            }
            return { error: null };
          },
        },
      },
      rpc: async (name: string) => {
        if (name === 'check_rate_limit') {
          if (rateLimitError) {
            return { data: null, error: { message: rateLimitError } };
          }
          return { data: rateLimitAllowed, error: null };
        }
        return { data: null, error: { message: `Unexpected admin RPC: ${name}` } };
      },
    }),
    createUserClient: () => ({
      rpc: async (name: string) => {
        operationLog.push(`rpc:${name}`);
        if (rpcError) {
          return { error: { message: rpcError } };
        }
        return { error: null };
      },
    }),
  };
}

function createMockRequest(
  options: {
    method?: string;
    origin?: string;
    authorization?: string;
    ip?: string;
  } = {}
): Request {
  const { method = 'POST', origin, authorization, ip } = options;
  const headers = new Headers();
  if (origin) headers.set('Origin', origin);
  if (authorization) headers.set('Authorization', authorization);
  if (ip) headers.set('x-forwarded-for', ip);
  headers.set('Content-Type', 'application/json');

  return new Request('http://localhost:54321/functions/v1/delete-account', {
    method,
    headers,
  });
}

/** Shorthand: run the real handler once with the given mocks and request */
async function run(
  config: MockConfig = {},
  reqOptions: Parameters<typeof createMockRequest>[0] = {
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
  }
): Promise<Response> {
  const handler = createHandler(createMockDeps(config));
  return handler(createMockRequest(reqOptions));
}

// =============================================================================
// CORS Tests (real _shared/cors.ts module)
// =============================================================================

Deno.test('CORS: allows production origin', () => {
  assertEquals(isOriginAllowed('https://app.match-ops.com'), true);
  assertEquals(isOriginAllowed('https://matchops.app'), true);
  assertEquals(isOriginAllowed('https://www.matchops.app'), true);
});

Deno.test('CORS: allows localhost origins', () => {
  assertEquals(isOriginAllowed('http://localhost:3000'), true);
  assertEquals(isOriginAllowed('http://localhost:3009'), true);
  assertEquals(isOriginAllowed('http://localhost:3010'), false);
});

Deno.test('CORS: allows Vercel preview deployments', () => {
  assertEquals(isOriginAllowed('https://match-ops-local.vercel.app'), true);
  assertEquals(isOriginAllowed('https://match-ops-local-abc123.vercel.app'), true);
  assertEquals(isOriginAllowed('https://match-ops-local-git-feature-xyz.vercel.app'), true);
});

Deno.test('CORS: rejects unknown origins', () => {
  assertEquals(isOriginAllowed('https://evil.com'), false);
  assertEquals(isOriginAllowed('https://attacker.vercel.app'), false);
  assertEquals(isOriginAllowed(null), false);
});

Deno.test('CORS: rejects similar but wrong domains', () => {
  assertEquals(isOriginAllowed('https://matchops.app.evil.com'), false);
  assertEquals(isOriginAllowed('https://fakematchops.app'), false);
  assertEquals(isOriginAllowed('https://match-ops-local.vercel.app.evil.com'), false);
});

// =============================================================================
// Handler: HTTP Method Tests
// =============================================================================

Deno.test('Handler: returns 200 for OPTIONS preflight', async () => {
  const res = await run({}, { method: 'OPTIONS', origin: 'https://matchops.app' });

  assertEquals(res.status, 200);
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://matchops.app');
  await res.body?.cancel();
});

Deno.test('Handler: returns 405 for GET request', async () => {
  const res = await run({}, { method: 'GET', origin: 'https://matchops.app' });

  assertEquals(res.status, 405);
  const body = await res.json();
  assertEquals(body.error, 'Method not allowed');
});

Deno.test('Handler: returns 405 for PUT request', async () => {
  const res = await run({}, { method: 'PUT', origin: 'https://matchops.app' });
  assertEquals(res.status, 405);
  await res.body?.cancel();
});

Deno.test('Handler: returns 405 for DELETE request (must use POST)', async () => {
  const res = await run({}, { method: 'DELETE', origin: 'https://matchops.app' });
  assertEquals(res.status, 405);
  await res.body?.cancel();
});

// =============================================================================
// Handler: Authentication Tests
// =============================================================================

Deno.test('Handler: returns 401 for missing authorization header', async () => {
  const res = await run({}, { origin: 'https://matchops.app' });

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, 'Missing or invalid authorization header');
});

Deno.test('Handler: returns 401 for non-Bearer authorization', async () => {
  const res = await run({}, {
    origin: 'https://matchops.app',
    authorization: 'Basic dXNlcjpwYXNz',
  });

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, 'Missing or invalid authorization header');
});

Deno.test('Handler: returns 401 for invalid JWT', async () => {
  const res = await run({ authError: 'Invalid JWT' });

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, 'Invalid or expired token');
});

Deno.test('Handler: returns 401 for expired JWT', async () => {
  const res = await run({ authError: 'Token expired' });

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, 'Invalid or expired token');
});

Deno.test('Handler: returns 401 when user is null (no error but no user)', async () => {
  const res = await run({ userId: null });

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, 'Invalid or expired token');
});

// =============================================================================
// Handler: Environment Configuration
// =============================================================================

Deno.test('Handler: returns 500 when environment variables are missing', async () => {
  const res = await run({ missingEnv: true });

  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, 'Server configuration error');
});

// =============================================================================
// Handler: Rate Limiting (real handler path, mocked check_rate_limit RPC)
// =============================================================================

Deno.test('Rate limiting: uses stricter limit (5/min) than verify-subscription', () => {
  assertEquals(RATE_LIMIT_MAX_REQUESTS, 5);
});

Deno.test('Handler: returns 429 when check_rate_limit denies the request', async () => {
  const res = await run({ rateLimitAllowed: false });

  assertEquals(res.status, 429);
  assertEquals(res.headers.get('Retry-After'), '60');
  const body = await res.json();
  assertEquals(body.error, 'Too many requests. Please try again later.');
});

Deno.test('Handler: fails closed (503) when rate limit check errors', async () => {
  const res = await run({ rateLimitError: 'connection refused' });

  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error, 'Service temporarily unavailable. Please try again.');
});

Deno.test('Handler: rate limit denial happens BEFORE JWT verification and deletion', async () => {
  const res = await run({ rateLimitAllowed: false, userId: 'user-123' });

  assertEquals(res.status, 429);
  // Neither data deletion nor auth deletion was attempted
  assertEquals(operationLog.length, 0);
});

// =============================================================================
// Handler: Data Deletion Tests
// =============================================================================

Deno.test('Handler: returns 500 when RPC clear_all_user_data fails', async () => {
  const res = await run({ rpcError: 'Database error during deletion' });

  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, 'Failed to delete account data. Please try again or contact support.');
});

Deno.test('Handler: does NOT proceed to auth deletion when data deletion fails', async () => {
  const res = await run({ rpcError: 'RPC failed' });
  await res.body?.cancel();

  // Verify only RPC was called, not auth deletion
  assertEquals(operationLog.length, 1);
  assertEquals(operationLog[0], 'rpc:clear_all_user_data');
  assertEquals(operationLog.includes('auth:deleteUser'), false);
});

// =============================================================================
// Handler: Auth Deletion Tests
// =============================================================================

Deno.test('Handler: returns 500 when auth.admin.deleteUser fails', async () => {
  const res = await run({ deleteUserError: 'Failed to delete auth user' });

  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, 'Failed to delete account. Please try again or contact support.');
});

// =============================================================================
// Handler: Success Path
// =============================================================================

Deno.test('Handler: returns 200 for successful account deletion', async () => {
  const res = await run();

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.message, 'Account deleted successfully');
});

Deno.test('Handler: sets correct CORS headers on success', async () => {
  const res = await run();

  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://matchops.app');
  assertEquals(res.headers.get('Content-Type'), 'application/json');
  await res.body?.cancel();
});

Deno.test('Handler: sets correct CORS headers for Vercel preview', async () => {
  const res = await run({}, {
    origin: 'https://match-ops-local-abc123.vercel.app',
    authorization: 'Bearer valid-jwt',
  });

  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://match-ops-local-abc123.vercel.app');
  await res.body?.cancel();
});

Deno.test('Handler: omits Access-Control-Allow-Origin for unknown origin', async () => {
  const res = await run({}, {
    method: 'OPTIONS',
    origin: 'https://evil.com',
  });

  // Real cors.ts omits the header entirely so the browser blocks the response
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), null);
  await res.body?.cancel();
});

// =============================================================================
// Security Invariant Tests
// =============================================================================

Deno.test('Security: data deletion happens BEFORE auth deletion', async () => {
  const res = await run();
  await res.body?.cancel();

  assertEquals(operationLog.length, 2);
  assertEquals(operationLog[0], 'rpc:clear_all_user_data');
  assertEquals(operationLog[1], 'auth:deleteUser');
});

Deno.test('Security: rate limit is 5/min (stricter than verify-subscription at 10/min)', () => {
  assertEquals(RATE_LIMIT_MAX_REQUESTS, 5);
});

// =============================================================================
// Error Message Sanitization Tests
// =============================================================================

Deno.test('Error messages: do not leak implementation details', async () => {
  // Collect real error bodies from every handler failure path
  const failures = await Promise.all([
    run({}, { method: 'GET', origin: 'https://matchops.app' }),
    run({}, { origin: 'https://matchops.app' }), // missing auth header
    run({ missingEnv: true }),
    run({ rateLimitAllowed: false }),
    run({ rateLimitError: 'pg down' }),
    run({ authError: 'Invalid JWT' }),
    run({ rpcError: 'db exploded' }),
    run({ deleteUserError: 'admin api down' }),
  ]);

  for (const res of failures) {
    const body = await res.json();
    const lower = String(body.error).toLowerCase();
    // Should not contain sensitive implementation details
    assertEquals(lower.includes('supabase'), false, `Error "${body.error}" leaks "supabase"`);
    assertEquals(lower.includes('rpc'), false, `Error "${body.error}" leaks "rpc"`);
    assertEquals(lower.includes('service role'), false, `Error "${body.error}" leaks "service role"`);
    assertEquals(lower.includes('admin'), false, `Error "${body.error}" leaks "admin"`);
    assertEquals(lower.includes('postgresql'), false, `Error "${body.error}" leaks "postgresql"`);
    assertEquals(lower.includes('auth.uid'), false, `Error "${body.error}" leaks "auth.uid"`);
    // Should not echo the underlying error messages from mocks
    assertEquals(lower.includes('exploded'), false, `Error "${body.error}" leaks internal message`);
    assertEquals(lower.includes('pg down'), false, `Error "${body.error}" leaks internal message`);
  }
});

console.log('\n✅ All delete-account unit tests completed\n');
