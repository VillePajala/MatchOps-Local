# Google Play Billing Implementation Guide (P4C)

**Status**: ✅ Implementation Complete (January 2026)
**Last Updated**: January 26, 2026

> **Note**: This guide has been updated to reflect the implemented architecture. The actual implementation uses Supabase Edge Functions for verification and monthly subscriptions (not one-time purchases).

## Overview

This document details the implementation of Google Play Billing for the MatchOps TWA (Trusted Web Activity) app. The billing system uses two Web APIs:

- **Digital Goods API** - Retrieves product details and checks existing purchases
- **Payment Request API** - Handles the actual purchase transaction

**Requirements:** Chrome 101+, Android 9+, app installed via Google Play

## Actual Implementation (What Was Built)

| Component | File | Status |
|-----------|------|--------|
| Play Billing Utility | `src/utils/playBilling.ts` | ✅ Complete |
| React Hook | `src/hooks/usePlayBilling.ts` | ✅ Complete (18 tests) |
| Platform Detection | `src/utils/platform.ts` | ✅ Complete |
| Edge Function | `supabase/functions/verify-subscription/index.ts` | ✅ Complete |
| Subscription Table | `supabase/migrations/010_subscriptions.sql` | ✅ Complete |
| Subscription Context | `src/contexts/SubscriptionContext.tsx` | ✅ Complete |
| Premium Manager | `src/utils/premiumManager.ts` | ✅ Complete |

**Product ID**: `matchops_premium_monthly` (subscription, not one-time purchase)

### Purchase Flow (Implemented Architecture)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PURCHASE FLOW                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  User clicks          Digital Goods API       Payment Request API       │
│  "Subscribe"          checks product          shows Play dialog         │
│      │                     │                        │                   │
│      ▼                     ▼                        ▼                   │
│  ┌────────┐          ┌──────────┐            ┌──────────┐              │
│  │ Button │ ───────► │ getDetails│ ─────────►│  show()  │              │
│  └────────┘          └──────────┘            └────┬─────┘              │
│                                                   │                     │
│                                                   ▼                     │
│                                           User completes                │
│                                           payment in Play               │
│                                                   │                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                SUPABASE EDGE FUNCTION VERIFICATION               │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                              │                                   │   │
│  │   ┌──────────────┐     ┌─────▼─────┐     ┌──────────────┐       │   │
│  │   │   verify-    │ ◄── │ Purchase  │ ──► │ Google Play  │       │   │
│  │   │ subscription │     │  Token    │     │ Developer API│       │   │
│  │   │ (Edge Func)  │     └───────────┘     └──────────────┘       │   │
│  │   └──────┬───────┘                                               │   │
│  │          │                                                       │   │
│  │          ▼                                                       │   │
│  │   ┌──────────────┐                                               │   │
│  │   │ subscriptions│  (Upsert with status, period_end, grace_end) │   │
│  │   │    table     │                                               │   │
│  │   └──────────────┘                                               │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│             │                                                           │
│             ▼                                                           │
│      ┌─────────────┐          ┌─────────────┐                          │
│      │Grant Premium│ ───────► │  IndexedDB  │ (local cache)            │
│      │   Access    │          │   Storage   │                          │
│      └─────────────┘          └─────────────┘                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### Google Play Console Setup

