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
  error: Error | null;
}

export function useGameDataQueries(): GameDataQueriesResult {
  const masterRoster = useQuery<Player[], Error>({
    queryKey: queryKeys.masterRoster,
    queryFn: getMasterRoster,
  });

  const seasons = useQuery<Season[], Error>({
    queryKey: queryKeys.seasons,
    queryFn: getSeasons,
  });

  const tournaments = useQuery<Tournament[], Error>({
    queryKey: queryKeys.tournaments,
    queryFn: getTournaments,
  });

  const savedGames = useQuery<SavedGamesCollection | null, Error>({
    queryKey: queryKeys.savedGames,
    queryFn: getSavedGames,
    initialData: {},
  });

  const currentGameId = useQuery<string | null, Error>({
    queryKey: queryKeys.appSettingsCurrentGameId,
    queryFn: getCurrentGameIdSetting,
  });

  const loading =
    masterRoster.isLoading ||
    seasons.isLoading ||
    tournaments.isLoading ||
    savedGames.isLoading ||
    currentGameId.isLoading;

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
    error,
  };
}

// Team-aware version of useGameDataQueries
export function useTeamGameDataQueries(teamId?: string): TeamGameDataQueriesResult {
  // Get all teams
  const teams = useQuery<Team[], Error>({
    queryKey: queryKeys.teams,
    queryFn: getTeams,
  });

  // Note: Active team concept removed - teams are contextually selected
  // This will be refactored in Phase 2 when implementing contextual team selection
  
  // Use provided teamId (no fallback to global active team)
  const effectiveTeamId = teamId;

  // Get team roster (only if we have a team ID)
  const teamRoster = useQuery<TeamPlayer[], Error>({
    queryKey: queryKeys.teamRoster(effectiveTeamId || 'none'),
    queryFn: () => effectiveTeamId ? getTeamRoster(effectiveTeamId) : Promise.resolve([]),
    enabled: !!effectiveTeamId,
  });

  // Get seasons (global entities - no team filtering per plan)
  const seasons = useQuery<Season[], Error>({
    queryKey: queryKeys.seasons,
    queryFn: getSeasons,
  });

  // Get tournaments (global entities - no team filtering per plan)  
  const tournaments = useQuery<Tournament[], Error>({
    queryKey: queryKeys.tournaments,
    queryFn: getTournaments,
  });

  // Get saved games (global collection - filtering happens at UI level)
  const savedGames = useQuery<SavedGamesCollection | null, Error>({
    queryKey: queryKeys.savedGames,
    queryFn: getSavedGames,
    initialData: {},
  });

  const currentGameId = useQuery<string | null, Error>({
    queryKey: queryKeys.appSettingsCurrentGameId,
    queryFn: getCurrentGameIdSetting,
  });

  const loading =
    teams.isLoading ||
    teamRoster.isLoading ||
    seasons.isLoading ||
    tournaments.isLoading ||
    savedGames.isLoading ||
    currentGameId.isLoading;

  const error =
    teams.error ||
    teamRoster.error ||
    seasons.error ||
    tournaments.error ||
    savedGames.error ||
    currentGameId.error ||
    null;

  return {
    teams: teams.data || [],
    activeTeamId: null, // Active team concept removed
    teamRoster: teamRoster.data || [],
    seasons: seasons.data || [],
    tournaments: tournaments.data || [],
    savedGames: savedGames.data || null,
    currentGameId: currentGameId.data || null,
    loading,
    error,
  };
}
