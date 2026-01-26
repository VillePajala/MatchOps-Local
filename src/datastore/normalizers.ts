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
 * - Sets lastModified to current timestamp
 * - Sets isDefault to false (user-modified plans are never default)
 *
 * Used by LocalDataStore and SyncedDataStore to ensure consistent normalization.
 */
export const normalizeWarmupPlanForSave = (plan: WarmupPlan): WarmupPlan => ({
  ...plan,
  lastModified: new Date().toISOString(),
  isDefault: false,
});
