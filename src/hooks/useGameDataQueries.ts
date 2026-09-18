/**
 * React Query hooks for game data management.
 *
 * All hooks use user-scoped storage when authenticated:
 * - userId is included in query keys for cache isolation
 * - userId is passed to utility functions for correct database selection
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import {
  getMasterRoster,
} from '@/utils/masterRosterManager';
import { getSeasons } from '@/utils/seasons';
import { getTournaments } from '@/utils/tournaments';
import { getSavedGames } from '@/utils/savedGames';
import { getCurrentGameIdSetting } from '@/utils/appSettings';
import { getTeams, getTeamRoster } from '@/utils/teams';
import { useDataStore } from '@/hooks/useDataStore';
import type {
  Player,
  Season,
  Tournament,
  SavedGamesCollection,
  Team,
  TeamPlayer,
} from '@/types';

export interface GameDataQueriesResult {
  masterRoster: Player[];
  seasons: Season[];
  tournaments: Tournament[];
  savedGames: SavedGamesCollection | null;
  currentGameId: string | null;
  loading: boolean;
  /** Saved games or the current-game id are refetching - see `isSettling`.
   *  REQUIRED on purpose: optional let a missing value coerce to false, which
   *  is exactly how this was wired to the wrong hook variant and silently did
   *  nothing. A missing one must be a type error, not a quiet no-op. */
  isSettling: boolean;
  error: Error | null;
}

export interface TeamGameDataQueriesResult {
  teams: Team[];
  activeTeamId: string | null;
  teamRoster: TeamPlayer[];
  seasons: Season[];
  tournaments: Tournament[];
  savedGames: SavedGamesCollection | null;
  currentGameId: string | null;
  loading: boolean;
  /** Saved games or the current-game id are refetching - see `isSettling`.
   *  REQUIRED on purpose: optional let a missing value coerce to false, which
   *  is exactly how this was wired to the wrong hook variant and silently did
   *  nothing. A missing one must be a type error, not a quiet no-op. */
  isSettling: boolean;
  error: Error | null;
}

export function useGameDataQueries(): GameDataQueriesResult {
  const { userId } = useDataStore();

  const masterRoster = useQuery<Player[], Error>({
    // Include userId in query key for cache isolation between users
    queryKey: [...queryKeys.masterRoster, userId],
    queryFn: () => getMasterRoster(userId),
  });

  const seasons = useQuery<Season[], Error>({
    // Include userId in query key for cache isolation between users
    queryKey: [...queryKeys.seasons, userId],
    queryFn: () => getSeasons(userId),
  });

  const tournaments = useQuery<Tournament[], Error>({
    // Include userId in query key for cache isolation between users
    queryKey: [...queryKeys.tournaments, userId],
    queryFn: () => getTournaments(userId),
  });

  const savedGames = useQuery<SavedGamesCollection | null, Error>({
    // Include userId in query key for cache isolation between users
    queryKey: [...queryKeys.savedGames, userId],
    queryFn: () => getSavedGames(userId),
    // Note: Removed initialData: {} - it was causing race conditions where
    // isLoading would be false (because initialData counts as "data available")
    // but the actual cloud data hadn't loaded yet. This caused the game ID
    // from settings to not be found in the empty savedGames object.
  });

  const currentGameId = useQuery<string | null, Error>({
    // Include userId in query key for cache isolation between users
    queryKey: [...queryKeys.appSettingsCurrentGameId, userId],
    queryFn: () => getCurrentGameIdSetting(userId),
  });

  const loading =
    masterRoster.isLoading ||
    seasons.isLoading ||
    tournaments.isLoading ||
    savedGames.isLoading ||
    currentGameId.isLoading;

  // The variant the match's boot actually calls - see the note on the team
  // variant below for why isLoading alone is not enough.
  const isSettling = savedGames.isFetching || currentGameId.isFetching;

  const error =
    masterRoster.error ||
    seasons.error ||
    tournaments.error ||
    savedGames.error ||
    currentGameId.error ||
    null;

  return {
    masterRoster: masterRoster.data || [],
    seasons: seasons.data || [],
    tournaments: tournaments.data || [],
    savedGames: savedGames.data || null,
    currentGameId: currentGameId.data || null,
    loading,
    isSettling,
    error,
  };
}

