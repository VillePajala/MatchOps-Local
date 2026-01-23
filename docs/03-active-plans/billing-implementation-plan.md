# Billing Implementation Plan

**Status:** In Progress (Phase 7 Complete)
**Last Updated:** January 23, 2026
**Consolidates Issues:** #171, #258, #291, #292, #293, #299, #300, #301

---

## Executive Summary

This document consolidates all billing-related work into a single implementation plan. The goal is to enable Google Play Billing for premium subscriptions while ensuring:

1. **Account creation is tied to subscription** (no free cloud accounts)
2. **Subscription status lives in Supabase** (not just local IndexedDB)
3. **Cross-device sync works** (subscribe on one device, use on all)
4. **Non-Android platforms handled gracefully** (sign-in only, no purchase)
5. **Each phase is independently testable**

---

## Current State (Problems)

| Component | Current | Problem |
|-----------|---------|---------|
| Account creation | `signUp()` works without payment | Users can create cloud accounts for free |
| Premium storage | Local IndexedDB only | Doesn't sync across devices |
| Platform detection | None | Desktop users see payment UI that won't work |
| Server verification | None | Easy to spoof premium status |
| Cross-device | Broken | New device = appears non-premium |

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ANDROID DEVICE                            │
│  ┌──────────────┐                                               │
│  │ User clicks  │                                               │
│  │ "Subscribe"  │                                               │
│  └──────┬───────┘                                               │
│         ▼                                                        │
│  ┌──────────────┐     ┌──────────────┐                          │
│  │ Play Billing │────▶│ Purchase     │                          │
│  │ (Digital     │     │ Token        │                          │
│  │  Goods API)  │     └──────┬───────┘                          │
│  └──────────────┘            │                                   │
└──────────────────────────────┼───────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SUPABASE                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     │
│  │ Edge Function│────▶│ Google Play  │────▶│ subscriptions│     │
│  │ verify-      │     │ API Verify   │     │ table        │     │
│  │ subscription │     └──────────────┘     └──────┬───────┘     │
│  └──────────────┘                                 │              │
│                                                   │              │
│  ┌──────────────┐                                 │              │
│  │ auth.users   │◀────────────────────────────────┘              │
│  │ (account)    │  (subscription linked to user)                 │
│  └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ANY DEVICE (Android/Desktop/iOS)             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     │
│  │ User signs   │────▶│ Fetch sub    │────▶│ Premium      │     │
│  │ in           │     │ from Supabase│     │ features     │     │
│  └──────────────┘     └──────────────┘     │ unlocked     │     │
│                                            └──────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Database Foundation ✅ COMPLETE

**Goal:** Create subscription storage in Supabase with proper security.

**Completed:** January 23, 2026 - Migration `010_subscriptions.sql` applied to Supabase.

#### 1.1 Subscriptions Table Migration

