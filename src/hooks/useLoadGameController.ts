/**
 * Load-game controller for the page-level ClubModalsHost (two-level
 * restructure, L.3a - the first level crossing).
 *
 * LoadGameModal renders in the host, so browsing/deleting/exporting saved
 * games works WITHOUT the match view mounted. Picking a game is the level
 * crossing: persist it as the current game, then hand over to the page's
 * `enterMatch` contract - a FRESH match mount whose existing, guardrail-
 * tested boot path loads the persisted id. No in-memory game switching, no
 * mount-the-game-first facade.
 *
 * Handler bodies mirror useGamePersistence's match-side versions minus the
 * live-session plumbing (the fresh mount replaces it).
 */
import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import { useToast } from '@/contexts/ToastProvider';
import {
  getSavedGames,
  deleteGame as utilDeleteGame,
  getLatestGameId,
} from '@/utils/savedGames';
import {
  getCurrentGameIdSetting,
  saveCurrentGameIdSetting as utilSaveCurrentGameIdSetting,
} from '@/utils/appSettings';
import { clearTimerState } from '@/utils/timerStateManager';
import { clearTimerAnchor } from '@/utils/timerAnchor';
import { deleteGameSubs } from '@/utils/playtimePlanner/gameSubs';
import { deletePlanLink } from '@/utils/playtimePlanner/planLinks';
import { getMasterRoster } from '@/utils/masterRosterManager';
import { getSeasons } from '@/utils/seasons';
import { getTournaments } from '@/utils/tournaments';
import { exportJson } from '@/utils/exportGames';
import { DEFAULT_GAME_ID } from '@/config/constants';
import type { SavedGamesCollection } from '@/types';
import logger from '@/utils/logger';

export interface UseLoadGameControllerArgs {
  /** The page's level-crossing: freshly mount the match view (which boots
   *  the persisted current game). Called AFTER the picked id is persisted. */
  onEnterMatch: () => void;
  /** Called when the PERSISTED current game was deleted - the page remounts
   *  a mounted match so it can't keep autosaving a deleted game. */
  onActiveGameDeleted?: () => void;
}

