/**
 * SubscriptionContext
 *
 * Provides subscription state across the app for cloud users.
 * Fetches from Supabase and caches locally for offline access.
 *
 * Usage:
 * ```tsx
 * // Wrap app with provider
 * <SubscriptionProvider>
 *   <App />
 * </SubscriptionProvider>
 *
 * // Use in components
 * const { status, isActive, refresh } = useSubscription();
 * ```
 *
 * @see docs/03-active-plans/billing-implementation-plan.md - Phase 5
 */

'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthProvider';
import { getStorageItem, setStorageItem } from '@/utils/storage';
import { isCloudAvailable } from '@/config/backendConfig';
import logger from '@/utils/logger';

/**
 * Subscription status enum (matches database enum)
 */
export type SubscriptionStatus = 'none' | 'active' | 'cancelled' | 'grace' | 'expired';

/**
 * Compute whether subscription grants active premium access.
 * Derived from status to ensure consistency.
 *
 * Active statuses:
 * - 'active': Paid and valid
 * - 'cancelled': User cancelled but period not ended
 * - 'grace': Payment failed, in grace period (still has access)
 */
export function isSubscriptionActive(_status: SubscriptionStatus): boolean {
  // TEMPORARY: Always return true - free sync for all users
  // TODO: Remove this when implementing paid subscriptions (see issue #354)
  return true;
  // Original logic:
  // return _status === 'active' || _status === 'cancelled' || _status === 'grace';
}

/**
 * Subscription state shape
 */
export interface SubscriptionState {
  /** Current subscription status */
  status: SubscriptionStatus;
  /** When the current period ends */
  periodEnd: Date | null;
  /** When grace period ends (7 days after period end) */
  graceEnd: Date | null;
  /** Whether user has active premium access */
  isActive: boolean;
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Whether the last fetch failed (state may be from cache or fallback) */
  fetchFailed: boolean;
}

/**
 * Context value including state and actions
 */