// Team-aware version of useGameDataQueries
export function useTeamGameDataQueries(teamId?: string): TeamGameDataQueriesResult {
  const { userId } = useDataStore();

  // Get all teams
  const teams = useQuery<Team[], Error>({
    // Include userId in query key for cache isolation between users
    queryKey: [...queryKeys.teams, userId],
    queryFn: () => getTeams(userId),
  });

  // Note: Active team concept removed - teams are contextually selected
  // This will be refactored in Phase 2 when implementing contextual team selection

  // Use provided teamId (no fallback to global active team)
  const effectiveTeamId = teamId;

  // Get team roster (only if we have a team ID)
  const teamRoster = useQuery<TeamPlayer[], Error>({
    // Include userId in query key for cache isolation between users
    queryKey: [...queryKeys.teamRoster(effectiveTeamId || 'none'), userId],
    queryFn: () => effectiveTeamId ? getTeamRoster(effectiveTeamId, userId) : Promise.resolve([]),
    enabled: !!effectiveTeamId,
  });

  // Get seasons (global entities - no team filtering per plan)
  const seasons = useQuery<Season[], Error>({
    // Include userId in query key for cache isolation between users
    queryKey: [...queryKeys.seasons, userId],
    queryFn: () => getSeasons(userId),
  });

  // Get tournaments (global entities - no team filtering per plan)
  const tournaments = useQuery<Tournament[], Error>({
    // Include userId in query key for cache isolation between users
    queryKey: [...queryKeys.tournaments, userId],
    queryFn: () => getTournaments(userId),
  });

  // Get saved games (global collection - filtering happens at UI level)
  const savedGames = useQuery<SavedGamesCollection | null, Error>({
    // Include userId in query key for cache isolation between users
    queryKey: [...queryKeys.savedGames, userId],
    queryFn: () => getSavedGames(userId),
    // Note: No initialData - let the query properly load before rendering
  });

  const currentGameId = useQuery<string | null, Error>({
    // Include userId in query key for cache isolation between users
    queryKey: [...queryKeys.appSettingsCurrentGameId, userId],
    queryFn: () => getCurrentGameIdSetting(userId),
  });

  const loading =
    teams.isLoading ||
    teamRoster.isLoading ||
    seasons.isLoading ||
    tournaments.isLoading ||
    savedGames.isLoading ||
    currentGameId.isLoading;

  /**
   * The two queries the match's boot decision depends on, still in flight.
   *
   * WHY THIS IS SEPARATE FROM `loading`. React Query reports a REFETCH as
   * `isFetching`, not `isLoading` - `isLoading` is only the very first fetch,
   * when there is nothing cached. So after an invalidation the cache still
   * serves the OLD value while the new one is on its way, and anything that
   * only checks `isLoading` believes it is looking at settled data.
   *
   * That is how the match could boot into the demo workspace: the persisted id
   * was not in a stale savedGames snapshot, and the boot read "not in the list"
   * as "no such game" rather than "not loaded yet". Callers deciding whether a
   * game EXISTS must consult this too.
   */
  const isSettling = savedGames.isFetching || currentGameId.isFetching;

  const error =
    teams.error ||
    teamRoster.error ||
    seasons.error ||
    tournaments.error ||
    savedGames.error ||
    currentGameId.error ||
    null;

  return useMemo(() => ({
    teams: teams.data || [],
    activeTeamId: null, // Active team concept removed
    teamRoster: teamRoster.data || [],
    seasons: seasons.data || [],
    tournaments: tournaments.data || [],
    savedGames: savedGames.data || null,
    currentGameId: currentGameId.data || null,
    loading,
    isSettling,
    error,
  }), [
    teams.data, teamRoster.data, seasons.data, tournaments.data,
    savedGames.data, currentGameId.data, loading, isSettling, error,
  ]);
}
