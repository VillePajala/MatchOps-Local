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
 * Per-metric ratings are stored on a **canonical 1-10 integer scale** (the
 * finest scale offered). How they are presented/captured is a per-user choice
 * (see `AssessmentRatingStyle`): the 5-level developmental words, numbers 1-5,
 * or numbers 1-10. Display styles map to/from canonical; the stored value never
 * depends on the chosen style.
 */
export const ASSESSMENT_MIN = 1;
export const ASSESSMENT_MAX = 10;
/** Neutral starting value for an un-touched metric (mid scale; "Developing"). */
export const ASSESSMENT_DEFAULT = 5;

/** Number of distinct positions each presentation style offers. */
export const RATING_STYLE_MAX: Record<'words' | 'num5' | 'num10', number> = {
  words: 5,
  num5: 5,
  num10: 10,
};

/** Proportionally remap an integer from one 1..fromMax scale to 1..toMax. */
function remapScale(value: number, fromMax: number, toMax: number): number {
  if (fromMax === toMax) return value;
  const mapped = Math.round(((value - 1) / (fromMax - 1)) * (toMax - 1) + 1);
  return Math.min(toMax, Math.max(1, mapped));
}

/** Canonical (1-10) -> a display value on the given style's scale (1..styleMax). */
export function canonicalToDisplay(canonical: number, styleMax: number): number {
  return remapScale(canonical, ASSESSMENT_MAX, styleMax);
}

/** A display value on the given style's scale -> canonical (1-10). */
export function displayToCanonical(display: number, styleMax: number): number {
  return remapScale(display, styleMax, ASSESSMENT_MAX);
}

/**
 * Fold a (possibly fractional) canonical value into one of the 5 developmental
 * word levels (1-5) - used for the long-term/development view, where ratings are
 * always summarised as a word regardless of the capture style.
 */
export function ratingBandLevel(canonical: number): number {
  return canonicalToDisplay(Math.round(canonical), RATING_STYLE_MAX.words);
}

/**
 * The numeric value to show alongside the word band, on the coach's chosen
 * numeric scale (fractional, for averages). Returns null for the words style
 * (numbers are intentionally hidden there).
 */
export function ratingDisplayNumber(
  canonical: number,
  styleMax: number,
): number {
  if (styleMax === ASSESSMENT_MAX) return canonical;
  return ((canonical - 1) / (ASSESSMENT_MAX - 1)) * (styleMax - 1) + 1;
}

/**
 * Scale version stored on each assessment, and the value range it implies.
 *   NULL/1 = original 1-10 numeric scale
 *   2      = interim 1-5 developmental word scale
 *   3      = current canonical 1-10 scale
 */
export const ASSESSMENT_SLIDER_SCALE_VERSION = 3;
const SCALE_MAX_BY_VERSION: Record<number, number> = { 1: 10, 2: 5, 3: ASSESSMENT_MAX };

/**
 * Map per-metric values from whatever scale they were captured on onto the
 * current canonical scale, on READ. Idempotent and safe to run every read;
 * non-destructive (rows adopt the canonical scale the next time they are saved).
 */
export function migrateAssessmentSliderScale(
  sliders: Record<string, number>,
  fromVersion: number | null | undefined,
): Record<string, number> {
  const version = fromVersion ?? 1;
  const fromMax = SCALE_MAX_BY_VERSION[version] ?? ASSESSMENT_MAX;
  if (fromMax === ASSESSMENT_MAX) return sliders;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(sliders)) {
    out[key] = remapScale(value, fromMax, ASSESSMENT_MAX);
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
