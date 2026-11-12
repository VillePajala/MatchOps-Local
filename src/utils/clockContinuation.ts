/**
 * Where a stopped match clock can go next, given the game's CURRENT structure
 * (review 1.11). A game set up as 2 x 20 but played as 2 x 25 reaches "Game over"
 * at 40:00; once the coach corrects the period length or count, the clock must be
 * able to continue from where it stopped instead of only offering Reset.
 *
 * Worked out from the elapsed time alone (not the stored period number), so any
 * correction lands in the right place - including 2 x 20 corrected to one 50-minute
 * period, where the stored "period 2" no longer exists.
 */

export interface ClockStructure {
  numberOfPeriods: number;
  periodDurationMinutes: number;
  timeElapsedInSeconds: number;
}

export type ClockContinuation =
  /** Mid-period: continue the clock in this period. */
  | { kind: 'resume'; period: number }
  /** Exactly at the end of a period that is not the last: start this period. */
  | { kind: 'nextPeriod'; period: number }
  /** At or past the end of the last period: the game is over. */
  | null;

export function clockContinuation({
  numberOfPeriods,
  periodDurationMinutes,
  timeElapsedInSeconds,
}: ClockStructure): ClockContinuation {
  const periodSeconds = periodDurationMinutes * 60;
  if (!(periodSeconds > 0) || !(numberOfPeriods >= 1)) return null;
  if (timeElapsedInSeconds >= numberOfPeriods * periodSeconds) return null;
  const completedPeriods = Math.floor(timeElapsedInSeconds / periodSeconds);
  if (completedPeriods >= 1 && timeElapsedInSeconds === completedPeriods * periodSeconds) {
    return { kind: 'nextPeriod', period: completedPeriods + 1 };
  }
  return { kind: 'resume', period: completedPeriods + 1 };
}
