import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { exportJson } from '@/utils/exportGames';
import { exportCurrentGameExcel, exportAggregateExcel, exportPlayerExcel } from '@/utils/exportExcel';
import { exportFullBackup } from '@/utils/fullBackup';
import { useToast } from '@/contexts/ToastProvider';
import logger from '@/utils/logger';
import type { SavedGamesCollection, Player, Season, Tournament, PlayerStatRow } from '@/types';

/**
 * Hook for managing game data exports (JSON, Excel, Full Backup)
 *
 * Extracted from useGameOrchestration to reduce complexity.
 * Handles all export operations including individual games, aggregate stats, and player stats.
 */

export interface UseGameExportProps {
  savedGames: SavedGamesCollection;
  availablePlayers: Player[];
  seasons: Season[];
  tournaments: Tournament[];
}

export interface UseGameExportReturn {
  handleExportOneJson: (gameId: string) => void;
  handleExportOneExcel: (gameId: string) => void;
  handleExportAggregateExcel: (gameIds: string[], aggregateStats: PlayerStatRow[]) => void;
  handleExportPlayerExcel: (playerId: string, playerData: PlayerStatRow, gameIds: string[]) => Promise<void>;
  handleCreateBackup: () => void;
}

export function useGameExport({
  savedGames,
  availablePlayers,
  seasons,
  tournaments,
}: UseGameExportProps): UseGameExportReturn {
  const { showToast } = useToast();
  const { t } = useTranslation();

  /**
   * Export a single game as JSON
   */
  const handleExportOneJson = useCallback((gameId: string) => {
    const gameData = savedGames[gameId];
    if (!gameData) {
      showToast(`Error: Could not find game data for ${gameId}`, 'error');
      return;
    }
    exportJson(gameId, gameData, seasons, tournaments);
  }, [savedGames, seasons, tournaments, showToast]);

  /**
   * Export a single game as Excel
   */
  const handleExportOneExcel = useCallback((gameId: string) => {
    const gameData = savedGames[gameId];
    if (!gameData) {
      showToast(`Error: Could not find game data for ${gameId}`, 'error');
      return;
    }
    try {
      exportCurrentGameExcel(gameId, gameData, availablePlayers, seasons, tournaments);
    } catch (error) {
      logger.error('[handleExportOneExcel] Export failed:', error);
      showToast(t('export.exportGameFailed'), 'error');
    }
  }, [savedGames, availablePlayers, seasons, tournaments, t, showToast]);

  /**
   * Export aggregate statistics for multiple games as Excel
   */
  const handleExportAggregateExcel = useCallback((gameIds: string[], aggregateStats: PlayerStatRow[]) => {
    if (gameIds.length === 0) {
      showToast(t('export.noGamesInSelection', 'No games match the current filter.'), 'error');
      return;
    }
    const gamesData = gameIds.reduce((acc, id) => {
      const gameData = savedGames[id];
      if (gameData) {
        acc[id] = gameData;
      }
      return acc;
    }, {} as SavedGamesCollection);
    try {
      exportAggregateExcel(gamesData, aggregateStats, seasons, tournaments, []);
    } catch (error) {
      logger.error('[handleExportAggregateExcel] Export failed:', error);
      showToast(t('export.exportStatsFailed'), 'error');
    }
  }, [savedGames, seasons, tournaments, t, showToast]);

  /**
   * Export individual player statistics as Excel
   */
  const handleExportPlayerExcel = useCallback(async (playerId: string, playerData: PlayerStatRow, gameIds: string[]) => {
    const gamesData = gameIds.reduce((acc, id) => {
      const gameData = savedGames[id];
      if (gameData) {
        acc[id] = gameData;
      }
      return acc;
    }, {} as SavedGamesCollection);
    try {
      const { getAdjustmentsForPlayer } = await import('@/utils/playerAdjustments');
      const adjustments = await getAdjustmentsForPlayer(playerId);
      exportPlayerExcel(playerId, playerData, gamesData, seasons, tournaments, adjustments);
    } catch (error) {
      logger.error('[handleExportPlayerExcel] Export failed:', error);
      showToast(t('export.exportPlayerFailed'), 'error');
    }
  }, [savedGames, seasons, tournaments, t, showToast]);

  /**
   * Create a full backup of all app data
   */
  const handleCreateBackup = useCallback(() => {
    exportFullBackup(showToast);
  }, [showToast]);

  return {
    handleExportOneJson,
    handleExportOneExcel,
    handleExportAggregateExcel,
    handleExportPlayerExcel,
    handleCreateBackup,
  };
}