1. **Developer Account** ($25 one-time fee)
   - Register at [play.google.com/console](https://play.google.com/console)

2. **Create In-App Product**
   - Go to: Your App → Monetize → In-app products → Create product
   - Product ID: `premium_upgrade`
   - Type: One-time purchase (managed product)
   - Price: 9,99 €
   - Title: "MatchOps Full Version" / "MatchOps Täysversio"

3. **Link Merchant Account**
   - Settings → Payments profile
   - Required for receiving payments

4. **License Testers**
   - Settings → License testing → Add email addresses
   - Testers can make free test purchases

---

## Implementation Files

### 1. Play Billing Utility (`src/utils/playBilling.ts`)

```typescript
/**
 * Google Play Billing integration for TWA
 * Uses Digital Goods API + Payment Request API
 */

// Product SKU constant
export const PREMIUM_SKU = 'premium_upgrade';

// TypeScript declarations for Digital Goods API
declare global {
  interface Window {
    getDigitalGoodsService?: (serviceProvider: string) => Promise<DigitalGoodsService>;
  }
}

interface DigitalGoodsService {
  getDetails(itemIds: string[]): Promise<ItemDetails[]>;
  listPurchases(): Promise<PurchaseDetails[]>;
  consume(purchaseToken: string): Promise<void>;
}

interface ItemDetails {
  itemId: string;
  title: string;
  description: string;
  price: {
    currency: string;
    value: string;
  };
  type: 'product' | 'subscription';
}

interface PurchaseDetails {
  itemId: string;
  purchaseToken: string;
}

export interface ProductInfo {
  itemId: string;
  title: string;
  description: string;
  formattedPrice: string;
  currency: string;
  value: number;
}

export interface PurchaseResult {
  success: boolean;
  purchaseToken?: string;
  orderId?: string;
  error?: string;
}

/**
 * Check if Google Play Billing is available
 */
export async function isPlayBillingAvailable(): Promise<boolean> {
  if (!('getDigitalGoodsService' in window)) {
    console.log('[PlayBilling] Digital Goods API not available');
    return false;
  }

  try {
    await window.getDigitalGoodsService!('https://play.google.com/billing');
    console.log('[PlayBilling] Google Play Billing is available');
    return true;
  } catch (error) {
    console.log('[PlayBilling] Not available:', error);
    return false;
  }
}

/**
 * Get product details from Google Play
 */
export async function getProductDetails(skus: string[] = [PREMIUM_SKU]): Promise<ProductInfo[]> {
  try {
    const service = await window.getDigitalGoodsService!('https://play.google.com/billing');
    const details = await service.getDetails(skus);

    return details.map((item) => ({
      itemId: item.itemId,
      title: item.title,
      description: item.description,
      currency: item.price.currency,
      value: parseFloat(item.price.value),
      formattedPrice: new Intl.NumberFormat(navigator.language, {
        style: 'currency',
        currency: item.price.currency,
      }).format(parseFloat(item.price.value)),
    }));
  } catch (error) {
    console.error('[PlayBilling] Failed to get product details:', error);
    throw error;
  }
}

/**
 * Check for existing purchases (e.g., on app startup)
 */
export async function getExistingPurchases(): Promise<PurchaseDetails[]> {
  try {
    const service = await window.getDigitalGoodsService!('https://play.google.com/billing');
    return await service.listPurchases();
  } catch (error) {
    console.error('[PlayBilling] Failed to get existing purchases:', error);
    return [];
  }
}

/**
 * Initiate a purchase using Payment Request API
 */
export async function makePurchase(sku: string = PREMIUM_SKU): Promise<PurchaseResult> {
  try {
    const paymentMethods = [
      {
        supportedMethods: 'https://play.google.com/billing',
        data: { sku },
      },
    ];

    // Play Billing ignores these values - uses price from Play Console
    const paymentDetails = {
      total: {
        label: 'Total',
        amount: { currency: 'EUR', value: '0' },
      },
    };

    const request = new PaymentRequest(paymentMethods, paymentDetails);
    const response = await request.show();

    const { purchaseToken, orderId } = response.details;

    await response.complete('success');

    return {
      success: true,
      purchaseToken,
      orderId,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { success: false, error: 'cancelled' };
    }
    console.error('[PlayBilling] Purchase failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Purchase failed',
    };
  }
}
```

### 2. React Hook (`src/hooks/usePlayBilling.ts`)

```typescript
import { useState, useEffect, useCallback } from 'react';
import {
  isPlayBillingAvailable,
  getProductDetails,
  getExistingPurchases,
  makePurchase,
  PREMIUM_SKU,
  ProductInfo,
} from '@/utils/playBilling';
import { usePremium } from './usePremium';

export function usePlayBilling() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [product, setProduct] = useState<ProductInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { grantPremiumAccess, isPremium } = usePremium();

  // Check availability and load product on mount
  useEffect(() => {
    async function init() {
      try {
        const available = await isPlayBillingAvailable();
        setIsAvailable(available);

        if (available) {
          // Get product details
          const products = await getProductDetails([PREMIUM_SKU]);
          if (products.length > 0) {
            setProduct(products[0]);
          }

          // Check for existing purchases
          const purchases = await getExistingPurchases();
          const hasPremium = purchases.some((p) => p.itemId === PREMIUM_SKU);
          if (hasPremium && !isPremium) {
            // User has purchase but app doesn't know - restore it
            const purchase = purchases.find((p) => p.itemId === PREMIUM_SKU);
            if (purchase) {
              await verifyAndGrantPremium(purchase.purchaseToken);
            }
          }
        }
      } catch (err) {
        console.error('[usePlayBilling] Init error:', err);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [isPremium]);

  // Verify purchase with backend and grant premium
  const verifyAndGrantPremium = async (purchaseToken: string, orderId?: string) => {
    try {
      const response = await fetch('/api/billing/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseToken,
          sku: PREMIUM_SKU,
          orderId,
        }),
      });

      if (!response.ok) {
        throw new Error('Verification failed');
      }

      const result = await response.json();
      if (result.verified) {
        await grantPremiumAccess(purchaseToken);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[usePlayBilling] Verification error:', err);
      return false;
    }
  };

  // Purchase premium
  const purchasePremium = useCallback(async (): Promise<boolean> => {
    if (!isAvailable) {
      setError('Google Play Billing not available');
      return false;
    }

    setIsPurchasing(true);
    setError(null);

    try {
      const result = await makePurchase(PREMIUM_SKU);

      if (!result.success) {
        if (result.error === 'cancelled') {
          // User cancelled - not an error
          return false;
        }
        setError(result.error || 'Purchase failed');
        return false;
      }

      // Verify with backend
      const verified = await verifyAndGrantPremium(
        result.purchaseToken!,
        result.orderId
      );

      if (!verified) {
        setError('Purchase verification failed');
        return false;
      }

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed');
      return false;
    } finally {
      setIsPurchasing(false);
    }
  }, [isAvailable]);

  return {
    isAvailable,
    isLoading,
    isPurchasing,
    product,
    error,
    purchasePremium,
  };
}
```

### 3. Backend Verification Endpoint (`pages/api/billing/verify.ts`)

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { google } from 'googleapis';

// Service account credentials (store securely!)
const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountKey) {
  throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable not set');
}
const GOOGLE_SERVICE_ACCOUNT = JSON.parse(serviceAccountKey);
const PACKAGE_NAME = 'app.matchops.local'; // Your app package name