export function useLoadGameController({ onEnterMatch, onActiveGameDeleted }: UseLoadGameControllerArgs) {
  const { t } = useTranslation();
  const { userId } = useDataStore();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Shared query keys - same cache as the game side.
  const savedGamesQuery = useQuery<SavedGamesCollection | null, Error>({
    queryKey: [...queryKeys.savedGames, userId],
    queryFn: () => getSavedGames(userId),
  });
  const currentGameIdQuery = useQuery<string | null, Error>({
    queryKey: [...queryKeys.appSettingsCurrentGameId, userId],
    queryFn: () => getCurrentGameIdSetting(userId),
  });
  const seasonsQuery = useQuery({
    queryKey: [...queryKeys.seasons, userId],
    queryFn: () => getSeasons(userId),
  });
  const tournamentsQuery = useQuery({
    queryKey: [...queryKeys.tournaments, userId],
    queryFn: () => getTournaments(userId),
  });
  const masterRosterQuery = useQuery({
    queryKey: [...queryKeys.masterRoster, userId],
    queryFn: () => getMasterRoster(userId),
  });

  const savedGamesData = savedGamesQuery.data;
  const savedGames = useMemo(() => savedGamesData ?? {}, [savedGamesData]);
  const [isGameLoading, setIsGameLoading] = useState(false);
  const [isGameDeleting, setIsGameDeleting] = useState(false);
  const [gameDeleteError, setGameDeleteError] = useState<string | null>(null);
  const [processingGameId, setProcessingGameId] = useState<string | null>(null);

  // The level crossing: persist the pick, then enter the match fresh.
  const handleLoadGame = useCallback(
    async (gameId: string) => {
      setProcessingGameId(gameId);
      setIsGameLoading(true);
      try {
        // Same pre-switch hygiene as the match-side loader: stale timer state
        // or a wall-clock anchor from the previous game must not replay onto
        // the newly opened one.
        await clearTimerState(userId);
        clearTimerAnchor();
        await utilSaveCurrentGameIdSetting(gameId, userId);
        await queryClient.invalidateQueries({
          queryKey: [...queryKeys.appSettingsCurrentGameId, userId],
        });
        onEnterMatch();
      } catch (error) {
        logger.error('[useLoadGameController] Failed to open game:', error);
        showToast(t('loadGameModal.errors.loadFailed', 'Error loading game state. Please try again.'), 'error');
      } finally {
        setIsGameLoading(false);
        setProcessingGameId(null);
      }
    },
    [userId, queryClient, onEnterMatch, showToast, t],
  );

  const handleDeleteGame = useCallback(
    async (gameId: string) => {
      if (gameId === DEFAULT_GAME_ID) {
        setGameDeleteError(t('loadGameModal.errors.cannotDeleteDefault', 'Cannot delete the current unsaved game progress.'));
        return;
      }
      setGameDeleteError(null);
      setIsGameDeleting(true);
      setProcessingGameId(gameId);
      try {
        const deletedGameId = await utilDeleteGame(gameId, userId);
        if (deletedGameId) {
          // Planner bookkeeping: drop the game's planned-sub schedule and plan
          // link so they don't accumulate as orphans (best-effort).
          try {
            await Promise.all([deleteGameSubs(gameId), deletePlanLink(gameId)]);
          } catch (cleanupError) {
            logger.warn('[useLoadGameController] Planner cleanup after game delete failed (non-fatal):', cleanupError);
          }

          const updated: SavedGamesCollection = { ...savedGames };
          delete updated[gameId];
          queryClient.setQueryData<SavedGamesCollection>([...queryKeys.savedGames, userId], updated);

          // Deleting the PERSISTED current game: fall back to the latest
          // remaining game (or the default workspace) and let the page
          // remount any live match so it can't keep autosaving a ghost.
          if (currentGameIdQuery.data === gameId) {
            const nextGameId = getLatestGameId(updated);
            await utilSaveCurrentGameIdSetting(nextGameId || DEFAULT_GAME_ID, userId);
            await queryClient.invalidateQueries({
              queryKey: [...queryKeys.appSettingsCurrentGameId, userId],
            });
            onActiveGameDeleted?.();
          }
        } else {
          setGameDeleteError(t('loadGameModal.errors.deleteFailedNotFound', 'Error deleting game: {gameId}. Game not found or ID was invalid.', { gameId }));
        }
      } catch (error) {
        logger.error('[useLoadGameController] Game delete failed:', error);
        setGameDeleteError(t('loadGameModal.errors.deleteFailedCatch', 'Failed to delete game. Please try again.'));
      } finally {
        setIsGameDeleting(false);
        setProcessingGameId(null);
      }
    },
    [savedGames, currentGameIdQuery.data, userId, queryClient, onActiveGameDeleted, t],
  );

  const handleExportOneJson = useCallback(
    (gameId: string) => {
      const gameData = savedGames[gameId];
      if (!gameData) {
        showToast(t('page.gameDataNotFound', { gameId, defaultValue: `Error: Could not find game data for ${gameId}` }), 'error');
        return;
      }
      exportJson(gameId, gameData, seasonsQuery.data ?? [], tournamentsQuery.data ?? []);
    },
    [savedGames, seasonsQuery.data, tournamentsQuery.data, showToast, t],
  );

  const handleExportOneExcel = useCallback(
    async (gameId: string) => {
      const gameData = savedGames[gameId];
      if (!gameData) {
        showToast(t('page.gameDataNotFound', { gameId, defaultValue: `Error: Could not find game data for ${gameId}` }), 'error');
        return;
      }
      try {
        // Dynamic import: xlsx (~7.8MB) is only loaded when user actually exports
        const { exportCurrentGameExcel } = await import('@/utils/exportExcel');
        const translate = (key: string, defaultValue?: string) => t(key, defaultValue ?? key);
        exportCurrentGameExcel(
          gameId,
          gameData,
          masterRosterQuery.data ?? [],
          seasonsQuery.data ?? [],
          tournamentsQuery.data ?? [],
          translate,
        );
      } catch (error) {
        logger.error('[useLoadGameController] Export failed:', error);
        showToast(t('export.exportGameFailed'), 'error');
      }
    },
    [savedGames, masterRosterQuery.data, seasonsQuery.data, tournamentsQuery.data, showToast, t],
  );

  return {
    savedGames,
    currentGameId: currentGameIdQuery.data ?? undefined,
    isLoadingGamesList: savedGamesQuery.isLoading,
    loadGamesListError: savedGamesQuery.error ? savedGamesQuery.error.message : null,
    isGameLoading,
    isGameDeleting,
    gameDeleteError,
    processingGameId,
    handleLoadGame,
    handleDeleteGame,
    handleExportOneJson,
    handleExportOneExcel,
  };
}

export default useLoadGameController;
