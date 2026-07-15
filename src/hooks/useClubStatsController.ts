/**
 * Club-stats controller for the page-level ClubModalsHost (two-level
 * restructure, L.4).
 *
 * GameStatsModal's AGGREGATE side (season/tournament/overall/player tabs)
 * renders in the host in `aggregateOnly` mode, so team stats work WITHOUT
 * the match view mounted - the modal fetches seasons/tournaments/adjustments
 * itself, and this controller supplies the shared-cache data plus the Excel
 * export handlers (same helpers the match-side render uses). The
 * current-game tab STAYS with the match modal.
 */
import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import { useToast } from '@/contexts/ToastProvider';
import { getSavedGames } from '@/utils/savedGames';
import { getMasterRoster } from '@/utils/masterRosterManager';
import { getSeasons } from '@/utils/seasons';
import { getTournaments } from '@/utils/tournaments';
import {
  exportAggregateStatsExcel,
  exportPlayerStatsExcel,
  type AggregateExcelDeps,
} from '@/utils/exportGames';
import type { SavedGamesCollection, PlayerStatRow } from '@/types';

export function useClubStatsController() {
  const { t } = useTranslation();
  const { userId } = useDataStore();
  const { showToast } = useToast();

  // Shared query keys - same cache as the game side.
  const savedGamesQuery = useQuery<SavedGamesCollection | null, Error>({
    queryKey: [...queryKeys.savedGames, userId],
    queryFn: () => getSavedGames(userId),
  });
  const masterRosterQuery = useQuery({
    queryKey: [...queryKeys.masterRoster, userId],
    queryFn: () => getMasterRoster(userId),
  });
  const seasonsQuery = useQuery({
    queryKey: [...queryKeys.seasons, userId],
    queryFn: () => getSeasons(userId),
  });
  const tournamentsQuery = useQuery({
    queryKey: [...queryKeys.tournaments, userId],
    queryFn: () => getTournaments(userId),
  });

  const savedGamesData = savedGamesQuery.data;
  const savedGames = useMemo(() => savedGamesData ?? {}, [savedGamesData]);
  const masterRosterData = masterRosterQuery.data;
  const masterRoster = useMemo(() => masterRosterData ?? [], [masterRosterData]);

  const excelDeps = useMemo<AggregateExcelDeps>(() => ({
    savedGames,
    seasons: seasonsQuery.data ?? [],
    tournaments: tournamentsQuery.data ?? [],
    showToast,
    t,
    userId,
  }), [savedGames, seasonsQuery.data, tournamentsQuery.data, showToast, t, userId]);

  const handleExportAggregateExcel = useCallback(
    (gameIds: string[], aggregateStats: PlayerStatRow[]) =>
      exportAggregateStatsExcel(excelDeps, gameIds, aggregateStats),
    [excelDeps],
  );

  const handleExportPlayerExcel = useCallback(
    (playerId: string, playerData: PlayerStatRow, gameIds: string[]) =>
      exportPlayerStatsExcel(excelDeps, playerId, playerData, gameIds),
    [excelDeps],
  );

  return {
    savedGames,
    masterRoster,
    handleExportAggregateExcel,
    handleExportPlayerExcel,
  };
}

export default useClubStatsController;
