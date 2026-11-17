/**
 * Seasons, tournaments and teams with archived ones included (review 7.L3).
 *
 * The pickers offer only active entities - right for choosing a new one. But a
 * game linked to a season, tournament or team that was archived later rendered its
 * select empty (the value had no option), as if it were linked to nothing. These
 * lists let a picker show the current value as "Name (Archived)". Same query keys
 * as the managers' archive-inclusive lists (7.20), so the data is shared.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import { getSeasons } from '@/utils/seasons';
import { getTournaments } from '@/utils/tournaments';
import { getTeams } from '@/utils/teams';
import type { Season, Team, Tournament } from '@/types';

const NONE_SEASONS: Season[] = [];
const NONE_TOURNAMENTS: Tournament[] = [];
const NONE_TEAMS: Team[] = [];

export function useArchiveInclusiveLists(enabled: boolean): {
  allSeasons: Season[];
  allTournaments: Tournament[];
  allTeams: Team[];
} {
  const { userId } = useDataStore();
  const seasons = useQuery({
    queryKey: [...queryKeys.seasons, userId, 'withArchived'],
    queryFn: () => getSeasons(userId, true),
    enabled,
  });
  const tournaments = useQuery({
    queryKey: [...queryKeys.tournaments, userId, 'withArchived'],
    queryFn: () => getTournaments(userId, true),
    enabled,
  });
  const teams = useQuery({
    queryKey: [...queryKeys.teams, userId, 'withArchived'],
    queryFn: () => getTeams(userId, true),
    enabled,
  });
  return {
    allSeasons: seasons.data ?? NONE_SEASONS,
    allTournaments: tournaments.data ?? NONE_TOURNAMENTS,
    allTeams: teams.data ?? NONE_TEAMS,
  };
}

/** The current value's entity when the active options do not contain it (archived). */
export function archivedCurrent<T extends { id: string; archived?: boolean }>(
  currentId: string | null | undefined,
  activeOptions: readonly { id: string }[],
  all: readonly T[],
): T | undefined {
  if (!currentId || activeOptions.some((o) => o.id === currentId)) return undefined;
  return all.find((e) => e.id === currentId);
}
