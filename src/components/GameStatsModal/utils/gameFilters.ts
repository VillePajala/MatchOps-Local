/**
 * Shared game filtering utilities for GameStatsModal
 * Consolidates duplicated filtering logic across multiple files
 */

import { SavedGamesCollection } from '@/types';
import { StatsTab } from '../types';

/**
 * Filter options for game collection
 */
export interface GameFilterOptions {
  /**
   * Only include games where isPlayed !== false
   * @default true
   */
  playedOnly?: boolean;

  /**
   * Team filter - 'all', 'legacy', or specific team ID
   */
  teamFilter?: string | 'all' | 'legacy';

  /**
   * Season filter - 'all' or specific season ID
   */
  seasonFilter?: string | 'all';

  /**
   * Tournament filter - 'all' or specific tournament ID
   */
  tournamentFilter?: string | 'all';

  /**
   * Active tab context - affects season/tournament filtering logic
   */
  activeTab?: StatsTab;
}

/**
 * Filters game IDs from a SavedGamesCollection based on provided criteria
 *
 * @param games - Collection of saved games
 * @param options - Filter options
 * @returns Array of filtered game IDs
 *
 * @example
 * // Get all played games for a specific team
 * const gameIds = filterGameIds(savedGames, {
 *   playedOnly: true,
 *   teamFilter: 'team_123'
 * });
 *
 * @example
 * // Get all season games (no tournaments)
 * const seasonGameIds = filterGameIds(savedGames, {
 *   playedOnly: true,
 *   activeTab: 'season',
 *   seasonFilter: 'all'
 * });
 */
export function filterGameIds(
  games: SavedGamesCollection | null,
  options: GameFilterOptions = {}
): string[] {
  const {
    playedOnly = true,
    teamFilter = 'all',
    seasonFilter,
    tournamentFilter,
    activeTab
  } = options;

  if (!games) return [];

  // Get all game IDs
  let gameIds = Object.keys(games);

  // Filter by played status
  if (playedOnly) {
    gameIds = gameIds.filter(id => games[id]?.isPlayed !== false);
  }

  // Apply filters
  gameIds = gameIds.filter(gameId => {
    const game = games[gameId];
    if (!game) return false;

    // Team filter
    if (teamFilter !== 'all') {
      if (teamFilter === 'legacy') {
        // Legacy games have no teamId or empty teamId
        if (game.teamId != null && game.teamId !== '') return false;
      } else {
        // Specific team
        if (game.teamId !== teamFilter) return false;
      }
    }

    // Season filter (based on activeTab context)
    if (seasonFilter !== undefined) {
      if (activeTab === 'season') {
        // Season tab: exclude games that have tournaments
        if (seasonFilter === 'all') {
          // Show all season games (no tournament)
          return game.seasonId != null && (game.tournamentId == null || game.tournamentId === '');
        } else {
          // Show specific season only
          return game.seasonId === seasonFilter;
        }
      }
    }

    // Tournament filter (based on activeTab context)
    if (tournamentFilter !== undefined) {
      if (activeTab === 'tournament') {
        // Tournament tab: exclude games that have seasons
        if (tournamentFilter === 'all') {
          // Show all tournament games (no season)
          return game.tournamentId != null && (game.seasonId == null || game.seasonId === '');
        } else {
          // Show specific tournament only
          return game.tournamentId === tournamentFilter;
        }
      }
    }

    return true;
  });

  return gameIds;
}

/**
 * Get all played game IDs filtered by team
 * Convenience wrapper for common use case
 *
 * @param games - Collection of saved games
 * @param teamFilter - Team filter ('all', 'legacy', or team ID)
 * @returns Array of filtered game IDs
 */
export function getPlayedGamesByTeam(
  games: SavedGamesCollection | null,
  teamFilter: string | 'all' | 'legacy' = 'all'
): string[] {
  return filterGameIds(games, {
    playedOnly: true,
    teamFilter
  });
}
