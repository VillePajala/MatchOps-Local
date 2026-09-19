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
