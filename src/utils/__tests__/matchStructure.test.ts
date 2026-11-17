/**
 * Review 11.1: period boundaries with optional extra time. Without extra time every
 * answer must equal the old `period × length × 60` formula.
 * @critical
 */
import {
  structureFrom, extraTimePeriodCount, isExtraTimePeriod, isLastPeriod, periodEndSeconds,
  periodStartSeconds, regulationEndSeconds, totalPeriods,
} from '../matchStructure';

describe('matchStructure', () => {
  it.each([
    [1, 25], [2, 25], [2, 20], [1, 50], [2, 7.5],
  ])('without extra time equals the old formula (%i x %s min), incl. periods past the count', (numberOfPeriods, minutes) => {
    for (const extra of [undefined, { extraTimePeriods: 0, extraTimeMinutes: 15 }, { extraTimePeriods: 2, extraTimeMinutes: 0 }]) {
      const s = { numberOfPeriods, periodDurationMinutes: minutes, ...extra };
      for (let p = 1; p <= 4; p += 1) {
        expect(periodEndSeconds(s, p)).toBe(p * minutes * 60);
        expect(periodStartSeconds(s, p)).toBe((p - 1) * minutes * 60);
        expect(isLastPeriod(s, p)).toBe(p >= numberOfPeriods);
        expect(isExtraTimePeriod(s, p)).toBe(false);
      }
      expect(totalPeriods(s)).toBe(numberOfPeriods);
      expect(extraTimePeriodCount(s)).toBe(0);
    }
  });

  it('2 x 25 plus 2 x 15 extra time', () => {
    const s = { numberOfPeriods: 2, periodDurationMinutes: 25, extraTimePeriods: 2, extraTimeMinutes: 15 };
    expect(totalPeriods(s)).toBe(4);
    expect([1, 2, 3, 4].map((p) => periodEndSeconds(s, p))).toEqual([1500, 3000, 3900, 4800]);
    expect([1, 2, 3, 4].map((p) => periodStartSeconds(s, p))).toEqual([0, 1500, 3000, 3900]);
    expect(regulationEndSeconds(s)).toBe(3000);
    expect([1, 2, 3, 4].map((p) => isLastPeriod(s, p))).toEqual([false, false, false, true]);
    expect([1, 2, 3, 4].map((p) => isExtraTimePeriod(s, p))).toEqual([false, false, true, true]);
  });

  it('one regulation period plus a single extra period (futsal-style 1 x 5)', () => {
    const s = { numberOfPeriods: 1, periodDurationMinutes: 40, extraTimePeriods: 1, extraTimeMinutes: 5 };
    expect(totalPeriods(s)).toBe(2);
    expect(periodEndSeconds(s, 2)).toBe(2700);
    expect(isLastPeriod(s, 1)).toBe(false);
    expect(isLastPeriod(s, 2)).toBe(true);
  });

  it('counts no extra time for unusable values (no length, NaN, negative or fractional periods)', () => {
    const base = { numberOfPeriods: 2, periodDurationMinutes: 25 };
    for (const extra of [
      { extraTimePeriods: 2 }, { extraTimePeriods: 2, extraTimeMinutes: NaN },
      { extraTimePeriods: -1, extraTimeMinutes: 15 }, { extraTimePeriods: 1.5, extraTimeMinutes: 15 },
    ]) {
      expect(extraTimePeriodCount({ ...base, ...extra })).toBe(0);
      expect(periodEndSeconds({ ...base, ...extra }, 3)).toBe(3 * 25 * 60);
    }
  });

  it('structureFrom keeps all four fields and fills missing regulation values', () => {
    expect(structureFrom({ extraTimePeriods: 2, extraTimeMinutes: 15 }, { numberOfPeriods: 2, periodDurationMinutes: 10 }))
      .toEqual({ numberOfPeriods: 2, periodDurationMinutes: 10, extraTimePeriods: 2, extraTimeMinutes: 15 });
  });
});
