/**
 * Assessment metrics - single source of truth.
 *
 * Player development assessment is built around a configurable set of metrics
 * rather than hardcoded fields. This file defines the active metric set; the
 * assessment UI, stats, transforms and exports all derive from it.
 *
 * PR 1 (ID-keyed storage) keeps the legacy 10 metric ids unchanged so behaviour
 * is identical - only the storage shape moves to an id-keyed map. The metric
 * *content* change (Balanced default set) and editable templates land in later
 * PRs. See docs/03-active-plans/player-development-assessment-plan.md.
 */

export type AssessmentMetricCategory =
  | 'technical'
  | 'tactical'
  | 'psychological'
  | 'social';

export interface AssessmentMetricDef {
  /** Stable id - used as the storage key and i18n key (`assessmentMetrics.<id>`). */
  id: string;
  /** Four-corner category anchor (used for grouping / future roll-ups). */
  category: AssessmentMetricCategory;
}

/**
 * The active metric set. Order is the display order.
 * NOTE: ids match the legacy hardcoded list exactly (behaviour-preserving).
 */
export const ASSESSMENT_METRICS: readonly AssessmentMetricDef[] = [
  { id: 'intensity', category: 'psychological' },
  { id: 'courage', category: 'psychological' },
  { id: 'duels', category: 'tactical' },
  { id: 'technique', category: 'technical' },
  { id: 'creativity', category: 'technical' },
  { id: 'decisions', category: 'tactical' },
  { id: 'awareness', category: 'tactical' },
  { id: 'teamwork', category: 'social' },
  { id: 'fair_play', category: 'social' },
  { id: 'impact', category: 'psychological' },
] as const;

/** Just the ids, in display order. */
export const ASSESSMENT_METRIC_IDS: readonly string[] = ASSESSMENT_METRICS.map(
  (m) => m.id,
);

/** Rating scale (PR 1 keeps the legacy 1-10 numeric scale). */
export const ASSESSMENT_MIN = 1;
export const ASSESSMENT_MAX = 10;
/** Neutral starting value for an un-touched slider. */
export const ASSESSMENT_DEFAULT = 5;

/** A fresh sliders map with every active metric at the default value. */
export function makeDefaultSliders(): Record<string, number> {
  return Object.fromEntries(
    ASSESSMENT_METRIC_IDS.map((id) => [id, ASSESSMENT_DEFAULT]),
  );
}
