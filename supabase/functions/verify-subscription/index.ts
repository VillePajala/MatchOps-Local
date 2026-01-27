/**
 * Verify Subscription Edge Function
 *
 * Verifies Google Play subscription purchases and stores subscription status in Supabase.
 *
 * Security Model:
 * 1. Client sends JWT + purchase token
 * 2. Function verifies JWT to confirm user identity
 * 3. Function verifies purchase with Google Play API (or mock mode)
 * 4. Function upserts subscription record using service role
 *
 * Mock Mode:
 * Set MOCK_BILLING=true in Supabase secrets to accept test tokens (for development/staging).
 * Test tokens must start with 'test-' prefix.
 *
 * @see docs/03-active-plans/billing-implementation-plan.md
 */

/* eslint-disable no-console */
// Console logging is appropriate for Edge Functions (server-side Deno runtime)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Allowed origins for CORS (exact match)
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

// Vercel preview deployment pattern: match-ops-local-{hash}-{team}.vercel.app
// Format: https://match-ops-local-{deploymentHash}-{teamSlug}.vercel.app
// Security note: This only matches our specific project prefix (match-ops-local).
// Vercel generates unique subdomains per deployment (e.g., match-ops-local-abc123-team-name.vercel.app).
// An attacker would need access to our Vercel project to create a matching deployment.
const VERCEL_PREVIEW_PATTERN = /^https:\/\/match-ops-local-[a-z0-9]+-[a-z0-9-]+\.vercel\.app$/;

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // Max 10 requests per minute per IP

// In-memory rate limit store (cleared when function instance restarts)
// KNOWN LIMITATION: This is per-instance only, not distributed across Edge Function instances.
// For high-traffic scenarios, consider:
// - Supabase Edge Function KV storage (when available)
// - Redis/Upstash for distributed rate limiting
// - Cloudflare Rate Limiting rules at the CDN level
// Current implementation provides basic protection against single-source abuse.
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Check if request is rate limited
 * @returns true if request should be blocked
 */
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  // Clean up expired entries periodically
  if (rateLimitStore.size > 1000) {
    for (const [key, value] of rateLimitStore.entries()) {
      if (value.resetAt < now) {
        rateLimitStore.delete(key);
      }
    }
  }

  if (!record || record.resetAt < now) {
    // First request or window expired - start new window
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    // Over limit
    return true;
  }

  // Increment counter
  record.count++;
  return false;
}

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Vercel preview deployments
  if (VERCEL_PREVIEW_PATTERN.test(origin)) {
    console.log(`[CORS] Allowed Vercel preview origin: ${origin}`);
    return true;
  }
  // Log rejected origins for debugging
  console.warn(`[CORS] Origin not allowed: ${origin}`);
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

// Google Play package and product configuration
const GOOGLE_PLAY_PACKAGE = 'com.matchops.local';
const VALID_PRODUCT_IDS = ['matchops_premium_monthly'];

// Subscription timing constants
const MOCK_SUBSCRIPTION_DAYS = 30;
const GRACE_PERIOD_DAYS = 7;

// Subscription status type (matches database enum)
type SubscriptionStatus = 'none' | 'active' | 'cancelled' | 'grace' | 'expired';

interface VerifyRequest {
  purchaseToken: string;
  productId: string;
}

interface GoogleSubscription {
  expiryTimeMillis: string;
  paymentState: number; // 0=pending, 1=received, 2=free trial, 3=deferred
  acknowledgementState: number; // 0=not acknowledged, 1=acknowledged
  autoRenewing: boolean;
  cancelReason?: number;
}

interface SubscriptionRecord {
  user_id: string;
  status: SubscriptionStatus;
  google_purchase_token: string;
  google_order_id?: string;
  product_id: string;
  period_start?: string;
  period_end: string;
  grace_end: string;
  last_verified_at: string;
  updated_at: string;
}

