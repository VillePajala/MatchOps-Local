'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import { getSeasons } from '@/utils/seasons';
import { getSavedGames } from '@/utils/savedGames';
import { addOpponentToList } from '@/utils/opponentNames';
import type { Season, SavedGamesCollection } from '@/types';

/**
 * Every opponent name this coach has used anywhere.
 *
 * DERIVED, NEVER STORED. There is no global opponent list in the app and there
 * should not be: the authoritative list belongs to each competition, and a
 * global one with an edit button is the first step back toward treating
 * opponents as entities, which is exactly what was rejected (see
 * `utils/opponentNames.ts`).
 *
 * Its only job is spelling. Offering the spelling already in use when a coach
 * types "Ips" is what keeps one name identical across seasons, which is the
 * whole point of listing opponents at all.
 *
 * Both queries are already cached under the same keys by the rest of the app,
 * so this is normally a cache read rather than a fetch.
 *
 * @module useOpponentSuggestions
 * @category Hooks
 */
export function useOpponentSuggestions(): string[] {
  const { userId } = useDataStore();

  const { data: seasons } = useQuery<Season[]>({
    queryKey: [...queryKeys.seasons, userId],
    queryFn: () => getSeasons(userId),
  });

  const { data: savedGames } = useQuery<SavedGamesCollection>({
    queryKey: [...queryKeys.savedGames, userId],
    queryFn: () => getSavedGames(userId),
  });

  return useMemo(() => {
    // Competition lists first: those names were curated deliberately, so when
    // two spellings exist the curated one is the better thing to offer.
    const fromCompetitions = (seasons ?? []).flatMap((s) => s.opponents ?? []);
    const fromGames = Object.values(savedGames ?? {}).map((g) => g?.opponentName ?? '');

    return [...fromCompetitions, ...fromGames].reduce<string[]>(
      (kept, name) => addOpponentToList(kept, name),
      [],
    );
  }, [seasons, savedGames]);
}

export default useOpponentSuggestions;
