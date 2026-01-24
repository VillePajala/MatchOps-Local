/**
 * Play Billing Utilities
 *
 * Client-side integration with Google Play Billing via the Digital Goods API.
 * Only works in TWA (Trusted Web Activity) context on Android.
 *
 * Mock Mode:
 * Set NEXT_PUBLIC_MOCK_BILLING=true to enable mock purchases for development/testing.
 * Mock purchases return test tokens that the Edge Function accepts when MOCK_BILLING=true.
 *
 * @see docs/03-active-plans/billing-implementation-plan.md
 * @see https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing
 */

import logger from './logger';

// Play Billing service URL for Digital Goods API
const PLAY_BILLING_SERVICE = 'https://play.google.com/billing';

// Product ID for premium subscription (must match Play Console)
export const SUBSCRIPTION_PRODUCT_ID = 'matchops_premium_monthly';

// Check if mock billing is enabled
// SECURITY: Mock billing bypasses real payments - NEVER enable in production
const MOCK_BILLING_RAW = process.env.NEXT_PUBLIC_MOCK_BILLING === 'true';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Runtime protection: refuse to enable mock billing in production
// This is a defense-in-depth measure - the env var should never be set in production
const MOCK_BILLING = (() => {
  if (MOCK_BILLING_RAW && IS_PRODUCTION) {
    // Log error and alert - this should NEVER happen in production
    console.error(
      '🚨 CRITICAL SECURITY: NEXT_PUBLIC_MOCK_BILLING=true detected in production! ' +
      'Mock billing DISABLED for security. Please remove this environment variable.'
    );
    // Report to Sentry if available (dynamic import to avoid bundling issues)
    if (typeof window !== 'undefined') {
      import('@sentry/nextjs').then(Sentry => {
        Sentry.captureMessage(
          'CRITICAL: MOCK_BILLING enabled in production - blocked for security',
          'error'
        );
      }).catch(() => {
        // Sentry not available, error already logged to console
      });
    }
    return false; // Force disable in production
  }
  return MOCK_BILLING_RAW;
})();

/**
 * Result of a purchase attempt
 */
export interface PurchaseResult {
  success: boolean;
  purchaseToken?: string;
  error?: string;
}

/**
 * Subscription product details from Play Store
 */
export interface SubscriptionDetails {
  productId: string;
  title: string;
  description: string;
  price: string;
  priceMicros: number;
  currencyCode: string;
}

/**
 * Digital Goods Service interface (from Play Billing)
 */
interface DigitalGoodsService {
  getDetails(itemIds: string[]): Promise<ItemDetails[]>;
  listPurchases(): Promise<PurchaseDetails[]>;
}

interface ItemDetails {
  itemId: string;
  title: string;
  description: string;
  price: {
    currency: string;
    value: string;
    valueMicros: number;
  };
  subscriptionPeriod?: string;
  freeTrialPeriod?: string;
  introductoryPrice?: {
    currency: string;
    value: string;
    valueMicros: number;
  };
}

interface PurchaseDetails {
  itemId: string;
  purchaseToken: string;
}

interface PaymentRequestDetails {
  purchaseToken?: string;
}

/**
 * Window with Digital Goods API (available in TWA context)
 */
interface WindowWithDigitalGoods extends Window {
  getDigitalGoodsService?: (serviceUrl: string) => Promise<DigitalGoodsService | null>;
}

/**
 * Check if Play Billing is available (Digital Goods API present)
 *
 * @returns true if running in TWA with Digital Goods API available
 */
export async function isPlayBillingAvailable(): Promise<boolean> {
  if (MOCK_BILLING) {
    logger.info('[PlayBilling] Mock mode enabled - billing available');
    return true;
  }

  try {
    const win = window as WindowWithDigitalGoods;
    if (!('getDigitalGoodsService' in win) || !win.getDigitalGoodsService) {
      logger.debug('[PlayBilling] Digital Goods API not available');
      return false;
    }

    const service = await win.getDigitalGoodsService(PLAY_BILLING_SERVICE);
    const available = service !== null;
    logger.debug(`[PlayBilling] Digital Goods service available: ${available}`);
    return available;
  } catch (error) {
    logger.warn('[PlayBilling] Error checking availability:', error);
    return false;
  }
}

/**
 * Get the Digital Goods service instance
 *
 * @returns DigitalGoodsService or null if not available
 */
async function getService(): Promise<DigitalGoodsService | null> {
  try {
    const win = window as WindowWithDigitalGoods;
    if (!win.getDigitalGoodsService) {
      return null;
    }
    return await win.getDigitalGoodsService(PLAY_BILLING_SERVICE);
  } catch (error) {
    logger.error('[PlayBilling] Failed to get service:', error);
    return null;
  }
}

