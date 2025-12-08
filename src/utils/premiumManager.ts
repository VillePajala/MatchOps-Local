/**
 * Premium License Manager
 * Handles premium status storage, license caching, and limit checking
 */

import { PREMIUM_LICENSE_KEY } from '@/config/storageKeys';
import { FREE_LIMITS, ResourceType, PREMIUM_PRODUCT_ID } from '@/config/premiumLimits';
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
 * Grant premium status (after successful purchase verification)
 */
export async function grantPremium(purchaseToken?: string): Promise<void> {
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
  gamesInSeason: number;
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
 */
export function getResourceLimit(resource: ResourceType): number {
  switch (resource) {
    case 'team':
      return FREE_LIMITS.maxTeams;
    case 'player':
      return FREE_LIMITS.maxPlayers;
    case 'season':
      return FREE_LIMITS.maxSeasons;
    case 'tournament':
      return FREE_LIMITS.maxTournaments;
    case 'game':
      return FREE_LIMITS.maxGamesPerSeason;
    default:
      return 0;
  }
}

/**
 * Check if any resource is over the free limit (for import warnings)
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
