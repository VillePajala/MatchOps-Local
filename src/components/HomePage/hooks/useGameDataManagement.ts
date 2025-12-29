/**
 * Game Data Management Hook
 *
 * @remarks
 * Centralizes all data fetching, caching, and synchronization logic for the game orchestrator.
 * This hook manages React Query operations and local state synchronization for:
 * - Master roster
 * - Seasons and tournaments
 * - Saved games collection
 * - Teams and personnel
 * - Season/tournament mutations (CRUD operations)
 *
 * Extracted from useGameOrchestration.ts as part of Step 2.6.1 refactoring.
 *
 * @example
 * ```tsx
 * const dataManager = useGameDataManagement({
 *   currentGameId,
 *   setAvailablePlayers,
 *   setSeasons,
 *   setTournaments
 * });
 *
 * // Access data
 * <RosterModal roster={dataManager.masterRoster} />
 *
 * // Perform mutations via mutationResults
 * await dataManager.mutationResults.addSeason.mutateAsync({ name: 'Spring 2024' });
 * await dataManager.mutationResults.updateTournament.mutateAsync(tournament);
 * ```
 */

import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGameDataQueries } from '@/hooks/useGameDataQueries';
import { useTeamsQuery } from '@/hooks/useTeamQueries';
import { usePersonnelManager } from '@/hooks/usePersonnelManager';
import type { PersonnelManagerReturn } from '@/hooks/usePersonnelManager';
import { queryKeys } from '@/config/queryKeys';
import {
  addSeason as utilAddSeason,
  updateSeason as utilUpdateSeason,
  deleteSeason as utilDeleteSeason,
} from '@/utils/seasons';
import {
  addTournament as utilAddTournament,
  updateTournament as utilUpdateTournament,
  deleteTournament as utilDeleteTournament,
} from '@/utils/tournaments';
import type {
  Player,
  Season,
  Tournament,
  SavedGamesCollection,
  Team,
} from '@/types';
import type { Personnel } from '@/types/personnel';
import { DEFAULT_GAME_ID } from '@/config/constants';
import logger from '@/utils/logger';

/**
 * Parameters for useGameDataManagement hook
 */
export interface UseGameDataManagementParams {
  /** Current game ID - used to determine when to sync master roster */
  currentGameId: string | null;

  /** Setter for available players - called when master roster syncs */
  setAvailablePlayers: (players: Player[] | ((prev: Player[]) => Player[])) => void;

  /**
   * Setter for seasons list - called when seasons data loads
   * @deprecated Use gameDataManagement.seasons directly instead of local state
   */
  setSeasons?: (seasons: Season[]) => void;

  /**
   * Setter for tournaments list - called when tournaments data loads
   * @deprecated Use gameDataManagement.tournaments directly instead of local state
   */
  setTournaments?: (tournaments: Tournament[]) => void;
}

/**
 * Return type for useGameDataManagement hook
 */
export interface UseGameDataManagementReturn {
  /** Master roster from React Query */
  masterRoster: Player[];

  /** Seasons list */
  seasons: Season[];

  /** Tournaments list */
  tournaments: Tournament[];

  /** All saved games */
  savedGames: SavedGamesCollection | null;

  /** Teams list */
  teams: Team[];

  /** Personnel list */
  personnel: Personnel[];

  /** Personnel manager for CRUD operations */
  personnelManager: PersonnelManagerReturn;

  /** Current game ID setting from app settings */
  currentGameIdSetting: string | null;

  /** Combined loading state for all queries */
  isLoading: boolean;

  /** Error from any failed query */
  error: Error | null;

  /** Mutation result objects for season and tournament CRUD operations */
  mutationResults: {
    addSeason: import('@tanstack/react-query').UseMutationResult<Season | null, Error, Partial<Season> & { name: string }, unknown>;
    updateSeason: import('@tanstack/react-query').UseMutationResult<Season | null, Error, Season, unknown>;
    deleteSeason: import('@tanstack/react-query').UseMutationResult<boolean, Error, string, unknown>;
    addTournament: import('@tanstack/react-query').UseMutationResult<Tournament | null, Error, Partial<Tournament> & { name: string }, unknown>;
    updateTournament: import('@tanstack/react-query').UseMutationResult<Tournament | null, Error, Tournament, unknown>;
    deleteTournament: import('@tanstack/react-query').UseMutationResult<boolean, Error, string, unknown>;
  };
}

