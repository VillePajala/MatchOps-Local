# Google Play Billing Implementation Guide (P4C)

## Overview

This document details the implementation of Google Play Billing for the MatchOps TWA (Trusted Web Activity) app. The billing system uses two Web APIs:

- **Digital Goods API** - Retrieves product details and checks existing purchases
- **Payment Request API** - Handles the actual purchase transaction

**Requirements:** Chrome 101+, Android 9+, app installed via Google Play

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
const GOOGLE_SERVICE_ACCOUNT = JSON.parse(
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}'
);
const PACKAGE_NAME = 'app.matchops.local'; // Your app package name

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { purchaseToken, sku, orderId } = req.body;

  if (!purchaseToken || !sku) {
    return res.status(400).json({ error: 'Missing required fields' });
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
      return res.status(400).json({ verified: false, error: 'Purchase cancelled' });
    }

    // Validate order ID if provided
    if (orderId && purchase.orderId !== orderId) {
      return res.status(400).json({ verified: false, error: 'Order ID mismatch' });
    }

    // Acknowledge the purchase (CRITICAL - must be done within 72 hours!)
    if (purchase.acknowledgementState === 0) {
      await androidPublisher.purchases.products.acknowledge({
        packageName: PACKAGE_NAME,
        productId: sku,
        token: purchaseToken,
      });
    }

    return res.status(200).json({
      verified: true,
      orderId: purchase.orderId,
      purchaseTime: purchase.purchaseTimeMillis,
    });
  } catch (error) {
    console.error('[Billing API] Verification error:', error);
    return res.status(500).json({
      verified: false,
      error: 'Verification failed',
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

- NEVER trust client-side purchase tokens alone
- Always verify with Google Play Developer API
- Store service account credentials securely (environment variables)

### Error Handling

- Handle network failures gracefully
- Queue failed acknowledgements for retry
- Show user-friendly error messages

### Restore Purchases

- Check for existing purchases on app startup
- Use `getExistingPurchases()` to restore premium status
- Handle reinstalls and device changes

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
