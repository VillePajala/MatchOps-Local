'use client';

import { useCallback } from 'react';
import { usePremiumContext } from '@/contexts/PremiumContext';
import { ResourceType } from '@/config/premiumLimits';

/**
 * Hook for checking premium status and limits
 *
 * @example
 * ```tsx
 * const { isPremium, canCreate, showUpgradePrompt } = usePremium();
 *
 * const handleAddTeam = () => {
 *   if (!canCreate('team', currentTeamCount)) {
 *     showUpgradePrompt('team');
 *     return;
 *   }
 *   // ... create team
 * };
 * ```
 */
export function usePremium() {
  const context = usePremiumContext();

  return {
    /** Whether the user has premium status */
    isPremium: context.isPremium,
    /** Whether premium status is still loading */
    isLoading: context.isLoading,
    /** The free tier limits (null if premium) */
    limits: context.limits,
    /** Premium price for display */
    price: context.price,
    /** Check if user can create a resource given current count */
    canCreate: context.canCreate,
    /** Get remaining count for a resource */
    getRemaining: context.getRemaining,
    /** Trigger to show upgrade prompt */
    showUpgradePrompt: context.showUpgradePrompt,
    /** Grant premium (for after purchase verification) */
    grantPremiumAccess: context.grantPremiumAccess,
    /** Revoke premium (for testing/refunds) */
    revokePremiumAccess: context.revokePremiumAccess,
    /** Refresh premium status from storage */
    refreshPremiumStatus: context.refreshPremiumStatus,
  };
}

/**
 * Hook specifically for limit checking with a given resource type
 * Provides a simpler API when you know which resource you're working with
 *
 * @example
 * ```tsx
 * const { canAdd, remaining, checkAndPrompt } = useResourceLimit('team', teams.length);
 *
 * // Simple check
 * if (canAdd) { ... }
 *
 * // Check and show prompt if needed
 * const handleAdd = () => {
 *   if (!checkAndPrompt()) return;
 *   // ... add team
 * };
 * ```
 */
export function useResourceLimit(resource: ResourceType, currentCount: number) {
  const { isPremium, canCreate, getRemaining, showUpgradePrompt } = usePremium();

  const canAdd = canCreate(resource, currentCount);
  const remaining = getRemaining(resource, currentCount);

  /**
   * Check if can add and show upgrade prompt if not
   * @returns true if can add, false if limit reached (and prompt shown)
   */
  const checkAndPrompt = useCallback((): boolean => {
    if (canAdd) return true;
    showUpgradePrompt(resource);
    return false;
  }, [canAdd, showUpgradePrompt, resource]);

  return {
    /** Whether user can add another of this resource */
    canAdd,
    /** How many more can be added (Infinity if premium) */
    remaining,
    /** Current count passed in */
    currentCount,
    /** Whether user is premium */
    isPremium,
    /** Check and show prompt if limit reached, returns false if blocked */
    checkAndPrompt,
  };
}
