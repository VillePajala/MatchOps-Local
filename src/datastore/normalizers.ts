/**
 * Data Normalizers
 *
 * Pure functions for normalizing data before persistence.
 * Used by DataStore implementations to ensure consistent data shapes.
 *
 * These functions have NO dependencies on DataStore to avoid circular imports.
 */

import type { WarmupPlan } from '@/types/warmupPlan';

/**
 * Normalizes a warmup plan for persistence.
 * - Sets lastModified to current timestamp (legacy field)
 * - Sets updatedAt for conflict resolution (preserves cloud timestamp if present)
 * - Sets isDefault to false (user-modified plans are never default)
 *
 * Used by LocalDataStore and SyncedDataStore to ensure consistent normalization.
 */
export const normalizeWarmupPlanForSave = (plan: WarmupPlan): WarmupPlan => {
  const now = new Date().toISOString();
  return {
    ...plan,
    lastModified: now,
    // Preserve cloud timestamp if present (cloud-wins scenario), otherwise use now
    updatedAt: plan.updatedAt ?? now,
    isDefault: false,
  };
};
