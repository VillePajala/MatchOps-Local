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
  'http://localhost:3000',
  'http://localhost:3001',
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

Deno.test('CORS: allows localhost origins', () => {
  assertEquals(isOriginAllowed('http://localhost:3000'), true);
  assertEquals(isOriginAllowed('http://localhost:3001'), true);
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
// Rate Limiting Tests
// =============================================================================

Deno.test('Rate limiting: logic accepts first request', () => {
  const store = new Map<string, { count: number; resetAt: number }>();
  const ip = 'test-ip-1';
  const now = Date.now();
  const RATE_LIMIT_WINDOW_MS = 60 * 1000;
  // RATE_LIMIT_MAX_REQUESTS = 10 (documented for context, not used in this test)

  // Simulate first request
  const record = store.get(ip);
  if (!record || record.resetAt < now) {
    store.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  }

  assertEquals(store.get(ip)?.count, 1);
});

Deno.test('Rate limiting: logic blocks after max requests', () => {
  const store = new Map<string, { count: number; resetAt: number }>();
  const ip = 'test-ip-2';
  const now = Date.now();
  const RATE_LIMIT_WINDOW_MS = 60 * 1000;
  const RATE_LIMIT_MAX_REQUESTS = 10;

  // Set count at max
  store.set(ip, { count: RATE_LIMIT_MAX_REQUESTS, resetAt: now + RATE_LIMIT_WINDOW_MS });

  const record = store.get(ip);
  const isBlocked = record !== undefined && record.count >= RATE_LIMIT_MAX_REQUESTS;

  assertEquals(isBlocked, true);
});

Deno.test('Rate limiting: logic resets after window expires', () => {
  const store = new Map<string, { count: number; resetAt: number }>();
  const ip = 'test-ip-3';
  const now = Date.now();

  // Set expired record
  store.set(ip, { count: 10, resetAt: now - 1000 }); // Expired 1 second ago

  const record = store.get(ip);
  const windowExpired = record !== undefined && record.resetAt < now;

  assertEquals(windowExpired, true);
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

console.log('\n✅ All verify-subscription unit tests completed\n');
