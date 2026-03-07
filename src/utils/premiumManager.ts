/**
 * Premium License Manager
 * Handles premium status storage, license caching, and limit checking
 */

import { PREMIUM_LICENSE_KEY } from '@/config/storageKeys';
import { ResourceType, PREMIUM_PRODUCT_ID, getLimit } from '@/config/premiumLimits';
import { PREMIUM_ENFORCEMENT_ENABLED } from '@/config/constants';
import { getStorageItem, setStorageItem } from './storage';
import logger from './logger';

/**
 * Premium license data stored in IndexedDB
 */
export interface PremiumLicense {
  isPremium: boolean;
  purchaseToken?: string;
  purchaseDate?: string;
  lastVerified?: string;
  productId?: string;
}

const DEFAULT_LICENSE: PremiumLicense = {
  isPremium: false,
};

/**
 * Get the current premium license from storage
 */
export async function getPremiumLicense(): Promise<PremiumLicense> {
  try {
    const licenseJson = await getStorageItem(PREMIUM_LICENSE_KEY);
    if (!licenseJson) {
      return DEFAULT_LICENSE;
    }
    const license = JSON.parse(licenseJson) as PremiumLicense;
    return license;
  } catch (error) {
    logger.error('Failed to get premium license', error);
    return DEFAULT_LICENSE;
  }
}

/**
 * Save premium license to storage
 */
export async function savePremiumLicense(license: PremiumLicense): Promise<void> {
  try {
    await setStorageItem(PREMIUM_LICENSE_KEY, JSON.stringify(license));
    logger.info('Premium license saved', { isPremium: license.isPremium });
  } catch (error) {
    logger.error('Failed to save premium license', error);
    throw error;
  }
}

/**
 * Test token pattern - only valid in dev/internal testing modes
 * Format: 'dev-test-token' or 'internal-test-token'
 */
const TEST_TOKEN_PATTERN = /^(dev|internal)-test-token$/;

/**
 * Validate purchase token before granting premium
 *
 * Security (Defense in Depth):
 * 1. Build-time: next.config.ts blocks INTERNAL_TESTING on production branches
 * 2. Runtime: When PREMIUM_ENFORCEMENT_ENABLED is true, rejects test tokens in production
 * 3. Runtime: Test tokens only accepted in dev mode OR with INTERNAL_TESTING flag
 *
 * Test tokens are ONLY accepted when:
 * - PREMIUM_ENFORCEMENT_ENABLED is false (bypasses all checks), OR
 * - Development mode (NODE_ENV !== 'production'), OR
 * - Internal testing mode (NEXT_PUBLIC_INTERNAL_TESTING === 'true')
 *
 * @throws Error if token validation fails
 */
function validatePurchaseToken(purchaseToken?: string): void {
  const isDev = process.env.NODE_ENV !== 'production';
  const isInternalTesting = process.env.NEXT_PUBLIC_INTERNAL_TESTING === 'true';
  const isProduction = process.env.NODE_ENV === 'production';

  // If token matches test pattern, validate environment
  if (purchaseToken && TEST_TOKEN_PATTERN.test(purchaseToken)) {
    // When enforcement is disabled, allow all test tokens
    if (!PREMIUM_ENFORCEMENT_ENABLED) {
      logger.debug('Test token accepted (enforcement disabled)');
      return;
    }

    // When enforcement is enabled in production, block test tokens
    if (isProduction && !isDev && !isInternalTesting) {
      logger.error('Test token rejected in production', { tokenPrefix: purchaseToken.split('-')[0] });
      throw new Error('Invalid purchase token');
    }
    logger.debug('Test token accepted', { isDev, isInternalTesting });
    return;
  }

  // TODO: P4C - Add Digital Goods API token validation for real tokens
  // For now, require a token in production (will be validated via Play Store)
  if (!purchaseToken && !isDev && !isInternalTesting) {
    logger.error('Missing purchase token in production');
    throw new Error('Purchase token required');
  }
}

