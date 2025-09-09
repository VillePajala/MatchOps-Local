import { getLocalStorageItem, setLocalStorageItem } from './localStorage';
import { SUBSCRIPTION_LIMITS } from '@/types/subscription';
import type { SubscriptionStatus, FeatureLimits } from '@/types/subscription';
import logger from './logger';

const SUBSCRIPTION_KEY = 'subscription_status';

/**
 * Get current subscription status from localStorage
 */
export const getSubscriptionStatus = async (): Promise<SubscriptionStatus> => {
  try {
    const statusJson = getLocalStorageItem(SUBSCRIPTION_KEY);
    if (!statusJson) {
      return getDefaultFreeSubscription();
    }
    
    const status = JSON.parse(statusJson) as SubscriptionStatus;
    
    // Check if subscription has expired
    if (status.tier === 'premium' && status.expiresAt) {
      const expiryDate = new Date(status.expiresAt);
      if (expiryDate < new Date()) {
        // Subscription expired, downgrade to free
        const expiredStatus = getDefaultFreeSubscription();
        await setSubscriptionStatus(expiredStatus);
        return expiredStatus;
      }
    }
    
    return status;
  } catch (error) {
    logger.error('[subscriptionManager] Error reading subscription status:', error);
    return getDefaultFreeSubscription();
  }
};

/**
 * Update subscription status in localStorage
 */
export const setSubscriptionStatus = async (status: SubscriptionStatus): Promise<void> => {
  try {
    setLocalStorageItem(SUBSCRIPTION_KEY, JSON.stringify(status));
    logger.log('[subscriptionManager] Subscription status updated:', status);
  } catch (error) {
    logger.error('[subscriptionManager] Error saving subscription status:', error);
  }
};

/**
 * Get default free subscription
 */
const getDefaultFreeSubscription = (): SubscriptionStatus => ({
  tier: 'free',
  isActive: true,
});

/**
 * Get feature limits for current subscription
 */
export const getFeatureLimits = async (): Promise<FeatureLimits> => {
  const status = await getSubscriptionStatus();
  return SUBSCRIPTION_LIMITS[status.tier];
};

/**
 * Check if user has premium subscription
 */
export const isPremiumUser = async (): Promise<boolean> => {
  const status = await getSubscriptionStatus();
  return status.tier === 'premium' && status.isActive;
};

/**
 * Check if a feature is available for current subscription
 */
export const isFeatureAvailable = async (feature: keyof FeatureLimits): Promise<boolean> => {
  const limits = await getFeatureLimits();
  const featureValue = limits[feature];
  
  // Handle boolean features
  if (typeof featureValue === 'boolean') {
    return featureValue;
  }
  
  // Handle numeric limits (assuming they're checked elsewhere)
  return true;
};

/**
 * Check if user can perform an action based on current usage and limits
 */
export const canPerformAction = async (
  action: 'addTeam' | 'addPlayer' | 'saveGame' | 'createDrawing',
  currentCount: number
): Promise<{ allowed: boolean; limit?: number; current?: number }> => {
  const limits = await getFeatureLimits();
  
  let limit: number;
  switch (action) {
    case 'addTeam':
      limit = limits.maxTeams;
      break;
    case 'addPlayer':
      limit = limits.maxPlayersPerTeam;
      break;
    case 'saveGame':
      limit = limits.maxGamesPerSeason;
      break;
    case 'createDrawing':
      limit = limits.maxTacticalDrawings;
      break;
    default:
      return { allowed: true };
  }
  
  const allowed = currentCount < limit;
  return { allowed, limit, current: currentCount };
};

/**
 * Simulate premium subscription (for testing)
 */
export const enablePremiumForTesting = async (): Promise<void> => {
  const premiumStatus: SubscriptionStatus = {
    tier: 'premium',
    isActive: true,
    purchasedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    platform: 'web',
    subscriptionId: 'test_premium_' + Date.now(),
  };
  
  await setSubscriptionStatus(premiumStatus);
  logger.log('[subscriptionManager] Premium subscription enabled for testing');
};

/**
 * Reset to free tier (for testing)
 */
export const resetToFreeForTesting = async (): Promise<void> => {
  const freeStatus = getDefaultFreeSubscription();
  await setSubscriptionStatus(freeStatus);
  logger.log('[subscriptionManager] Reset to free tier');
};