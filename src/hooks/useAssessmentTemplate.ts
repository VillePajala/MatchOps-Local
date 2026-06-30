import { useQuery } from '@tanstack/react-query';
import { useDataStore } from '@/hooks/useDataStore';
import { getAppSettings } from '@/utils/appSettings';
import { queryKeys } from '@/config/queryKeys';
import type { AssessmentTemplate } from '@/types/settings';

/**
 * The coach's chosen assessment metric template (default 'balanced'). Reads the
 * shared settings query (deduped with other settings hooks), so it updates live
 * when the setting changes. Downstream display components take it as a prop.
 */
export function useAssessmentTemplate(): AssessmentTemplate {
  const { userId } = useDataStore();
  const { data } = useQuery({
    queryKey: [...queryKeys.settings.detail(), userId],
    queryFn: () => getAppSettings(userId),
  });
  return data?.assessmentTemplate ?? 'balanced';
}
