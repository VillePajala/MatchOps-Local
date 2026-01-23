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
  // Allow localhost for development
  'http://localhost:3000',
  'http://localhost:3001',
];

// Vercel preview deployment pattern: match-ops-local-*.vercel.app
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

// Google Play package and product configuration
const GOOGLE_PLAY_PACKAGE = 'com.matchops.app';
const VALID_PRODUCT_IDS = ['matchops_premium_monthly'];

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

    // Validate purchaseToken format (alphanumeric with common delimiters)
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

    if (isTestToken && mockBilling) {
      // Mock mode: Accept test tokens
      console.log(`Mock mode: accepting test token for user ${userId}`);
      periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
      orderId = `mock-order-${Date.now()}`;
    } else if (isTestToken && !mockBilling) {
      // Test token in production mode - reject
      return new Response(
        JSON.stringify({ error: 'Test tokens not accepted in production' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Real token - verify with Google Play API
      if (!googleServiceAccount) {
        console.error('Google service account not configured');
        return new Response(
          JSON.stringify({ error: 'Google Play verification not configured' }),
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

    // Calculate grace period end (7 days after subscription expires)
    const graceEnd = new Date(periodEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
    const now = new Date().toISOString();

    // Build subscription record
    const subscriptionRecord: SubscriptionRecord = {
      user_id: userId,
      status,
      google_purchase_token: purchaseToken,
      google_order_id: orderId,
      product_id: productId,
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
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${GOOGLE_PLAY_PACKAGE}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google API error:', response.status, errorText);
      return null;
    }

    return await response.json();
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
