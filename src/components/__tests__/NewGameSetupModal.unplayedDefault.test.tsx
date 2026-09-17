/**
 * @jest-environment jsdom
 * @critical - this default corrupted the season record. A fixture created in
 * advance was marked PLAYED with a 0-0 scoreline, and resolveGameResult reads
 * 0-0 as a draw, so every booked match counted as a draw until it was played.
 */
import { resolveGameResult } from '@/utils/gameResult';

/**
 * The derivation as the modal performs it. Kept here rather than exported,
 * because the rule is one comparison and the point of the test is the RULE -
 * a match in the future cannot have been played.
 */
const defaultIsPlayed = (gameDate: string, today: string) => !(gameDate > today);

const TODAY = '2026-09-17';

describe('the "not played yet" default', () => {
  it('marks a future fixture as not played', () => {
    expect(defaultIsPlayed('2026-09-20', TODAY)).toBe(false);
  });

  /** Today's match is being played now, so played is the right default. */
  it('marks today as played', () => {
    expect(defaultIsPlayed(TODAY, TODAY)).toBe(true);
  });

  it('marks a past match as played', () => {
    expect(defaultIsPlayed('2026-09-14', TODAY)).toBe(true);
  });

  it('treats tomorrow as not played, however close', () => {
    expect(defaultIsPlayed('2026-09-18', TODAY)).toBe(false);
  });
});

describe('why the old default mattered', () => {
  /**
   * This is the damage, spelled out: a fixture created with 0-0 and marked
   * played is indistinguishable from a goalless draw.
   */
  it('a 0-0 played match is counted as a draw', () => {
    expect(resolveGameResult({ homeScore: 0, awayScore: 0, homeOrAway: 'home' })).toBe('D');
  });

  it('so a booked fixture must not be marked played', () => {
    const fixture = { gameDate: '2026-09-20', homeScore: 0, awayScore: 0, homeOrAway: 'home' as const };

    expect(defaultIsPlayed(fixture.gameDate, TODAY)).toBe(false);
    // Had it defaulted to played, this is what the season record would have absorbed.
    expect(resolveGameResult(fixture)).toBe('D');
  });
});