// Error codes for client handling
const ErrorCodes = {
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  MISSING_FIELDS: 'MISSING_FIELDS',
  PURCHASE_CANCELLED: 'PURCHASE_CANCELLED',
  ORDER_ID_MISMATCH: 'ORDER_ID_MISMATCH',
  INVALID_TOKEN: 'INVALID_TOKEN',
  GOOGLE_API_ERROR: 'GOOGLE_API_ERROR',
  ACKNOWLEDGEMENT_FAILED: 'ACKNOWLEDGEMENT_FAILED',
  VERIFICATION_ERROR: 'VERIFICATION_ERROR',
} as const;

// Simple in-memory rate limiting (for production, use Redis or similar)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  entry.count++;
  return true;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Rate limiting
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({
      verified: false,
      error: 'Too many requests',
      code: 'RATE_LIMITED',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      code: ErrorCodes.METHOD_NOT_ALLOWED,
    });
  }

  const { purchaseToken, sku, orderId } = req.body;

  if (!purchaseToken || !sku) {
    return res.status(400).json({
      error: 'Missing required fields',
      code: ErrorCodes.MISSING_FIELDS,
    });
  }

  try {
    // Initialize Google API client
    const auth = new google.auth.GoogleAuth({
      credentials: GOOGLE_SERVICE_ACCOUNT,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    const androidPublisher = google.androidpublisher({
      version: 'v3',
      auth,
    });

    // Get purchase details from Google Play
    const purchaseResponse = await androidPublisher.purchases.products.get({
      packageName: PACKAGE_NAME,
      productId: sku,
      token: purchaseToken,
    });

    const purchase = purchaseResponse.data;

    // Validate purchase
    if (purchase.purchaseState !== 0) {
      // 0 = Purchased, 1 = Cancelled
      return res.status(400).json({
        verified: false,
        error: 'Purchase cancelled',
        code: ErrorCodes.PURCHASE_CANCELLED,
      });
    }

    // Validate order ID if provided
    if (orderId && purchase.orderId !== orderId) {
      return res.status(400).json({
        verified: false,
        error: 'Order ID mismatch',
        code: ErrorCodes.ORDER_ID_MISMATCH,
      });
    }

    // Acknowledge the purchase (CRITICAL - must be done within 72 hours!)
    if (purchase.acknowledgementState === 0) {
      try {
        await androidPublisher.purchases.products.acknowledge({
          packageName: PACKAGE_NAME,
          productId: sku,
          token: purchaseToken,
        });
      } catch (ackError) {
        console.error('[Billing API] Acknowledgement failed:', ackError);
        // Purchase is valid but acknowledgement failed - still grant access
        // but log for manual review (72-hour window applies)
        return res.status(200).json({
          verified: true,
          orderId: purchase.orderId,
          purchaseTime: purchase.purchaseTimeMillis,
          warning: 'Acknowledgement pending - will retry',
          code: ErrorCodes.ACKNOWLEDGEMENT_FAILED,
        });
      }
    }

    return res.status(200).json({
      verified: true,
      orderId: purchase.orderId,
      purchaseTime: purchase.purchaseTimeMillis,
    });
  } catch (error) {
    console.error('[Billing API] Verification error:', error);

    // Determine specific error type for client handling
    const isGoogleApiError = error instanceof Error &&
      error.message.includes('googleapis');

    return res.status(500).json({
      verified: false,
      error: 'Verification failed',
      code: isGoogleApiError ? ErrorCodes.GOOGLE_API_ERROR : ErrorCodes.VERIFICATION_ERROR,
    });
  }
}
```

---

## Integration with Existing Code

### Update UpgradePromptModal

Replace the dev popup in `src/components/UpgradePromptModal.tsx`:

```typescript
import { usePlayBilling } from '@/hooks/usePlayBilling';

// Inside the component:
const { isAvailable, isPurchasing, purchasePremium, error } = usePlayBilling();

const handleUpgradeClick = async () => {
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev && !isAvailable) {
    // Dev mode fallback (existing behavior)
    const confirmGrant = window.confirm('DEV MODE: Grant premium for testing?');
    if (confirmGrant) {
      await grantPremiumAccess('dev-test-token');
      onClose();
    }
    return;
  }

  // Real purchase flow
  const success = await purchasePremium();
  if (success) {
    onClose();
  }
};
```

---

## TWA Configuration

### Update `twa-manifest.json`

```json
{
  "packageId": "app.matchops.local",
  "host": "matchops.app",
  "name": "MatchOps",
  "playBilling": true,
  ...
}
```

### Rebuild TWA

After updating the manifest:

```bash
bubblewrap update
bubblewrap build
```

---

## Testing

### Enable Debug Mode (Chrome)

1. Open `chrome://flags/#enable-debug-for-store-billing`
2. Set to "Enabled"
3. Restart Chrome

