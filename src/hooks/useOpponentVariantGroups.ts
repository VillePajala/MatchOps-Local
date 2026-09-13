'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import { getSeasons } from '@/utils/seasons';
import { getSavedGames } from '@/utils/savedGames';
import { groupOpponentVariants, type OpponentVariantGroup } from '@/utils/opponentNames';
import type { Season } from '@/types';
import type { SavedGamesCollection } from '@/types/game';

/**
 * Teams written more than one way across this coach's games and competition
 * lists.
 *
 * Shared by the sweep tool and by the badge that points at it, deliberately:
 * a badge computed separately from the list it advertises is a badge that
 * eventually lies. One source, two consumers.
 *
 * Both queries are already cached under these keys by the rest of the app, so
 * this is normally a cache read rather than a fetch.
 *
 * @module useOpponentVariantGroups
 * @category Hooks
 */
export function useOpponentVariantGroups(enabled = true): OpponentVariantGroup[] {
  const { userId } = useDataStore();

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

  return useMemo(() => {
    // Every OCCURRENCE, not a deduplicated list: the repetition is what ranks
    // the suggested spelling, so one used in nine games outranks one used once.
    const fromGames = Object.values(savedGames ?? {}).map((g) => g?.opponentName ?? '');
    const fromSeasons = (seasons ?? []).flatMap((s) => s.opponents ?? []);
    return groupOpponentVariants([...fromGames, ...fromSeasons]);
  }, [savedGames, seasons]);
}

export default useOpponentVariantGroups;
