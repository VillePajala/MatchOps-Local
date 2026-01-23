/**
 * usePlayBilling Hook
 *
 * React hook for integrating Google Play Billing into the app.
 * Handles purchase flow, verification, and restore functionality.
 *
 * Usage:
 * ```tsx
 * const { isAvailable, isPurchasing, details, purchase, restore } = usePlayBilling();
 *
 * // In render
 * <button onClick={purchase} disabled={isPurchasing || !isAvailable}>
 *   {isPurchasing ? 'Processing...' : `Subscribe for ${details?.price}`}
 * </button>
 * ```
 *
 * @see docs/03-active-plans/billing-implementation-plan.md
 */

import { useState, useCallback, useEffect } from 'react';
import {
  isPlayBillingAvailable,
  purchaseSubscription,
  getSubscriptionDetails,
  getExistingPurchases,
  SubscriptionDetails,
  SUBSCRIPTION_PRODUCT_ID,
} from '@/utils/playBilling';
import { getSupabaseClient } from '@/datastore/supabase/client';
import logger from '@/utils/logger';

/**
 * Result of a billing operation
 */
export interface BillingResult {
  success: boolean;
  error?: string;
  /** Purchase token (available on successful purchase) */
  purchaseToken?: string;
}

/**
 * Hook return type
 */
export interface UsePlayBillingResult {
  /** Whether Play Billing is available (Android TWA context) */
  isAvailable: boolean;
  /** Whether initial availability check is in progress */
  isLoading: boolean;
  /** Whether a purchase/restore is in progress */
  isPurchasing: boolean;
  /** Subscription product details from Play Store */
  details: SubscriptionDetails | null;
  /** Initiate a purchase flow */
  purchase: () => Promise<BillingResult>;
  /** Restore existing purchases */
  restore: () => Promise<BillingResult>;
  /** Refresh product details */
  refreshDetails: () => Promise<void>;
}

/**
 * Verify a purchase token with the server
 *
 * @param purchaseToken - Token from Play Billing
 * @returns BillingResult
 */
async function verifyPurchaseWithServer(purchaseToken: string): Promise<BillingResult> {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.functions.invoke('verify-subscription', {
      body: {
        purchaseToken,
        productId: SUBSCRIPTION_PRODUCT_ID,
      },
    });

    if (error) {
      logger.error('[usePlayBilling] Server verification failed:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      const errorMsg = data?.error || 'Verification failed';
      logger.error('[usePlayBilling] Server returned error:', errorMsg);
      return { success: false, error: errorMsg };
    }

    logger.info('[usePlayBilling] Server verification successful:', {
      status: data.status,
      periodEnd: data.periodEnd,
    });

    return { success: true };
  } catch (error) {
    logger.error('[usePlayBilling] Error calling verify-subscription:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Verification request failed',
    };
  }
}

/**
 * Hook for Google Play Billing integration
 */
export function usePlayBilling(): UsePlayBillingResult {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [details, setDetails] = useState<SubscriptionDetails | null>(null);

  // Check availability and load details on mount
  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const available = await isPlayBillingAvailable();

        if (!mounted) return;
        setIsAvailable(available);

        if (available) {
          const productDetails = await getSubscriptionDetails();
          if (mounted) {
            setDetails(productDetails);
          }
        }
      } catch (error) {
        logger.error('[usePlayBilling] Initialization error:', error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, []);

  // Refresh product details
  const refreshDetails = useCallback(async () => {
    if (!isAvailable) return;

    try {
      const productDetails = await getSubscriptionDetails();
      setDetails(productDetails);
    } catch (error) {
      logger.error('[usePlayBilling] Failed to refresh details:', error);
    }
  }, [isAvailable]);

  // Purchase flow
  const purchase = useCallback(async (): Promise<BillingResult> => {
    if (!isAvailable) {
      return { success: false, error: 'Play Billing not available' };
    }

    if (isPurchasing) {
      return { success: false, error: 'Purchase already in progress' };
    }

    setIsPurchasing(true);

    try {
      // Step 1: Launch Play Billing purchase flow
      logger.info('[usePlayBilling] Starting purchase flow');
      const purchaseResult = await purchaseSubscription();

      if (!purchaseResult.success) {
        logger.warn('[usePlayBilling] Purchase flow failed:', purchaseResult.error);
        return { success: false, error: purchaseResult.error };
      }

      // Step 2: Verify purchase with server
      logger.info('[usePlayBilling] Verifying purchase with server');
      const verifyResult = await verifyPurchaseWithServer(purchaseResult.purchaseToken!);

      if (!verifyResult.success) {
        logger.error('[usePlayBilling] Server verification failed');
        return verifyResult;
      }

      logger.info('[usePlayBilling] Purchase complete and verified');
      return { success: true, purchaseToken: purchaseResult.purchaseToken };
    } catch (error) {
      logger.error('[usePlayBilling] Purchase flow error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Purchase failed',
      };
    } finally {
      setIsPurchasing(false);
    }
  }, [isAvailable, isPurchasing]);

  // Restore purchases
  const restore = useCallback(async (): Promise<BillingResult> => {
    if (!isAvailable) {
      return { success: false, error: 'Play Billing not available' };
    }

    if (isPurchasing) {
      return { success: false, error: 'Operation already in progress' };
    }

    setIsPurchasing(true);

    try {
      // Step 1: Get existing purchases from Play Store
      logger.info('[usePlayBilling] Checking for existing purchases');
      const purchases = await getExistingPurchases();

      if (purchases.length === 0) {
        logger.info('[usePlayBilling] No existing purchases found');
        return { success: false, error: 'No purchases to restore' };
      }

      // Step 2: Verify the most recent purchase with server
      logger.info('[usePlayBilling] Verifying existing purchase with server');
      const verifyResult = await verifyPurchaseWithServer(purchases[0]);

      if (!verifyResult.success) {
        logger.error('[usePlayBilling] Restore verification failed');
        return verifyResult;
      }

      logger.info('[usePlayBilling] Restore complete');
      return { success: true, purchaseToken: purchases[0] };
    } catch (error) {
      logger.error('[usePlayBilling] Restore flow error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Restore failed',
      };
    } finally {
      setIsPurchasing(false);
    }
  }, [isAvailable, isPurchasing]);

  return {
    isAvailable,
    isLoading,
    isPurchasing,
    details,
    purchase,
    restore,
    refreshDetails,
  };
}

export default usePlayBilling;

/**
 * Grant mock subscription for a user
 *
 * Creates a subscription record in Supabase by calling the verify-subscription
 * Edge Function with a test token. The Edge Function must have MOCK_BILLING=true
 * for this to work.
 *
 * Used for testing purposes - automatically grants subscription on signup for Android users.
 *
 * @param testToken - A test token (must start with 'test-' prefix)
 * @returns BillingResult indicating success or failure
 */
export async function grantMockSubscription(testToken: string): Promise<BillingResult> {
  logger.info('[usePlayBilling] Granting mock subscription with test token');
  return verifyPurchaseWithServer(testToken);
}
