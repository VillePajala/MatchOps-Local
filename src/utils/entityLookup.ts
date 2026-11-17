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
 * - Team: The name stored with the game (owner decision 2026-11-17, review 7.17):
 *         the match screen, the recap and the Taso text all show it, so the list
 *         does too - a renamed team's old games keep the name they were played
 *         under, and a name customised for one game is never hidden. The team's
 *         current name fills in only when the game has none, and is returned
 *         separately (currentTeamName) so a search for it still finds the games.
 * - Season/Tournament: Always look up by ID (no snapshots stored in game)
 *                      If entity missing: Return undefined (will display as empty)
 *
 * This ensures:
 * 1. Every screen shows a game under the same team name
 * 2. Renamed seasons/tournaments show their updated names
 * 3. Deleted season/tournament entities return undefined (handled by UI)
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
    teamName: game.teamName || team?.name || '',
    currentTeamName: team?.name,
    seasonName: season?.name,
    tournamentName: tournament?.name,
  };
}
