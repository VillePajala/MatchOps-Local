/**
 * Premium tier limits configuration
 *
 * ENFORCEMENT:
 * - Cloud mode (Supabase): Limits ARE enforced for free-tier users.
 *   Premium subscribers get unlimited access.
 * - Local mode (IndexedDB): No limits enforced - always treated as premium.
 *   This allows full offline functionality without subscription.
 *
 * EXISTING DATA:
 * - Data exceeding limits is never deleted automatically.
 * - Users who downgrade from premium retain access to existing data.
 * - They just can't create NEW resources beyond the limit.
 *
 * @see PremiumContext.tsx - where enforcement logic lives
 */

export const FREE_LIMITS = {
  maxTeams: 1,               // Allow trying one team before upgrade
  maxGamesPerSeason: 10,     // ~1/3 of typical Finnish youth season (25-30 games)
  maxGamesPerTournament: 10, // Covers most small tournaments
  maxPlayers: 18,            // Standard squad size (11 starters + 7 subs)
  maxSeasons: 1,             // One active season to evaluate the app
  maxTournaments: 1,         // One tournament to try the feature
} as const;

export type ResourceType = 'team' | 'game' | 'player' | 'season' | 'tournament';

export const PREMIUM_PRODUCT_ID = 'matchops_premium';
/** Price in European format: symbol + space + comma decimal + /kk (per month in Finnish) */
export const PREMIUM_PRICE = '€ 4,99/kk';
export const PREMIUM_PRICE_AMOUNT = 4.99;
/** Whether premium is a subscription (monthly) or one-time purchase */
export const PREMIUM_IS_SUBSCRIPTION = true;

/**
 * Get the limit for a specific resource type
 */
export function getLimit(resource: ResourceType): number {
  switch (resource) {
    case 'team':
      return FREE_LIMITS.maxTeams;
    case 'game':
      // Games are per-competition, but this returns the per-competition limit
      return FREE_LIMITS.maxGamesPerSeason;
    case 'player':
      return FREE_LIMITS.maxPlayers;
    case 'season':
      return FREE_LIMITS.maxSeasons;
    case 'tournament':
      return FREE_LIMITS.maxTournaments;
    default:
      return 0;
  }
}

/**
 * Get human-readable resource name for UI
 */
export function getResourceName(resource: ResourceType, count: number = 1): string {
  const names: Record<ResourceType, [string, string]> = {
    team: ['team', 'teams'],
    game: ['game', 'games'],
    player: ['player', 'players'],
    season: ['season', 'seasons'],
    tournament: ['tournament', 'tournaments'],
  };
  return count === 1 ? names[resource][0] : names[resource][1];
}
