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

/**
 * THE fairness colour (round 2, owner): one muted step of the ramp used by
 * every planner surface - the discs on the pitch, the totals chips on the Games
 * tab and the level stripe of the Balance tiles - so a player's colour means
 * the same everywhere. Muted (low saturation, dark) so it sits calmly in the
 * navy UI and still carries white text.
 */
export function fairnessColor(ratio: number | null): string {
  const hue = fairnessHue(ratio);
  return hue === null ? '#4a2850' /* slate-700 */ : `hsl(${hue}, 42%, 38%)`;
}

/** Disc/segment fill on the pitch: the shared muted colour. */
export function fairnessFill(ratio: number | null): string {
  return fairnessColor(ratio);
}

/** Small text tint (minutes under a disc / on a bench chip) on dark ground. */
export function fairnessText(ratio: number | null): string {
  const hue = fairnessHue(ratio);
  return hue === null ? '#b79ab9' /* slate-400 */ : `hsl(${hue}, 60%, 72%)`;
}

/** Strip/list cell background: the shared muted colour. */
export function fairnessCell(ratio: number | null): string {
  return fairnessColor(ratio);
}
