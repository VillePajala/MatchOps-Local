/**
 * "Started = played" on Home (review R2) and the basic card's priorities (R5).
 *
 * @critical - a game created this morning with the "played" flag on was shown
 * as "Viimeisin peli 0-0", and last Saturday's game that never kicked off
 * vanished from the card. A match that has not begun is still ahead of the
 * coach, whatever its flag and date say.
 */
import { buildHomeSummary, hasMatchStarted } from '../homeSummary';
import type { AppState, SavedGamesCollection } from '@/types';

const TODAY = '2026-11-19';

const g = (over: Partial<AppState>): AppState => ({
  opponentName: 'HJK',
  teamName: 'PK-35',
  homeOrAway: 'home',
  homeScore: 0,
  awayScore: 0,
  isPlayed: true,
  gameStatus: 'notStarted',
  gameEvents: [],
  timeElapsedInSeconds: 0,
  gameDate: TODAY,
  selectedPlayerIds: [],
  ...over,
} as AppState);

const basic = (games: SavedGamesCollection, currentGameId: string | null = null) =>
  buildHomeSummary(games, { today: TODAY, startedDecidesPlayed: true, currentGameId });
const full = (games: SavedGamesCollection, currentGameId: string | null = null) =>
  buildHomeSummary(games, { today: TODAY, currentGameId });

describe('hasMatchStarted', () => {
  it('is false for a match nothing has happened in', () => {
    expect(hasMatchStarted(g({}), TODAY)).toBe(false);
  });

  it('is true once the clock ran, something was recorded, a score exists or the status moved', () => {
    expect(hasMatchStarted(g({ timeElapsedInSeconds: 12 }), TODAY)).toBe(true);
    expect(hasMatchStarted(g({ gameEvents: [{ id: 'e', type: 'goal', time: 60 }] }), TODAY)).toBe(true);
    expect(hasMatchStarted(g({ homeScore: 1 }), TODAY)).toBe(true);
    expect(hasMatchStarted(g({ gameStatus: 'gameEnd' }), TODAY)).toBe(true);
  });

  it('a pre-match note does not start the match on its day', () => {
    const noted = g({ gameEvents: [{ id: 'n', type: 'note', time: 0 }] });
    expect(hasMatchStarted(noted, TODAY)).toBe(false);
  });
});

describe('started = played (R2)', () => {
  /** @critical the reported bug: created today, flag on, shown as a 0-0 result */
  it('a game created today with the played flag on is the next game, not a 0-0 result', () => {
    for (const build of [basic, full]) {
      const s = build({ a: g({ isPlayed: true }) }, 'a');
      expect(s.upcoming?.id).toBe('a');
      expect(s.upcoming?.daysAway).toBe(0);
      expect(s.lastPlayed).toBeNull();
      expect(s.recent).toEqual([]);
      expect(s.playedCount).toBe(0);
      expect(s.resume?.started).toBe(false);
    }
  });

  /** @critical a past game that never kicked off stays on the basic card */
  it('basic: a past-dated game that never started is overdue, never a result', () => {
    const s = basic({ a: g({ isPlayed: true, gameDate: '2026-11-15' }) }, 'a');
    expect(s.upcoming).toBeNull();
    expect(s.overdue?.id).toBe('a');
    expect(s.overdue?.daysOverdue).toBe(4);
    expect(s.lastPlayed).toBeNull();
    expect(s.playedCount).toBe(0);
  });

  it('basic: the latest overdue game is the one shown', () => {
    const s = basic({
      old: g({ gameDate: '2026-11-01', isPlayed: false }),
      recent: g({ gameDate: '2026-11-15', isPlayed: false }),
    });
    expect(s.overdue?.id).toBe('recent');
  });

  it('basic: a booked game wins over an overdue one', () => {
    const s = basic({
      past: g({ gameDate: '2026-11-15' }),
      next: g({ gameDate: '2026-11-22' }),
    });
    expect(s.upcoming?.id).toBe('next');
    expect(s.overdue?.id).toBe('past');
  });

  it('basic: a played game counts whatever its flag says', () => {
    const s = basic({ a: g({ isPlayed: false, gameDate: '2026-11-15', gameStatus: 'gameEnd', homeScore: 2 }) });
    expect(s.playedCount).toBe(1);
    expect(s.lastPlayed?.id).toBe('a');
    expect(s.overdue).toBeNull();
  });

  /**
   * The full layout keeps trusting the flag for PAST matches: those accounts
   * have history entered by hand, where a 0-0 with nothing recorded may be real.
   */
  it('full: a past 0-0 marked played stays a result; no overdue card', () => {
    const s = full({ a: g({ isPlayed: true, gameDate: '2026-11-15' }) });
    expect(s.playedCount).toBe(1);
    expect(s.overdue).toBeNull();
    expect(s.upcoming).toBeNull();
  });

  it('full: a started game marked unplayed keeps its old upcoming behaviour', () => {
    const s = full({ a: g({ isPlayed: false, gameDate: '2026-11-22', gameStatus: 'inProgress', timeElapsedInSeconds: 30 }) });
    expect(s.upcoming?.id).toBe('a');
  });

  it('counts every game for "Kaikki ottelut"', () => {
    const s = basic({ a: g({}), b: g({ gameDate: '2026-11-15', gameStatus: 'gameEnd' }) });
    expect(s.gameCount).toBe(2);
  });
});

describe('basic card priorities (R5)', () => {
  it('same-day games sort by kick-off time, then by creation', () => {
    const s = basic({
      late: g({ gameTime: '18:00', createdAt: '2026-11-19T06:00:00Z' }),
      untimed: g({ createdAt: '2026-11-19T05:00:00Z' }),
      secondEarly: g({ gameTime: '10:00', createdAt: '2026-11-19T08:00:00Z' }),
      firstEarly: g({ gameTime: '10:00', createdAt: '2026-11-19T07:00:00Z' }),
    });
    expect([s.upcoming?.id, ...s.upcomingList.map((u) => u.id)]).toEqual([
      'firstEarly',
      'secondEarly',
      'late',
      'untimed',
    ]);
  });

  it('falls back to the timestamp in the id for creation order', () => {
    const s = basic({
      game_1700000002000_b: g({}),
      game_1700000001000_a: g({}),
    });
    expect(s.upcoming?.id).toBe('game_1700000001000_a');
  });

  /** @critical a match under way always wins the card */
  it('finds a match under way even when it is not the current game', () => {
    const s = basic(
      {
        live: g({ gameStatus: 'inProgress', timeElapsedInSeconds: 300, isPlayed: true }),
        next: g({ gameDate: '2026-11-22' }),
      },
      'next',
    );
    expect(s.unfinished?.id).toBe('live');
    expect(s.unfinished?.inProgress).toBe(true);
    // The live match is never the "next game".
    expect(s.upcoming?.id).toBe('next');
  });

  it('prefers the current game when it is the one under way', () => {
    const s = basic(
      {
        a: g({ gameStatus: 'periodEnd', timeElapsedInSeconds: 900 }),
        b: g({ gameStatus: 'inProgress', timeElapsedInSeconds: 60 }),
      },
      'a',
    );
    expect(s.unfinished?.id).toBe('a');
  });
});
