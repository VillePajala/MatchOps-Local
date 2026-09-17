/**
 * @critical - regression guard for the owner's report: a car button on the
 * front page must never open a search for a vague place name like "Itainen
 * alue". Navigation needs a coordinate.
 */
import { buildHomeSummary } from '../homeSummary';
import type { AppState } from '@/types';

const game = (over: Partial<AppState>): Record<string, AppState> => ({
  g1: {
    opponentName: 'HJK',
    homeOrAway: 'away',
    homeScore: 0,
    awayScore: 0,
    isPlayed: false,
    gameDate: '2026-09-20',
    ...over,
  } as AppState,
});

const summaryFor = (over: Partial<AppState>) =>
  buildHomeSummary(game(over), { today: '2026-09-18', currentGameId: 'g1' });

describe('directions on the resume card', () => {
  it('offers directions to a pinned venue', () => {
    const s = summaryFor({
      gameLocation: 'Kimpisen kenttä',
      locationLat: 61.0583,
      locationLng: 28.1887,
    });

    expect(s.resume?.mapsUrl).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=61.0583,28.1887',
    );
  });

  /** The reported bug: a typed region name is not somewhere you can drive to. */
  it('offers nothing for a location that was only typed', () => {
    const s = summaryFor({ gameLocation: 'Itäinen alue' });

    expect(s.resume?.mapsUrl).toBeNull();
  });

  it('offers nothing when there is no location at all', () => {
    const s = summaryFor({});

    expect(s.resume?.mapsUrl).toBeNull();
  });

  /** Half a coordinate pair is not a position. */
  it('offers nothing with only one coordinate', () => {
    const s = summaryFor({ gameLocation: 'Kisapuisto', locationLat: 61.0583 });

    expect(s.resume?.mapsUrl).toBeNull();
  });

  it('never puts the venue name into the link', () => {
    const s = summaryFor({
      gameLocation: 'Itäinen alue',
      locationLat: 61.0583,
      locationLng: 28.1887,
    });

    expect(s.resume?.mapsUrl).not.toContain('alue');
  });
});
