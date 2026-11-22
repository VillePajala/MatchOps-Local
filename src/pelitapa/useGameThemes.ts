import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDataStore } from '@/hooks/useDataStore';
import { queryKeys } from '@/config/queryKeys';
import logger from '@/utils/logger';
import { normalizeGameThemes, type GameTheme } from './gameThemeTypes';

const NONE: GameTheme[] = [];

export interface GameThemesState {
  themes: GameTheme[];
  isLoading: boolean;
  /** Replace the game's themes. Resolves false when the local save failed. */
  save: (themes: GameTheme[]) => Promise<boolean>;
}

/**
 * The Pelitapa themes of one saved game, through the DataStore (local-first:
 * IndexedDB now, the cloud push queued in cloud mode). No game id = nothing.
 */
export function useGameThemes(gameId: string | null | undefined): GameThemesState {
  const { userId, getStore } = useDataStore();
  const queryClient = useQueryClient();
  const key = useMemo(() => [...queryKeys.gameThemes, userId ?? 'local', gameId ?? ''] as const, [userId, gameId]);

  const query = useQuery({
    queryKey: key,
    enabled: !!gameId,
    queryFn: async () => (await getStore()).getGameThemes(gameId as string),
  });

  const save = useCallback(
    async (themes: GameTheme[]): Promise<boolean> => {
      if (!gameId) return false;
      const clean = normalizeGameThemes(themes);
      const previous = queryClient.getQueryData<GameTheme[]>(key);
      queryClient.setQueryData(key, clean);
      try {
        const ok = await (await getStore()).setGameThemes(gameId, clean);
        if (!ok) queryClient.setQueryData(key, previous ?? NONE);
        return ok;
      } catch (error) {
        logger.warn('[Pelitapa] Could not save the game themes', error);
        queryClient.setQueryData(key, previous ?? NONE);
        return false;
      }
    },
    [gameId, getStore, queryClient, key],
  );

  return { themes: query.data ?? NONE, isLoading: query.isLoading, save };
}