/**
 * Hook for managing all game data fetching and synchronization
 *
 * @param params - Configuration parameters
 * @returns Data and mutation operations
 */
export function useGameDataManagement(
  params: UseGameDataManagementParams
): UseGameDataManagementReturn {
  const { currentGameId, setAvailablePlayers, setSeasons, setTournaments } = params;

  // --- Initialize React Query client ---
  const queryClient = useQueryClient();

  // --- Load game data via hooks ---
  const {
    masterRoster: masterRosterQueryResultData,
    seasons: seasonsQueryResultData,
    tournaments: tournamentsQueryResultData,
    savedGames: allSavedGamesQueryResultData,
    currentGameId: currentGameIdSettingQueryResultData,
    loading: isGameDataLoading,
    error: gameDataError,
  } = useGameDataQueries();

  // Teams query for multi-team support
  const { data: teams = [] } = useTeamsQuery();

  // Personnel management with consolidated hook
  const personnelManager = usePersonnelManager();

  // Extract individual loading/error states for legacy compatibility
  const isMasterRosterQueryLoading = isGameDataLoading;
  const areSeasonsQueryLoading = isGameDataLoading;
  const areTournamentsQueryLoading = isGameDataLoading;

  const isMasterRosterQueryError = !!gameDataError;
  const isSeasonsQueryError = !!gameDataError;
  const isTournamentsQueryError = !!gameDataError;

  const masterRosterQueryErrorData = gameDataError;
  const seasonsQueryErrorData = gameDataError;
  const tournamentsQueryErrorData = gameDataError;

  // --- Mutations for Adding a new Season ---
  const addSeasonMutation = useMutation<
    Season | null,
    Error,
    Partial<Season> & { name: string }
  >({
    mutationFn: async (data) => {
      const { name, ...extra } = data;
      return utilAddSeason(name, extra);
    },
    onSuccess: (newSeason, variables) => {
      if (newSeason) {
        logger.log('[Mutation Success] Season added:', newSeason.name, newSeason.id);
        queryClient.invalidateQueries({ queryKey: queryKeys.seasons });
      } else {
        logger.warn('[Mutation Non-Success] utilAddSeason returned null for season:', variables.name);
      }
    },
    onError: (error, variables) => {
      logger.error(`[Mutation Error] Failed to add season ${variables.name}:`, error);
    },
  });

  const updateSeasonMutation = useMutation<Season | null, Error, Season>({
    mutationFn: async (season) => utilUpdateSeason(season),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seasons });
    },
  });

  const deleteSeasonMutation = useMutation<boolean, Error, string>({
    mutationFn: async (id) => utilDeleteSeason(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.seasons });
    },
  });

  // --- Mutations for Tournaments ---
  const addTournamentMutation = useMutation<
    Tournament | null,
    Error,
    Partial<Tournament> & { name: string }
  >({
    mutationFn: async (data) => {
      const { name, ...extra } = data;
      return utilAddTournament(name, extra);
    },
    onSuccess: (newTournament, variables) => {
      if (newTournament) {
        logger.log('[Mutation Success] Tournament added:', newTournament.name, newTournament.id);
        queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
      } else {
        logger.warn('[Mutation Non-Success] utilAddTournament returned null for tournament:', variables.name);
      }
    },
    onError: (error, variables) => {
      logger.error(`[Mutation Error] Failed to add tournament ${variables.name}:`, error);
    },
  });

  const updateTournamentMutation = useMutation<Tournament | null, Error, Tournament>({
    mutationFn: async (tournament) => utilUpdateTournament(tournament),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
    },
  });

  const deleteTournamentMutation = useMutation({
    mutationFn: (id: string) => utilDeleteTournament(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tournaments });
      queryClient.invalidateQueries({ queryKey: queryKeys.savedGames });
    },
  });

  // --- Data Synchronization Effects ---

  /**
   * Sync master roster from React Query to local state
   *
   * @remarks
   * For default game: Replace availablePlayers entirely with master roster
   * For active games: Merge player details (name, jerseyNumber) from master roster
   *                   while preserving per-game isGoalie status
   */
  useEffect(() => {
    if (isMasterRosterQueryLoading) {
      logger.log('[TanStack Query] Master Roster is loading...');
      return;
    }

    if (isMasterRosterQueryError) {
      logger.error('[TanStack Query] Error loading master roster:', masterRosterQueryErrorData);
      setAvailablePlayers([]);
      return;
    }

    if (masterRosterQueryResultData && Array.isArray(masterRosterQueryResultData)) {
      if (!currentGameId || currentGameId === DEFAULT_GAME_ID) {
        // Default game: use master roster directly
        logger.log('[TanStack Query] Syncing master roster to availablePlayers (default game)');
        setAvailablePlayers(masterRosterQueryResultData);
      } else {
        // Active game: merge player details while preserving per-game goalie status
        logger.log('[TanStack Query] Merging master roster updates (preserving per-game goalie status)');
        setAvailablePlayers((currentPlayers: Player[]) => {
          // Build lookup map of current per-game goalie assignments
          const perGameGoalieMap = new Map<string, boolean>();
          currentPlayers.forEach((p: Player) => {
            if (p.isGoalie !== undefined) {
              perGameGoalieMap.set(p.id, p.isGoalie);
            }
          });

          // Merge: use master roster data but preserve per-game isGoalie
          return masterRosterQueryResultData.map(masterPlayer => {
            const hasPerGameGoalie = perGameGoalieMap.has(masterPlayer.id);
            // If player exists in current game with explicit goalie status, preserve it
            if (hasPerGameGoalie) {
              return { ...masterPlayer, isGoalie: perGameGoalieMap.get(masterPlayer.id) };
            }
            // New player from master roster - use master's isGoalie
            return masterPlayer;
          });
        });
      }
    }
  }, [
    masterRosterQueryResultData,
    isMasterRosterQueryLoading,
    isMasterRosterQueryError,
    masterRosterQueryErrorData,
    setAvailablePlayers,
    currentGameId,
  ]);

  /**
   * Sync seasons from React Query to local state
   * @deprecated This effect only runs if setSeasons is provided for backward compatibility
   */
  useEffect(() => {
    if (!setSeasons) return; // Skip if no setter provided (using hook's seasons directly)

    if (areSeasonsQueryLoading) {
      logger.log('[TanStack Query] Seasons are loading...');
      return;
    }

    if (isSeasonsQueryError) {
      logger.error('[TanStack Query] Error loading seasons:', seasonsQueryErrorData);
      setSeasons([]);
      return;
    }

    if (seasonsQueryResultData && Array.isArray(seasonsQueryResultData)) {
      setSeasons(seasonsQueryResultData);
    }
  }, [
    seasonsQueryResultData,
    areSeasonsQueryLoading,
    isSeasonsQueryError,
    seasonsQueryErrorData,
    setSeasons,
  ]);

  /**
   * Sync tournaments from React Query to local state
   * @deprecated This effect only runs if setTournaments is provided for backward compatibility
   */
  useEffect(() => {
    if (!setTournaments) return; // Skip if no setter provided (using hook's tournaments directly)

    if (areTournamentsQueryLoading) {
      logger.log('[TanStack Query] Tournaments are loading...');
      return;
    }

    if (isTournamentsQueryError) {
      logger.error('[TanStack Query] Error loading tournaments:', tournamentsQueryErrorData);
      setTournaments([]);
      return;
    }

    if (tournamentsQueryResultData && Array.isArray(tournamentsQueryResultData)) {
      setTournaments(tournamentsQueryResultData);
    }
  }, [
    tournamentsQueryResultData,
    areTournamentsQueryLoading,
    isTournamentsQueryError,
    tournamentsQueryErrorData,
    setTournaments,
  ]);

  // --- Return consolidated data and operations ---

  return {
    // Data from queries
    masterRoster: masterRosterQueryResultData || [],
    seasons: seasonsQueryResultData || [],
    tournaments: tournamentsQueryResultData || [],
    savedGames: allSavedGamesQueryResultData,
    teams,
    personnel: personnelManager.personnel,
    personnelManager,
    currentGameIdSetting: currentGameIdSettingQueryResultData,

    // Loading and error states
    isLoading: isGameDataLoading || personnelManager.isLoading,
    error: gameDataError,

    // Mutation result objects for components requiring UseMutationResult
    mutationResults: {
      addSeason: addSeasonMutation,
      updateSeason: updateSeasonMutation,
      deleteSeason: deleteSeasonMutation,
      addTournament: addTournamentMutation,
      updateTournament: updateTournamentMutation,
      deleteTournament: deleteTournamentMutation,
    },
  };
}
