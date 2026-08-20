'use client';

import { useEffect, type FC } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import { getMasterRoster } from '@/utils/masterRosterManager';
import { useAuth } from '@/contexts/AuthProvider';
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
  const { user } = useAuth();
  const userId = user?.id;
  const isActive = tour?.isActive ?? false;

  const { data: roster } = useQuery({
    queryKey: [...queryKeys.masterRoster, userId],
    queryFn: () => getMasterRoster(userId),
    enabled: isActive,
  });

  const playersCount = roster?.length ?? 0;
  const reportSignals = tour?.reportSignals;

  useEffect(() => {
    if (!isActive) return;
    reportSignals?.({ playersCount });
  }, [isActive, playersCount, reportSignals]);

  return null;
};

export default GuidedTourRosterReporter;
