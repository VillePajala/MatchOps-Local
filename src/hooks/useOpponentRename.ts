'use client';

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import { getSeasons, updateSeason } from '@/utils/seasons';
import { getSavedGames, saveGame } from '@/utils/savedGames';
import { planOpponentRename, renameInOpponentList } from '@/utils/opponentRename';
import type { Season } from '@/types';
import type { SavedGamesCollection } from '@/types/game';

/**
 * Rename one opponent everywhere it appears.
 *
 * SHARED BY TWO ENTRY POINTS ON PURPOSE. The sweep tool in the competitions
 * manager is where a coach goes to tidy up; the new-game form is where they
 * NOTICE, because that is where the app rewrites what they typed onto the
 * spelling already in use. Both must do exactly the same thing to the data, so
 * the writes live here rather than being spelled out twice.
 *
 * WHY THE GAME FORM NEEDS THIS AT ALL. Adopting the existing spelling has a
 * trap in it: once the app rewrites every entry onto the first spelling, a
 * second spelling can never appear, "most used" can never shift, and the sweep
 * tool - which only lists names written two or more ways - never sees the name
 * again. A wrong-but-consistent name would be uncorrectable. Letting the coach
 * refuse the adoption and push THEIR spelling back over the history is the
 * escape hatch that makes adoption safe to do at all.
 *
 * Errors are not swallowed here: each caller shows its own message, so the
 * hook rethrows and lets them decide.
 *
 * Games are written before competition lists, the same order the sweep tool
 * uses: games are what the statistics read, so a half-finished rename must not
 * leave those split. A stale competition list is cosmetic by comparison.
 *
 * @module useOpponentRename
 * @category Hooks
 */
export interface OpponentRenameResult {
  /** How many games were rewritten. Zero is normal when only a list changed. */
  gamesChanged: number;
  /** How many competition lists were rewritten. */
  listsChanged: number;
}

export function useOpponentRename(enabled = true): {
  renameOpponent: (key: string, canonical: string) => Promise<OpponentRenameResult | null>;
  isRenaming: boolean;
} {
  const { userId } = useDataStore();
  const queryClient = useQueryClient();
  const [isRenaming, setIsRenaming] = useState(false);

  // Both are already cached under these keys by the rest of the app, so this is
  // normally a cache read rather than a fetch.
  const { data: seasons } = useQuery<Season[]>({
    queryKey: [...queryKeys.seasons, userId],
    queryFn: () => getSeasons(userId),
    enabled,
  });
  const { data: savedGames } = useQuery<SavedGamesCollection>({
    queryKey: [...queryKeys.savedGames, userId],
    queryFn: () => getSavedGames(userId),
    enabled,
  });

  /**
   * @param key       any spelling of the name to replace - matching is by
   *                  normalised form, so every variant of it is caught
   * @param canonical the spelling to keep
   * @returns what changed, or null when nothing needed to
   */
  const renameOpponent = useCallback(
    async (key: string, canonical: string): Promise<OpponentRenameResult | null> => {
      const plan = planOpponentRename(key, canonical, savedGames, seasons);
      if (plan.isNoop) return null;

      setIsRenaming(true);
      try {
        for (const gameId of plan.gameIds) {
          const game = savedGames?.[gameId];
          if (!game) continue;
          await saveGame(gameId, { ...game, opponentName: plan.canonical }, userId);
        }

        for (const seasonId of plan.seasonIds) {
          const season = (seasons ?? []).find((s) => s.id === seasonId);
          if (!season) continue;
          await updateSeason(
            {
              ...season,
              opponents: renameInOpponentList(season.opponents ?? [], key, plan.canonical),
            },
            userId,
          );
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.savedGames }),
          queryClient.invalidateQueries({ queryKey: queryKeys.seasons }),
        ]);
        return { gamesChanged: plan.gameIds.length, listsChanged: plan.seasonIds.length };
      } finally {
        setIsRenaming(false);
      }
    },
    [savedGames, seasons, userId, queryClient],
  );

  return { renameOpponent, isRenaming };
}

export default useOpponentRename;
