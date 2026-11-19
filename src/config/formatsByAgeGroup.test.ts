/**
 * The format/period suggestion table (Onboarding v3). It preselects a format in
 * the setup wizard and New Game defaults, so a wrong band here puts every new
 * team of that age on the wrong pitch size.
 * @critical
 */
import {
  DEFAULT_PERIODS,
  suggestFormatForAgeGroup,
  suggestPeriodsForAgeGroup,
} from './formatsByAgeGroup';

describe('suggestFormatForAgeGroup', () => {
  describe('football (2027 formats)', () => {
    it.each([
      ['U7', '4v4'],
      ['U8', '5v5'],
      ['U10', '5v5'],
      ['U11', '8v8'],
      ['U13', '8v8'],
      ['U14', '11v11'],
      ['U21', '11v11'],
    ])('%s -> %s', (ageGroup, expected) => {
      expect(suggestFormatForAgeGroup(ageGroup, 'soccer')?.fieldSize).toBe(expected);
    });

    it('offers 3v3 as the alternative for the youngest (the source allows 3v3 or 4v4)', () => {
      expect(suggestFormatForAgeGroup('U7', 'soccer')?.alternatives).toEqual(['3v3']);
    });

    it('has no published playing time, so football uses the 2 x 15 default', () => {
      const s = suggestFormatForAgeGroup('U12', 'soccer');
      expect(s).toMatchObject({ numberOfPeriods: 2, periodMinutes: 15, source: 'default' });
    });

    it('treats a missing sport as football', () => {
      expect(suggestFormatForAgeGroup('U12', undefined)?.fieldSize).toBe('8v8');
    });

    /** Unlike officialFieldSize, the suggestion is for the coming season - no date gate. */
    it('answers today, before season 2027 starts', () => {
      expect(suggestFormatForAgeGroup('U10', 'soccer')?.fieldSize).toBe('5v5');
    });
  });

  describe('futsal (2026-27, from the official table)', () => {
    it.each([
      ['U7', '3v3'],
      ['U8', '4v4'],
      ['U10', '4v4'],
      ['U11', '5v5'],
      ['U16', '5v5'],
      ['U19', '5v5'],
    ])('%s -> %s', (ageGroup, expected) => {
      expect(suggestFormatForAgeGroup(ageGroup, 'futsal')?.fieldSize).toBe(expected);
    });

    it('reads the period length from the table where the source gives one', () => {
      expect(suggestFormatForAgeGroup('U9', 'futsal')).toMatchObject({
        numberOfPeriods: 2,
        periodMinutes: 15,
        source: 'table',
      });
      expect(suggestFormatForAgeGroup('U12', 'futsal')).toMatchObject({
        numberOfPeriods: 2,
        periodMinutes: 10,
        source: 'table',
      });
      expect(suggestFormatForAgeGroup('U17', 'futsal')).toMatchObject({ periodMinutes: 20, source: 'table' });
    });

    it('falls back to 2 x 15 for a band without one primary time (U7: "flexibly")', () => {
      expect(suggestFormatForAgeGroup('U7', 'futsal')).toMatchObject({
        numberOfPeriods: 2,
        periodMinutes: 15,
        source: 'default',
      });
    });
  });

  it.each([[''], [undefined], ['P12'], ['adults']])('returns null for an unknown age group (%s)', (ageGroup) => {
    expect(suggestFormatForAgeGroup(ageGroup, 'soccer')).toBeNull();
    expect(suggestFormatForAgeGroup(ageGroup, 'futsal')).toBeNull();
  });
});

describe('suggestPeriodsForAgeGroup', () => {
  it('never returns null - the default stands in', () => {
    expect(suggestPeriodsForAgeGroup('', 'soccer')).toEqual(DEFAULT_PERIODS);
    expect(suggestPeriodsForAgeGroup(undefined, undefined)).toEqual(DEFAULT_PERIODS);
  });

  it('passes the table value through', () => {
    expect(suggestPeriodsForAgeGroup('U12', 'futsal')).toEqual({
      numberOfPeriods: 2,
      periodMinutes: 10,
      source: 'table',
    });
  });
});
