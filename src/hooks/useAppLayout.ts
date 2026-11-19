import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDataStore } from '@/hooks/useDataStore';
import { getAppSettings, updateAppSettings } from '@/utils/appSettings';
import { resolveAppLayout } from '@/utils/appLayout';
import { queryKeys } from '@/config/queryKeys';
import type { AppLayout } from '@/types/settings';

/**
 * The account's layout (Onboarding v3): 'basic' or 'full', or undefined while
 * the settings are still loading - callers render neither layout then, so a
 * basic account never flashes the full Home (or the other way round).
 *
 * Reads the shared settings query, so a change made in Settings or from
 * "Kaikki toiminnot" updates every surface at once.
 */
export function useAppLayout(): AppLayout | undefined {
  const { userId } = useDataStore();
  const { data } = useQuery({
    queryKey: [...queryKeys.settings.detail(), userId],
    queryFn: () => getAppSettings(userId),
  });
  return data ? resolveAppLayout(data) : undefined;
}

/**
 * Switch the layout. Only the coach's own tap calls this (Settings, or the
 * switch at the bottom of the basic Home). Returns false when the write failed.
 */
export function useSetAppLayout(): (layout: AppLayout) => Promise<boolean> {
  const { userId } = useDataStore();
  const queryClient = useQueryClient();
  return useCallback(
    async (layout: AppLayout) => {
      const saved = await updateAppSettings({ appLayout: layout }, userId);
      await queryClient.invalidateQueries({ queryKey: [...queryKeys.settings.detail(), userId] });
      return resolveAppLayout(saved) === layout;
    },
    [userId, queryClient],
  );
}