export interface SubscriptionContextValue extends SubscriptionState {
  /** Refresh subscription from server (clears cache) */
  refresh: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

// Cache configuration
const CACHE_KEY_PREFIX = 'matchops_subscription_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get cache key for a specific user
 * Including user ID prevents cache collision between users on same device
 */
function getCacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}_${userId}`;
}

/**
 * Default state for non-subscribed users
 */
const DEFAULT_STATE: SubscriptionState = {
  status: 'none',
  periodEnd: null,
  graceEnd: null,
  isActive: false,
  isLoading: true,
  fetchFailed: false,
};

/**
 * Get cached subscription from storage
 * @param userId - User ID to scope the cache
 */
async function getCachedSubscription(userId: string): Promise<Omit<SubscriptionState, 'isLoading'> | null> {
  try {
    const cached = await getStorageItem(getCacheKey(userId));
    if (!cached) return null;

    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_DURATION) {
      return null; // Expired
    }

    const status = data.status as SubscriptionStatus;
    return {
      status,
      periodEnd: data.periodEnd ? new Date(data.periodEnd) : null,
      graceEnd: data.graceEnd ? new Date(data.graceEnd) : null,
      isActive: isSubscriptionActive(status),
      fetchFailed: false, // Cached data was from a successful fetch
    };
  } catch (error) {
    logger.warn('[SubscriptionContext] Failed to read cached subscription:', error);
    return null;
  }
}

/**
 * Cache subscription to storage
 * @param userId - User ID to scope the cache
 * @param state - Subscription state to cache
 */
async function cacheSubscription(userId: string, state: Omit<SubscriptionState, 'isLoading'>): Promise<void> {
  try {
    await setStorageItem(getCacheKey(userId), JSON.stringify({
      data: {
        status: state.status,
        periodEnd: state.periodEnd?.toISOString() ?? null,
        graceEnd: state.graceEnd?.toISOString() ?? null,
        isActive: state.isActive,
      },
      timestamp: Date.now(),
    }));
  } catch (error) {
    logger.warn('[SubscriptionContext] Failed to cache subscription:', error);
  }
}

/**
 * Clear subscription cache for a specific user
 * Exported for use by AuthProvider.signOut() to prevent data leakage between users
 * @param userId - User ID whose cache should be cleared
 */
export async function clearSubscriptionCache(userId: string): Promise<void> {
  try {
    await setStorageItem(getCacheKey(userId), '');
    logger.debug('[SubscriptionContext] Cache cleared');
  } catch (error) {
    logger.warn('[SubscriptionContext] Failed to clear cache:', error);
  }
}

/**
 * SubscriptionProvider component
 */
export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<SubscriptionState>(DEFAULT_STATE);

  // Track previous user ID to detect user changes
  const prevUserIdRef = React.useRef<string | null>(null);
  const currentUserId = user?.id ?? null;

  // CRITICAL: Reset to loading state immediately when user changes
  // This must happen synchronously (during render) to prevent race conditions where:
  // 1. User logs in
  // 2. page.tsx re-renders with stale subscription state (isLoading: false, isActive: false)
  // 3. Migration check sees !hasActiveSubscription and sets postLoginCheckComplete(true)
  // 4. Then fetchSubscription runs but it's too late!
  // By setting isLoading: true synchronously when user changes, we ensure the migration
  // check waits for the new subscription data to be fetched.
  if (currentUserId !== prevUserIdRef.current) {
    prevUserIdRef.current = currentUserId;
    // Only set loading if we have a user (login), not when user becomes null (logout)
    if (currentUserId && state.isLoading === false) {
      // This is a synchronous state update during render - React handles this specially
      // It will cause a re-render with the new loading state before effects run
      setState(prev => ({ ...prev, isLoading: true }));
    }
  }

  // Fetch subscription from Supabase
  const fetchSubscription = useCallback(async (skipCache = false) => {
    // Issue #336: Fetch subscription when cloud is available (regardless of mode) and user is authenticated.
    // This allows subscription checks to work even in local mode when user has an account.
    if (!isCloudAvailable() || !user) {
      setState({
        ...DEFAULT_STATE,
        isLoading: false,
        fetchFailed: false,
      });
      return;
    }

    try {
      // Check cache first (unless skipping)
      if (!skipCache) {
        const cached = await getCachedSubscription(user.id);
        if (cached) {
          setState({
            ...cached,
            isLoading: false,
          });
          return;
        }
      }

      // Fetch from server (dynamic import to avoid pulling Supabase into local-mode bundle)
      const { getSupabaseClient } = await import('@/datastore/supabase/client');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc('get_subscription_status');

      if (error) {
        throw error;
      }

      // RPC returns array, get first row or use defaults
      const subscription = data?.[0] || {
        status: 'none' as SubscriptionStatus,
        period_end: null,
        grace_end: null,
      };

      const subscriptionStatus = subscription.status as SubscriptionStatus;
      const newState: SubscriptionState = {
        status: subscriptionStatus,
        periodEnd: subscription.period_end ? new Date(subscription.period_end) : null,
        graceEnd: subscription.grace_end ? new Date(subscription.grace_end) : null,
        isActive: isSubscriptionActive(subscriptionStatus),
        isLoading: false,
        fetchFailed: false,
      };

      // Cache the result
      await cacheSubscription(user.id, newState);

      setState(newState);
      logger.debug('[SubscriptionContext] Fetched subscription:', newState.status);
    } catch (error) {
      logger.error('[SubscriptionContext] Failed to fetch subscription:', error);

      // Fall back to cached or default state, but mark as failed so UI can distinguish
      const cached = await getCachedSubscription(user.id);
      if (cached) {
        setState({
          ...cached,
          isLoading: false,
          fetchFailed: true, // Cached data may be stale
        });
      } else {
        const fallbackStatus: SubscriptionStatus = 'none';
        setState({
          status: fallbackStatus,
          periodEnd: null,
          graceEnd: null,
          isActive: isSubscriptionActive(fallbackStatus),
          isLoading: false,
          fetchFailed: true, // Status unknown due to fetch failure
        });
      }
    }
    // Issue #336: isCloudAvailable() is a pure function, doesn't need to be in deps
  }, [user]);

  // Initial fetch when user changes
  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // Refresh function (clears cache and refetches)
  const refresh = useCallback(async () => {
    if (!user) return;
    logger.debug('[SubscriptionContext] Refreshing subscription');
    await clearSubscriptionCache(user.id);
    await fetchSubscription(true);
  }, [user, fetchSubscription]);

  // Memoize context value
  const value = useMemo<SubscriptionContextValue>(() => ({
    ...state,
    refresh,
  }), [state, refresh]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

/**
 * Hook to access subscription state
 *
 * @throws Error if used outside SubscriptionProvider
 */
export function useSubscription(): SubscriptionContextValue {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
}

/**
 * Hook that returns subscription state without throwing
 * Useful for optional subscription checks
 */
export function useSubscriptionOptional(): SubscriptionContextValue | null {
  return useContext(SubscriptionContext);
}

export default SubscriptionContext;
