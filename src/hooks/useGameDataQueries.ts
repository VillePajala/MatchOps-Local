import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import {
  getMasterRoster,
} from '@/utils/masterRosterManager';
import { getSeasons } from '@/utils/seasons';
import { getTournaments } from '@/utils/tournaments';
import { getSavedGames } from '@/utils/savedGames';
import { getCurrentGameIdSetting } from '@/utils/appSettings';
import { getTeams, getTeamRoster, getActiveTeamId } from '@/utils/teams';
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

  // Get active team ID
  const activeTeamIdQuery = useQuery<string | null, Error>({
    queryKey: queryKeys.activeTeamId,
    queryFn: () => Promise.resolve(getActiveTeamId()),
  });

  // Use provided teamId or active team ID
  const effectiveTeamId = teamId || activeTeamIdQuery.data;

  // Get team roster (only if we have a team ID)
  const teamRoster = useQuery<TeamPlayer[], Error>({
    queryKey: queryKeys.teamRoster(effectiveTeamId || 'none'),
    queryFn: () => effectiveTeamId ? getTeamRoster(effectiveTeamId) : Promise.resolve([]),
    enabled: !!effectiveTeamId,
  });

  // Get seasons (filtered by team or global)
  const seasons = useQuery<Season[], Error>({
    queryKey: queryKeys.teamSeasons(effectiveTeamId),
    queryFn: async () => {
      const allSeasons = await getSeasons();
      // Filter seasons: include team-specific or global (no teamId)
      return allSeasons.filter(season => 
        !season.teamId || season.teamId === effectiveTeamId
      );
    },
  });

  // Get tournaments (filtered by team or global)
  const tournaments = useQuery<Tournament[], Error>({
    queryKey: queryKeys.teamTournaments(effectiveTeamId),
    queryFn: async () => {
      const allTournaments = await getTournaments();
      // Filter tournaments: include team-specific or global (no teamId)
      return allTournaments.filter(tournament => 
        !tournament.teamId || tournament.teamId === effectiveTeamId
      );
    },
  });

  // Get saved games (filtered by team)
  const savedGames = useQuery<SavedGamesCollection | null, Error>({
    queryKey: queryKeys.teamSavedGames(effectiveTeamId),
    queryFn: async () => {
      const allGames = await getSavedGames();
      if (!effectiveTeamId || !allGames) return allGames;
      
      // Filter games by team
      const filteredGames: SavedGamesCollection = {};
      Object.entries(allGames).forEach(([gameId, gameState]) => {
        if (!gameState.teamId || gameState.teamId === effectiveTeamId) {
          filteredGames[gameId] = gameState;
        }
      });
      return filteredGames;
    },
    initialData: {},
  });

  const currentGameId = useQuery<string | null, Error>({
    queryKey: queryKeys.appSettingsCurrentGameId,
    queryFn: getCurrentGameIdSetting,
  });

  const loading =
    teams.isLoading ||
    activeTeamIdQuery.isLoading ||
    teamRoster.isLoading ||
    seasons.isLoading ||
    tournaments.isLoading ||
    savedGames.isLoading ||
    currentGameId.isLoading;

  const error =
    teams.error ||
    activeTeamIdQuery.error ||
    teamRoster.error ||
    seasons.error ||
    tournaments.error ||
    savedGames.error ||
    currentGameId.error ||
    null;

  return {
    teams: teams.data || [],
    activeTeamId: activeTeamIdQuery.data || null,
    teamRoster: teamRoster.data || [],
    seasons: seasons.data || [],
    tournaments: tournaments.data || [],
    savedGames: savedGames.data || null,
    currentGameId: currentGameId.data || null,
    loading,
    error,
  };
}
