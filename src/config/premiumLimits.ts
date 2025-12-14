/**
 * Premium tier limits configuration
 * Free users have quantity limits, premium users have unlimited access
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
export const PREMIUM_PRICE = '9,99 €';
export const PREMIUM_PRICE_AMOUNT = 9.99;

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
