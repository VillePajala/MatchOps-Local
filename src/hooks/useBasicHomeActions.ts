'use client';

/**
 * Basic Home's own writes (Onboarding v3 review R2, R12): move a game that
 * never kicked off to another day, remove it, and create the first players.
 * Every write goes through the existing utils - no new data paths - and ends
 * with `onChanged` so page.tsx re-reads what Home shows.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/config/queryKeys';
import { DEFAULT_GAME_ID } from '@/config/constants';
import { useDataStore } from '@/hooks/useDataStore';
import { useToast } from '@/contexts/ToastProvider';
import { deleteGameWithCleanup } from '@/services/deleteGame';
import { getGame, getLatestGameId, getSavedGames, saveGame } from '@/utils/savedGames';
import { getCurrentGameIdSetting, saveCurrentGameIdSetting } from '@/utils/appSettings';
import { getPlanLink } from '@/utils/playtimePlanner/planLinks';
import { deletePlan, getPlan } from '@/utils/playtimePlanner/storage';
import { addPlayer } from '@/utils/masterRosterManager';
import { getTeamRoster, getTeams, setTeamRoster } from '@/utils/teams';
import { defaultNickname } from '@/utils/splitPastedNames';
import type { Player, TeamPlayer } from '@/types';
import logger from '@/utils/logger';

export interface BasicHomeActions {
  /** Resolves false when the game could not be moved (a toast said so). */
  moveGameDate: (gameId: string, gameDate: string) => Promise<boolean>;
  /** Resolves false when the game could not be removed (a toast said so). */
  deleteGame: (gameId: string) => Promise<boolean>;
  /** Creates the players in order; resolves how many were created. */
  addPlayers: (names: string[]) => Promise<number>;
}

const toTeamPlayer = (p: Player): TeamPlayer => ({
  id: p.id,
  name: p.name,
  nickname: p.nickname,
  jerseyNumber: p.jerseyNumber,
  isGoalie: p.isGoalie,
  receivedFairPlayCard: p.receivedFairPlayCard,
});

export function useBasicHomeActions(onChanged?: () => void): BasicHomeActions {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { userId } = useDataStore();

  const refreshGames = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [...queryKeys.savedGames, userId] });
    onChanged?.();
  }, [queryClient, userId, onChanged]);

  const moveGameDate = useCallback(
    async (gameId: string, gameDate: string): Promise<boolean> => {
      try {
        const game = await getGame(gameId, userId);
        if (!game) throw new Error('game not found');
        // Not played yet, on whatever day it now is: the match itself flips it
        // to played the first time its clock starts.
        await saveGame(gameId, { ...game, gameDate, isPlayed: false }, userId);
        await refreshGames();
        return true;
      } catch (error) {
        logger.error('[useBasicHomeActions] move date failed:', error);
        showToast(t('basicHome.moveDateError', 'Could not change the date. Please try again.'), 'error');
        return false;
      }
    },
    [userId, refreshGames, showToast, t],
  );

  const deleteGame = useCallback(
    async (gameId: string): Promise<boolean> => {
      try {
        // Read before the game goes: its plan link is removed with it.
        const link = await getPlanLink(gameId).catch(() => null);
        const deleted = await deleteGameWithCleanup(gameId, userId);
        if (!deleted) throw new Error('game not found');
        // The one-game plan made for this game has nothing else to plan for.
        if (link) {
          try {
            const plan = await getPlan(link.planId);
            if (plan && plan.games.length === 1) await deletePlan(plan.id);
          } catch (planError) {
            logger.warn('[useBasicHomeActions] plan cleanup after delete failed (non-fatal):', planError);
          }
        }
        // The persisted current game must not point at a game that is gone.
        if ((await getCurrentGameIdSetting(userId)) === gameId) {
          const remaining = await getSavedGames(userId);
          await saveCurrentGameIdSetting(getLatestGameId(remaining) || DEFAULT_GAME_ID, userId);
          await queryClient.invalidateQueries({ queryKey: [...queryKeys.appSettingsCurrentGameId, userId] });
        }
        await refreshGames();
        return true;
      } catch (error) {
        logger.error('[useBasicHomeActions] delete failed:', error);
        showToast(t('loadGameModal.errors.deleteFailedCatch', 'Failed to delete game. Please try again.'), 'error');
        return false;
      }
    },
    [userId, queryClient, refreshGames, showToast, t],
  );

  const addPlayers = useCallback(
    async (names: string[]): Promise<number> => {
      const created: Player[] = [];
      for (const name of names) {
        const player = await addPlayer({ name, nickname: defaultNickname(name), jerseyNumber: '', notes: '' }, userId);
        if (!player) break;
        created.push(player);
      }
      if (created.length > 0) {
        // The team's own roster too, when there is exactly one team: it is
        // what the full New Game form selects from.
        try {
          const teams = await getTeams(userId);
          if (teams.length === 1) {
            const roster = await getTeamRoster(teams[0].id, userId);
            await setTeamRoster(teams[0].id, [...roster, ...created.map(toTeamPlayer)], userId);
            await queryClient.invalidateQueries({ queryKey: [...queryKeys.teamRoster(teams[0].id), userId] });
          }
        } catch (error) {
          logger.warn('[useBasicHomeActions] team roster update failed (non-fatal):', error);
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: [...queryKeys.masterRoster, userId] }),
          queryClient.invalidateQueries({ queryKey: [...queryKeys.teams, userId] }),
        ]);
        onChanged?.();
      }
      if (created.length < names.length) {
        showToast(t('setupWizard.error', 'Saving failed - please try again.'), 'error');
      }
      return created.length;
    },
    [userId, queryClient, onChanged, showToast, t],
  );

  return { moveGameDate, deleteGame, addPlayers };
}
