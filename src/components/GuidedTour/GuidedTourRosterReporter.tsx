'use client';

import { useEffect, type FC } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import { getMasterRoster } from '@/utils/masterRosterManager';
import { getTeams } from '@/utils/teams';
import { useDataStore } from '@/hooks/useDataStore';
import { useGuidedTourOptional } from '@/contexts/GuidedTourProvider';

/**
 * Headless reporter that feeds the LIVE master-roster size into the tour, so
 * the add-players step can show real progress ("3 / 8 players added") and
 * auto-advance at the goal while the roster list is still open. It subscribes
 * to the same React Query key the roster mutations write/invalidate
 * (['masterRoster', userId]), so every add/remove updates it immediately -
 * unlike the page-level setup signals, which refresh only on modal close.
 * Only active while a tour is running; renders nothing.
 */
const GuidedTourRosterReporter: FC = () => {
  const tour = useGuidedTourOptional();
  // useDataStore's userId (NOT raw auth user id): it is undefined when cloud is
  // unavailable, exactly matching the key useRoster's mutations write and
  // invalidate - a raw user id would subscribe to a key nothing updates.
  const { userId } = useDataStore();
  const isActive = tour?.isActive ?? false;

  const { data: roster } = useQuery({
    queryKey: [...queryKeys.masterRoster, userId],
    queryFn: () => getMasterRoster(userId),
    enabled: isActive,
  });

  // Same pattern for teams (mutations invalidate ['teams', userId] in
  // useTeamQueries), so the create-team step advances the moment the team
  // exists - not only when the club modals eventually close.
  const { data: teams } = useQuery({
    queryKey: [...queryKeys.teams, userId],
    queryFn: () => getTeams(userId),
    enabled: isActive,
  });

  const playersCount = roster?.length ?? 0;
  const teamsCount = teams?.length ?? 0;
  const reportSignals = tour?.reportSignals;

  useEffect(() => {
    if (!isActive) return;
    reportSignals?.({ playersCount, teamsCount });
  }, [isActive, playersCount, teamsCount, reportSignals]);

  return null;
};

export default GuidedTourRosterReporter;
