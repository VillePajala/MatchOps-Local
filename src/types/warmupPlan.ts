/**
 * Warm-up Plan Types
 *
 * Data structures for user-customizable warm-up plans.
 * Plans are stored in IndexedDB and can be edited by users.
 *
 * ## Timestamp Fields
 *
 * WarmupPlan has two timestamp fields for historical reasons:
 * - `lastModified`: Original field, still set for backwards compatibility
 * - `updatedAt`: Added for consistency with other entities (Player, Team, etc.)
 *   and cloud sync conflict resolution
 *
 * Both fields are set to the same value by `normalizeWarmupPlanForSave()`.
 * New code should use `updatedAt` for conflict resolution.
 */

/**
 * A section in the warm-up plan (a card with title and free-form content)
 */
export interface WarmupPlanSection {
  id: string;
  title: string;
  /** Free-form text content (can include bullet points as plain text) */
  content: string;
}

/**
 * The complete warm-up plan structure
 */
export interface WarmupPlan {
  /** Plan ID (single plan per user, typically 'user_warmup_plan') */
  id: string;
  /** Schema version for future migrations */
  version: number;
  /**
   * ISO timestamp of last modification (legacy field).
   * Set to same value as updatedAt by normalizeWarmupPlanForSave().
   * @deprecated Use updatedAt for conflict resolution in new code.
   */
  lastModified: string;
  /**
   * ISO timestamp of last update - used for conflict resolution in cloud sync.
   * Set to same value as lastModified by normalizeWarmupPlanForSave().
   * @remarks Prefer this over lastModified for timestamp comparisons.
   */
  updatedAt?: string;
  /** True if this is the unmodified default template */
  isDefault: boolean;
  /** Ordered list of sections */
  sections: WarmupPlanSection[];
}

/** Current schema version */
export const WARMUP_PLAN_SCHEMA_VERSION = 1;
