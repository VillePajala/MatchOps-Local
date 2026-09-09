import { useQuery } from '@tanstack/react-query';
import { useDataStore } from '@/hooks/useDataStore';
import { getAppSettings } from '@/utils/appSettings';
import { queryKeys } from '@/config/queryKeys';

/**
 * Whether the player-assessment feature is shown (default false).
 * Same settings query as the other assessment hooks, so flipping the setting
 * updates every surface live. Must be called inside the app's providers.
 */
export function useAssessmentsEnabled(): boolean {
  const { userId } = useDataStore();
  const { data } = useQuery({
    queryKey: [...queryKeys.settings.detail(), userId],
    queryFn: () => getAppSettings(userId),
  });
  return data?.assessmentsEnabled ?? false;
}
