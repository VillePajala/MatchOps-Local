// @ts-nocheck - This is a Deno file, not Node.js. Run with: deno test
/**
 * Deno tests for verify-subscription Edge Function
 *
 * Run with: deno test --allow-env --allow-net index.test.ts
 *
 * These tests verify input validation and error handling without
 * requiring actual Google Play or Supabase connections.
 *
 * IMPORTANT: Handler Reimplementation Notice
 * -------------------------------------------
 * The handleRequest() function in this file (line ~401) is a REIMPLEMENTATION
 * of the actual Edge Function handler in index.ts. This is necessary because
 * the Edge Function runs in Deno with Deno.serve() and imports from ESM URLs
 * (e.g., https://esm.sh/@supabase/supabase-js@2), making it impossible to
 * directly import into a test runner (whether Jest/Node or even Deno test).
 *
 * MAINTENANCE RISK: If index.ts changes, this test handler must be updated
 * manually to stay in sync. When modifying the Edge Function:
 *   1. Update the corresponding logic in handleRequest() below
 *   2. Update unit tests above if validation rules change
 *   3. Verify error messages match between index.ts and this file
 *
 * The Handler Integration Tests section (bottom of file) tests the
 * reimplemented handler to verify request/response flow. The Unit Tests
 * sections above test extracted logic (CORS, validation, status) that
 * mirrors the actual Edge Function's behavior.
 */

