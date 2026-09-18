/**
 * @critical - the season record depends on this. Too eager and every booked
 * fixture becomes a 0-0 draw; too reluctant and a match you played goes
 * missing. Both have already happened to the owner.
 */
import { defaultIsPlayed, hasBeenPlayed } from '../matchPlayedDefault';

const TODAY = '2026-09-18';

describe('defaultIsPlayed', () => {
  it.each([
    ['tomorrow', '2026-09-19'],
    ['next week', '2026-09-25'],
    ['today', TODAY],
  ])('a match %s has not been played yet', (_when, date) => {
    expect(defaultIsPlayed(date, TODAY)).toBe(false);
  });

  /** Entering a result after the fact: the past is the one thing that is done. */
  it.each([
    ['yesterday', '2026-09-17'],
    ['last month', '2026-08-15'],
  ])('a match %s is a result, not a fixture', (_when, date) => {
    expect(defaultIsPlayed(date, TODAY)).toBe(true);
  });
});

describe('hasBeenPlayed', () => {
  /**
   * THE OWNER'S OBJECTION, ANSWERED. They will not tick a box after the final
   * whistle, and they are right not to - a flag a person maintains will be
   * wrong. So the match says so itself.
   */
  it('a clock that has run means it was played', () => {
    expect(hasBeenPlayed({ timeElapsedInSeconds: 1, gameEvents: [] })).toBe(true);
  });

  it('anything recorded against it means it was played', () => {
    expect(hasBeenPlayed({ timeElapsedInSeconds: 0, gameEvents: [{ type: 'goal' }] })).toBe(true);
  });

  /** A fixture booked and not yet played has neither. */
  it('an untouched fixture has not been played', () => {
    expect(hasBeenPlayed({ timeElapsedInSeconds: 0, gameEvents: [] })).toBe(false);
  });

  it('copes with a match carrying neither field', () => {
    expect(hasBeenPlayed({})).toBe(false);
  });

  /** A 0-0 that really was played still has a clock behind it. */
  it('recognises a goalless match that was actually played', () => {
    expect(hasBeenPlayed({ timeElapsedInSeconds: 3600, gameEvents: [] })).toBe(true);
  });
});

describe('the two rules together', () => {
  /**
   * The full life of today's match, with the coach never touching the toggle:
   * booked in the morning, played in the afternoon, in the record by evening.
   */
  it('carries today s match from fixture to result without being asked', () => {
    const created = defaultIsPlayed(TODAY, TODAY);
    expect(created).toBe(false); // a fixture: on the next-match card, out of the record

    const afterKickOff = created || hasBeenPlayed({ timeElapsedInSeconds: 120, gameEvents: [] });
    expect(afterKickOff).toBe(true); // a result: in the record, no toggle touched
  });

  /** And a fixture that never happened stays out of the record on its own. */
  it('leaves a fixture nobody played out of the record', () => {
    const created = defaultIsPlayed('2026-09-25', TODAY);
    const later = created || hasBeenPlayed({ timeElapsedInSeconds: 0, gameEvents: [] });

    expect(later).toBe(false);
  });
});
