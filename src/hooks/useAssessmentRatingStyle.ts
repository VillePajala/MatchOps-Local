import { useQuery } from '@tanstack/react-query';
import { useDataStore } from '@/hooks/useDataStore';
import { getAppSettings } from '@/utils/appSettings';
import { queryKeys } from '@/config/queryKeys';
import type { AssessmentRatingStyle } from '@/types/settings';

/**
 * The coach's chosen assessment rating presentation style (default 'words').
 * Reads the same settings query other components use, so it updates live when
 * the setting changes. Must be called inside the app's providers (QueryClient +
 * DataStore) - downstream display components take the style as a prop instead.
 */
export function useAssessmentRatingStyle(): AssessmentRatingStyle {
  const { userId } = useDataStore();
  const { data } = useQuery({
    queryKey: [...queryKeys.settings.detail(), userId],
    queryFn: () => getAppSettings(userId),
  });
  return data?.assessmentRatingStyle ?? 'words';
}
