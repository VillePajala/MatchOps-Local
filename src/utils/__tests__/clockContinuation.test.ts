/**
 * Review 1.11: where a stopped clock can continue after the game's period length or
 * count was corrected.
 * @critical
 */
import { clockContinuation } from '@/utils/clockContinuation';

const at = (numberOfPeriods: number, periodDurationMinutes: number, timeElapsedInSeconds: number) =>
  clockContinuation({ numberOfPeriods, periodDurationMinutes, timeElapsedInSeconds });

describe('clockContinuation', () => {
  it('2 x 20 corrected to 2 x 25 at 40:00: continue period 2', () => {
    expect(at(2, 25, 2400)).toEqual({ kind: 'resume', period: 2 });
  });

  it('1 x 20 corrected to 2 x 20 at 20:00: start period 2 (a normal half-time)', () => {
    expect(at(2, 20, 1200)).toEqual({ kind: 'nextPeriod', period: 2 });
  });

  it('2 x 20 corrected to one 50-minute period at 40:00: continue period 1, not a "period 2 of 1"', () => {
    expect(at(1, 50, 2400)).toEqual({ kind: 'resume', period: 1 });
  });

  it('false half-time at 20:00 corrected to 25-minute periods: continue period 1', () => {
    expect(at(2, 25, 1200)).toEqual({ kind: 'resume', period: 1 });
  });

  it('at or past the end of the last period: nothing left to play', () => {
    expect(at(2, 20, 2400)).toBeNull();
    expect(at(2, 15, 2400)).toBeNull();
    expect(at(1, 20, 1200)).toBeNull();
  });

  it('guards against a broken structure', () => {
    expect(at(2, 0, 100)).toBeNull();
    expect(at(0, 20, 100)).toBeNull();
  });

  /** Review 11.1: with extra time configured the clock continues into it. */
  it('2 x 25 + 2 x 15 extra time: next period at regulation end, resume inside, over at the end', () => {
    const s = { numberOfPeriods: 2, periodDurationMinutes: 25, extraTimePeriods: 2, extraTimeMinutes: 15 };
    expect(clockContinuation({ ...s, timeElapsedInSeconds: 3000 })).toEqual({ kind: 'nextPeriod', period: 3 });
    expect(clockContinuation({ ...s, timeElapsedInSeconds: 3500 })).toEqual({ kind: 'resume', period: 3 });
    expect(clockContinuation({ ...s, timeElapsedInSeconds: 3900 })).toEqual({ kind: 'nextPeriod', period: 4 });
    expect(clockContinuation({ ...s, timeElapsedInSeconds: 4800 })).toBeNull();
  });
});
