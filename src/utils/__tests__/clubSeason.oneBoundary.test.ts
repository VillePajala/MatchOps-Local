/**
 * @critical - a match that belongs to no club season drops out of the season
 * record entirely. The shipped default left a 26-day hole where exactly that
 * happened, and the coach had no way to know.
 */
import { getClubSeasonForDate, clubSeasonEndFromStart } from '../clubSeason';

describe('clubSeasonEndFromStart', () => {
  it('is the day before', () => {
    expect(clubSeasonEndFromStart('2000-11-15')).toBe('2000-11-14');
  });

  it('steps back over a month boundary', () => {
    expect(clubSeasonEndFromStart('2000-12-01')).toBe('2000-11-30');
  });

  it('wraps a January start to the end of December', () => {
    expect(clubSeasonEndFromStart('2000-01-01')).toBe('2000-12-31');
  });

  /** A boundary on 29 February would not exist in three years out of four. */
  it('uses 28 February rather than a leap day', () => {
    expect(clubSeasonEndFromStart('2000-03-01')).toBe('2000-02-28');
  });
});

describe('every date belongs to a season', () => {
  const START = '2000-11-15';

  /**
   * THE HOLE. With the old default end of 20 October, every one of these
   * returned 'off-season' - autumn matches, silently absent from the record.
   */
  it.each([
    ['2026-10-21'], ['2026-10-31'], ['2026-11-01'], ['2026-11-14'],
  ])('%s is no longer off-season', (date) => {
    expect(getClubSeasonForDate(date, START)).not.toBe('off-season');
  });

  it('puts the day before the boundary in the outgoing season', () => {
    expect(getClubSeasonForDate('2026-11-14', START)).toBe('25/26');
  });

  it('puts the boundary itself in the new season', () => {
    expect(getClubSeasonForDate('2026-11-15', START)).toBe('26/27');
  });

  /** PEPO's own shape: the break sits between two seasons, not outside them. */
  it('puts a friendly played during the winter break in a season', () => {
    expect(getClubSeasonForDate('2026-11-20', START)).toBe('26/27');
  });

  /**
   * Every real date of a LEAP year, against every boundary. The first version
   * of this swept a non-leap year on four days a month and missed the one day
   * that was still broken: with a 1 March boundary the end was 28 February, so
   * 29 February fell in a one-day gap. Review caught it; the sweep had not.
   */
  it('never returns off-season, for any date against any boundary', () => {
    const daysIn = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // 2024, a leap year
    for (let bMonth = 1; bMonth <= 12; bMonth += 1) {
      const boundary = `2000-${String(bMonth).padStart(2, '0')}-01`;
      for (let month = 1; month <= 12; month += 1) {
        for (let day = 1; day <= daysIn[month - 1]; day += 1) {
          const date = `2024-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          expect(getClubSeasonForDate(date, boundary)).not.toBe('off-season');
        }
      }
    }
  });

  /** The day that was still falling through. */
  it('places 29 February against a 1 March boundary', () => {
    expect(getClubSeasonForDate('2024-02-29', '2000-03-01')).toBe('23/24');
  });
});

describe('a calendar-year club season', () => {
  const START = '2000-01-01';

  it('is labelled by the single year it sits in', () => {
    expect(getClubSeasonForDate('2026-06-15', START)).toBe('2026');
  });

  it('covers both ends of the year', () => {
    expect(getClubSeasonForDate('2026-01-01', START)).toBe('2026');
    expect(getClubSeasonForDate('2026-12-31', START)).toBe('2026');
  });
});

/** Corrupt data still degrades rather than throwing. */
describe('bad input', () => {
  it('returns off-season for a date it cannot read', () => {
    expect(getClubSeasonForDate('not-a-date', '2000-11-15')).toBe('off-season');
  });
});
