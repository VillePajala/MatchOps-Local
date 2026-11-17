/**
 * Where each period of a match starts and ends on the match clock (review 11.1).
 *
 * Every clock site used `period × periodDurationMinutes × 60` and
 * `currentPeriod >= numberOfPeriods`. Extra time adds periods with their own length
 * after regulation, so these questions are answered here, once.
 *
 * Without extra time (the fields absent or 0) every answer is exactly the old formula
 * - including for a period past the configured count (a count reduced mid-match),
 * which the clock rules rely on.
 */

export interface MatchStructure {
  /** Regulation periods (1 or 2). */
  numberOfPeriods: number;
  /** Regulation period length. */
  periodDurationMinutes: number;
  /** Extra-time periods played after regulation (0, 1 or 2; absent = none). */
  extraTimePeriods?: number;
  /** Length of each extra-time period. */
  extraTimeMinutes?: number;
}

/**
 * The structure of a game or session state - all four fields, so a site cannot
 * forget extra time by building `{ numberOfPeriods, periodDurationMinutes }` itself.
 * Missing regulation values take the given defaults.
 */
export function structureFrom(
  source: Partial<MatchStructure>,
  defaults: Pick<MatchStructure, 'numberOfPeriods' | 'periodDurationMinutes'>,
): MatchStructure {
  return {
    numberOfPeriods: source.numberOfPeriods ?? defaults.numberOfPeriods,
    periodDurationMinutes: source.periodDurationMinutes ?? defaults.periodDurationMinutes,
    extraTimePeriods: source.extraTimePeriods,
    extraTimeMinutes: source.extraTimeMinutes,
  };
}

/** Extra-time periods that actually count (a whole number of periods with a length). */
export function extraTimePeriodCount(s: MatchStructure): number {
  const periods = s.extraTimePeriods ?? 0;
  const minutes = s.extraTimeMinutes ?? 0;
  return Number.isInteger(periods) && periods > 0 && minutes > 0 ? periods : 0;
}

/** Regulation plus extra-time periods. */
export function totalPeriods(s: MatchStructure): number {
  return s.numberOfPeriods + extraTimePeriodCount(s);
}

/** The match-clock second at which `period` ends. */
export function periodEndSeconds(s: MatchStructure, period: number): number {
  const regulationLength = s.periodDurationMinutes * 60;
  if (extraTimePeriodCount(s) === 0 || period <= s.numberOfPeriods) {
    return period * regulationLength;
  }
  return s.numberOfPeriods * regulationLength
    + (period - s.numberOfPeriods) * (s.extraTimeMinutes ?? 0) * 60;
}

/** The match-clock second at which `period` starts (0 for the first). */
export function periodStartSeconds(s: MatchStructure, period: number): number {
  return period <= 1 ? 0 : periodEndSeconds(s, period - 1);
}

/** Whether `period` is the last one to play (>=: a corrected structure can leave fewer). */
export function isLastPeriod(s: MatchStructure, period: number): boolean {
  return period >= totalPeriods(s);
}

/** Whether `period` is an extra-time period. */
export function isExtraTimePeriod(s: MatchStructure, period: number): boolean {
  return extraTimePeriodCount(s) > 0 && period > s.numberOfPeriods;
}

/** The match-clock second at which regulation ends. */
export function regulationEndSeconds(s: MatchStructure): number {
  return periodEndSeconds(s, s.numberOfPeriods);
}

/**
 * Goals scored in extra time (review 11.1, owner 2026-11-17: the final score and the
 * extra-time score are shown separately) - the goals logged after the regulation end,
 * as our goals / opponent goals. Null when the game has no extra time.
 */
export function extraTimeGoals(
  s: MatchStructure,
  events: ReadonlyArray<{ type: string; time: number }>,
): { us: number; them: number } | null {
  if (extraTimePeriodCount(s) === 0) return null;
  const end = regulationEndSeconds(s);
  const late = events.filter((e) => e.time > end);
  return {
    us: late.filter((e) => e.type === 'goal').length,
    them: late.filter((e) => e.type === 'opponentGoal').length,
  };
}
