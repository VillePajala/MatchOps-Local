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

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  isPlayBillingAvailable,
  purchaseSubscription,
  getSubscriptionDetails,
  getExistingPurchases,
  SubscriptionDetails,
  SUBSCRIPTION_PRODUCT_ID,
} from '@/utils/playBilling';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/datastore/supabase/client';
import { clearSubscriptionCache } from '@/contexts/SubscriptionContext';
import logger from '@/utils/logger';

/**
 * Result of a billing operation
 *
 * Discriminated union ensures:
 * - success=true always has purchaseToken
 * - success=false always has error message
 */
export type BillingResult =
  | { success: true; purchaseToken: string }
  | { success: false; error: string };

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
 * Module-level lock for session refresh.
 * Prevents concurrent refresh calls from causing auth state conflicts.
 */
let sessionRefreshPromise: Promise<Session | null> | null = null;

/**
 * Timeout for session refresh operations (10 seconds).
 * Prevents deadlock if Supabase auth hangs.
 */
const SESSION_REFRESH_TIMEOUT_MS = 10000;

/**
 * Ensure we have a fresh, valid session for Edge Function calls.
 *
 * The Edge Function has verify_jwt: true, so Supabase's API gateway validates
 * the JWT before the function code runs. We must ensure the access token is
 * fresh to avoid 401 errors.
 *
 * Uses a module-level lock to prevent concurrent refresh calls from causing
 * auth state conflicts (e.g., multiple simultaneous purchases).
 *
 * Includes timeout protection to prevent deadlock if auth service hangs.
 *
 * @returns Fresh session or null if not authenticated
 */
async function ensureFreshSession(): Promise<Session | null> {
  // If a refresh is already in progress, wait for it instead of starting another
  if (sessionRefreshPromise) {
    logger.debug('[usePlayBilling] Session refresh already in progress, waiting...');
    return sessionRefreshPromise;
  }

  // The actual refresh logic
  const doRefresh = async (): Promise<Session | null> => {
    const supabase = getSupabaseClient();

    // First, get the current cached session
    const { data: { session: cachedSession }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      logger.error('[usePlayBilling] Error getting session:', sessionError.message);
      return null;
    }

    // If no session found, try refreshSession as recovery attempt
    // This handles cases where getSession() returns null but refresh token is still valid
    // (e.g., session state desync between AuthProvider and Supabase client)
    if (!cachedSession) {
      logger.info('[usePlayBilling] No cached session, attempting refresh recovery...');

      const { data: { session: recoveredSession }, error: refreshError } = await supabase.auth.refreshSession();

      if (refreshError) {
        logger.error('[usePlayBilling] Session refresh recovery failed:', refreshError.message);
        return null;
      }

      if (!recoveredSession) {
        logger.error('[usePlayBilling] No session after refresh - user needs to re-login');
        return null;
      }

      logger.info('[usePlayBilling] Session recovered via refresh');
      return recoveredSession;
    }

    // Check if token is expired or about to expire (within 60 seconds)
    const expiresAt = cachedSession.expires_at;
    const now = Math.floor(Date.now() / 1000);
    const bufferSeconds = 60;

    if (expiresAt && expiresAt < now + bufferSeconds) {
      logger.info('[usePlayBilling] Access token expired or expiring soon, refreshing...');

      // Force refresh the session to get a fresh access token
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();

      if (refreshError) {
        logger.error('[usePlayBilling] Failed to refresh session:', refreshError.message);
        return null;
      }

      if (!refreshedSession) {
        logger.error('[usePlayBilling] No session after refresh - user may need to re-login');
        return null;
      }

      logger.info('[usePlayBilling] Session refreshed successfully');
      return refreshedSession;
    }

    return cachedSession;
  };

  // Create timeout promise to prevent deadlock
  const timeoutPromise = new Promise<Session | null>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Session refresh timeout - auth service may be unavailable'));
    }, SESSION_REFRESH_TIMEOUT_MS);
  });

  // Create the refresh promise with timeout protection
  sessionRefreshPromise = Promise.race([doRefresh(), timeoutPromise])
    .catch((error) => {
      logger.error('[usePlayBilling] Session refresh failed:', error);
      return null;
    })
    .finally(() => {
      // Always clear the lock, even on timeout/error
      sessionRefreshPromise = null;
    });

  return sessionRefreshPromise;
}

/**
 * Result of server verification (internal use only)
 * Different from BillingResult - doesn't return purchaseToken since caller already has it
 */
type VerifyResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Verify a purchase token with the server
 *
 * @param purchaseToken - Token from Play Billing
 * @returns VerifyResult (success or error)
 */