Deno.serve(async (req: Request) => {
  // Get origin for CORS
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  // Debug logging for troubleshooting
  console.log(`[verify-subscription] Request from origin: ${origin || '(no origin)'}, method: ${req.method}`);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log(`[verify-subscription] CORS preflight response for origin: ${origin}`);
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

    // Rate limiting - check before any expensive operations
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'unknown';

    if (isRateLimited(clientIP)) {
      console.warn(`Rate limit exceeded for IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } }
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
    const mockBilling = Deno.env.get('MOCK_BILLING') === 'true';
    const googleServiceAccount = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');

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
    console.log(`Verifying subscription for user: ${userId}`);

    // Parse request body
    let body: VerifyRequest;
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

    // Validate purchaseToken format and length
    // Max 500 chars to prevent abuse while accommodating real Google tokens (~170 chars)
    if (purchaseToken.length > 500) {
      return new Response(
        JSON.stringify({ error: 'Purchase token too long' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(purchaseToken)) {
      return new Response(
        JSON.stringify({ error: 'Invalid purchase token format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate product ID
    if (!VALID_PRODUCT_IDS.includes(productId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid product ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let status: SubscriptionStatus = 'active';
    let periodEnd: Date;
    let orderId: string | undefined;

    // Check if this is a mock/test token
    const isTestToken = purchaseToken.startsWith('test-');

    // Test tokens should be short (e.g., "test-preview-1234567890")
    // Reject overly long test tokens as potential abuse
    if (isTestToken && purchaseToken.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Test token too long' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (isTestToken && mockBilling) {
      // Mock mode: Accept test tokens
      console.log(`Mock mode: accepting test token for user ${userId}`);
      periodEnd = new Date(Date.now() + MOCK_SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000);
      orderId = `mock-order-${Date.now()}`;
    } else if (isTestToken && !mockBilling) {
      // Test token in production mode - reject with generic error to avoid leaking test mode existence
      return new Response(
        JSON.stringify({ error: 'Invalid purchase token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Real token - verify with Google Play API
      if (!googleServiceAccount) {
        console.error('Google service account not configured');
        // Generic error to avoid leaking configuration details
        return new Response(
          JSON.stringify({ error: 'Server configuration error' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        const googleSubscription = await verifyWithGoogle(
          purchaseToken,
          productId,
          googleServiceAccount
        );

        if (!googleSubscription) {
          return new Response(
            JSON.stringify({ error: 'Invalid purchase token' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Calculate period end from Google response
        periodEnd = new Date(parseInt(googleSubscription.expiryTimeMillis));

        // Determine status based on Google subscription state
        if (googleSubscription.paymentState === 0) {
          // Payment pending
          status = 'grace';
        } else if (googleSubscription.cancelReason !== undefined) {
          // User cancelled but period not ended
          status = periodEnd > new Date() ? 'cancelled' : 'expired';
        } else if (periodEnd < new Date()) {
          status = 'expired';
        } else {
          status = 'active';
        }

        console.log(`Google verification successful. Status: ${status}, Expires: ${periodEnd.toISOString()}`);
      } catch (error) {
        console.error('Google Play verification failed:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to verify with Google Play' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Calculate grace period end (after subscription expires)
    const graceEnd = new Date(periodEnd.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    const now = new Date().toISOString();

    // Idempotency check: Verify this purchase token isn't already claimed by another user
    // This prevents token reuse attacks where an attacker tries to use someone else's token
    const { data: existingSubscription } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id')
      .eq('google_purchase_token', purchaseToken)
      .neq('user_id', userId)
      .maybeSingle();

    if (existingSubscription) {
      console.error(`Purchase token already claimed by another user`);
      return new Response(
        JSON.stringify({ error: 'This purchase is already associated with another account' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build subscription record
    const subscriptionRecord: SubscriptionRecord = {
      user_id: userId,
      status,
      google_purchase_token: purchaseToken,
      google_order_id: orderId,
      product_id: productId,
      period_start: now,
      period_end: periodEnd.toISOString(),
      grace_end: graceEnd.toISOString(),
      last_verified_at: now,
      updated_at: now,
    };

    // Upsert subscription record
    const { error: upsertError } = await supabaseAdmin
      .from('subscriptions')
      .upsert(subscriptionRecord, {
        onConflict: 'user_id',
      });

    if (upsertError) {
      console.error('Failed to upsert subscription:', upsertError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to save subscription' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Subscription verified and saved for user: ${userId}`);

    return new Response(
      JSON.stringify({
        success: true,
        status,
        periodEnd: periodEnd.toISOString(),
        graceEnd: graceEnd.toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error in verify-subscription:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Verify subscription with Google Play Developer API
 */
async function verifyWithGoogle(
  purchaseToken: string,
  productId: string,
  serviceAccountJson: string
): Promise<GoogleSubscription | null> {
  try {
    const credentials = JSON.parse(serviceAccountJson);

    // Get access token via service account JWT
    const accessToken = await getGoogleAccessToken(credentials);

    // Call Google Play Developer API
    // URL-encode the purchase token to handle any special characters safely
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${GOOGLE_PLAY_PACKAGE}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;

    // Use AbortController for timeout (15 seconds) to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Google API error:', response.status, errorText);
        return null;
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.error('Error verifying with Google:', error);
    throw error;
  }
}

/**
 * Get Google API access token using service account credentials
 * Uses JWT-based authentication for service accounts
 */
async function getGoogleAccessToken(credentials: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600; // 1 hour

  // Create JWT header
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  // Create JWT payload
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: expiry,
  };

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  // Sign with private key
  const signature = await signWithPrivateKey(signatureInput, credentials.private_key);
  const jwt = `${signatureInput}.${signature}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Failed to get access token: ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

/**
 * Base64URL encode (URL-safe base64 without padding)
 */
function base64UrlEncode(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Sign data with RSA private key using Web Crypto API
 */
async function signWithPrivateKey(data: string, privateKeyPem: string): Promise<string> {
  // Convert PEM to binary
  const pemContents = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  // Import the key
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  // Sign the data
  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(data)
  );

  // Convert to base64url
  const signatureArray = new Uint8Array(signatureBuffer);
  const base64 = btoa(String.fromCharCode(...signatureArray));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
