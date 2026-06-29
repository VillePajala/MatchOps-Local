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

/**
 * Per-metric rating scale: a 5-level developmental word scale (see
 * `assessmentScale.level{1..5}` in i18n). Stored as the integer 1-5.
 *   1 Working on it · 2 Emerging · 3 Developing · 4 Consistent · 5 A strength
 */
export const ASSESSMENT_MIN = 1;
export const ASSESSMENT_MAX = 5;
/** Neutral starting level for an un-touched metric ("Developing"). */
export const ASSESSMENT_DEFAULT = 3;
/** Ordered level values, for rendering the selector. */
export const ASSESSMENT_LEVELS: readonly number[] = [1, 2, 3, 4, 5];

/**
 * Slider-scale version stored on each assessment.
 *   absent / 1 = legacy 1-10 numeric scale
 *   2        = 1-5 developmental word scale (current)
 * Used to migrate legacy values on read without a destructive data migration.
 */
export const ASSESSMENT_SLIDER_SCALE_VERSION = 2;

/**
 * Map per-metric values from a legacy scale onto the current 1-5 scale on READ.
 * Legacy values were 1-10; `round(v/2)` folds them into the 5 levels and clamps.
 * A no-op once `fromVersion` is already current, so it is safe to run on every
 * read (idempotent); rows adopt the new scale the next time they are saved.
 */
export function migrateAssessmentSliderScale(
  sliders: Record<string, number>,
  fromVersion: number | null | undefined,
): Record<string, number> {
  if ((fromVersion ?? 1) >= ASSESSMENT_SLIDER_SCALE_VERSION) return sliders;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(sliders)) {
    out[key] = Math.min(ASSESSMENT_MAX, Math.max(ASSESSMENT_MIN, Math.round(value / 2)));
  }
  return out;
}

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
