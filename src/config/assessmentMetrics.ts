/**
 * Assessment metrics - single source of truth.
 *
 * Player development assessment is built around a configurable set of metrics
 * rather than hardcoded fields. This file defines the active metric set; the
 * assessment UI, stats, transforms and exports all derive from it.
 *
 * The active set is "set A" (scanning-led, TOVO-flavoured). Labels are tunable
 * later without data impact - the stable `id` (storage key) is what's fixed.
 * See docs/03-active-plans/player-development-assessment-plan.md.
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
 * The active metric set (set A). Order is the display order.
 * 2 technical / 3 tactical / 3 psychological / 2 social.
 */
export const ASSESSMENT_METRICS: readonly AssessmentMetricDef[] = [
  { id: 'ball_control', category: 'technical' },
  { id: 'passing', category: 'technical' },
  { id: 'scanning', category: 'tactical' },
  { id: 'game_reading', category: 'tactical' },
  { id: 'decisions', category: 'tactical' },
  { id: 'courage', category: 'psychological' },
  { id: 'effort', category: 'psychological' },
  { id: 'enjoyment', category: 'psychological' },
  { id: 'teamwork', category: 'social' },
  { id: 'fair_play', category: 'social' },
] as const;

/** Just the ids, in display order. */
export const ASSESSMENT_METRIC_IDS: readonly string[] = ASSESSMENT_METRICS.map(
  (m) => m.id,
);

/** Rating scale (still the 1-10 numeric scale; the 5-level word scale is a later PR). */
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

/**
 * Legacy metric-id migration (the pre-set-A "intensity/courage/duels/..." ids).
 *
 * Applied on READ (both local and cloud) so existing assessments map onto the
 * current ids without a destructive database migration; rows lazily adopt the
 * new keys the next time they are saved.
 *
 * - Renames carry the value over to the new id.
 * - `duels` / `impact` left the library entirely (north-star) -> dropped.
 * - `creativity` is still a valid library metric (just not in set A's default)
 *   -> preserved, not dropped.
 * - Already-current ids and unknown/custom ids pass through unchanged.
 */
const LEGACY_METRIC_ID_RENAMES: Record<string, string> = {
  technique: 'ball_control',
  awareness: 'game_reading',
  intensity: 'effort',
};
const DROPPED_LEGACY_METRIC_IDS = new Set(['duels', 'impact']);

export function migrateAssessmentSliders(
  sliders: Record<string, number> | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(sliders ?? {})) {
    if (DROPPED_LEGACY_METRIC_IDS.has(key)) continue;
    const id = LEGACY_METRIC_ID_RENAMES[key] ?? key;
    out[id] = value;
  }
  return out;
}
