// @ts-nocheck - This is a Deno file, not Node.js. Run with: deno test
/**
 * Deno tests for delete-account Edge Function
 *
 * Run with: deno test --allow-env --allow-net index.test.ts
 *
 * Tests verify input validation, error handling, and security
 * invariants without requiring actual Supabase connections.
 *
 * @critical - Security-critical function: account deletion
 */

import {
  assertEquals,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';

// =============================================================================
// CORS Utilities (mirrored from _shared/cors.ts for testing)
// =============================================================================

const ALLOWED_ORIGINS = [
  'https://matchops.app',
  'https://www.matchops.app',
  'https://match-ops-local.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3005',
  'http://localhost:3006',
  'http://localhost:3007',
  'http://localhost:3008',
  'http://localhost:3009',
];

const VERCEL_PREVIEW_PATTERN = /^https:\/\/match-ops-local(-[a-z0-9-]+)?\.vercel\.app$/;

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (VERCEL_PREVIEW_PATTERN.test(origin)) return true;
  return false;
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = isOriginAllowed(origin) ? origin! : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// =============================================================================
// Mock Infrastructure
// =============================================================================

let mockUserId: string | null = 'user-123';
let mockAuthError: string | null = null;
let mockRpcError: string | null = null;
let mockDeleteUserError: string | null = null;

interface MockSupabaseClient {
  auth: {
    getUser: (jwt: string) => Promise<{
      data: { user: { id: string } | null };
      error: { message: string } | null;
    }>;
    admin: {
      deleteUser: (userId: string) => Promise<{
        error: { message: string } | null;
      }>;
    };
  };
  rpc: (name: string) => Promise<{ error: { message: string } | null }>;
}

function createMockAdminClient(): MockSupabaseClient {
  return {
    auth: {
      getUser: async () => {
        if (mockAuthError) {
          return { data: { user: null }, error: { message: mockAuthError } };
        }
        if (!mockUserId) {
          return { data: { user: null }, error: null };
        }
        return { data: { user: { id: mockUserId } }, error: null };
      },
      admin: {
        deleteUser: async () => {
          if (mockDeleteUserError) {
            return { error: { message: mockDeleteUserError } };
          }
          return { error: null };
        },
      },
    },
    rpc: async () => {
      if (mockRpcError) {
        return { error: { message: mockRpcError } };
      }
      return { error: null };
    },
  };
}

function createMockUserClient(): { rpc: MockSupabaseClient['rpc'] } {
  return {
    rpc: async () => {
      if (mockRpcError) {
        return { error: { message: mockRpcError } };
      }
      return { error: null };
    },
  };
}

function resetMocks() {
  mockUserId = 'user-123';
  mockAuthError = null;
  mockRpcError = null;
  mockDeleteUserError = null;
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

// =============================================================================
// Simplified handler for testing (mirrors edge function logic)
// =============================================================================

// Rate limiting (mirrored from main function)
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const testRateLimitStore = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = testRateLimitStore.get(ip);

  if (testRateLimitStore.size > 1000) {
    for (const [key, value] of testRateLimitStore.entries()) {
      if (value.resetAt < now) {
        testRateLimitStore.delete(key);
      }
    }
  }

  if (!record || record.resetAt < now) {
    testRateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  record.count++;
  return false;
}

/** Track operation ordering for security invariant tests */
let operationLog: string[] = [];

async function handleRequest(req: Request): Promise<Response> {
  operationLog = [];
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Rate limiting
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                   req.headers.get('x-real-ip') ||
                   'unknown';
  if (isRateLimited(clientIp)) {
    return new Response(
      JSON.stringify({ error: 'Too many requests. Please try again later.' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid authorization header' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const jwt = authHeader.replace('Bearer ', '');

  const mockAdmin = createMockAdminClient();
  const mockUser = createMockUserClient();

  // Verify JWT
  const { data: { user }, error: userError } = await mockAdmin.auth.getUser(jwt);
  if (userError || !user) {
    return new Response(
      JSON.stringify({ error: 'Invalid or expired token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const userId = user.id;

  // Step 1: Delete user data via RPC (user-scoped client)
  operationLog.push('rpc:clear_all_user_data');
  const { error: dataDeleteError } = await mockUser.rpc('clear_all_user_data');
  if (dataDeleteError) {
    return new Response(
      JSON.stringify({ error: 'Failed to delete account data. Please try again or contact support.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Step 2: Delete auth user (admin client)
  operationLog.push('auth:deleteUser');
  const { error: authDeleteError } = await mockAdmin.auth.admin.deleteUser(userId);
  if (authDeleteError) {
    return new Response(
      JSON.stringify({ error: 'Failed to delete account. Please try again or contact support.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, message: 'Account deleted successfully' }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// =============================================================================
// CORS Tests
// =============================================================================

Deno.test('CORS: allows production origin', () => {
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
// Rate Limiting Tests
// =============================================================================

Deno.test('Rate limiting: uses stricter limit (5/min) than verify-subscription', () => {
  assertEquals(RATE_LIMIT_MAX_REQUESTS, 5);
});

Deno.test('Rate limiting: accepts first request', () => {
  const store = new Map<string, { count: number; resetAt: number }>();
  const ip = 'rate-test-1';
  const now = Date.now();

  const record = store.get(ip);
  if (!record || record.resetAt < now) {
    store.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  }

  assertEquals(store.get(ip)?.count, 1);
});

Deno.test('Rate limiting: blocks after 5 requests', () => {
  const store = new Map<string, { count: number; resetAt: number }>();
  const ip = 'rate-test-2';
  const now = Date.now();

  store.set(ip, { count: RATE_LIMIT_MAX_REQUESTS, resetAt: now + RATE_LIMIT_WINDOW_MS });

  const record = store.get(ip);
  const isBlocked = record !== undefined && record.count >= RATE_LIMIT_MAX_REQUESTS;

  assertEquals(isBlocked, true);
});

Deno.test('Rate limiting: resets after window expires', () => {
  const store = new Map<string, { count: number; resetAt: number }>();
  const ip = 'rate-test-3';
  const now = Date.now();

  store.set(ip, { count: 5, resetAt: now - 1000 });

  const record = store.get(ip);
  const windowExpired = record !== undefined && record.resetAt < now;

  assertEquals(windowExpired, true);
});

// =============================================================================
// Handler: HTTP Method Tests
// =============================================================================

Deno.test('Handler: returns 200 for OPTIONS preflight', async () => {
  resetMocks();
  const req = createMockRequest({ method: 'OPTIONS', origin: 'https://matchops.app' });
  const res = await handleRequest(req);

  assertEquals(res.status, 200);
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://matchops.app');
});

Deno.test('Handler: returns 405 for GET request', async () => {
  resetMocks();
  const req = createMockRequest({ method: 'GET', origin: 'https://matchops.app' });
  const res = await handleRequest(req);

  assertEquals(res.status, 405);
  const body = await res.json();
  assertEquals(body.error, 'Method not allowed');
});

Deno.test('Handler: returns 405 for PUT request', async () => {
  resetMocks();
  const req = createMockRequest({ method: 'PUT', origin: 'https://matchops.app' });
  const res = await handleRequest(req);

  assertEquals(res.status, 405);
});

Deno.test('Handler: returns 405 for DELETE request (must use POST)', async () => {
  resetMocks();
  const req = createMockRequest({ method: 'DELETE', origin: 'https://matchops.app' });
  const res = await handleRequest(req);

  assertEquals(res.status, 405);
});

// =============================================================================
// Handler: Authentication Tests
// =============================================================================

Deno.test('Handler: returns 401 for missing authorization header', async () => {
  resetMocks();
  const req = createMockRequest({ origin: 'https://matchops.app' });
  const res = await handleRequest(req);

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, 'Missing or invalid authorization header');
});

Deno.test('Handler: returns 401 for non-Bearer authorization', async () => {
  resetMocks();
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Basic dXNlcjpwYXNz',
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, 'Missing or invalid authorization header');
});

Deno.test('Handler: returns 401 for invalid JWT', async () => {
  resetMocks();
  mockAuthError = 'Invalid JWT';
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer invalid-jwt-token',
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, 'Invalid or expired token');
});

Deno.test('Handler: returns 401 for expired JWT', async () => {
  resetMocks();
  mockAuthError = 'Token expired';
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer expired-jwt-token',
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, 'Invalid or expired token');
});

Deno.test('Handler: returns 401 when user is null (no error but no user)', async () => {
  resetMocks();
  mockUserId = null;
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, 'Invalid or expired token');
});

// =============================================================================
// Handler: Data Deletion Tests
// =============================================================================

Deno.test('Handler: returns 500 when RPC clear_all_user_data fails', async () => {
  resetMocks();
  mockRpcError = 'Database error during deletion';
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, 'Failed to delete account data. Please try again or contact support.');
});

Deno.test('Handler: does NOT proceed to auth deletion when data deletion fails', async () => {
  resetMocks();
  mockRpcError = 'RPC failed';
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
  });
  await handleRequest(req);

  // Verify only RPC was called, not auth deletion
  assertEquals(operationLog.length, 1);
  assertEquals(operationLog[0], 'rpc:clear_all_user_data');
  assertEquals(operationLog.includes('auth:deleteUser'), false);
});

// =============================================================================
// Handler: Auth Deletion Tests
// =============================================================================

Deno.test('Handler: returns 500 when auth.admin.deleteUser fails', async () => {
  resetMocks();
  mockDeleteUserError = 'Failed to delete auth user';
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, 'Failed to delete account. Please try again or contact support.');
});

// =============================================================================
// Handler: Success Path
// =============================================================================

Deno.test('Handler: returns 200 for successful account deletion', async () => {
  resetMocks();
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.message, 'Account deleted successfully');
});

Deno.test('Handler: sets correct CORS headers on success', async () => {
  resetMocks();
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
  });
  const res = await handleRequest(req);

  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://matchops.app');
  assertEquals(res.headers.get('Content-Type'), 'application/json');
});

Deno.test('Handler: sets correct CORS headers for Vercel preview', async () => {
  resetMocks();
  const req = createMockRequest({
    origin: 'https://match-ops-local-abc123.vercel.app',
    authorization: 'Bearer valid-jwt',
  });
  const res = await handleRequest(req);

  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://match-ops-local-abc123.vercel.app');
});

Deno.test('Handler: uses production origin for unknown origin', async () => {
  resetMocks();
  const req = createMockRequest({
    method: 'OPTIONS',
    origin: 'https://evil.com',
  });
  const res = await handleRequest(req);

  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://matchops.app');
});

// =============================================================================
// Security Invariant Tests
// =============================================================================

Deno.test('Security: data deletion happens BEFORE auth deletion', async () => {
  resetMocks();
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
  });
  await handleRequest(req);

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

Deno.test('Error messages: do not leak implementation details', () => {
  const publicErrors = [
    'Method not allowed',
    'Too many requests. Please try again later.',
    'Missing or invalid authorization header',
    'Server configuration error',
    'Invalid or expired token',
    'Failed to delete account data. Please try again or contact support.',
    'Failed to delete account. Please try again or contact support.',
    'An unexpected error occurred',
  ];

  for (const error of publicErrors) {
    const lower = error.toLowerCase();
    // Should not contain sensitive implementation details
    assertEquals(lower.includes('supabase'), false, `Error "${error}" leaks "supabase"`);
    assertEquals(lower.includes('rpc'), false, `Error "${error}" leaks "rpc"`);
    assertEquals(lower.includes('service role'), false, `Error "${error}" leaks "service role"`);
    assertEquals(lower.includes('admin'), false, `Error "${error}" leaks "admin"`);
    assertEquals(lower.includes('postgresql'), false, `Error "${error}" leaks "postgresql"`);
    assertEquals(lower.includes('auth.uid'), false, `Error "${error}" leaks "auth.uid"`);
  }
});

// =============================================================================
// Rate Limiting Handler Integration Tests
// =============================================================================

Deno.test('Handler: returns 429 when rate limited', async () => {
  resetMocks();
  // Clear rate limit store
  testRateLimitStore.clear();

  const ip = 'rate-limit-test-ip';

  // Make 5 requests (should all succeed or fail for other reasons)
  for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
    const req = createMockRequest({
      origin: 'https://matchops.app',
      authorization: 'Bearer valid-jwt',
      ip,
    });
    await handleRequest(req);
  }

  // 6th request should be rate limited
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
    ip,
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 429);
  const body = await res.json();
  assertEquals(body.error, 'Too many requests. Please try again later.');
});

console.log('\n✅ All delete-account unit tests completed\n');
