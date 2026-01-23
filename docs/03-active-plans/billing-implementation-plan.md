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
