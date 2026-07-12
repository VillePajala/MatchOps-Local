/**
 * Playing-Time Planner — fairness colour ramp.
 *
 * ONE continuous scale from red through orange and yellow to green, driven by
 * the player's ratio of planned minutes to their fair share. Ported from the
 * standalone planner's proven `hueForRatio`/`ratioColors` (matchops-planner):
 * ratio clamps to 0.4..1.5 and maps linearly onto HSL hue 0..130. There is
 * deliberately NO separate "over-played" colour (no blue): more minutes just
 * reads greener until the cap - one axis, one story.
 *
 * Colour never stands alone: every surface that uses these also prints the
 * minutes number.
 */

/** Ratio → hue (0 = red, ~65 = yellow, 130 = green). Null ratio = no signal. */
export function fairnessHue(ratio: number | null): number | null {
  if (ratio === null || !Number.isFinite(ratio)) return null;
  const clamped = Math.min(1.5, Math.max(0.4, ratio));
  return Math.round(((clamped - 0.4) / 1.1) * 130);
}

/** Disc/segment fill on the pitch: saturated, dark enough for white text. */
export function fairnessFill(ratio: number | null): string {
  const hue = fairnessHue(ratio);
  return hue === null ? '#334155' /* slate-700 */ : `hsl(${hue}, 62%, 34%)`;
}

/** Small text tint (minutes under a disc / on a bench chip) on dark ground. */
export function fairnessText(ratio: number | null): string {
  const hue = fairnessHue(ratio);
  return hue === null ? '#94a3b8' /* slate-400 */ : `hsl(${hue}, 80%, 68%)`;
}

/** Strip/list cell background: slightly brighter than the pitch fill. */
export function fairnessCell(ratio: number | null): string {
  const hue = fairnessHue(ratio);
  return hue === null ? '#334155' : `hsl(${hue}, 60%, 36%)`;
}
