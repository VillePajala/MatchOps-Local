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
import { getSupabaseClient } from '@/datastore/supabase/client';
import { getStorageItem, setStorageItem } from '@/utils/storage';
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
export function isSubscriptionActive(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'cancelled' || status === 'grace';
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
  const { user, mode } = useAuth();
  const [state, setState] = useState<SubscriptionState>(DEFAULT_STATE);

  // Fetch subscription from Supabase
  const fetchSubscription = useCallback(async (skipCache = false) => {
    // Only fetch for cloud mode with authenticated user
    if (mode !== 'cloud' || !user) {
      setState({
        ...DEFAULT_STATE,
        isLoading: false,
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

      // Fetch from server
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
      };

      // Cache the result
      await cacheSubscription(user.id, newState);

      setState(newState);
      logger.debug('[SubscriptionContext] Fetched subscription:', newState.status);
    } catch (error) {
      logger.error('[SubscriptionContext] Failed to fetch subscription:', error);

      // Fall back to cached or default state
      const cached = await getCachedSubscription(user.id);
      if (cached) {
        setState({
          ...cached,
          isLoading: false,
        });
      } else {
        const fallbackStatus: SubscriptionStatus = 'none';
        setState({
          status: fallbackStatus,
          periodEnd: null,
          graceEnd: null,
          isActive: isSubscriptionActive(fallbackStatus),
          isLoading: false,
        });
      }
    }
  }, [user, mode]);

  // Initial fetch when user/mode changes
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