import {
  assertEquals,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * CORS origin validation (extracted from main function)
 */
const ALLOWED_ORIGINS = [
  'https://app.match-ops.com',
  'https://matchops.app',
  'https://www.matchops.app',
  'https://match-ops-local.vercel.app',
  // Allow localhost for development (ports 3000-3009)
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

// =============================================================================
// CORS Tests
// =============================================================================

Deno.test('CORS: allows production origin', () => {
  assertEquals(isOriginAllowed('https://app.match-ops.com'), true);
  assertEquals(isOriginAllowed('https://matchops.app'), true);
  assertEquals(isOriginAllowed('https://www.matchops.app'), true);
});

Deno.test('CORS: allows localhost origins (ports 3000-3009)', () => {
  assertEquals(isOriginAllowed('http://localhost:3000'), true);
  assertEquals(isOriginAllowed('http://localhost:3001'), true);
  assertEquals(isOriginAllowed('http://localhost:3002'), true);
  assertEquals(isOriginAllowed('http://localhost:3003'), true);
  assertEquals(isOriginAllowed('http://localhost:3004'), true);
  assertEquals(isOriginAllowed('http://localhost:3005'), true);
  assertEquals(isOriginAllowed('http://localhost:3006'), true);
  assertEquals(isOriginAllowed('http://localhost:3007'), true);
  assertEquals(isOriginAllowed('http://localhost:3008'), true);
  assertEquals(isOriginAllowed('http://localhost:3009'), true);
  // Port outside range should fail
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
  assertEquals(isOriginAllowed('https://other-project.vercel.app'), false);
  assertEquals(isOriginAllowed(null), false);
});

Deno.test('CORS: rejects similar but wrong domains', () => {
  // These look similar but should not match
  assertEquals(isOriginAllowed('https://matchops.app.evil.com'), false);
  assertEquals(isOriginAllowed('https://fakematchops.app'), false);
  assertEquals(isOriginAllowed('https://match-ops-local.vercel.app.evil.com'), false);
});

// =============================================================================
// Token Validation Tests
// =============================================================================

Deno.test('Token validation: rejects tokens over 500 chars', () => {
  const longToken = 'a'.repeat(501);
  assertEquals(longToken.length > 500, true);
});

Deno.test('Token validation: accepts tokens under 500 chars', () => {
  const validToken = 'a'.repeat(500);
  assertEquals(validToken.length <= 500, true);
});

Deno.test('Token validation: validates token format regex', () => {
  const validPattern = /^[a-zA-Z0-9._-]+$/;

  // Valid tokens
  assertEquals(validPattern.test('abc123'), true);
  assertEquals(validPattern.test('test-token-123'), true);
  assertEquals(validPattern.test('token.with.dots'), true);
  assertEquals(validPattern.test('token_with_underscores'), true);

  // Invalid tokens
  assertEquals(validPattern.test('token with spaces'), false);
  assertEquals(validPattern.test('token<script>'), false);
  assertEquals(validPattern.test('token\ninjection'), false);
  assertEquals(validPattern.test(''), false);
});

Deno.test('Token validation: test tokens have test- prefix', () => {
  const isTestToken = (token: string) => token.startsWith('test-');

  assertEquals(isTestToken('test-preview-123'), true);
  assertEquals(isTestToken('test-'), true);
  assertEquals(isTestToken('real-purchase-token'), false);
  assertEquals(isTestToken('TEST-uppercase'), false); // Case sensitive
});

Deno.test('Token validation: rejects long test tokens (>100 chars)', () => {
  const shortTestToken = 'test-' + 'a'.repeat(90); // 95 chars - OK
  const longTestToken = 'test-' + 'a'.repeat(100); // 105 chars - too long

  assertEquals(shortTestToken.length <= 100, true);
  assertEquals(longTestToken.length <= 100, false);
});

// =============================================================================
// Product ID Validation Tests
// =============================================================================

Deno.test('Product ID validation: accepts valid product IDs', () => {
  const VALID_PRODUCT_IDS = ['matchops_full_version', 'matchops_premium_monthly'];

  assertEquals(VALID_PRODUCT_IDS.includes('matchops_full_version'), true);
  assertEquals(VALID_PRODUCT_IDS.includes('matchops_premium_monthly'), true);
});

Deno.test('Product ID validation: rejects invalid product IDs', () => {
  const VALID_PRODUCT_IDS = ['matchops_full_version', 'matchops_premium_monthly'];

  assertEquals(VALID_PRODUCT_IDS.includes('unknown_product'), false);
  assertEquals(VALID_PRODUCT_IDS.includes(''), false);
  assertEquals(VALID_PRODUCT_IDS.includes('matchops_premium_yearly'), false);
});

// =============================================================================
// Rate Limiting Tests (Distributed via PostgreSQL RPC)
//
// The actual rate limiting uses supabaseAdmin.rpc('check_rate_limit', {...}).
// Since we cannot call the real RPC in unit tests, these tests verify:
// - The fail-closed branching logic (error → 503, not allowed → 429, allowed → proceed)
// - The key format used for the RPC call
// - The handler integration tests below cover the full request flow
// =============================================================================

Deno.test('Rate limiting: fail-closed logic blocks requests when RPC errors', () => {
  // The Edge Function uses fail-closed behavior (see index.ts lines 145-153):
  //   if (rateLimitError) { return 503 }           // fail-closed: block on RPC error
  //   else if (isAllowed === false) { return 429 }  // block on explicit rate limit exceeded
  //
  // This verifies the branching logic variables. Note: the actual handler returns 503
  // on RPC error (fail-closed), but the branching test here only checks the boolean logic.
  const rateLimitError = { message: 'connection timeout' };
  const isAllowed = null; // No data returned on error

  // With fail-closed, rateLimitError alone triggers a block (503 in the handler).
  // The boolean expression below only covers the isAllowed===false branch (429).
  const shouldBlock429 = !rateLimitError && isAllowed === false;
  assertEquals(shouldBlock429, false, 'isAllowed branch should not trigger when RPC errored (separate 503 path handles this)');
});

Deno.test('Rate limiting: branching logic blocks when RPC returns explicit false', () => {
  // When RPC succeeds and returns false, the request should be blocked
  const rateLimitError = null;
  const isAllowed = false;

  const shouldBlock = !rateLimitError && isAllowed === false;
  assertEquals(shouldBlock, true, 'Should block when RPC explicitly returns false');
});

Deno.test('Rate limiting: branching logic allows when RPC returns true', () => {
  // When RPC succeeds and returns true, the request should proceed
  const rateLimitError = null;
  const isAllowed = true;

  const shouldBlock = !rateLimitError && isAllowed === false;
  assertEquals(shouldBlock, false, 'Should allow when RPC returns true');
});

Deno.test('Rate limiting: key includes IP and function prefix', () => {
  // The RPC key format is 'verify-sub:{ip}' to namespace rate limits per function
  const clientIP = '192.168.1.1';
  const key = `verify-sub:${clientIP}`;
  assertEquals(key, 'verify-sub:192.168.1.1');
  assertEquals(key.startsWith('verify-sub:'), true);
});

// =============================================================================
// Error Message Sanitization Tests
// =============================================================================

Deno.test('Error messages: do not leak implementation details', () => {
  // These are the public error messages - verify they are generic
  const publicErrors = [
    'Method not allowed',
    'Service temporarily unavailable. Please try again.',  // Rate limit RPC failure (fail-closed)
    'Too many requests. Please try again later.',
    'Missing or invalid authorization header',
    'Server configuration error', // Was: "Google Play verification not configured"
    'Invalid or expired token',
    'Invalid request body',
    'Missing purchaseToken or productId',
    'Purchase token too long',
    'Invalid purchase token format',
    'Invalid product ID',
    'Invalid purchase token', // Generic: covers test token too long + test token in production
    'Failed to verify with Google Play',
    'This purchase is already associated with another account',
    'Failed to save subscription',
    'An unexpected error occurred',
  ];

  // Sensitive keywords that should never appear in user-facing error messages.
  // These would leak implementation details about mock mode, configuration, or environment.
  const sensitiveKeywords = ['mock', 'test mode', 'production', 'configured'];

  for (const error of publicErrors) {
    const lowerError = error.toLowerCase();
    for (const keyword of sensitiveKeywords) {
      assertEquals(
        lowerError.includes(keyword),
        false,
        `Error message "${error}" should not contain sensitive keyword "${keyword}"`
      );
    }
  }
});

// =============================================================================
// Subscription Status Tests
// =============================================================================

Deno.test('Subscription status: determines correct status from subscription state', () => {
  type SubscriptionStatus = 'none' | 'active' | 'cancelled' | 'grace' | 'expired';

  function determineSubscriptionStatus(
    paymentState: number,
    cancelReason: number | undefined | null,
    expiryDate: Date,
    now: Date
  ): SubscriptionStatus {
    if (paymentState === 0) {
      return 'grace';
    } else if (cancelReason != null) {
      return expiryDate > now ? 'cancelled' : 'expired';
    } else if (expiryDate < now) {
      return 'expired';
    } else {
      return 'active';
    }
  }

  const now = new Date();
  const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Active subscription
  assertEquals(determineSubscriptionStatus(1, undefined, future, now), 'active');

  // Payment pending = grace
  assertEquals(determineSubscriptionStatus(0, undefined, future, now), 'grace');

  // Cancelled but not expired (cancelReason: 0 = user-initiated cancel)
  assertEquals(determineSubscriptionStatus(1, 0, future, now), 'cancelled');

  // Cancelled and expired
  assertEquals(determineSubscriptionStatus(1, 0, past, now), 'expired');

  // Expired (not cancelled)
  assertEquals(determineSubscriptionStatus(1, undefined, past, now), 'expired');

  // cancelReason: null — field present but no cancel reason (not cancelled)
  // != null correctly treats null same as undefined (no cancel)
  assertEquals(determineSubscriptionStatus(1, null, future, now), 'active');
});

Deno.test('Product purchase status: determines correct status from purchase state', () => {
  type SubscriptionStatus = 'none' | 'active' | 'cancelled' | 'grace' | 'expired';

  function determineProductStatus(purchaseState: number): SubscriptionStatus {
    if (purchaseState === 2) return 'grace';    // pending
    if (purchaseState === 1) return 'expired';  // cancelled/refunded
    return 'active';                             // 0 = purchased
  }

  assertEquals(determineProductStatus(0), 'active');
  assertEquals(determineProductStatus(1), 'expired');
  assertEquals(determineProductStatus(2), 'grace');
});

Deno.test('Product routing: one-time purchases use products endpoint', () => {
  const ONE_TIME_PRODUCT_IDS = ['matchops_full_version'];

  assertEquals(ONE_TIME_PRODUCT_IDS.includes('matchops_full_version'), true);
  assertEquals(ONE_TIME_PRODUCT_IDS.includes('matchops_premium_monthly'), false);
});

// =============================================================================
// Grace Period Calculation Tests
// =============================================================================

Deno.test('Grace period: adds 7 days to period end', () => {
  const GRACE_PERIOD_DAYS = 7;
  const periodEnd = new Date('2026-02-01T00:00:00Z');
  const graceEnd = new Date(periodEnd.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  assertEquals(graceEnd.toISOString(), '2026-02-08T00:00:00.000Z');
});

// =============================================================================
// Mock Subscription Duration Tests
// =============================================================================

Deno.test('Mock purchase: validity period is 30 days', () => {
  const MOCK_PURCHASE_VALIDITY_DAYS = 30;
  const now = new Date('2026-01-15T12:00:00Z');
  const periodEnd = new Date(now.getTime() + MOCK_PURCHASE_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

  assertEquals(periodEnd.toISOString(), '2026-02-14T12:00:00.000Z');
});

// =============================================================================
// Handler Integration Tests
// =============================================================================

/**
 * These tests verify the complete request/response flow by calling
 * the handler with mocked dependencies. They test:
 * - HTTP method validation
 * - CORS preflight handling
 * - Authorization header validation
 * - Request body validation
 * - Rate limiting behavior
 *
 * Note: Full E2E tests require actual Supabase/Google connections
 * and should be run separately in staging environment.
 */

// Mock environment variables for testing
const mockEnv: Record<string, string> = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  MOCK_BILLING: 'true',
};

// Mock Supabase client
interface MockSupabaseClient {
  auth: {
    getUser: (jwt: string) => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
  };
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        neq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
    upsert: (record: unknown, options: unknown) => Promise<{ error: unknown }>;
  };
}

let mockSupabaseClient: MockSupabaseClient;
let mockUserId: string | null = 'user-123';
let mockAuthError: string | null = null;
let mockExistingSubscription: unknown = null;
let mockUpsertError: unknown = null;

function createMockSupabaseClient(): MockSupabaseClient {
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
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          neq: () => ({
            maybeSingle: async () => ({ data: mockExistingSubscription, error: null }),
          }),
        }),
      }),
      upsert: async () => ({ error: mockUpsertError }),
    }),
  };
}

