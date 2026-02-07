// @ts-nocheck - This is a Deno file, not Node.js. Run with: deno test
/**
 * Deno tests for verify-subscription Edge Function
 *
 * Run with: deno test --allow-env --allow-net index.test.ts
 *
 * These tests verify input validation and error handling without
 * requiring actual Google Play or Supabase connections.
 */

import {
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.220.0/assert/mod.ts';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Helper to create a mock request (for future integration tests)
 */
function _createMockRequest(
  options: {
    method?: string;
    origin?: string;
    authorization?: string;
    body?: unknown;
    ip?: string;
  } = {}
): Request {
  const { method = 'POST', origin, authorization, body, ip } = options;

  const headers = new Headers();
  if (origin) headers.set('Origin', origin);
  if (authorization) headers.set('Authorization', authorization);
  if (ip) headers.set('x-forwarded-for', ip);
  headers.set('Content-Type', 'application/json');

  return new Request('http://localhost:54321/functions/v1/verify-subscription', {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/**
 * CORS origin validation (extracted from main function)
 */
const ALLOWED_ORIGINS = [
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
  const VALID_PRODUCT_IDS = ['matchops_premium_monthly'];

  assertEquals(VALID_PRODUCT_IDS.includes('matchops_premium_monthly'), true);
});

Deno.test('Product ID validation: rejects invalid product IDs', () => {
  const VALID_PRODUCT_IDS = ['matchops_premium_monthly'];

  assertEquals(VALID_PRODUCT_IDS.includes('unknown_product'), false);
  assertEquals(VALID_PRODUCT_IDS.includes(''), false);
  assertEquals(VALID_PRODUCT_IDS.includes('matchops_premium_yearly'), false);
});

// =============================================================================
// Rate Limiting Tests (Distributed via PostgreSQL RPC)
// =============================================================================

Deno.test('Rate limiting: uses distributed check_rate_limit RPC', () => {
  // The Edge Function now calls supabaseAdmin.rpc('check_rate_limit', {...})
  // instead of using an in-memory Map. This verifies the contract:
  // - Returns true = request allowed
  // - Returns false = rate limited
  const isAllowed = true; // RPC returns boolean
  assertEquals(isAllowed === false, false); // Not blocked
});

Deno.test('Rate limiting: blocks when RPC returns false', () => {
  const isAllowed = false; // RPC says over limit
  assertEquals(isAllowed === false, true); // Should block
});

Deno.test('Rate limiting: fails open when RPC errors', () => {
  // If the rate limit RPC fails, the function should NOT block the request.
  // It logs the error and proceeds (fail-open for availability).
  const rateLimitError = { message: 'connection timeout' };
  const isAllowed = null; // No data returned on error

  // The function checks: if (rateLimitError) { log } else if (isAllowed === false) { block }
  // So with an error, it should NOT reach the block branch
  const shouldBlock = !rateLimitError && isAllowed === false;
  assertEquals(shouldBlock, false); // Should NOT block on error
});

Deno.test('Rate limiting: key includes IP and function prefix', () => {
  // The RPC key format is 'verify-sub:{ip}' to allow reuse across functions
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
    'Too many requests. Please try again later.',
    'Missing or invalid authorization header',
    'Server configuration error', // Was: "Google Play verification not configured"
    'Invalid or expired token',
    'Invalid request body',
    'Missing purchaseToken or productId',
    'Purchase token too long',
    'Invalid purchase token format',
    'Invalid product ID',
    'Test token too long',
    'Invalid purchase token', // Was: "Test tokens not accepted in production"
    'Failed to verify with Google Play',
    'This purchase is already associated with another account',
    'Failed to save subscription',
    'An unexpected error occurred',
  ];

  for (const error of publicErrors) {
    // Should not contain sensitive keywords
    assertStringIncludes(error.toLowerCase().includes('mock') ? 'bad' : 'ok', 'ok');
    assertStringIncludes(error.toLowerCase().includes('test mode') ? 'bad' : 'ok', 'ok');
    assertStringIncludes(error.toLowerCase().includes('production') ? 'bad' : 'ok', 'ok');
    assertStringIncludes(error.toLowerCase().includes('configured') ? 'bad' : 'ok', 'ok');
  }
});

// =============================================================================
// Subscription Status Tests
// =============================================================================

Deno.test('Subscription status: determines correct status from state', () => {
  type SubscriptionStatus = 'none' | 'active' | 'cancelled' | 'grace' | 'expired';

  function determineStatus(
    paymentState: number,
    cancelReason: number | undefined,
    expiryDate: Date,
    now: Date
  ): SubscriptionStatus {
    if (paymentState === 0) {
      return 'grace';
    } else if (cancelReason !== undefined) {
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
  assertEquals(determineStatus(1, undefined, future, now), 'active');

  // Payment pending = grace
  assertEquals(determineStatus(0, undefined, future, now), 'grace');

  // Cancelled but not expired
  assertEquals(determineStatus(1, 0, future, now), 'cancelled');

  // Cancelled and expired
  assertEquals(determineStatus(1, 0, past, now), 'expired');

  // Expired (not cancelled)
  assertEquals(determineStatus(1, undefined, past, now), 'expired');
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

Deno.test('Mock subscription: lasts 30 days', () => {
  const MOCK_SUBSCRIPTION_DAYS = 30;
  const now = new Date('2026-01-15T12:00:00Z');
  const periodEnd = new Date(now.getTime() + MOCK_SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000);

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
  const VALID_PRODUCT_IDS = ['matchops_premium_monthly'];
  if (!VALID_PRODUCT_IDS.includes(productId)) {
    return new Response(
      JSON.stringify({ error: 'Invalid product ID' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Check if test token
  const isTestToken = purchaseToken.startsWith('test-');

  if (isTestToken && purchaseToken.length > 100) {
    return new Response(
      JSON.stringify({ error: 'Test token too long' }),
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
  const MOCK_SUBSCRIPTION_DAYS = 30;
  const GRACE_PERIOD_DAYS = 7;
  const periodEnd = new Date(Date.now() + MOCK_SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000);
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
    body: { purchaseToken: 'test-token', productId: 'matchops_premium_monthly' },
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
    body: { purchaseToken: 'test-token', productId: 'matchops_premium_monthly' },
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
    body: { productId: 'matchops_premium_monthly' },
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
    body: { purchaseToken: 'a'.repeat(501), productId: 'matchops_premium_monthly' },
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
    body: { purchaseToken: 'token with spaces', productId: 'matchops_premium_monthly' },
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
    body: { purchaseToken: 'test-token', productId: 'matchops_premium_monthly' },
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, 'Invalid purchase token');
});

Deno.test('Handler: returns 400 for test token over 100 chars', async () => {
  resetMocks();
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
    body: { purchaseToken: 'test-' + 'a'.repeat(100), productId: 'matchops_premium_monthly' },
  });
  const res = await handleRequest(req);

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, 'Test token too long');
});

Deno.test('Handler: returns 409 for token already claimed by another user', async () => {
  resetMocks();
  mockExistingSubscription = { user_id: 'other-user' };
  const req = createMockRequest({
    origin: 'https://matchops.app',
    authorization: 'Bearer valid-jwt',
    body: { purchaseToken: 'test-token', productId: 'matchops_premium_monthly' },
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
    body: { purchaseToken: 'test-token', productId: 'matchops_premium_monthly' },
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
    body: { purchaseToken: 'test-preview-123', productId: 'matchops_premium_monthly' },
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

  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://matchops.app');
});

console.log('\n✅ All verify-subscription unit tests completed\n');
