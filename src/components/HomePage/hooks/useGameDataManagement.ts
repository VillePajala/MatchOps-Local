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
 * ```
 */

import { useEffect } from 'react';
import { useGameDataQueries } from '@/hooks/useGameDataQueries';
import { useTeamsQuery } from '@/hooks/useTeamQueries';
import { usePersonnelManager } from '@/hooks/usePersonnelManager';
import type { PersonnelManagerReturn } from '@/hooks/usePersonnelManager';
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

  // Season/tournament CRUD mutations LIFTED to useSeasonTournamentManagement
  // (L.1) - SeasonTournamentManagementModal was their only consumer.
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

  // --- Initialize React Query client and user-scoped storage ---

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
          const merged = masterRosterQueryResultData.map(masterPlayer => {
            const hasPerGameGoalie = perGameGoalieMap.has(masterPlayer.id);
            // If player exists in current game with explicit goalie status, preserve it
            if (hasPerGameGoalie) {
              return { ...masterPlayer, isGoalie: perGameGoalieMap.get(masterPlayer.id) };
            }
            // New player from master roster - use master's isGoalie
            return masterPlayer;
          });
          // Deep-review I3: PRESERVE per-game players who are no longer in
          // the club roster. The per-game availablePlayers is this game's
          // HISTORICAL record - mapping only over the master roster silently
          // deleted departed players from old games on load (breaking stats
          // name resolution and writing selectedPlayerIds ⊄ availablePlayers
          // back to storage). Live deletions still prune field/selection via
          // rosterRemovalDiff; the roster snapshot keeps the name.
          const masterIds = new Set(masterRosterQueryResultData.map(p => p.id));
          const departed = currentPlayers.filter((p: Player) => !masterIds.has(p.id));
          return departed.length > 0 ? [...merged, ...departed] : merged;
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

  };
}