### License Testers

1. Go to Play Console → Settings → License testing
2. Add tester email addresses
3. Testers can make purchases without being charged

### Test Flow

1. Install app from Play Store (internal/closed testing track)
2. Open app, navigate to upgrade
3. Complete purchase (free for license testers)
4. Verify premium status is granted

---

## Important Notes

### 72-Hour Acknowledgement Window

- Purchases MUST be acknowledged within 72 hours
- Unacknowledged purchases are automatically refunded
- Always acknowledge on backend after verification

### Security

**Core Principles:**
- NEVER trust client-side purchase tokens alone
- Always verify with Google Play Developer API
- Store service account credentials securely (environment variables)

**Purchase Token Validation:**
- Check `purchaseTimeMillis` to detect stale tokens (reject if > 24h old for new purchases)
- Verify `orderId` matches if provided by client
- Check `purchaseState === 0` (purchased, not cancelled)

**Replay Attack Prevention:**
- Track processed `orderId` values to prevent token reuse
- Consider adding request timestamps and rejecting requests > 5 minutes old
- The verification endpoint includes rate limiting (10 req/min per IP)

**Audit Logging (for debugging):**
```typescript
// Log all premium grants for troubleshooting
console.log('[Billing] Premium granted:', {
  orderId: purchase.orderId,
  purchaseTime: new Date(Number(purchase.purchaseTimeMillis)).toISOString(),
  sku: sku,
  timestamp: new Date().toISOString(),
});
```

### Error Handling

- Handle network failures gracefully
- Queue failed acknowledgements for retry
- Show user-friendly error messages

### Restore Purchases

- Check for existing purchases on app startup
- Use `getExistingPurchases()` to restore premium status
- Handle reinstalls and device changes

---

## Troubleshooting

### Common Errors

| Error Code | Cause | Solution |
|------------|-------|----------|
| `GOOGLE_API_ERROR` | Service account misconfigured | Verify API access enabled in Play Console, check credentials |
| `PURCHASE_CANCELLED` | User cancelled or refund issued | No action needed - expected behavior |
| `ORDER_ID_MISMATCH` | Token/order don't match | Possible tampering - reject purchase |
| `ACKNOWLEDGEMENT_FAILED` | Google API timeout | Purchase valid, retry acknowledgement (72h window) |
| `RATE_LIMITED` | Too many verification requests | Wait 1 minute, check for client-side bugs causing loops |
| `MISSING_FIELDS` | Client sent incomplete data | Check client is sending `purchaseToken` and `sku` |