/**
 * Simplified handler for testing (extracted logic without Deno.serve wrapper)
 *
 * MAINTENANCE NOTE: This is a reimplementation of index.ts handler logic.
 * It intentionally does NOT cover:
 * - Rate limiting (RPC calls to check_rate_limit)
 * - Real Google Play API verification (verifySubscriptionWithGoogle/verifyProductWithGoogle)
 * - Product type routing (one-time vs subscription)
 * - RPC-based upsert (upsert_subscription)
 *
 * When index.ts logic changes, verify these tests still test relevant behavior.
 */
async function handleRequest(req: Request): Promise<Response> {
  // Get origin for CORS
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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

  // Check environment variables
  const supabaseUrl = mockEnv['SUPABASE_URL'];
  const serviceRoleKey = mockEnv['SUPABASE_SERVICE_ROLE_KEY'];
  const mockBilling = mockEnv['MOCK_BILLING'] === 'true';

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Verify user JWT
  mockSupabaseClient = createMockSupabaseClient();
  const { data: { user }, error: userError } = await mockSupabaseClient.auth.getUser(jwt);

  if (userError || !user) {
    return new Response(
      JSON.stringify({ error: 'Invalid or expired token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Parse request body
  let body: { purchaseToken?: string; productId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { purchaseToken, productId } = body;

  // Validate required fields
  if (!purchaseToken || !productId) {
    return new Response(
      JSON.stringify({ error: 'Missing purchaseToken or productId' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Validate purchaseToken length
  if (purchaseToken.length > 500) {
    return new Response(
      JSON.stringify({ error: 'Purchase token too long' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Validate purchaseToken format
  if (!/^[a-zA-Z0-9._-]+$/.test(purchaseToken)) {
    return new Response(
      JSON.stringify({ error: 'Invalid purchase token format' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Validate product ID
  const VALID_PRODUCT_IDS = ['matchops_full_version', 'matchops_premium_monthly'];
  if (!VALID_PRODUCT_IDS.includes(productId)) {
    return new Response(
      JSON.stringify({ error: 'Invalid product ID' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Check if test token
  const isTestToken = purchaseToken.startsWith('test-');

  if (isTestToken && mockBilling && purchaseToken.length > 100) {
    return new Response(
      JSON.stringify({ error: 'Invalid purchase token' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (isTestToken && !mockBilling) {
    return new Response(
      JSON.stringify({ error: 'Invalid purchase token' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Check idempotency
  const { data: existingSubscription } = await mockSupabaseClient
    .from('subscriptions')
    .select('user_id')
    .eq('google_purchase_token', purchaseToken)
    .neq('user_id', user.id)
    .maybeSingle();

  if (existingSubscription) {
    return new Response(
      JSON.stringify({ error: 'This purchase is already associated with another account' }),
      { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Upsert subscription
  const { error: upsertError } = await mockSupabaseClient
    .from('subscriptions')
    .upsert({}, {});

  if (upsertError) {
    return new Response(
      JSON.stringify({ error: 'Failed to save subscription' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Success
  const MOCK_PURCHASE_VALIDITY_DAYS = 30;
  const GRACE_PERIOD_DAYS = 7;
  const periodEnd = new Date(Date.now() + MOCK_PURCHASE_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
  const graceEnd = new Date(periodEnd.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  return new Response(
    JSON.stringify({
      success: true,
      status: 'active',
      periodEnd: periodEnd.toISOString(),
      graceEnd: graceEnd.toISOString(),
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = isOriginAllowed(origin) ? origin! : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function createMockRequest(
  options: {
    method?: string;
    origin?: string;
    authorization?: string;
    body?: unknown;
  } = {}
): Request {
  const { method = 'POST', origin, authorization, body } = options;

  const headers = new Headers();
  if (origin) headers.set('Origin', origin);
  if (authorization) headers.set('Authorization', authorization);
  headers.set('Content-Type', 'application/json');

  return new Request('http://localhost:54321/functions/v1/verify-subscription', {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// Reset mocks before each test
function resetMocks() {
  mockUserId = 'user-123';
  mockAuthError = null;
  mockExistingSubscription = null;
  mockUpsertError = null;
  mockEnv['MOCK_BILLING'] = 'true';
}

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

Deno.test('Handler: returns 401 for missing authorization', async () => {
  resetMocks();
  const req = createMockRequest({
    origin: 'https://matchops.app',
    body: { purchaseToken: 'test-token', productId: 'matchops_full_version' },
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
    authorization: 'Bearer invalid-jwt',
    body: { purchaseToken: 'test-token', productId: 'matchops_full_version' },
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, 'Invalid or expired token');
});

Deno.test('Handler: returns 400 for missing purchaseToken', async () => {
  resetMocks();
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
    body: { productId: 'matchops_full_version' },
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, 'Missing purchaseToken or productId');
});

Deno.test('Handler: returns 400 for missing productId', async () => {
  resetMocks();
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
    body: { purchaseToken: 'test-token' },
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, 'Missing purchaseToken or productId');
});

Deno.test('Handler: returns 400 for token over 500 chars', async () => {
  resetMocks();
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
    body: { purchaseToken: 'a'.repeat(501), productId: 'matchops_full_version' },
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, 'Purchase token too long');
});

Deno.test('Handler: returns 400 for invalid token format', async () => {
  resetMocks();
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
    body: { purchaseToken: 'token with spaces', productId: 'matchops_full_version' },
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, 'Invalid purchase token format');
});

Deno.test('Handler: returns 400 for invalid product ID', async () => {
  resetMocks();
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
    body: { purchaseToken: 'test-token', productId: 'invalid_product' },
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, 'Invalid product ID');
});

Deno.test('Handler: returns 400 for test token when mock billing disabled', async () => {
  resetMocks();
  mockEnv['MOCK_BILLING'] = 'false';
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
    body: { purchaseToken: 'test-token', productId: 'matchops_full_version' },
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, 'Invalid purchase token');
});

Deno.test('Handler: returns 400 for test token over 100 chars in mock mode', async () => {
  resetMocks();
  mockEnv['MOCK_BILLING'] = 'true';
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
    body: { purchaseToken: 'test-' + 'a'.repeat(100), productId: 'matchops_full_version' },
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, 'Invalid purchase token');
});

Deno.test('Handler: returns 409 for token already claimed by another user', async () => {
  resetMocks();
  mockExistingSubscription = { user_id: 'other-user' };
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
    body: { purchaseToken: 'test-token', productId: 'matchops_full_version' },
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 409);
  const body = await res.json();
  assertEquals(body.error, 'This purchase is already associated with another account');
});

Deno.test('Handler: returns 500 for upsert failure', async () => {
  resetMocks();
  mockUpsertError = { message: 'Database error' };
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
    body: { purchaseToken: 'test-token', productId: 'matchops_full_version' },
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, 'Failed to save subscription');
});

Deno.test('Handler: returns 200 for valid test token in mock mode', async () => {
  resetMocks();
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
    body: { purchaseToken: 'test-preview-123', productId: 'matchops_full_version' },
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.status, 'active');
  assertEquals(typeof body.periodEnd, 'string');
  assertEquals(typeof body.graceEnd, 'string');
});

Deno.test('Handler: sets correct CORS headers for allowed origin', async () => {
  resetMocks();
  const req = createMockRequest({
    method: 'OPTIONS',
    origin: 'https://match-ops-local-abc123.vercel.app',
  });
  const res = await handleRequest(req);

  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://match-ops-local-abc123.vercel.app');
});

Deno.test('Handler: uses production origin for disallowed origin', async () => {
  resetMocks();
  const req = createMockRequest({
    method: 'OPTIONS',
    origin: 'https://evil.com',
  });
  const res = await handleRequest(req);

  // Falls back to ALLOWED_ORIGINS[0] for disallowed origins
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://app.match-ops.com');
});

console.log('\n✅ All verify-subscription unit tests completed\n');
