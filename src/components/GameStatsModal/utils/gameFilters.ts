/**
 * Shared game filtering utilities for GameStatsModal
 * Consolidates duplicated filtering logic across multiple files
 */

import { SavedGamesCollection } from '@/types';
import type { GameType } from '@/types/game';
import { StatsTab } from '../types';
import { getClubSeasonForDate } from '@/utils/clubSeason';

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
   * Series filter - 'all' or specific series ID (within tournament)
   */
  seriesFilter?: string | 'all';

  /**
   * Game type filter - 'all', 'soccer', or 'futsal'
   */
  gameTypeFilter?: GameType | 'all';

  /**
   * Active tab context - affects season/tournament filtering logic
   */
  activeTab?: StatsTab;

  /**
   * Club season filter - 'all' or specific season label (e.g., '24/25')
   */
  clubSeasonFilter?: string | 'all';

  /**
   * Club season start date template (ISO format, e.g., '2000-10-01')
   */
  clubSeasonStartDate?: string;

  /**
   * Club season end date template (ISO format, e.g., '2000-05-01')
   */
  clubSeasonEndDate?: string;
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
    seriesFilter,
    gameTypeFilter = 'all',
    activeTab,
    clubSeasonFilter = 'all',
    clubSeasonStartDate = '2000-10-01',
    clubSeasonEndDate = '2000-05-01',
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
        if ((game.teamId ?? '') !== '') return false;
      } else {
        // Specific team
        if (game.teamId !== teamFilter) return false;
      }
    }

    // Game type filter
    if (gameTypeFilter !== 'all') {
      const gameType = game.gameType || 'soccer'; // Default to soccer for legacy games
      if (gameType !== gameTypeFilter) return false;
    }

    // Club season filter (Vuosi - e.g., '24/25')
    if (clubSeasonFilter !== 'all') {
      if (!game.gameDate) return false;
      const gameSeason = getClubSeasonForDate(game.gameDate, clubSeasonStartDate, clubSeasonEndDate);
      if (gameSeason !== clubSeasonFilter) return false;
    }

    // Season filter (based on activeTab context)
    if (activeTab === 'season') {
      if (seasonFilter === 'all') {
        // Show all season games (must have seasonId, no tournament)
        const hasSeason = (game.seasonId ?? '') !== '';
        const hasTournament = (game.tournamentId ?? '') !== '';
        return hasSeason && !hasTournament;
      } else if (seasonFilter !== undefined) {
        // Show specific season only
        return game.seasonId === seasonFilter;
      }
      // If on season tab but no seasonFilter or game has no season, exclude
      return false;
    }

    // Tournament filter (based on activeTab context)
    if (activeTab === 'tournament') {
      if (tournamentFilter === 'all') {
        // Show all tournament games (must have tournamentId, no season)
        const hasTournament = (game.tournamentId ?? '') !== '';
        const hasSeason = (game.seasonId ?? '') !== '';
        return hasTournament && !hasSeason;
      } else if (tournamentFilter !== undefined) {
        // Show specific tournament only
        if (game.tournamentId !== tournamentFilter) return false;

        // Apply series filter if set (only when specific tournament selected)
        if (seriesFilter && seriesFilter !== 'all') {
          // Filter by specific series within this tournament
          return game.tournamentSeriesId === seriesFilter;
        }
        return true;
      }
      // If on tournament tab but no tournamentFilter or game has no tournament, exclude
      return false;
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
