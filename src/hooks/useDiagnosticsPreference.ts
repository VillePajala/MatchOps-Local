import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDataStore } from '@/hooks/useDataStore';
import { getAppSettings, updateAppSettings } from '@/utils/appSettings';
import { queryKeys } from '@/config/queryKeys';
import {
  applyDiagnosticsPreference,
  diagnosticsEnabledFromSettings,
} from '@/utils/diagnosticsPreference';

/**
 * Keeps the error-reporting switch Sentry reads in step with the signed-in
 * account's settings (Settings -> Data "Error reporting and usage
 * statistics"). Mounted once at the app root. Reads the shared settings
 * query, so a change saved anywhere - or synced from another device -
 * applies here too. Returns the account's value, or undefined while loading.
 */
export function useDiagnosticsPreferenceSync(): boolean | undefined {
  const { userId } = useDataStore();
  const { data } = useQuery({
    queryKey: [...queryKeys.settings.detail(), userId],
    queryFn: () => getAppSettings(userId),
  });
  const enabled = data ? diagnosticsEnabledFromSettings(data) : undefined;

  useEffect(() => {
    if (enabled !== undefined) applyDiagnosticsPreference(enabled);
  }, [enabled]);

  return enabled;
}

/**
 * Save the coach's choice to the account and apply it on this device at once
 * (Sentry stops from the next event on). Returns false when the save failed;
 * the device then keeps the previous value so screen and storage agree.
 */
export function useSetDiagnosticsEnabled(): (enabled: boolean) => Promise<boolean> {
  const { userId } = useDataStore();
  const queryClient = useQueryClient();
  return useCallback(
    async (enabled: boolean) => {
      try {
        const saved = await updateAppSettings({ diagnosticsEnabled: enabled }, userId);
        applyDiagnosticsPreference(diagnosticsEnabledFromSettings(saved));
        await queryClient.invalidateQueries({ queryKey: [...queryKeys.settings.detail(), userId] });
        return diagnosticsEnabledFromSettings(saved) === enabled;
      } catch {
        return false;
      }
    },
    [userId, queryClient],
  );
}
