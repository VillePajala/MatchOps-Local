import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDataStore } from '@/hooks/useDataStore';
import { getAppSettings, updateAppSettings } from '@/utils/appSettings';
import { resolveAppLayout } from '@/utils/appLayout';
import { queryKeys } from '@/config/queryKeys';
import { recordMilestone } from '@/utils/onboardingMilestones';
import type { AppLayout, OnboardingMilestones } from '@/types/settings';

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
 * The account's onboarding milestones from the same shared settings query, or
 * undefined while the settings are still loading ({} when none are recorded).
 */
export function useOnboardingMilestonesSetting(): OnboardingMilestones | undefined {
  const { userId } = useDataStore();
  const { data } = useQuery({
    queryKey: [...queryKeys.settings.detail(), userId],
    queryFn: () => getAppSettings(userId),
  });
  return data ? (data.onboardingMilestones ?? {}) : undefined;
}

/**
 * Switch the layout. Only the coach's own tap calls this (Settings, or the
 * basic Home's "Kaikki toiminnot", or the basic-layout notice). Returns false
 * when the write failed. A successful switch to 'full' records the
 * `switchedToFull` milestone once (measurement: follows the diagnostics switch),
 * so every entry point is counted.
 */
export function useSetAppLayout(): (layout: AppLayout) => Promise<boolean> {
  const { userId } = useDataStore();
  const queryClient = useQueryClient();
  return useCallback(
    async (layout: AppLayout) => {
      const saved = await updateAppSettings({ appLayout: layout }, userId);
      const ok = resolveAppLayout(saved) === layout;
      if (ok && layout === 'full') await recordMilestone('switchedToFull', userId);
      await queryClient.invalidateQueries({ queryKey: [...queryKeys.settings.detail(), userId] });
      return ok;
    },
    [userId, queryClient],
  );
}
