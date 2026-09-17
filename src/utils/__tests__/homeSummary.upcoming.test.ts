/**
 * @critical - a fixture created days ahead was stored and shown NOWHERE: the
 * recent strip filters unplayed games out, and nothing else looked for them.
 * This is the computation that finally surfaces it.
 */
import { buildHomeSummary } from '../homeSummary';
import type { AppState, SavedGamesCollection } from '@/types';

const TODAY = '2026-09-17';

const g = (over: Partial<AppState>): AppState => ({
  opponentName: 'HJK',
  homeOrAway: 'away',
  homeScore: 0,
  awayScore: 0,
  isPlayed: true,
  gameDate: TODAY,
  ...over,
} as AppState);

const summary = (games: SavedGamesCollection) =>
  buildHomeSummary(games, { today: TODAY });

describe('upcoming fixtures', () => {
  it('finds an unplayed match in the future', () => {
    const s = summary({ a: g({ isPlayed: false, gameDate: '2026-09-20', opponentName: 'Purppura' }) });

    expect(s.upcoming?.opponent).toBe('Purppura');
    expect(s.upcoming?.daysAway).toBe(3);
  });

  /** A match this afternoon is the most upcoming thing there is. */
  it('counts today as upcoming, not as past', () => {
    const s = summary({ a: g({ isPlayed: false, gameDate: TODAY }) });

    expect(s.upcoming).not.toBeNull();
    expect(s.upcoming?.daysAway).toBe(0);
  });

  it('picks the nearest when several are booked', () => {
    const s = summary({
      far: g({ isPlayed: false, gameDate: '2026-10-04', opponentName: 'Imatra' }),
      near: g({ isPlayed: false, gameDate: '2026-09-20', opponentName: 'Purppura' }),
      mid: g({ isPlayed: false, gameDate: '2026-09-24', opponentName: 'Saimaa' }),
    });

    expect(s.upcoming?.opponent).toBe('Purppura');
    expect(s.upcomingList.map((u) => u.opponent)).toEqual(['Purppura', 'Saimaa', 'Imatra']);
  });

  it('ignores a fixture whose date has passed', () => {
    const s = summary({ a: g({ isPlayed: false, gameDate: '2026-09-10' }) });

    expect(s.upcoming).toBeNull();
  });

  it('ignores played matches, however recent', () => {
    const s = summary({ a: g({ isPlayed: true, gameDate: '2026-09-20' }) });

    expect(s.upcoming).toBeNull();
  });

  it('is null when nothing is booked', () => {
    const s = summary({ a: g({ gameDate: '2026-09-14' }) });

    expect(s.upcoming).toBeNull();
    expect(s.upcomingList).toEqual([]);
  });

  /** Unplayed games stay out of Recent - the strips must not double up. */
  it('never appears in the recent strip as well', () => {
    const s = summary({
      past: g({ gameDate: '2026-09-14' }),
      future: g({ isPlayed: false, gameDate: '2026-09-20' }),
    });

    expect(s.recent.map((r) => r.id)).toEqual(['past']);
    expect(s.upcomingList.map((u) => u.id)).toEqual(['future']);
  });

  describe('the car button', () => {
    it('offers directions when the venue is pinned', () => {
      const s = summary({
        a: g({ isPlayed: false, gameDate: '2026-09-20', locationLat: 61.0583, locationLng: 28.1887 }),
      });

      expect(s.upcoming?.mapsUrl).toContain('destination=61.0583,28.1887');
    });

    /** Directions to a typed region name are a promise the button cannot keep. */
    it('offers nothing for a typed-only location', () => {
      const s = summary({ a: g({ isPlayed: false, gameDate: '2026-09-20', gameLocation: 'Itäinen alue' }) });

      expect(s.upcoming?.mapsUrl).toBeNull();
    });
  });

  describe('the countdown', () => {
    it.each([
      ['2026-09-17', 0],
      ['2026-09-18', 1],
      ['2026-09-24', 7],
    ])('reads %s as %i days away', (date, days) => {
      const s = summary({ a: g({ isPlayed: false, gameDate: date }) });
      expect(s.upcoming?.daysAway).toBe(days);
    });

    /** Built from calendar dates, so a clock change cannot shift "tomorrow". */
    it('survives a malformed date without throwing', () => {
      const s = summary({ a: g({ isPlayed: false, gameDate: 'not-a-date' }) });
      expect(s.upcoming).toBeNull();
    });
  });

  it('carries the venue and pitch separately', () => {
    const s = summary({
      a: g({ isPlayed: false, gameDate: '2026-09-20', gameLocation: 'Kimpisen kenttä', fieldNumber: 'TN 2' }),
    });

    expect(s.upcoming?.venue).toBe('Kimpisen kenttä');
    expect(s.upcoming?.fieldNumber).toBe('TN 2');
  });
});