async function verifyPurchaseWithServer(purchaseToken: string): Promise<VerifyResult> {
  try {
    const supabase = getSupabaseClient();

    // Ensure we have a fresh, valid session before calling Edge Function
    // The Edge Function has verify_jwt: true, so expired tokens cause 401 at gateway level
    const session = await ensureFreshSession();
    if (!session) {
      return { success: false, error: 'Not logged in. Please sign in first.' };
    }

    // Get the access token from the session
    const accessToken = session.access_token;
    if (!accessToken) {
      logger.error('[usePlayBilling] Session exists but no access_token');
      return { success: false, error: 'Session invalid. Please sign in again.' };
    }

    logger.info('[usePlayBilling] Calling Edge Function with fresh session:', {
      userId: session.user.id.slice(0, 8),
      expiresAt: session.expires_at,
      hasAccessToken: !!accessToken,
      hasPurchaseToken: !!purchaseToken,
      productId: SUBSCRIPTION_PRODUCT_ID,
    });

    // Explicitly pass the Authorization header to ensure it's included
    // functions.invoke() should do this automatically, but we're seeing 401s
    // indicating the header might not be sent
    const { data, error } = await supabase.functions.invoke('verify-subscription', {
      body: {
        purchaseToken,
        productId: SUBSCRIPTION_PRODUCT_ID,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (error) {
      // Supabase returns generic "Edge function returned non-2xx" error
      // The actual error message from the Edge Function is in the data field
      const actualError = data?.error || error.message;
      logger.error('[usePlayBilling] Server verification failed:', {
        errorMessage: error.message,
        errorName: error.name,
        dataError: data?.error,
        fullData: data,
        fullError: JSON.stringify(error),
      });
      return { success: false, error: actualError };
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

  // Ref-based lock to prevent race conditions (state updates are async)
  // This provides synchronous check to ensure only one operation runs at a time
  const operationLockRef = useRef(false);

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

    // Synchronous lock check to prevent race conditions
    // State updates are async, so isPurchasing alone isn't sufficient
    if (operationLockRef.current) {
      return { success: false, error: 'Purchase already in progress' };
    }

    // Acquire lock synchronously
    operationLockRef.current = true;
    setIsPurchasing(true);

    try {
      // Verify auth state before purchase - session could have expired
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        logger.error('[usePlayBilling] No active session - user must be logged in to purchase');
        return { success: false, error: 'Please sign in to purchase' };
      }

      // Step 1: Launch Play Billing purchase flow
      logger.info('[usePlayBilling] Starting purchase flow');
      const purchaseResult = await purchaseSubscription();

      if (!purchaseResult.success) {
        logger.warn('[usePlayBilling] Purchase flow failed:', purchaseResult.error);
        return { success: false, error: purchaseResult.error };
      }

      // Step 2: Verify purchase with server
      if (!purchaseResult.purchaseToken) {
        logger.error('[usePlayBilling] Purchase succeeded but no token received');
        return { success: false, error: 'No purchase token received' };
      }

      logger.info('[usePlayBilling] Verifying purchase with server');
      const verifyResult = await verifyPurchaseWithServer(purchaseResult.purchaseToken);

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
      // Release lock
      operationLockRef.current = false;
      setIsPurchasing(false);
    }
  }, [isAvailable]);

  // Restore purchases
  const restore = useCallback(async (): Promise<BillingResult> => {
    if (!isAvailable) {
      return { success: false, error: 'Play Billing not available' };
    }

    // Synchronous lock check to prevent race conditions
    if (operationLockRef.current) {
      return { success: false, error: 'Operation already in progress' };
    }

    // Acquire lock synchronously
    operationLockRef.current = true;
    setIsPurchasing(true);

    try {
      // Get session for user ID (needed for cache key)
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        return { success: false, error: 'Please sign in to restore purchases' };
      }

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

      // Step 3: Clear subscription cache to force fresh fetch
      // This ensures UI updates immediately after restore
      await clearSubscriptionCache(session.user.id);

      logger.info('[usePlayBilling] Restore complete');
      return { success: true, purchaseToken: purchases[0] };
    } catch (error) {
      logger.error('[usePlayBilling] Restore flow error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Restore failed',
      };
    } finally {
      // Release lock
      operationLockRef.current = false;
      setIsPurchasing(false);
    }
  }, [isAvailable]);

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
  const result = await verifyPurchaseWithServer(testToken);
  if (!result.success) {
    return result;
  }
  return { success: true, purchaseToken: testToken };
}
