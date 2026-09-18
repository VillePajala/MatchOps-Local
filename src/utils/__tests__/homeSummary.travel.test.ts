/**
 * @critical - the departure time only appears when it can be trusted. Every
 * missing input must blank it rather than guess, because a confidently late
 * departure is worse than none at all.
 */
import { buildHomeSummary } from '../homeSummary';
import type { AppState } from '@/types/game';

const HOME = { locationLat: 61.8699, locationLng: 28.8783 };   // Savonlinna
const AWAY = { locationLat: 61.6885, locationLng: 27.2723 };   // Mikkeli, ~87km

const game = (over: Partial<AppState>): Partial<AppState> => ({
  opponentName: 'Purppura', gameDate: '2026-09-25', isPlayed: false, ...over,
});

const opts = { today: '2026-09-18', teamFilter: 'all' as const };

/** Past home fixtures are what tell the app where "home" is. */
const homeHistory = {
  h1: game({ gameDate: '2026-08-01', isPlayed: true, homeOrAway: 'home', ...HOME }),
  h2: game({ gameDate: '2026-08-08', isPlayed: true, homeOrAway: 'home', ...HOME }),
};

const build = (games: Record<string, Partial<AppState>>) =>
  buildHomeSummary(games as never, opts as never).upcoming;

describe('when to leave for the next match', () => {
  it('works it out from the coach s own home fixtures', () => {
    const next = build({ ...homeHistory, next: game({ gameTime: '17:30', homeOrAway: 'away', ...AWAY }) });

    // 17:30 less a 45 min buffer is 16:45, less the drive.
    expect(next?.travel?.arriveBy).toBe('16:45');
    expect(next?.travel?.departure).toBeDefined();
    expect(next?.travel?.isEstimate).toBe(true);
  });

  it('reports the distance it used', () => {
    const next = build({ ...homeHistory, next: game({ gameTime: '17:30', homeOrAway: 'away', ...AWAY }) });

    expect(next?.travel?.distanceKm).toBeGreaterThan(80);
  });

  describe('stays silent rather than guessing', () => {
    it('with no kick-off time', () => {
      const next = build({ ...homeHistory, next: game({ homeOrAway: 'away', ...AWAY }) });

      expect(next?.travel).toBeNull();
    });

    /** A venue that was typed, not picked, has no position to measure to. */
    it('with a venue that was never pinned', () => {
      const next = build({ ...homeHistory, next: game({ gameTime: '17:30', gameLocation: 'Keskuskenttä' }) });

      expect(next?.travel).toBeNull();
    });

    /** Nothing says where home is until a home fixture has been pinned. */
    it('with no pinned home fixture to leave from', () => {
      const next = build({ next: game({ gameTime: '17:30', homeOrAway: 'away', ...AWAY }) });

      expect(next?.travel).toBeNull();
    });
  });

  /** One stray away-labelled match must not move the club's home ground. */
  it('picks the ground played at home most, not most recently', () => {
    const next = build({
      ...homeHistory,
      odd: game({ gameDate: '2026-09-01', isPlayed: true, homeOrAway: 'home', ...AWAY }),
      next: game({ gameTime: '17:30', homeOrAway: 'away', ...AWAY }),
    });

    // Home is still Savonlinna (twice) rather than Mikkeli (once), so the trip
    // to Mikkeli is a real journey rather than a five-minute hop.
    expect(next?.travel?.travelMinutes).toBeGreaterThan(90);
  });
});
