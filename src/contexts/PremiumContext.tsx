'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  grantPremium,
  revokePremium,
  canCreateResource,
  getRemainingCount,
  isOverFreeLimit,
  type ResourceCounts,
} from '@/utils/premiumManager';
import { FREE_LIMITS, ResourceType, PREMIUM_PRICE } from '@/config/premiumLimits';
import logger from '@/utils/logger';

interface PremiumContextValue {
  /** Whether the user has premium status */
  isPremium: boolean;
  /** Whether premium status is still loading */
  isLoading: boolean;
  /** The free tier limits (null if premium) */
  limits: typeof FREE_LIMITS | null;
  /** Check if user can create a resource given current count */
  canCreate: (resource: ResourceType, currentCount: number) => boolean;
  /** Get remaining count for a resource */
  getRemaining: (resource: ResourceType, currentCount: number) => number;
  /** Returns true if imported data exceeds free tier limits */
  isImportOverLimits: (counts: ResourceCounts) => boolean;
  /** Trigger to show upgrade prompt (set by consumer) */
  showUpgradePrompt: (resource?: ResourceType, currentCount?: number) => void;
  /** Register the upgrade prompt handler */
  setUpgradePromptHandler: (handler: (resource?: ResourceType, currentCount?: number) => void) => void;
  /** Grant premium (for after purchase verification) */
  grantPremiumAccess: (purchaseToken?: string) => Promise<void>;
  /** Revoke premium (for testing) */
  revokePremiumAccess: () => Promise<void>;
  /** Refresh premium status from storage */
  refreshPremiumStatus: () => Promise<void>;
  /** Premium price for display */
  price: string;
}

const PremiumContext = createContext<PremiumContextValue | undefined>(undefined);

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Use ref for callback to avoid re-renders when handler changes
  const upgradePromptHandlerRef = useRef<((resource?: ResourceType, currentCount?: number) => void) | null>(null);

  const loadPremiumStatus = useCallback(async () => {
    try {
      setIsLoading(true);

      // LIMITS DISABLED: Always grant premium (no resource limits enforced)
      // The limit infrastructure is preserved for potential future use.
      // To re-enable limits in cloud mode, restore the mode check and license lookup below.
      setIsPremium(true);
      logger.debug('Premium status: limits disabled - always premium');

      // --- COMMENTED OUT: Original cloud mode limit enforcement ---
      // const mode = getBackendMode();
      // if (mode === 'local') {
      //   setIsPremium(true);
      //   logger.debug('Premium status: local mode = always premium');
      //   return;
      // }
      // // Cloud mode: check actual license
      // const license = await getPremiumLicense();
      // setIsPremium(license.isPremium);
      // logger.debug('Premium status loaded', { isPremium: license.isPremium, mode });
    } catch (error) {
      logger.error('Failed to load premium status', error);
      // Even on error, grant premium since limits are disabled
      setIsPremium(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load premium status on mount
  useEffect(() => {
    loadPremiumStatus();
  }, [loadPremiumStatus]);

  const canCreate = useCallback(
    (resource: ResourceType, currentCount: number): boolean => {
      return canCreateResource(resource, currentCount, isPremium);
    },
    [isPremium]
  );

  const getRemaining = useCallback(
    (resource: ResourceType, currentCount: number): number => {
      return getRemainingCount(resource, currentCount, isPremium);
    },
    [isPremium]
  );

  const isImportOverLimits = useCallback(
    (counts: ResourceCounts): boolean => {
      if (isPremium) return false;
      return isOverFreeLimit(counts);
    },
    [isPremium]
  );

  const showUpgradePrompt = useCallback(
    (resource?: ResourceType, currentCount?: number) => {
      if (upgradePromptHandlerRef.current) {
        upgradePromptHandlerRef.current(resource, currentCount);
      } else {
        logger.warn('Upgrade prompt handler not registered');
      }
    },
    []
  );

  const setUpgradePromptHandler = useCallback(
    (handler: (resource?: ResourceType, currentCount?: number) => void) => {
      upgradePromptHandlerRef.current = handler;
    },
    []
  );

  const grantPremiumAccess = useCallback(async (purchaseToken?: string) => {
    try {
      await grantPremium(purchaseToken);
      setIsPremium(true);
      logger.info('Premium access granted');
    } catch (error) {
      logger.error('Failed to grant premium access', error);
      throw error;
    }
  }, []);

  const revokePremiumAccess = useCallback(async () => {
    try {
      await revokePremium();
      setIsPremium(false);
      logger.info('Premium access revoked');
    } catch (error) {
      logger.error('Failed to revoke premium access', error);
      throw error;
    }
  }, []);

  const refreshPremiumStatus = useCallback(async () => {
    await loadPremiumStatus();
  }, [loadPremiumStatus]);

  const value = useMemo(
    (): PremiumContextValue => ({
      isPremium,
      isLoading,
      limits: isPremium ? null : FREE_LIMITS,
      canCreate,
      getRemaining,
      isImportOverLimits,
      showUpgradePrompt,
      setUpgradePromptHandler,
      grantPremiumAccess,
      revokePremiumAccess,
      refreshPremiumStatus,
      price: PREMIUM_PRICE,
    }),
    [
      isPremium,
      isLoading,
      canCreate,
      getRemaining,
      isImportOverLimits,
      showUpgradePrompt,
      setUpgradePromptHandler,
      grantPremiumAccess,
      revokePremiumAccess,
      refreshPremiumStatus,
    ]
  );

  return (
    <PremiumContext.Provider value={value}>
      {children}
    </PremiumContext.Provider>
  );
}

/**
 * Hook to access premium context
 * @throws Error if used outside of PremiumProvider
 */
export function usePremiumContext(): PremiumContextValue {
  const context = useContext(PremiumContext);
  if (context === undefined) {
    throw new Error('usePremiumContext must be used within a PremiumProvider');
  }
  return context;
}
