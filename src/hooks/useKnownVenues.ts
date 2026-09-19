/**
 * The venue book a venue field completes from: everything the coach has ever
 * used (stored in settings, kept when matches are deleted) merged with the
 * matches on hand, which may be newer than the last learn pass.
 *
 * Read-only. Learning - writing what the matches teach back into settings -
 * happens in one place, page.tsx's refreshSetupSignals, so two components
 * never race to write the same list.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDataStore } from '@/hooks/useDataStore';
import { getAppSettings } from '@/utils/appSettings';
import { queryKeys } from '@/config/queryKeys';
import { learnVenues, type KnownVenue } from '@/utils/venueBook';
import type { SavedGamesCollection } from '@/types/game';

export function useKnownVenues(savedGames: SavedGamesCollection | undefined | null): KnownVenue[] {
  const { userId } = useDataStore();
  const { data } = useQuery({
    queryKey: [...queryKeys.settings.detail(), userId],
    queryFn: () => getAppSettings(userId),
  });
  const stored = data?.knownVenues;
  return useMemo(
    () => learnVenues(stored, Object.values(savedGames ?? {})).book,
    [stored, savedGames],
  );
}