/**
 * Grant premium status (after successful purchase verification)
 *
 * Note: This is a local-first PWA. Purchase verification happens client-side
 * via the Digital Goods API in the TWA context - no backend server involved.
 *
 * Security: Test tokens (dev-test-token, internal-test-token) are only
 * accepted in development mode or when NEXT_PUBLIC_INTERNAL_TESTING is enabled.
 *
 * TODO: P4C (Play Billing Integration) should add:
 * - Use Digital Goods API to verify purchase with Play Store
 * - Validate purchase is for correct product ID (PREMIUM_PRODUCT_ID)
 * - Check purchase state (PURCHASED, not PENDING/CANCELED)
 * - Handle acknowledgement via Digital Goods API
 */
export async function grantPremium(purchaseToken?: string): Promise<void> {
  // Validate token before granting access
  validatePurchaseToken(purchaseToken);

  const license: PremiumLicense = {
    isPremium: true,
    purchaseToken,
    purchaseDate: new Date().toISOString(),
    lastVerified: new Date().toISOString(),
    productId: PREMIUM_PRODUCT_ID,
  };
  await savePremiumLicense(license);
}

/**
 * Revoke premium status (for refunds or testing)
 */
export async function revokePremium(): Promise<void> {
  await savePremiumLicense(DEFAULT_LICENSE);
  logger.info('Premium status revoked');
}

/**
 * Check if user is premium
 */
export async function isPremiumUser(): Promise<boolean> {
  const license = await getPremiumLicense();
  return license.isPremium;
}

/**
 * Resource count providers - these need to be passed in to avoid circular dependencies
 *
 * Only seasons and tournaments are limited in the freemium model.
 * Teams, players, and games are unlimited for all users.
 */
export interface ResourceCounts {
  seasons: number;
  tournaments: number;
}

/**
 * Check if user can create a new resource (season or tournament)
 *
 * Business Model (as of 2026-03):
 * - Free tier: 3 seasons + 3 tournaments
 * - Full Version (one-time purchase): unlimited
 * - Local mode: always unlimited (no server cost)
 *
 * Currently DISABLED via PREMIUM_ENFORCEMENT_ENABLED flag.
 * Will be enabled when Play Store billing is ready.
 */
export function canCreateResource(
  resource: ResourceType,
  currentCount: number,
  isPremium: boolean
): boolean {
  if (!PREMIUM_ENFORCEMENT_ENABLED) return true;
  if (isPremium) return true;
  return currentCount < getLimit(resource);
}

/**
 * Get remaining count for a resource
 *
 * Returns how many more of this resource the user can create.
 * Returns Infinity for premium users or when enforcement is disabled.
 */
export function getRemainingCount(
  resource: ResourceType,
  currentCount: number,
  isPremium: boolean
): number {
  if (!PREMIUM_ENFORCEMENT_ENABLED) return Infinity;
  if (isPremium) return Infinity;
  return Math.max(0, getLimit(resource) - currentCount);
}

/**
 * Get the limit for a resource type
 * Re-exports getLimit from premiumLimits for convenience
 */
export const getResourceLimit = getLimit;

/**
 * Check if any resource is over the free limit (for import warnings)
 *
 * Business Model: No resource limits - always returns false.
 * All data imports are allowed without limit warnings.
 *
 * @param _counts - Resource counts (unused - no limits)
 * @returns always false - no resource limits
 */
export function isOverFreeLimit(_counts: ResourceCounts): boolean {
  // No resource limits - imports always allowed
  return false;
}

/**
 * Get a summary of which resources are over limit
 *
 * Business Model: No resource limits - always returns empty array.
 *
 * @param _counts - Resource counts (unused - no limits)
 * @returns always empty - no resource limits
 */
export function getOverLimitSummary(_counts: ResourceCounts): string[] {
  // No resource limits - no over-limit warnings
  return [];
}