/**
 * Get subscription product details from Play Store
 *
 * @returns Subscription details or null if not available
 */
export async function getSubscriptionDetails(): Promise<SubscriptionDetails | null> {
  if (MOCK_BILLING) {
    // Return mock details for testing
    return {
      productId: SUBSCRIPTION_PRODUCT_ID,
      title: 'MatchOps Premium',
      description: 'Unlimited teams, players, and cloud sync',
      price: '4.99',
      priceMicros: 4990000,
      currencyCode: 'EUR',
    };
  }

  try {
    const service = await getService();
    if (!service) {
      logger.warn('[PlayBilling] Service not available for getDetails');
      return null;
    }

    const details = await service.getDetails([SUBSCRIPTION_PRODUCT_ID]);
    if (!details || details.length === 0) {
      logger.warn('[PlayBilling] No product details returned');
      return null;
    }

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
    logger.error('[PlayBilling] Failed to get subscription details:', error);
    return null;
  }
}

/**
 * Launch the purchase flow for the premium subscription
 *
 * Uses the Payment Request API with Digital Goods payment method.
 *
 * @returns PurchaseResult with success status and purchase token
 */
export async function purchaseSubscription(): Promise<PurchaseResult> {
  if (MOCK_BILLING) {
    // Simulate successful purchase with test token
    logger.info('[PlayBilling] Mock mode - simulating purchase');
    return {
      success: true,
      purchaseToken: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
  }

  try {
    // Get product details first
    const details = await getSubscriptionDetails();
    if (!details) {
      return { success: false, error: 'Product not available' };
    }

    // Create payment method for Play Billing
    const paymentMethod: PaymentMethodData = {
      supportedMethods: PLAY_BILLING_SERVICE,
      data: {
        sku: SUBSCRIPTION_PRODUCT_ID,
      },
    };

    // Create payment details
    const paymentDetails: PaymentDetailsInit = {
      total: {
        label: details.title,
        amount: {
          currency: details.currencyCode,
          value: details.price,
        },
      },
    };

    // Launch Payment Request
    const request = new PaymentRequest([paymentMethod], paymentDetails);

    // Check if can make payment
    const canMake = await request.canMakePayment();
    if (!canMake) {
      logger.warn('[PlayBilling] Cannot make payment');
      return { success: false, error: 'Payment not available' };
    }

    // Show payment UI
    const response = await request.show();

    // Get purchase token from response
    const responseDetails = response.details as PaymentRequestDetails;
    const purchaseToken = responseDetails?.purchaseToken;

    if (!purchaseToken) {
      await response.complete('fail');
      logger.error('[PlayBilling] No purchase token in response');
      return { success: false, error: 'No purchase token received' };
    }

    // Complete the payment
    await response.complete('success');

    logger.info('[PlayBilling] Purchase successful');
    return {
      success: true,
      purchaseToken,
    };
  } catch (error: unknown) {
    // Handle user cancellation
    if (error instanceof Error && error.name === 'AbortError') {
      logger.info('[PlayBilling] Purchase cancelled by user');
      return { success: false, error: 'cancelled' };
    }

    logger.error('[PlayBilling] Purchase failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Purchase failed',
    };
  }
}

/**
 * Get existing purchases (for restore functionality)
 *
 * @returns Array of purchase tokens for active subscriptions
 */
export async function getExistingPurchases(): Promise<string[]> {
  if (MOCK_BILLING) {
    // No existing purchases in mock mode
    logger.info('[PlayBilling] Mock mode - no existing purchases');
    return [];
  }

  try {
    const service = await getService();
    if (!service) {
      logger.warn('[PlayBilling] Service not available for listPurchases');
      return [];
    }

    const purchases = await service.listPurchases();
    const tokens = purchases
      .filter((p) => p.itemId === SUBSCRIPTION_PRODUCT_ID)
      .map((p) => p.purchaseToken);

    logger.info(`[PlayBilling] Found ${tokens.length} existing purchase(s)`);
    return tokens;
  } catch (error) {
    logger.error('[PlayBilling] Failed to get existing purchases:', error);
    return [];
  }
}

/**
 * Check if mock billing is enabled
 */
export function isMockBillingEnabled(): boolean {
  return MOCK_BILLING;
}

/**
 * Generate a test purchase token for mock subscription
 *
 * Used for testing purposes - generates a token that the Edge Function
 * will accept when MOCK_BILLING=true is set in Supabase secrets.
 *
 * @returns A test token with 'test-' prefix
 */
export function generateTestPurchaseToken(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