```sql
-- supabase/migrations/010_subscriptions.sql

-- Subscription status enum for type safety
CREATE TYPE subscription_status AS ENUM (
  'none',       -- Never subscribed
  'active',     -- Paid and valid
  'cancelled',  -- User cancelled, but period not ended
  'grace',      -- Payment failed, in grace period
  'expired'     -- Grace ended, no access
);

-- Main subscriptions table
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status subscription_status NOT NULL DEFAULT 'none',

  -- Google Play fields
  google_purchase_token TEXT,
  google_order_id TEXT,
  product_id TEXT,

  -- Period tracking
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  grace_end TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ,

  -- Ensure one subscription per user
  CONSTRAINT unique_user_subscription UNIQUE (user_id)
);

-- RLS Policies
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own subscription
CREATE POLICY "Users can read own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Only Edge Functions can insert/update (via service role)
-- No direct user writes allowed

-- Index for fast lookups
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- Auto-update updated_at
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

#### 1.2 RPC for Subscription Check

```sql
-- Function to get subscription status (used by app)
CREATE OR REPLACE FUNCTION get_subscription_status()
RETURNS TABLE (
  status subscription_status,
  period_end TIMESTAMPTZ,
  grace_end TIMESTAMPTZ,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.status,
    s.period_end,
    s.grace_end,
    (s.status IN ('active', 'cancelled', 'grace')) AS is_active
  FROM subscriptions s
  WHERE s.user_id = auth.uid();

  -- Return none status if no subscription record
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'none'::subscription_status,
      NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ,
      FALSE;
  END IF;
END;
$$;
```

#### 1.3 Testing Phase 1

```typescript
// Test: Can create subscription record via service role
// Test: User can only read their own subscription
// Test: User cannot directly insert/update subscription
// Test: get_subscription_status() returns correct data
```

**Manual Test:**
1. Apply migration to Supabase
2. Insert test subscription via SQL editor (service role)
3. Verify RLS blocks direct user writes
4. Verify user can read own subscription

---

### Phase 2: Platform Detection & UI Gating ✅ COMPLETE

**Goal:** Different UI for Android vs Desktop/iOS.

**Completed:** January 23, 2026 - Platform detection utility, comprehensive tests, and platform-aware UI in WelcomeScreen and UpgradePromptModal.

#### 2.1 Platform Detection Utility

```typescript
// src/utils/platform.ts

/**
 * Platform detection utilities for billing
 */

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isDesktop(): boolean {
  return !isAndroid() && !isIOS();
}

/**
 * Check if Play Billing is potentially available
 * Note: Actual availability checked via Digital Goods API
 */
export function canUsePlayBilling(): boolean {
  return isAndroid();
}

/**
 * Check if Digital Goods API is available (TWA context)
 */
export async function isDigitalGoodsAvailable(): Promise<boolean> {
  if (!isAndroid()) return false;

  try {
    // Digital Goods API only available in TWA context
    if ('getDigitalGoodsService' in window) {
      const service = await (window as any).getDigitalGoodsService(
        'https://play.google.com/billing'
      );
      return service !== null;
    }
    return false;
  } catch {
    return false;
  }
}
```

#### 2.2 Platform-Aware Components

**WelcomeScreen Changes:**

```typescript
// src/components/WelcomeScreen.tsx

import { isAndroid } from '@/utils/platform';

// In render:
{isCloudAvailable && (
  isAndroid() ? (
    // Android: Can subscribe and create account
    <button onClick={onSubscribeAndCreateAccount}>
      {t('welcome.subscribeAndCreate', 'Subscribe & Create Account')}
      <span className="badge">{t('welcome.badgePaid', 'Paid')}</span>
    </button>
  ) : (
    // Desktop/iOS: Sign in only
    <>
      <button onClick={onSignIn}>
        {t('welcome.signInOnly', 'Sign In')}
      </button>
      <div className="mt-4 p-4 bg-slate-800 rounded-lg">
        <p>{t('welcome.androidRequired', 'New here? Subscribe via the Android app.')}</p>
        <a href="https://play.google.com/store/apps/details?id=com.matchops"
           className="text-amber-400">
          {t('welcome.getAndroidApp', 'Get on Google Play')}
        </a>
      </div>
    </>
  )
)}
```

**UpgradePromptModal Changes:**

```typescript
// In UpgradePromptModal.tsx

import { isAndroid } from '@/utils/platform';

// Replace canPurchase logic:
const canPurchase = isAndroid() && (!PREMIUM_ENFORCEMENT_ENABLED || isDev || isInternalTesting);

// In render, when !isAndroid():
{!isAndroid() && (
  <div className="text-center p-4 bg-slate-700/50 rounded-lg">
    <p>{t('premium.androidOnly', 'Subscriptions are available on the Android app.')}</p>
    <a href="https://play.google.com/store/apps/details?id=com.matchops">
      {t('premium.getAndroidApp', 'Get on Google Play')}
    </a>
    <div className="mt-4 border-t border-slate-600 pt-4">
      <p className="text-sm text-slate-400">
        {t('premium.alreadySubscribed', 'Already subscribed?')}
      </p>
      <button onClick={onSignIn}>
        {t('premium.signIn', 'Sign In')}
      </button>
    </div>
  </div>
)}
```

#### 2.3 Testing Phase 2

```typescript
// Unit tests for platform detection
describe('platform utils', () => {
  it('detects Android user agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
      configurable: true
    });
    expect(isAndroid()).toBe(true);
    expect(isDesktop()).toBe(false);
  });

  it('detects desktop user agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      configurable: true
    });
    expect(isAndroid()).toBe(false);
    expect(isDesktop()).toBe(true);
  });
});
```

**Manual Test:**
1. Open app in Chrome desktop → should see "Sign In" only
2. Open app in Chrome Android (or DevTools mobile emulation) → should see "Subscribe"
3. Verify upgrade prompts show correct UI per platform

---

### Phase 3: Verification Edge Function ✅ COMPLETE

**Goal:** Server-side purchase verification with Google Play API.

**Completed:** January 23, 2026 - Edge Function `verify-subscription` deployed to Supabase.

**Environment Variables Required:**
- `MOCK_BILLING=true` - Enable for testing with test tokens (prefix: `test-`)
- `GOOGLE_SERVICE_ACCOUNT_JSON` - Google Cloud service account for production

#### 3.1 Edge Function Setup

```typescript
// supabase/functions/verify-subscription/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GOOGLE_PLAY_PACKAGE = 'com.matchops.app';
const SUBSCRIPTION_PRODUCT_ID = 'matchops_premium_monthly';

interface VerifyRequest {
  purchaseToken: string;
  productId: string;
}

interface GoogleSubscription {
  expiryTimeMillis: string;
  paymentState: number;
  acknowledgementState: number;
  autoRenewing: boolean;
}

