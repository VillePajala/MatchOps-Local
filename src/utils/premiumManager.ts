/**
 * Premium License Manager
 * Handles premium status storage, license caching, and limit checking
 */

import { PREMIUM_LICENSE_KEY } from '@/config/storageKeys';
import { FREE_LIMITS, ResourceType, PREMIUM_PRODUCT_ID, getLimit } from '@/config/premiumLimits';
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
 * 2. Runtime: This function rejects test tokens in Vercel production (VERCEL_ENV)
 * 3. Runtime: Test tokens only accepted in dev mode OR with INTERNAL_TESTING flag
 *
 * Test tokens are ONLY accepted in:
 * - Development mode (NODE_ENV !== 'production')
 * - Internal testing mode (NEXT_PUBLIC_INTERNAL_TESTING === 'true')
 * - AND NOT in Vercel production environment (regardless of flags)
 *
 * @throws Error if token validation fails
 */
function validatePurchaseToken(purchaseToken?: string): void {
  const isDev = process.env.NODE_ENV !== 'production';
  const isInternalTesting = process.env.NEXT_PUBLIC_INTERNAL_TESTING === 'true';
  const isVercelProduction = process.env.VERCEL_ENV === 'production';

  // If token matches test pattern, validate environment
  if (purchaseToken && TEST_TOKEN_PATTERN.test(purchaseToken)) {
    // DEFENSE IN DEPTH: Always block test tokens in Vercel production
    // This catches edge cases even if other safeguards fail
    if (isVercelProduction) {
      logger.error('Test token rejected in Vercel production environment');
      throw new Error('Invalid purchase token');
    }

    // Standard check: only allow in dev or internal testing mode
    if (!isDev && !isInternalTesting) {
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
 */
export interface ResourceCounts {
  teams: number;
  /** Maximum game count in any single season (not total across all seasons) */
  gamesInSeason: number;
  /** Maximum game count in any single tournament (not total across all tournaments) */
  gamesInTournament: number;
  players: number;
  seasons: number;
  tournaments: number;
}

/**
 * Check if user can create a new resource
 * @param resource - The type of resource to create
 * @param currentCount - Current count of that resource
 * @param isPremium - Whether user has premium
 * @returns true if creation is allowed
 */
export function canCreateResource(
  resource: ResourceType,
  currentCount: number,
  isPremium: boolean
): boolean {
  if (isPremium) {
    return true;
  }

  switch (resource) {
    case 'team':
      return currentCount < FREE_LIMITS.maxTeams;
    case 'player':
      return currentCount < FREE_LIMITS.maxPlayers;
    case 'season':
      return currentCount < FREE_LIMITS.maxSeasons;
    case 'tournament':
      return currentCount < FREE_LIMITS.maxTournaments;
    case 'game':
      // Games are checked per-competition, limit applies to both season and tournament
      return currentCount < FREE_LIMITS.maxGamesPerSeason;
    default:
      return true;
  }
}

/**
 * Get remaining count for a resource
 * @returns remaining count, or Infinity if premium
 */
export function getRemainingCount(
  resource: ResourceType,
  currentCount: number,
  isPremium: boolean
): number {
  if (isPremium) {
    return Infinity;
  }

  const limit = getResourceLimit(resource);
  return Math.max(0, limit - currentCount);
}

/**
 * Get the limit for a resource type
 * Re-exports getLimit from premiumLimits for convenience
 */
export const getResourceLimit = getLimit;

/**
 * Check if any resource is over the free limit (for import warnings)
 *
 * Note: gamesInSeason/gamesInTournament represent the MAXIMUM game count
 * in any single season or tournament, not the total across all competitions.
 * This matches how limits are enforced per-competition.
 */
export function isOverFreeLimit(counts: ResourceCounts): boolean {
  return (
    counts.teams > FREE_LIMITS.maxTeams ||
    counts.players > FREE_LIMITS.maxPlayers ||
    counts.seasons > FREE_LIMITS.maxSeasons ||
    counts.tournaments > FREE_LIMITS.maxTournaments ||
    counts.gamesInSeason > FREE_LIMITS.maxGamesPerSeason ||
    counts.gamesInTournament > FREE_LIMITS.maxGamesPerTournament
  );
}

/**
 * Get a summary of which resources are over limit
 */
export function getOverLimitSummary(counts: ResourceCounts): string[] {
  const overLimit: string[] = [];

  if (counts.teams > FREE_LIMITS.maxTeams) {
    overLimit.push(`${counts.teams}/${FREE_LIMITS.maxTeams} teams`);
  }
  if (counts.players > FREE_LIMITS.maxPlayers) {
    overLimit.push(`${counts.players}/${FREE_LIMITS.maxPlayers} players`);
  }
  if (counts.seasons > FREE_LIMITS.maxSeasons) {
    overLimit.push(`${counts.seasons}/${FREE_LIMITS.maxSeasons} seasons`);
  }
  if (counts.tournaments > FREE_LIMITS.maxTournaments) {
    overLimit.push(`${counts.tournaments}/${FREE_LIMITS.maxTournaments} tournaments`);
  }

  return overLimit;
}