### Digital Goods API Not Available

**Symptoms:** `isPlayBillingAvailable()` returns `false`

**Causes & Solutions:**
1. **Not installed from Play Store** - App must be installed via Play Store (not sideloaded)
2. **Chrome version < 101** - Update Chrome/WebView
3. **Android version < 9** - Minimum API level 28 required
4. **`playBilling: false` in TWA manifest** - Rebuild TWA with `playBilling: true`
5. **Debug Chrome flag disabled** - Enable `chrome://flags/#enable-debug-for-store-billing` for testing

### Purchase Succeeds but Premium Not Granted

**Check order:**
1. Client received `purchaseToken`? → Check `makePurchase()` response
2. Verification endpoint called? → Check network tab / server logs
3. Backend returned `verified: true`? → Check response
4. `grantPremiumAccess()` called? → Check IndexedDB for `premiumLicense` key
5. UI reflects premium? → Check `usePremium()` hook state

### "Purchase already owned" Error

User already has valid purchase. Call `getExistingPurchases()` and restore:

```typescript
const purchases = await getExistingPurchases();
const existing = purchases.find(p => p.itemId === PREMIUM_SKU);
if (existing) {
  await verifyAndGrantPremium(existing.purchaseToken);
}
```

### Acknowledgement Failures

If acknowledgement fails but purchase is valid:
1. Grant premium access immediately (don't block user)
2. Log the `purchaseToken` for manual retry
3. Set up background job to retry acknowledgement
4. Monitor for 72-hour deadline

---

## Rollback Procedure

### If Billing Breaks in Production

**Immediate mitigation (< 5 minutes):**

```typescript
// 1. Disable billing checks temporarily in usePremium.ts
export function usePremium() {
  // EMERGENCY: Billing broken, grant all users access
  // TODO: Remove after fix deployed
  return {
    isPremium: true,  // Grant everyone access temporarily
    isLoading: false,
    // ... rest of interface
  };
}
```

**Proper rollback steps:**

1. **Revert to previous deployment** (Vercel dashboard → Deployments → Promote previous)

2. **If issue is backend-only:**
   ```bash
   git revert <commit-hash-of-billing-changes>
   git push
   ```

3. **If issue is client-side:**
   - Deploy fix ASAP (service worker will update within 24h)
   - For urgent fixes, increment SW version to force immediate update

### Data Recovery

**User purchased but premium not stored:**

```typescript
// Manual grant via browser console (dev only)
import { grantPremium } from '@/utils/premiumManager';
await grantPremium('manual-recovery-<orderId>');
```

**For production users:**
1. Get order ID from user (Google Play receipt email)
2. Verify in Play Console (Orders section)
3. If valid, provide one-time recovery token or manual database update

### Refund Handling

Google Play handles refunds automatically. To revoke access after refund:

1. Set up [Real-time Developer Notifications](https://developer.android.com/google/play/billing/rtdn-reference)
2. Listen for `ONE_TIME_PRODUCT_CANCELED` notifications
3. Call `revokePremiumAccess()` for affected user

**Manual revocation (if needed):**
```typescript
import { revokePremium } from '@/utils/premiumManager';
await revokePremium();
// User will see upgrade prompt on next limit check
```

---

## Environment Variables

Add to `.env.local`:

```env
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"..."}
```

For production, use Vercel environment variables or secrets management.

---

## Checklist

- [ ] Google Play Developer account created
- [ ] In-app product `premium_upgrade` created in Play Console
- [ ] Merchant account linked
- [ ] Service account created with API access
- [ ] `playBilling: true` added to twa-manifest.json
- [ ] TWA rebuilt with billing enabled
- [ ] Backend verification endpoint deployed
- [ ] License testers added
- [ ] Tested on real device via Play Store
- [ ] Error handling implemented
- [ ] Purchase restoration implemented

---

## References

- [Chrome: Receive Payments via Google Play Billing](https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing)
- [ChromeOS: Implement Play Billing in PWA](https://chromeos.dev/en/publish/pwa-play-billing)
- [GitHub: pwa-play-billing sample](https://github.com/chromeos/pwa-play-billing)
- [Google Play Developer API](https://developers.google.com/android-publisher)
- [Digital Goods API Spec](https://wicg.github.io/digital-goods/)
