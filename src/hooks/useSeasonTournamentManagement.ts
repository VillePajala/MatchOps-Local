/**
 * Season/Tournament management data + mutations, extracted from
 * useGameDataManagement for L.1 of the two-level restructure:
 * SeasonTournamentManagementModal renders in the page-level ClubModalsHost,
 * so its queries and mutations must work WITHOUT the match view mounted.
 *
 * Query keys match useGameDataQueries exactly, so React Query dedupes with
 * the game-side instances when both are mounted. Mutation bodies are moved
 * verbatim from useGameDataManagement (which no longer defines them - the
 * modal was their only consumer).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import { getMasterRoster } from '@/utils/masterRosterManager';
import {
  getSeasons,
  addSeason as utilAddSeason,
  updateSeason as utilUpdateSeason,
  deleteSeason as utilDeleteSeason,
} from '@/utils/seasons';
import {
  getTournaments,
  addTournament as utilAddTournament,
  updateTournament as utilUpdateTournament,
  deleteTournament as utilDeleteTournament,
} from '@/utils/tournaments';
import type { Player, Season, Tournament } from '@/types';
import logger from '@/utils/logger';

export interface UseSeasonTournamentManagementReturn {
  seasons: Season[];
  tournaments: Tournament[];
  /** Archived included - for the manager screen only, where they can be restored (review 7.20). */
  allSeasons: Season[];
  allTournaments: Tournament[];
  masterRoster: Player[];
  /** Seasons or tournaments still on their first load (an error is not loading). */
  isCompetitionsLoading: boolean;
  addSeasonMutation: UseMutationResult<Season | null, Error, Partial<Season> & { name: string }, unknown>;
  addTournamentMutation: UseMutationResult<Tournament | null, Error, Partial<Tournament> & { name: string }, unknown>;
  updateSeasonMutation: UseMutationResult<Season | null, Error, Season, unknown>;
  deleteSeasonMutation: UseMutationResult<boolean, Error, string, unknown>;
  updateTournamentMutation: UseMutationResult<Tournament | null, Error, Tournament, unknown>;
  deleteTournamentMutation: UseMutationResult<boolean, Error, string, unknown>;
}

// Stable fallbacks: a fresh [] per render while a query has no data (the roster
// query can now fail) would change identity every render.
const NO_PLAYERS: Player[] = [];
const NO_SEASONS: Season[] = [];
const NO_TOURNAMENTS: Tournament[] = [];

/**
 * @param managerOpen  load the archive-inclusive lists (allSeasons/allTournaments)
 *                     only while the manager screen is open
 */
export function useSeasonTournamentManagement(managerOpen = false): UseSeasonTournamentManagementReturn {
  const queryClient = useQueryClient();
  const { userId } = useDataStore();

  // Same query keys as useGameDataQueries - shared cache, no double fetch.
  const seasonsQuery: UseQueryResult<Season[], Error> = useQuery({
    queryKey: [...queryKeys.seasons, userId],
    queryFn: () => getSeasons(userId),
  });
  const tournamentsQuery: UseQueryResult<Tournament[], Error> = useQuery({
    queryKey: [...queryKeys.tournaments, userId],
    queryFn: () => getTournaments(userId),
  });
  // Under the same key prefixes, so every invalidation of seasons/tournaments
  // refreshes these too.
  const allSeasonsQuery: UseQueryResult<Season[], Error> = useQuery({
    queryKey: [...queryKeys.seasons, userId, 'withArchived'],
    queryFn: () => getSeasons(userId, true),
    enabled: managerOpen,
  });
  const allTournamentsQuery: UseQueryResult<Tournament[], Error> = useQuery({
    queryKey: [...queryKeys.tournaments, userId, 'withArchived'],
    queryFn: () => getTournaments(userId, true),
    enabled: managerOpen,
  });
  const masterRosterQuery: UseQueryResult<Player[], Error> = useQuery({
    queryKey: [...queryKeys.masterRoster, userId],
    queryFn: () => getMasterRoster(userId),
  });

  const addSeasonMutation = useMutation<
    Season | null,
    Error,
    Partial<Season> & { name: string }
  >({
    mutationFn: async (data) => {
      const { name, ...extra } = data;
      return utilAddSeason(name, extra, userId);
    },
    onSuccess: (newSeason) => {
      if (newSeason) {
        logger.log('[Mutation Success] Season added:', newSeason.name, newSeason.id);
        queryClient.invalidateQueries({ queryKey: [...queryKeys.seasons, userId] });
      } else {
        logger.warn('[Mutation Non-Success] utilAddSeason returned null');
      }
    },
    onError: (error) => {
      logger.error('[Mutation Error] Failed to add season:', error);
    },
  });

  const updateSeasonMutation = useMutation<Season | null, Error, Season>({
    mutationFn: async (season) => utilUpdateSeason(season, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.seasons, userId] });
    },
  });

  const deleteSeasonMutation = useMutation<boolean, Error, string>({
    mutationFn: async (id) => utilDeleteSeason(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.seasons, userId] });
    },
  });

  const addTournamentMutation = useMutation<
    Tournament | null,
    Error,
    Partial<Tournament> & { name: string }
  >({
    mutationFn: async (data) => {
      const { name, ...extra } = data;
      return utilAddTournament(name, extra, userId);
    },
    onSuccess: (newTournament) => {
      if (newTournament) {
        logger.log('[Mutation Success] Tournament added:', newTournament.name, newTournament.id);
        queryClient.invalidateQueries({ queryKey: [...queryKeys.tournaments, userId] });
      } else {
        logger.warn('[Mutation Non-Success] utilAddTournament returned null');
      }
    },
    onError: (error) => {
      logger.error('[Mutation Error] Failed to add tournament:', error);
    },
  });

  const updateTournamentMutation = useMutation<Tournament | null, Error, Tournament>({
    mutationFn: async (tournament) => utilUpdateTournament(tournament, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.tournaments, userId] });
    },
  });

  const deleteTournamentMutation = useMutation<boolean, Error, string>({
    mutationFn: (id: string) => utilDeleteTournament(id, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.tournaments, userId] });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.savedGames, userId] });
    },
  });

  return {
    seasons: seasonsQuery.data ?? NO_SEASONS,
    tournaments: tournamentsQuery.data ?? NO_TOURNAMENTS,
    allSeasons: allSeasonsQuery.data ?? NO_SEASONS,
    allTournaments: allTournamentsQuery.data ?? NO_TOURNAMENTS,
    masterRoster: masterRosterQuery.data ?? NO_PLAYERS,
    isCompetitionsLoading: seasonsQuery.isLoading || tournamentsQuery.isLoading,
    addSeasonMutation,
    addTournamentMutation,
    updateSeasonMutation,
    deleteSeasonMutation,
    updateTournamentMutation,
    deleteTournamentMutation,
  };
}

export default useSeasonTournamentManagement;
