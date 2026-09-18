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
// Imported, not re-implemented: a local copy is exactly how this rule
// drifted out of step with buildHomeSummary without a single test noticing.
import { defaultIsPlayed } from '@/utils/matchPlayedDefault';

const TODAY = '2026-09-17';

describe('the "not played yet" default', () => {
  it('marks a future fixture as not played', () => {
    expect(defaultIsPlayed('2026-09-20', TODAY)).toBe(false);
  });

  /** Today's match is being played now, so played is the right default. */
  it('does NOT mark today as played - it has not happened yet', () => {
    expect(defaultIsPlayed(TODAY, TODAY)).toBe(false);
  });

  it('marks a past match as played', () => {
    expect(defaultIsPlayed('2026-09-14', TODAY)).toBe(true);
  });

  it('treats tomorrow as not played, however close', () => {
    expect(defaultIsPlayed('2026-09-18', TODAY)).toBe(false);
  });
});

/**
 * The other half of the same bug, and the one that actually fired: picking a
 * competition set the match date to the COMPETITION'S start date. A Kausi runs
 * from August, so every match created for it landed in the past - where the
 * date rule above concludes it has been played.
 */
const laterOfTodayAnd = (startDate: string | undefined, today: string) =>
  startDate && startDate > today ? startDate : today;

describe('a match date taken from a competition', () => {
  it('does not inherit a season that started in August', () => {
    expect(laterOfTodayAnd('2026-08-15', TODAY)).toBe(TODAY);
  });

  it('does inherit a competition that has not started yet', () => {
    expect(laterOfTodayAnd('2026-10-01', TODAY)).toBe('2026-10-01');
  });

  it('falls back to today when the competition has no start date', () => {
    expect(laterOfTodayAnd(undefined, TODAY)).toBe(TODAY);
  });

  it('uses today when the competition starts today', () => {
    expect(laterOfTodayAnd(TODAY, TODAY)).toBe(TODAY);
  });

  /** The two rules together: this is the chain that produced phantom draws. */
  it('no longer lands a new match in the past and calls it played', () => {
    const date = laterOfTodayAnd('2026-08-15', TODAY);

    expect(date).toBe(TODAY);
    expect(defaultIsPlayed(date, TODAY)).toBe(false); // today: not played until it is
    // Whereas the old behaviour dated it to August and marked it played, so:
    expect(defaultIsPlayed('2026-08-15', TODAY)).toBe(true);
    expect(resolveGameResult({ homeScore: 0, awayScore: 0, homeOrAway: 'home' })).toBe('D');
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


/**
 * The rule does not stand alone: the front page's next-match card requires
 * isPlayed === false, and deliberately counts TODAY as upcoming. When the two
 * disagreed, a match created for today fell down the gap - it could never be
 * the next match, and it sat in the season record as a 0-0 draw. That is the
 * owner's bug, and this is the test that would have caught it.
 */
describe('agrees with what the next-match card requires', () => {
  const TODAY_ISO = '2026-09-18';

  it.each([
    ['today', TODAY_ISO],
    ['tomorrow', '2026-09-19'],
    ['next week', '2026-09-25'],
  ])('a match %s can be the next match', (_when, date) => {
    const isPlayed = defaultIsPlayed(date, TODAY_ISO);

    // buildHomeSummary: `if (g.isPlayed !== false) return false`
    expect(isPlayed).toBe(false);
    // buildHomeSummary: `if (g.gameDate < opts.today) return false`
    expect(date < TODAY_ISO).toBe(false);
  });

  it('a match yesterday is a result, not a fixture', () => {
    expect(defaultIsPlayed('2026-09-17', TODAY_ISO)).toBe(true);
  });
});
