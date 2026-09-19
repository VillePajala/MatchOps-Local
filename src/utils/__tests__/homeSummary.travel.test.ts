/**
 * @critical - the departure time only appears when it can be trusted. Every
 * missing input must blank it rather than guess, because a confidently late
 * departure is worse than none at all.
 */
import { buildHomeSummary } from '../homeSummary';
import type { AppState } from '@/types/game';

const SAVONLINNA = { latitude: 61.8699, longitude: 28.8783 };
const MIKKELI = { locationLat: 61.6885, locationLng: 27.2723 }; // ~87km away

const game = (over: Partial<AppState>): Partial<AppState> => ({
  opponentName: 'Purppura', gameDate: '2026-09-25', isPlayed: false, ...over,
});

const opts = (over = {}) => ({
  today: '2026-09-18',
  teamFilter: 'all' as const,
  startingPoint: SAVONLINNA,
  ...over,
});

const next = (games: Record<string, Partial<AppState>>, o = {}) =>
  buildHomeSummary(games as never, opts(o) as never).upcoming;

describe('when to leave for the next match', () => {
  const fixture = { next: game({ gameTime: '17:30', ...MIKKELI }) };

  it('counts back from kick-off through the buffer and the drive', () => {
    const plan = next(fixture)!.travel!;

    expect(plan.arriveBy).toBe('17:00'); // 17:30 less the 30 min default
    expect(plan.isEstimate).toBe(true);
    expect(plan.distanceKm).toBeGreaterThan(80);
  });

  it('uses the club buffer when one is set', () => {
    expect(next(fixture, { arrivalBufferMinutes: 45 })!.travel!.arriveBy).toBe('16:45');
  });

  /**
   * A cup tie asking for an hour must not drag every other fixture with it -
   * which is what a single club-wide number would force the coach to do.
   */
  it('lets the match itself override the club buffer', () => {
    const plan = next(
      { next: game({ gameTime: '17:30', arrivalBufferMinutes: 60, ...MIKKELI }) },
      { arrivalBufferMinutes: 30 },
    )!.travel!;

    expect(plan.arriveBy).toBe('16:30');
  });

  describe('a drive the coach has measured', () => {
    it('replaces the estimate, and drops the hedge', () => {
      const plan = next({ next: game({ gameTime: '17:30', travelMinutes: 75, ...MIKKELI }) })!.travel!;

      expect(plan.travelMinutes).toBe(75);
      expect(plan.isEstimate).toBe(false);
      expect(plan.departure).toBe('15:45'); // 17:00 less 75 min
    });

    /**
     * Measured once, applied everywhere: the figure is looked up by WHERE the
     * coach drove to, so a past match at the same venue answers for the next
     * one without anything being copied between them.
     */
    it('carries to another fixture at the same venue', () => {
      const plan = next({
        past: game({ gameDate: '2026-08-01', isPlayed: true, travelMinutes: 75, ...MIKKELI }),
        next: game({ gameTime: '17:30', ...MIKKELI }),
      })!.travel!;

      expect(plan.travelMinutes).toBe(75);
      expect(plan.isEstimate).toBe(false);
    });

    it('does not leak to a different venue', () => {
      const plan = next({
        past: game({ gameDate: '2026-08-01', isPlayed: true, travelMinutes: 75, locationLat: 60.1, locationLng: 24.9 }),
        next: game({ gameTime: '17:30', ...MIKKELI }),
      })!.travel!;

      expect(plan.isEstimate).toBe(true);
    });
  });

  describe('stays silent rather than guessing', () => {
    it.each([
      ['no kick-off time', { next: game({ ...MIKKELI }) }, {}],
      ['a venue that was never pinned', { next: game({ gameTime: '17:30', gameLocation: 'Keskuskenttä' }) }, {}],
      ['no starting point set', { next: game({ gameTime: '17:30', ...MIKKELI }) }, { startingPoint: null }],
    ])('with %s', (_case, games, o) => {
      expect(next(games as never, o)!.travel).toBeNull();
    });
  });
});

/**
 * The venue's name says which pitch; the town says how far away the afternoon
 * is. A coach reading the card on Thursday is asking the second question.
 */
describe('the town on the card', () => {
  const pinned = (address: string, name = 'Mitta-Keittiöt Areena') => ({
    next: game({ gameTime: '17:30', gameLocation: name, locationAddress: address, ...MIKKELI }),
  });

  it('is taken from the pinned address', () => {
    expect(next(pinned('Muurarinkatu 4, Savonlinna'))!.venueTown).toBe('Savonlinna');
  });

  it('copes with an address that also carries a region', () => {
    expect(next(pinned('Muurarinkatu 4, Savonlinna, Etelä-Savo'))!.venueTown).toBe('Savonlinna');
  });

  /** "Savonlinna Areena · Savonlinna" says it twice and helps nobody. */
  it('says nothing when the venue name already carries it', () => {
    expect(next(pinned('Muurarinkatu 4, Savonlinna', 'Savonlinna Areena'))!.venueTown).toBeUndefined();
  });

  it('says nothing for a venue that was only typed', () => {
    const upcoming = next({ next: game({ gameTime: '17:30', gameLocation: 'Keskuskenttä' }) });

    expect(upcoming!.venueTown).toBeUndefined();
  });

  it('says nothing for an address with no town in it', () => {
    expect(next(pinned('Muurarinkatu 4'))!.venueTown).toBeUndefined();
  });
});

/**
 * @critical - the top card's last resort before an empty state. Kept separate
 * from `resume` because the recent-strip accent is keyed to `resume`, and
 * blurring the two would point the accent at a match the coach never opened.
 */
describe('the latest match played', () => {
  const played = (id: string, date: string, opponent: string) => ({
    [id]: game({ gameDate: date, isPlayed: true, opponentName: opponent, homeOrAway: 'home', homeScore: 3, awayScore: 1 }),
  });

  const summary = (games: Record<string, Partial<AppState>>, o = {}) =>
    buildHomeSummary(games as never, opts(o) as never);

  it('is the most recent one, not the most recently created', () => {
    const s = summary({ ...played('a', '2026-08-01', 'Vanha'), ...played('b', '2026-09-10', 'Uusi') });

    expect(s.lastPlayed?.id).toBe('b');
    expect(s.lastPlayed?.opponent).toBe('Uusi');
  });

  it('reads the score from the coach s side', () => {
    const s = summary(played('a', '2026-09-10', 'HJK'));

    expect(s.lastPlayed?.ourScore).toBe(3);
    expect(s.lastPlayed?.theirScore).toBe(1);
  });

  /**
   * The resume card offers directions because the match is still ahead; this
   * one has been played, and routing a coach to a ground they came home from
   * is noise sitting where a useful control goes.
   */
  it('offers no directions, however well pinned the venue was', () => {
    const s = summary({
      a: game({ gameDate: '2026-09-10', isPlayed: true, locationLat: 61.87, locationLng: 28.88 }),
    });

    expect(s.lastPlayed?.mapsUrl).toBeNull();
  });

  it('is nothing when no match has been played', () => {
    expect(summary({ next: game({ gameTime: '17:30' }) }).lastPlayed).toBeNull();
  });

  /** The accent must keep pointing at the match actually open, or nothing. */
  it('does not become the resume card', () => {
    const s = summary(played('a', '2026-09-10', 'HJK'));

    expect(s.resume).toBeNull();
    expect(s.lastPlayed).not.toBeNull();
  });
});
