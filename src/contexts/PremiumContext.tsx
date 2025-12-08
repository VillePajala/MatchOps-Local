'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  getPremiumLicense,
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
  /** Check if imported data exceeds limits */
  checkImportLimits: (counts: ResourceCounts) => boolean;
  /** Trigger to show upgrade prompt (set by consumer) */
  showUpgradePrompt: (resource?: ResourceType) => void;
  /** Register the upgrade prompt handler */
  setUpgradePromptHandler: (handler: (resource?: ResourceType) => void) => void;
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
  const [upgradePromptHandler, setUpgradePromptHandlerState] = useState<
    ((resource?: ResourceType) => void) | null
  >(null);

  const loadPremiumStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const license = await getPremiumLicense();
      setIsPremium(license.isPremium);
      logger.debug('Premium status loaded', { isPremium: license.isPremium });
    } catch (error) {
      logger.error('Failed to load premium status', error);
      setIsPremium(false);
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

  const checkImportLimits = useCallback(
    (counts: ResourceCounts): boolean => {
      if (isPremium) return false;
      return isOverFreeLimit(counts);
    },
    [isPremium]
  );

  const showUpgradePrompt = useCallback(
    (resource?: ResourceType) => {
      if (upgradePromptHandler) {
        upgradePromptHandler(resource);
      } else {
        logger.warn('Upgrade prompt handler not registered');
      }
    },
    [upgradePromptHandler]
  );

  const setUpgradePromptHandler = useCallback(
    (handler: (resource?: ResourceType) => void) => {
      setUpgradePromptHandlerState(() => handler);
    },
    []
  );

  const grantPremiumAccess = useCallback(async (purchaseToken?: string) => {
    await grantPremium(purchaseToken);
    setIsPremium(true);
    logger.info('Premium access granted');
  }, []);

  const revokePremiumAccess = useCallback(async () => {
    await revokePremium();
    setIsPremium(false);
    logger.info('Premium access revoked');
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
      checkImportLimits,
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
      checkImportLimits,
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
