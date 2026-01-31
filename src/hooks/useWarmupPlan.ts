import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '@/config/queryKeys';
import {
  getWarmupPlan,
  saveWarmupPlan,
  deleteWarmupPlan,
  createDefaultWarmupPlan,
} from '@/utils/warmupPlan';
import type { WarmupPlan } from '@/types/warmupPlan';
import logger from '@/utils/logger';
import { useToast } from '@/contexts/ToastProvider';
import { useDataStore } from '@/hooks/useDataStore';

export interface UseWarmupPlanResult {
  /** The current warmup plan (from storage or default) */
  plan: WarmupPlan | undefined;
  /** Whether the plan is loading */
  isLoading: boolean;
  /** Any error that occurred */
  error: Error | null;
  /** Save the plan to storage */
  savePlan: (plan: WarmupPlan) => Promise<boolean>;
  /** Reset to default plan (deletes custom plan) */
  resetToDefault: () => Promise<boolean>;
  /** Whether a save operation is in progress */
  isSaving: boolean;
  /** Whether a reset operation is in progress */
  isResetting: boolean;
}

/**
 * Hook for managing the user's warm-up plan.
 * Returns the current plan (either custom or default) and mutation functions.
 */
export function useWarmupPlan(): UseWarmupPlanResult {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { userId } = useDataStore();

  // Query: Get the warmup plan (or generate default if none exists)
  const query = useQuery<WarmupPlan, Error>({
    queryKey: [...queryKeys.warmupPlan, userId],
    queryFn: async () => {
      const storedPlan = await getWarmupPlan(userId);
      if (storedPlan) {
        return storedPlan;
      }
      // No stored plan - return default (don't save yet, lazy save on first edit)
      return createDefaultWarmupPlan(t);
    },
  });

  // Mutation: Save plan
  const saveMutation = useMutation({
    mutationFn: (plan: WarmupPlan) => saveWarmupPlan(plan, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.warmupPlan, userId] });
    },
    onError: (error) => {
      logger.error('[useWarmupPlan] Failed to save warmup plan:', error);
      showToast(t('warmupPlanModal.saveError', 'Failed to save warmup plan'), 'error');
    },
  });

  // Mutation: Reset to default
  const resetMutation = useMutation({
    mutationFn: async () => {
      const success = await deleteWarmupPlan(userId);
      return success;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.warmupPlan, userId] });
    },
    onError: (error) => {
      logger.error('[useWarmupPlan] Failed to reset warmup plan:', error);
      showToast(t('warmupPlanModal.resetError', 'Failed to reset warmup plan'), 'error');
    },
  });

  return {
    plan: query.data,
    isLoading: query.isLoading,
    error: query.error,
    savePlan: saveMutation.mutateAsync,
    resetToDefault: resetMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    isResetting: resetMutation.isPending,
  };
}
