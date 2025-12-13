/**
 * Warm-up Plan Types
 *
 * Data structures for user-customizable warm-up plans.
 * Plans are stored in IndexedDB and can be edited by users.
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
  /** ISO timestamp of last modification */
  lastModified: string;
  /** True if this is the unmodified default template */
  isDefault: boolean;
  /** Ordered list of sections */
  sections: WarmupPlanSection[];
}

/** Current schema version */
export const WARMUP_PLAN_SCHEMA_VERSION = 1;
