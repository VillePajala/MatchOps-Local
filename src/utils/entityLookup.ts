import type { AppState } from '@/types/game';
import type { Team, Season, Tournament } from '@/types';

export interface EntityMaps {
  teams: Map<string, Team>;
  seasons: Map<string, Season>;
  tournaments: Map<string, Tournament>;
}

/**
 * Create memoized entity lookup maps for O(1) performance
 *
 * Converts arrays of entities into Maps keyed by ID for fast lookups.
 * Used to resolve entity names when displaying games.
 *
 * @param teams - Array of Team entities
 * @param seasons - Array of Season entities
 * @param tournaments - Array of Tournament entities
 * @returns Object containing Map instances for each entity type
 */
export function createEntityMaps(
  teams: Team[],
  seasons: Season[],
  tournaments: Tournament[]
): EntityMaps {
  return {
    teams: new Map(teams.map(t => [t.id, t])),
    seasons: new Map(seasons.map(s => [s.id, s])),
    tournaments: new Map(tournaments.map(t => [t.id, t])),
  };
}

/**
 * Resolve display names for a game using entity lookups with fallback to snapshots
 *
 * Strategy:
 * - Team: If game has teamId AND entity exists: Use entity's current name (live)
 *         If game has teamId BUT entity missing: Fall back to snapshot teamName (deleted entity)
 *         If game has no teamId: Use snapshot teamName (legacy or "No Team" games)
 * - Season/Tournament: Always look up by ID (no snapshots stored in game)
 *                      If entity missing: Return undefined (will display as empty)
 *
 * This ensures:
 * 1. Renamed entities show updated names everywhere
 * 2. Deleted team entities gracefully fall back to last known name
 * 3. Deleted season/tournament entities return undefined (handled by UI)
 * 4. Legacy games continue working with snapshot team names
 *
 * @param game - Game state containing entity IDs and team snapshot name
 * @param maps - Entity lookup maps created by createEntityMaps()
 * @returns Object with resolved teamName, seasonName, tournamentName
 */
export function getDisplayNames(game: AppState, maps: EntityMaps) {
  const team = game.teamId ? maps.teams.get(game.teamId) : null;
  const season = game.seasonId ? maps.seasons.get(game.seasonId) : null;
  const tournament = game.tournamentId ? maps.tournaments.get(game.tournamentId) : null;

  return {
    teamName: team?.name ?? game.teamName,
    seasonName: season?.name,
    tournamentName: tournament?.name,
  };
}
