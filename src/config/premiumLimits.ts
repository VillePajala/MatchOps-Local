/**
 * Premium tier limits configuration
 *
 * ENFORCEMENT:
 * - Cloud mode (Supabase): Limits ARE enforced for free-tier users.
 *   Full Version purchasers get unlimited access.
 * - Local mode (IndexedDB): No limits enforced - always treated as premium.
 *   This allows full offline functionality without purchase.
 *
 * EXISTING DATA:
 * - Data exceeding limits is never deleted automatically.
 * - Users who have data beyond limits retain access to existing data.
 * - They just can't create NEW resources beyond the limit.
 *
 * @see PremiumContext.tsx - where enforcement logic lives
 * @see docs/07-business/monetization-strategies.md - business rationale
 */

export const FREE_LIMITS = {
  maxSeasons: 3,               // 3 free seasons before upgrade
  maxTournaments: 3,           // 3 free tournaments before upgrade
  // Teams, players, and games are unlimited for all users
} as const;

export type ResourceType = 'season' | 'tournament';

export const PREMIUM_PRODUCT_ID = 'premium_unlock';
/** Price display string (TBD -- final price set in Play Store) */
export const PREMIUM_PRICE = '4,99 \u20AC';
export const PREMIUM_PRICE_AMOUNT = 4.99;
/** Whether premium is a subscription (monthly) or one-time purchase */
export const PREMIUM_IS_SUBSCRIPTION = false;

/**
 * Get the limit for a specific resource type
 */
export function getLimit(resource: ResourceType): number {
  switch (resource) {
    case 'season':
      return FREE_LIMITS.maxSeasons;
    case 'tournament':
      return FREE_LIMITS.maxTournaments;
    default: {
      // TypeScript exhaustive check — if a new ResourceType is added without
      // a case here, this will be a compile error
      const _exhaustive: never = resource;
      return _exhaustive;
    }
  }
}

/**
 * Get human-readable resource name for UI
 */
export function getResourceName(resource: ResourceType, count: number = 1): string {
  const names: Record<ResourceType, [string, string]> = {
    season: ['season', 'seasons'],
    tournament: ['tournament', 'tournaments'],
  };
  return count === 1 ? names[resource][0] : names[resource][1];
}