serve(async (req) => {
  try {
    // CORS headers
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'authorization, content-type',
        },
      });
    }

    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify JWT and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401
      });
    }

    // Parse request
    const { purchaseToken, productId }: VerifyRequest = await req.json();

    if (!purchaseToken || !productId) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), {
        status: 400
      });
    }

    // Verify with Google Play API
    const googleSubscription = await verifyWithGoogle(purchaseToken, productId);

    if (!googleSubscription) {
      return new Response(JSON.stringify({ error: 'Invalid purchase' }), {
        status: 400
      });
    }

    // Calculate dates
    const periodEnd = new Date(parseInt(googleSubscription.expiryTimeMillis));
    const graceEnd = new Date(periodEnd.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days grace

    // Determine status
    let status = 'active';
    if (googleSubscription.paymentState === 0) {
      status = 'grace'; // Payment pending
    }

    // Upsert subscription record
    const { error: upsertError } = await supabase
      .from('subscriptions')
      .upsert({
        user_id: user.id,
        status,
        google_purchase_token: purchaseToken,
        product_id: productId,
        period_end: periodEnd.toISOString(),
        grace_end: graceEnd.toISOString(),
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (upsertError) {
      console.error('Failed to upsert subscription:', upsertError);
      return new Response(JSON.stringify({ error: 'Database error' }), {
        status: 500
      });
    }

    return new Response(JSON.stringify({
      success: true,
      status,
      periodEnd: periodEnd.toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Verification error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500
    });
  }
});

async function verifyWithGoogle(
  purchaseToken: string,
  productId: string
): Promise<GoogleSubscription | null> {
  // Get Google API credentials from env
  const credentials = JSON.parse(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')!);

  // Get access token via service account
  const accessToken = await getGoogleAccessToken(credentials);

  // Call Google Play Developer API
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${GOOGLE_PLAY_PACKAGE}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    console.error('Google API error:', await response.text());
    return null;
  }

  return response.json();
}

async function getGoogleAccessToken(credentials: any): Promise<string> {
  // JWT-based service account authentication
  // Implementation details: create JWT, exchange for access token
  // ... (standard Google OAuth2 service account flow)
}
```

#### 3.2 Environment Variables Needed

```bash
# In Supabase Dashboard > Edge Functions > Secrets
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

#### 3.3 Testing Phase 3

**Mock Mode for Testing:**

```typescript
// Add to Edge Function for testing
const MOCK_MODE = Deno.env.get('MOCK_BILLING') === 'true';

if (MOCK_MODE && purchaseToken.startsWith('test-')) {
  // Accept test tokens in mock mode
  const mockSubscription = {
    status: 'active',
    periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
  // ... upsert and return
}
```

**Manual Test:**
1. Deploy Edge Function with `MOCK_BILLING=true`
2. Call with test token → should create subscription record
3. Verify subscription appears in database
4. Call `get_subscription_status()` → should return active

---

### Phase 4: Play Billing Integration (Client) ✅ COMPLETE

**Goal:** Integrate Digital Goods API for purchases.

**Completed:** January 23, 2026 - Play Billing utilities and React hook created with 18 tests.

#### 4.1 Play Billing Service

```typescript
// src/utils/playBilling.ts

import logger from './logger';

const PLAY_BILLING_SERVICE = 'https://play.google.com/billing';
const PRODUCT_ID = 'matchops_premium_monthly';

export interface PurchaseResult {
  success: boolean;
  purchaseToken?: string;
  error?: string;
}

export interface SubscriptionDetails {
  productId: string;
  title: string;
  description: string;
  price: string;
  priceMicros: number;
  currencyCode: string;
}

/**
 * Check if Digital Goods API is available
 */
export async function isPlayBillingAvailable(): Promise<boolean> {
  try {
    if (!('getDigitalGoodsService' in window)) {
      return false;
    }
    const service = await (window as any).getDigitalGoodsService(PLAY_BILLING_SERVICE);
    return service !== null;
  } catch (error) {
    logger.warn('Digital Goods API not available:', error);
    return false;
  }
}

/**
 * Get subscription product details
 */
export async function getSubscriptionDetails(): Promise<SubscriptionDetails | null> {
  try {
    const service = await (window as any).getDigitalGoodsService(PLAY_BILLING_SERVICE);
    if (!service) return null;

    const details = await service.getDetails([PRODUCT_ID]);
    if (!details || details.length === 0) return null;

    const item = details[0];
    return {
      productId: item.itemId,
      title: item.title,
      description: item.description,
      price: item.price.value,
      priceMicros: item.price.valueMicros,
      currencyCode: item.price.currency,
    };
  } catch (error) {
    logger.error('Failed to get subscription details:', error);
    return null;
  }
}

/**
 * Launch purchase flow
 */
export async function purchaseSubscription(): Promise<PurchaseResult> {
  try {
    // Use Payment Request API with Digital Goods
    const details = await getSubscriptionDetails();
    if (!details) {
      return { success: false, error: 'Product not available' };
    }

    const paymentMethod = {
      supportedMethods: PLAY_BILLING_SERVICE,
      data: {
        sku: PRODUCT_ID,
      },
    };

    const paymentDetails = {
      total: {
        label: details.title,
        amount: {
          currency: details.currencyCode,
          value: details.price,
        },
      },
    };

    const request = new PaymentRequest([paymentMethod], paymentDetails);
    const response = await request.show();

    // Get purchase token from response
    const purchaseToken = response.details?.purchaseToken;

    if (!purchaseToken) {
      await response.complete('fail');
      return { success: false, error: 'No purchase token received' };
    }

    await response.complete('success');

    return {
      success: true,
      purchaseToken,
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { success: false, error: 'cancelled' };
    }
    logger.error('Purchase failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check for existing purchases (restore)
 */
export async function getExistingPurchases(): Promise<string[]> {
  try {
    const service = await (window as any).getDigitalGoodsService(PLAY_BILLING_SERVICE);
    if (!service) return [];

    const purchases = await service.listPurchases();
    return purchases
      .filter((p: any) => p.itemId === PRODUCT_ID)
      .map((p: any) => p.purchaseToken);
  } catch (error) {
    logger.error('Failed to get existing purchases:', error);
    return [];
  }
}
```

#### 4.2 Purchase Hook

```typescript
// src/hooks/usePlayBilling.ts

import { useState, useCallback, useEffect } from 'react';
import {
  isPlayBillingAvailable,
  purchaseSubscription,
  getSubscriptionDetails,
  getExistingPurchases,
  SubscriptionDetails
} from '@/utils/playBilling';
import { useAuth } from '@/contexts/AuthProvider';
import { getSupabaseClient } from '@/auth/supabaseClient';
import logger from '@/utils/logger';

interface UsePlayBillingResult {
  isAvailable: boolean;
  isLoading: boolean;
  isPurchasing: boolean;
  details: SubscriptionDetails | null;
  purchase: () => Promise<{ success: boolean; error?: string }>;
  restore: () => Promise<{ success: boolean; error?: string }>;
}

export function usePlayBilling(): UsePlayBillingResult {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [details, setDetails] = useState<SubscriptionDetails | null>(null);
  const { user } = useAuth();

  // Check availability on mount
  useEffect(() => {
    async function checkAvailability() {
      const available = await isPlayBillingAvailable();
      setIsAvailable(available);

      if (available) {
        const productDetails = await getSubscriptionDetails();
        setDetails(productDetails);
      }

      setIsLoading(false);
    }
    checkAvailability();
  }, []);

  // Verify purchase with server
  const verifyPurchase = useCallback(async (purchaseToken: string) => {
    const supabase = await getSupabaseClient();

    const { data, error } = await supabase.functions.invoke('verify-subscription', {
      body: {
        purchaseToken,
        productId: 'matchops_premium_monthly',
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }, []);

  // Purchase flow
  const purchase = useCallback(async () => {
    if (!isAvailable) {
      return { success: false, error: 'Play Billing not available' };
    }

    setIsPurchasing(true);

    try {
      // 1. Launch Play Billing
      const result = await purchaseSubscription();

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // 2. Verify with server
      await verifyPurchase(result.purchaseToken!);

      return { success: true };
    } catch (error: any) {
      logger.error('Purchase flow failed:', error);
      return { success: false, error: error.message };
    } finally {
      setIsPurchasing(false);
    }
  }, [isAvailable, verifyPurchase]);

  // Restore purchases
  const restore = useCallback(async () => {
    if (!isAvailable) {
      return { success: false, error: 'Play Billing not available' };
    }

    try {
      const purchases = await getExistingPurchases();

      if (purchases.length === 0) {
        return { success: false, error: 'No purchases found' };
      }

      // Verify the most recent purchase
      await verifyPurchase(purchases[0]);

      return { success: true };
    } catch (error: any) {
      logger.error('Restore failed:', error);
      return { success: false, error: error.message };
    }
  }, [isAvailable, verifyPurchase]);

  return {
    isAvailable,
    isLoading,
    isPurchasing,
    details,
    purchase,
    restore,
  };
}
```

#### 4.3 Testing Phase 4

**Test Mode Flag:**
```typescript
// In development, allow mock purchases
const MOCK_PURCHASES = process.env.NODE_ENV === 'development'
  || process.env.NEXT_PUBLIC_MOCK_BILLING === 'true';

export async function purchaseSubscription(): Promise<PurchaseResult> {
  if (MOCK_PURCHASES) {
    // Simulate successful purchase
    return {
      success: true,
      purchaseToken: `test-token-${Date.now()}`,
    };
  }
  // ... real implementation
}
```

**Manual Test:**
1. Set `NEXT_PUBLIC_MOCK_BILLING=true`
2. Click "Subscribe" → should get mock token
3. Token sent to Edge Function (with `MOCK_BILLING=true`)
4. Subscription created in database
5. User sees premium features

---

### Phase 5: Subscription State Management ✅ COMPLETE

**Goal:** Track subscription state across the app.

**Completed:** January 23, 2026 - SubscriptionContext.tsx created with caching, useSubscription hook, and useSubscriptionOptional for conditional access.

#### 5.1 Subscription Context

```typescript
// src/contexts/SubscriptionContext.tsx

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthProvider';
import { getSupabaseClient } from '@/auth/supabaseClient';
import { getStorageItem, setStorageItem } from '@/utils/storage';
import logger from '@/utils/logger';

type SubscriptionStatus = 'none' | 'active' | 'cancelled' | 'grace' | 'expired';

interface SubscriptionState {
  status: SubscriptionStatus;
  periodEnd: Date | null;
  graceEnd: Date | null;
  isActive: boolean;
  isLoading: boolean;
}

interface SubscriptionContextValue extends SubscriptionState {
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

const CACHE_KEY = 'matchops_subscription_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user, mode } = useAuth();
  const [state, setState] = useState<SubscriptionState>({
    status: 'none',
    periodEnd: null,
    graceEnd: null,
    isActive: false,
    isLoading: true,
  });

  // Fetch subscription from Supabase
  const fetchSubscription = useCallback(async () => {
    if (mode !== 'cloud' || !user) {
      setState(s => ({ ...s, isLoading: false }));
      return;
    }

    try {
      // Check cache first
      const cached = await getCachedSubscription();
      if (cached) {
        setState({
          ...cached,
          isLoading: false,
        });
        return;
      }

      // Fetch from server
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.rpc('get_subscription_status');

      if (error) throw error;

      const subscription = data?.[0] || { status: 'none', is_active: false };

      const newState: SubscriptionState = {
        status: subscription.status,
        periodEnd: subscription.period_end ? new Date(subscription.period_end) : null,
        graceEnd: subscription.grace_end ? new Date(subscription.grace_end) : null,
        isActive: subscription.is_active,
        isLoading: false,
      };

      // Cache the result
      await cacheSubscription(newState);

      setState(newState);
    } catch (error) {
      logger.error('Failed to fetch subscription:', error);
      // Fall back to cached or none
      const cached = await getCachedSubscription();
      setState({
        ...(cached || { status: 'none', periodEnd: null, graceEnd: null, isActive: false }),
        isLoading: false,
      });
    }
  }, [user, mode]);

  // Initial fetch
  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // Refresh function for manual updates
  const refresh = useCallback(async () => {
    // Clear cache and refetch
    await clearSubscriptionCache();
    await fetchSubscription();
  }, [fetchSubscription]);

  return (
    <SubscriptionContext.Provider value={{ ...state, refresh }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
}

// Cache helpers
async function getCachedSubscription(): Promise<SubscriptionState | null> {
  try {
    const cached = await getStorageItem(CACHE_KEY);
    if (!cached) return null;

    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_DURATION) {
      return null; // Expired
    }

    return {
      ...data,
      periodEnd: data.periodEnd ? new Date(data.periodEnd) : null,
      graceEnd: data.graceEnd ? new Date(data.graceEnd) : null,
    };
  } catch {
    return null;
  }
}

async function cacheSubscription(state: SubscriptionState): Promise<void> {
  await setStorageItem(CACHE_KEY, JSON.stringify({
    data: state,
    timestamp: Date.now(),
  }));
}

async function clearSubscriptionCache(): Promise<void> {
  await setStorageItem(CACHE_KEY, '');
}
```

#### 5.2 Testing Phase 5

**Manual Test:**
1. Sign in with account that has subscription
2. Verify `useSubscription()` returns correct status
3. Go offline → verify cached status is used
4. Come back online → verify status refreshes

---

### Phase 6: Grace Period & Expiration UI ✅ COMPLETE

**Goal:** Handle expired/grace states gracefully.

**Completed:** January 23, 2026 - SubscriptionWarningBanner.tsx created with grace period countdown and expired state handling. Translation keys added for EN/FI.

#### 6.1 Subscription Warning Banner

```typescript
// src/components/SubscriptionWarningBanner.tsx

import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTranslation } from 'react-i18next';

export function SubscriptionWarningBanner() {
  const { t } = useTranslation();
  const { status, graceEnd } = useSubscription();

  if (status !== 'grace' && status !== 'expired') {
    return null;
  }

  const daysLeft = graceEnd
    ? Math.ceil((graceEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : 0;

  return (
    <div className={`p-3 ${status === 'expired' ? 'bg-red-900/50' : 'bg-amber-900/50'}`}>
      {status === 'grace' ? (
        <p>
          {t('subscription.graceWarning', {
            defaultValue: 'Your subscription has expired. Renew within {{days}} days to keep cloud access.',
            days: daysLeft,
          })}
        </p>
      ) : (
        <p>
          {t('subscription.expiredWarning',
            'Your subscription has expired. Renew to restore cloud access.'
          )}
        </p>
      )}
      <button onClick={openRenewFlow}>
        {t('subscription.renewNow', 'Renew Now')}
      </button>
    </div>
  );
}
```

#### 6.2 Expired State Handling

```typescript
// In data operations, check subscription
async function saveGame(game: AppState) {
  const { isActive, status } = useSubscription();

  if (!isActive && status === 'expired') {
    throw new SubscriptionExpiredError(
      'Your subscription has expired. Renew or switch to local mode.'
    );
  }

  // ... save operation
}
```

---

### Phase 7: Cross-Device Sync ✅ COMPLETE

**Goal:** Subscription works on any device after sign-in.

**Completed:** January 23, 2026 - usePlayBilling hook updated to return purchaseToken in BillingResult. UpgradePromptModal integrated with Play Billing for real purchases. Purchase token stored locally via grantPremiumAccess for cross-device sync.

#### 7.1 Post-Login Subscription Check

```typescript
// In AuthProvider, after successful sign-in:

async function handleSignIn(email: string, password: string) {
  const result = await authService.signIn(email, password);

  if (!result.error) {
    // Fetch subscription status
    const subscription = await fetchSubscriptionStatus();

    // Grant local premium if active
    if (subscription.isActive) {
      await grantPremium(subscription.purchaseToken);
    }
  }

  return result;
}
```

#### 7.2 Testing Phase 7

**Manual Test:**
1. Subscribe on Device A (Android)
2. Sign in on Device B (can be desktop)
3. Verify premium features available on Device B
4. Sign out on Device B → premium revoked locally
5. Sign in again → premium restored

---

### Phase 8: Enable Enforcement

**Goal:** Flip the production switch.

#### 8.1 Final Checklist

```typescript
// Before setting PREMIUM_ENFORCEMENT_ENABLED = true:

// [ ] Play Billing integration complete
// [ ] Edge Function deployed and tested
// [ ] Subscriptions table in production
// [ ] Platform detection working
// [ ] Cross-device sync tested
// [ ] Grace period UI tested
// [ ] Restore purchases working
// [ ] Error handling comprehensive
```

#### 8.2 Enable Flag

```typescript
// src/config/constants.ts
export const PREMIUM_ENFORCEMENT_ENABLED = true;
```

#### 8.3 Update Tests

```typescript
// src/__tests__/security/premium-env.test.ts
expect(PREMIUM_ENFORCEMENT_ENABLED).toBe(true);
```

---

## Testing Strategy

### Environment Flags

| Flag | Purpose | Where |
|------|---------|-------|
| `NEXT_PUBLIC_MOCK_BILLING` | Mock client-side purchases | `.env.local` |
| `MOCK_BILLING` | Accept test tokens in Edge Function | Supabase secrets |
| `PREMIUM_ENFORCEMENT_ENABLED` | Block free premium in production | `constants.ts` |

### Test Scenarios

| Scenario | Mock Billing | Enforcement | Expected |
|----------|--------------|-------------|----------|
| Development | true | false | Can "purchase" freely |
| Staging | true | true | Mock purchases work, real blocked |
| Production | false | true | Only real Play Store works |

### Manual Test Checklist

- [ ] Platform detection (Android vs Desktop)
- [ ] Mock purchase flow
- [ ] Subscription created in Supabase
- [ ] Cross-device sign-in restores premium
- [ ] Grace period banner shows
- [ ] Expired state blocks cloud writes
- [ ] Restore purchases works
- [ ] Desktop shows "Get Android app"

---

## Related Issues (Consolidated)

This plan consolidates and supersedes:

- [x] #171 - Epic: P4C - Play Billing API Integration
- [x] #258 - Enable PREMIUM_ENFORCEMENT_ENABLED
- [x] #291 - Integrate Google Play Billing
- [x] #292 - Subscription state management
- [x] #293 - Grace period and expiration handling
- [x] #299 - Platform-aware billing (was: Limit cloud sync)
- [x] #300 - Server-side subscription verification
- [x] #301 - Cross-device subscription sync

---

## Implementation Order

1. **Phase 1:** Database foundation (migration + RPC)
2. **Phase 2:** Platform detection + UI gating
3. **Phase 3:** Edge Function for verification
4. **Phase 4:** Play Billing client integration
5. **Phase 5:** Subscription context/state management
6. **Phase 6:** Grace period UI
7. **Phase 7:** Cross-device sync
8. **Phase 8:** Enable enforcement (final step)

Each phase can be tested independently before moving to the next.

---

# PART 2: Account-Subscription Separation Model

**Added:** January 23, 2026
**Status:** Implementation In Progress

This section documents the **revised billing model** that separates account creation from subscription. This supersedes the original model where "account creation is tied to subscription."

---

## Model Overview

### Core Principle

**Account and Subscription are SEPARATE concepts.**

| Concept | Cost | What It Provides |
|---------|------|------------------|
| **Account** | FREE | Identity, sign-in, future recovery, support |
| **Subscription** | PAID | Active cloud sync across devices |

### The Three User States

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER STATES                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  STATE 1: Anonymous Local                                                │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ • No account                                                     │    │
│  │ • Data in local IndexedDB only                                   │    │
│  │ • Works offline                                                  │    │
│  │ • Single device                                                  │    │
│  │ • FREE                                                           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼ (Create free account)                     │
│  STATE 2: Account without Subscription                                   │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ • Has account (email + password)                                 │    │
│  │ • Data in local IndexedDB (NOT synced)                           │    │
│  │ • Can sign in on any device (but data doesn't sync)              │    │
│  │ • Cloud sync PAUSED                                              │    │
│  │ • FREE                                                           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼ (Subscribe)                               │
│  STATE 3: Account with Active Subscription                               │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ • Has account                                                    │    │
│  │ • Data in Supabase cloud (actively syncing)                      │    │
│  │ • Works across all devices                                       │    │
│  │ • Cloud sync ACTIVE                                              │    │
│  │ • PAID (subscription required)                                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼ (Cancel subscription)                     │
│  STATE 4: Account with Expired Subscription                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ • Has account                                                    │    │
│  │ • Cloud data FROZEN (preserved, not deleted)                     │    │
│  │ • New data goes to local storage                                 │    │
│  │ • Cloud sync PAUSED                                              │    │
│  │ • FREE (until resubscribe)                                       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼ (Resubscribe)                             │
│                       Back to STATE 3                                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Detailed State Definitions

### State 1: Anonymous Local

**Entry:** User selects "Start without account" on Welcome Screen

| Aspect | Value |
|--------|-------|
| Account | None |
| Data location | Local IndexedDB |
| Sync status | N/A (no account) |
| Cost | Free |
| Devices | Single device only |
| Data recovery | Not possible (no account) |

**Available actions:**
- Use app fully (unlimited local features)
- Create account anytime (→ State 2)
- Export/import backups manually

---

### State 2: Account without Subscription

**Entry:** User creates free account OR subscription expires

| Aspect | Value |
|--------|-------|
| Account | Active (email + password) |
| Data location | Local IndexedDB |
| Sync status | PAUSED |
| Cost | Free |
| Devices | Can sign in anywhere, but data is local to each device |
| Data recovery | Account recovery via password reset |

**Available actions:**
- Use app fully (unlimited local features)
- Sign in/out on any device
- Subscribe to enable sync (→ State 3)
- Delete account

**UI indicators:**
- CloudSyncSection: "Account: Active ✓ | Sync: Paused ⚠"
- Banner: "Subscribe to sync your data across devices"

---

### State 3: Account with Active Subscription

**Entry:** User subscribes via Google Play Billing

| Aspect | Value |
|--------|-------|
| Account | Active |
| Data location | Supabase cloud |
| Sync status | ACTIVE |
| Cost | Paid (monthly subscription) |
| Devices | All devices sync automatically |
| Data recovery | Cloud backup + account recovery |

**Available actions:**
- Use app fully with cloud sync
- Sign in on any device (data syncs)
- Cancel subscription (→ State 4)
- Delete account

**UI indicators:**
- CloudSyncSection: "Account: Active ✓ | Sync: Active ✓"
- No warning banners

---

### State 4: Account with Expired Subscription

**Entry:** User cancels subscription OR payment fails after grace period

| Aspect | Value |
|--------|-------|
| Account | Active |
| Cloud data | FROZEN (preserved, read-only) |
| New data location | Local IndexedDB |
| Sync status | PAUSED |
| Cost | Free |
| Devices | Can sign in, but data doesn't sync |

**Available actions:**
- Use app with local data
- View frozen cloud data (read-only)
- Resubscribe to resume sync (→ State 3)
- Delete account

**UI indicators:**
- CloudSyncSection: "Account: Active ✓ | Sync: Paused (subscription expired)"
- Banner: "Resubscribe to sync your data"

---

## Data Flow Diagrams

### Creating Account and Subscribing

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Welcome      │     │ Create       │     │ App (Local)  │
│ Screen       │────▶│ Account      │────▶│ with Account │
│              │     │ (FREE)       │     │ No Sync      │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                                  │ User subscribes
                                                  ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ App (Cloud)  │     │ Verify       │     │ Play Billing │
│ Syncing      │◀────│ Subscription │◀────│ Purchase     │
│              │     │ (Edge Func)  │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
```

### Subscription Expiration Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Active       │     │ User         │     │ Grace        │
│ Subscription │────▶│ Cancels      │────▶│ Period       │
│              │     │              │     │ (7 days)     │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                                  │ Grace expires
                                                  ▼
┌──────────────┐                          ┌──────────────┐
│ Local Mode   │                          │ Subscription │
│ Cloud Frozen │◀─────────────────────────│ Expired      │
│ Account OK   │                          │              │
└──────────────┘                          └──────────────┘
```

### Resubscription Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Expired Sub  │     │ User         │     │ Merge        │
│ Local Data   │────▶│ Resubscribes │────▶│ Wizard       │
│ Cloud Frozen │     │              │     │              │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                                                  │ User chooses merge strategy
                                                  ▼
                     ┌──────────────┐     ┌──────────────┐
                     │ Sync         │     │ Active       │
                     │ Resumed      │◀────│ Subscription │
                     │              │     │              │
                     └──────────────┘     └──────────────┘
```

---

## User Experience Specifications

### Welcome Screen

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│                         MatchOps                                 │
│                                                                  │
│                        Welcome!                                  │
│                Choose how to get started                         │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Start without an account                                 │    │
│  │ FREE                                                     │    │
│  │ Your data is saved on this device only.                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Sign in or create an account                             │    │
│  │ FREE ACCOUNT                                             │    │
│  │ Create a free account. Subscribe anytime to sync         │    │
│  │ across devices.                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Import a backup                                          │    │
│  │ FREE                                                     │    │
│  │ Restore your previous data from a file.                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│              You can change this later in Settings               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Settings - Cloud Sync Section (No Subscription)

```
┌─────────────────────────────────────────────────────────────────┐
│ Account & Sync                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 👤 Account: user@email.com                              ✓   │ │
│ │ [Sign Out]                                                  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ⚠ Sync Status: Paused                                       │ │
│ │                                                             │ │
│ │ Your account is active but cloud sync is paused.            │ │
│ │ Subscribe to sync your data across devices.                 │ │
│ │                                                             │ │
│ │ [Subscribe Now]                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ Your data is stored locally on this device.                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Settings - Cloud Sync Section (With Subscription)

```
┌─────────────────────────────────────────────────────────────────┐
│ Account & Sync                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ☁ Cloud Mode: Active                                    ✓   │ │
│ │ Your data syncs to the cloud.                               │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ [Sign Out]                                                       │
│ [Switch to Local Mode]                                           │
│                                                                  │
│ ─────────────────────────────────────────────────────────────── │
│ Danger Zone                                                      │
│ [Clear All Cloud Data]                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## What This Model Does NOT Change

The following remain exactly the same:

| Component | Behavior |
|-----------|----------|
| Local mode features | Unlimited, free, works offline |
| Play Billing integration | Same - verifies via Edge Function |
| Subscription storage | Same - Supabase `subscriptions` table |
| SubscriptionContext | Same - fetches status from RPC |
| Migration wizard | Same - used when switching modes |
| Reverse migration | Same - downloads cloud data to local |
| Grace period handling | Same - 7 days after payment failure |

---

## What This Model DOES Change

| Component | Old Behavior | New Behavior |
|-----------|--------------|--------------|
| Account creation | Gated behind subscription | Free on all platforms |
| WelcomeScreen | "PAID" badge for cloud | "FREE ACCOUNT" badge |
| WelcomeScreen (Desktop) | Sign-in only, no registration | Full registration allowed |
| Post-login check | No subscription → kick to local | No subscription → stay logged in, show banner |
| CloudSyncSection | "Enable Cloud" gated | "Enable Cloud" free, sync status shown |
| useCloudUpgradeGate | Gates cloud enabling | Removed or gates sync-only operations |
| AuthProvider.signUp | Granted mock subscription (Android) | No subscription granted |

---

## Business Rationale

### Why Separate Account from Subscription?

1. **Lower barrier to entry**
   - Users can try cloud account without commitment
   - More users create accounts → larger potential customer base

2. **Reduced churn friction**
   - Canceling subscription ≠ losing everything
   - Users feel safe to try, cancel, and return

3. **Higher return rate**
   - Account remains active after cancellation
   - One-click resubscribe vs. starting from scratch

4. **Standard SaaS pattern**
   - Netflix, Spotify, etc. don't delete accounts on cancellation
   - Users expect this behavior

### Revenue Impact

| Metric | Old Model | New Model | Impact |
|--------|-----------|-----------|--------|
| Account creation rate | Lower (payment barrier) | Higher (free) | ↑ Funnel size |
| Conversion to paid | Higher % of smaller base | Lower % of larger base | ≈ Net neutral |
| Churn anxiety | High | Low | ↓ Cancellation fear |
| Return rate | Low | High | ↑ Resubscriptions |

---

## Edge Cases and Handling

### Edge Case 1: User Signs In on New Device (No Subscription)

**Scenario:** User has account but no subscription. Signs in on Device B.

**Behavior:**
- Sign-in succeeds (account exists)
- App loads in "cloud mode" but sync is paused
- Local data on Device B is empty (or whatever was there before)
- Banner: "Subscribe to sync your data"

**NOT expected:** User's data from Device A magically appears (that requires subscription).

---

### Edge Case 2: Subscription Expires Mid-Session

**Scenario:** User is actively using app when subscription expires.

**Behavior:**
- Current session continues normally
- On next app launch or subscription check:
  - Cloud data is frozen
  - New changes go to local storage
  - Banner appears: "Subscription expired. Your data is stored locally."

---

### Edge Case 3: User Resubscribes After Using Local for a While

**Scenario:** User had subscription, cancelled, made local changes, now resubscribes.

**Behavior:**
1. Subscription verified
2. Migration wizard appears with options:
   - **Merge:** Combine local and cloud data
   - **Cloud wins:** Discard local changes, use cloud
   - **Local wins:** Replace cloud with local data
3. User chooses, sync resumes

---

### Edge Case 4: User Deletes Account

**Scenario:** User wants to completely remove their account.

**Behavior:**
- Account deletion available in Settings (GDPR compliance)
- Deletes: auth user, all cloud data, subscription record
- User returns to State 1 (Anonymous Local)
- Local data on current device remains (user's choice to keep or delete)

---

## Security Considerations

### What's Protected

| Resource | Protection |
|----------|------------|
| Cloud data | Only accessible with valid session + subscription |
| Subscription status | Read-only for users, write via Edge Function only |
| Account | Standard Supabase auth security |

### Attack Vectors Addressed

| Attack | Mitigation |
|--------|------------|
| Create account, never pay, use cloud | Sync is paused without subscription - no cloud storage used |
| Spoof subscription status | Server-side verification via Edge Function |
| Access other users' data | RLS policies restrict to own user_id |

---

# PART 3: Implementation Plan for Model Migration

**Goal:** Migrate from "Account tied to Subscription" to "Account-Subscription Separation"

---

## Pre-Implementation State

### Files Modified (Partially Complete)

| File | Status | Changes Made |
|------|--------|--------------|
| `AuthProvider.tsx` | ✅ Done | Removed mock subscription grant from signUp |
| `AuthProvider.test.tsx` | ✅ Done | Removed platform/billing mocks |
| `CloudSyncSection.tsx` | ✅ Done | Removed useCloudUpgradeGate, added subscription banner |
| `WelcomeScreen.tsx` | ✅ Done | Unified "FREE ACCOUNT" for all platforms |

### Files Still Need Changes

| File | Status | Changes Needed |
|------|--------|----------------|
| `page.tsx` | 🔲 Todo | Remove useCloudUpgradeGate, update post-login flow |
| `useCloudUpgradeGate.ts` | 🔲 Todo | Delete or repurpose for sync-only gating |
| `LoginScreen.tsx` | 🔲 Todo | Ensure registration allowed on all platforms |
| Translation files | 🔲 Todo | Add new translation keys |
| Tests | 🔲 Todo | Update tests for new behavior |

---

## Implementation Steps

### Step 1: Update page.tsx - Remove Cloud Upgrade Gate

**File:** `src/app/page.tsx`

**Changes:**
1. Remove `useCloudUpgradeGate` import
2. Remove gate-related state and handlers
3. Simplify `handleEnableCloudSync` to call `executeEnableCloudSync` directly
4. Remove the gate-based `UpgradePromptModal`

**Before:**
```typescript
import { useCloudUpgradeGate } from '@/hooks/useCloudUpgradeGate';

const {
  showModal: showCloudUpgradeModal,
  gateCloudAction,
  handleUpgradeSuccess: handleCloudUpgradeSuccess,
  handleCancel: handleCloudUpgradeCancel,
} = useCloudUpgradeGate();

const handleEnableCloudSync = useCallback(() => {
  gateCloudAction(executeEnableCloudSync);
}, [gateCloudAction, executeEnableCloudSync]);
```

**After:**
```typescript
// No useCloudUpgradeGate import

const handleEnableCloudSync = useCallback(() => {
  executeEnableCloudSync();
}, [executeEnableCloudSync]);
```

---

### Step 2: Update page.tsx - Fix Post-Login Flow

**File:** `src/app/page.tsx`

**Current behavior:** If user signs in without subscription, they're kicked back to local mode.

**New behavior:** User stays logged in, sync is paused, banner shown.

**Changes:**
1. Remove the effect that checks premium after login and kicks to local
2. Let user stay in cloud mode (logged in but sync paused)
3. SubscriptionContext + CloudSyncSection handle the "no subscription" UI

**Find and remove/modify:**
```typescript
// Current: kicks user to local if no premium
if (!isPremium) {
  setShowPostLoginUpgradeModal(true);
}

// handlePostLoginUpgradeCancel: disables cloud mode
```

**Replace with:**
```typescript
// New: let user stay logged in, sync is paused
// No modal, no kick to local
// CloudSyncSection shows subscription banner
```

---

### Step 3: Update LoginScreen.tsx - Allow Registration Everywhere

**File:** `src/components/LoginScreen.tsx`

**Current:** `allowRegistration` prop controls whether signup is shown.

**New:** Registration always allowed (prop removed or always true).

**Changes:**
1. Remove `allowRegistration` prop or default to `true`
2. Show signup form on all platforms
3. Update messaging: "Create a free account"

---

### Step 4: Clean Up useCloudUpgradeGate

**File:** `src/hooks/useCloudUpgradeGate.ts`

**Options:**
1. **Delete entirely** - if no longer used
2. **Repurpose** - rename to `useSyncGate` for gating sync-only operations

**Recommendation:** Delete if CloudSyncSection no longer uses it.

Also update/delete the test file: `src/hooks/__tests__/useCloudUpgradeGate.test.ts`

---

### Step 5: Add Translation Keys

**Files:**
- `public/locales/en/common.json`
- `public/locales/fi/common.json`

**New keys needed:**
```json
{
  "welcome": {
    "badgeFreeAccount": "Free Account",
    "signInCloudDescFree": "Create a free account. Subscribe anytime to sync across devices."
  },
  "cloudSync": {
    "subscriptionRequired": "Subscription Required",
    "subscriptionRequiredDescription": "Your account is active but cloud sync is paused. Subscribe to sync your data across devices.",
    "subscribeButton": "Subscribe Now",
    "cloudNoSubscription": "You have a cloud account but sync is paused. Subscribe to enable cloud sync."
  }
}
```

---

### Step 6: Update Migration Wizard Trigger

**File:** Where migration wizard is triggered (likely `page.tsx`)

**Current:** Migration wizard shown when entering cloud mode with local data.

**New:** Migration wizard shown when:
- Entering cloud mode with local data AND
- User has active subscription

**Changes:**
1. Add subscription check before showing migration wizard
2. If no subscription: show "Subscribe to migrate your data" message

---

### Step 7: Update Tests

**Files to update:**
- `src/contexts/__tests__/AuthProvider.test.tsx` - already updated
- `src/app/__tests__/page.test.tsx` - remove gate expectations
- `src/components/__tests__/CloudSyncSection.test.tsx` - update for new behavior
- `src/components/__tests__/WelcomeScreen.test.tsx` - update for unified button
- `src/hooks/__tests__/useCloudUpgradeGate.test.ts` - delete or update

---

### Step 8: Manual Testing Checklist

**Test each user state:**

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Anonymous local | Choose "Start without account" | App works, data local |
| Create free account | Click "Create account", sign up | Account created, sync paused, banner shown |
| Subscribe | Click "Subscribe Now" on Android | Play Billing flow, subscription verified, sync enabled |
| Sign out | Click "Sign Out" | Returns to login screen |
| Sign in (with subscription) | Sign in | Cloud mode, syncing |
| Sign in (no subscription) | Sign in | Cloud mode, sync paused, banner shown |
| Cancel subscription | Cancel in Play Store | After grace period: sync paused, banner shown |
| Resubscribe | Subscribe again | Merge wizard if needed, sync resumes |
| Desktop account creation | On desktop, create account | Works (no platform restriction) |

---

## Implementation Order Summary

```
Step 1: page.tsx - Remove useCloudUpgradeGate usage
         ↓
Step 2: page.tsx - Fix post-login flow (no kick to local)
         ↓
Step 3: LoginScreen.tsx - Allow registration everywhere
         ↓
Step 4: useCloudUpgradeGate.ts - Delete or repurpose
         ↓
Step 5: Translation files - Add new keys
         ↓
Step 6: Migration wizard - Add subscription check
         ↓
Step 7: Tests - Update all affected tests
         ↓
Step 8: Manual testing - Verify all states
```

---

## Rollback Plan

If issues arise, revert to previous model:

1. Restore `useCloudUpgradeGate` usage in `CloudSyncSection` and `page.tsx`
2. Restore post-login premium check that kicks to local
3. Restore platform-specific WelcomeScreen buttons
4. Restore mock subscription grant in `AuthProvider.signUp`

All changes are in application code (no database migrations needed for rollback).

---

## Success Criteria

The implementation is complete when:

1. ✅ Users can create accounts for free on all platforms
2. ✅ Users with accounts but no subscription see "sync paused" UI
3. ✅ Users are NOT kicked to local mode after signing in without subscription
4. ✅ Subscribe button works and enables sync
5. ✅ Canceling subscription pauses sync but preserves account
6. ✅ Resubscribing prompts merge wizard and resumes sync
7. ✅ All tests pass
8. ✅ Manual testing of all user states passes
