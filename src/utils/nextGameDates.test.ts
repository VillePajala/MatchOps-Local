/**
 * Local-date helpers for the "Milloin seuraava peli?" step. Game dates are
 * calendar days in the coach's own zone - a UTC round trip would move a
 * Sunday game to Saturday around midnight.
 * @edge-case
 */
import { formatShortGameDay, fromLocalIsoDate, toLocalIsoDate, upcomingWeekendDates } from './nextGameDates';

describe('upcomingWeekendDates', () => {
  it('gives the coming Saturday and Sunday from a weekday', () => {
    // Thursday 19.11.2026
    expect(upcomingWeekendDates(new Date(2026, 10, 19, 9))).toEqual(['2026-11-21', '2026-11-22']);
  });

  it('on a Saturday: today and tomorrow', () => {
    expect(upcomingWeekendDates(new Date(2026, 10, 21, 23, 30))).toEqual(['2026-11-21', '2026-11-22']);
  });

  it('on a Sunday: today and the next Saturday', () => {
    expect(upcomingWeekendDates(new Date(2026, 10, 22, 0, 5))).toEqual(['2026-11-22', '2026-11-28']);
  });
});

describe('local ISO dates', () => {
  it('round-trip without shifting the day', () => {
    const d = fromLocalIsoDate('2026-03-29');
    expect(d).not.toBeNull();
    expect(toLocalIsoDate(d!)).toBe('2026-03-29');
  });

  it('rejects malformed input', () => {
    expect(fromLocalIsoDate('29.3.2026')).toBeNull();
  });
});

describe('formatShortGameDay', () => {
  it('formats weekday + day + month, capitalised', () => {
    expect(formatShortGameDay('2026-11-22', 'fi')).toMatch(/^Su 22\.11\.?$/);
    expect(formatShortGameDay('2026-11-22', 'en')).toMatch(/^Sun/);
  });

  it('passes an unparseable value through', () => {
    expect(formatShortGameDay('soon', 'fi')).toBe('soon');
  });
});
