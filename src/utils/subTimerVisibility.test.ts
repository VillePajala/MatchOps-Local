import {
  MAX_REMEMBERED_GAMES,
  isSubTimerShown,
  readSubTimerChoice,
  writeSubTimerChoice,
} from './subTimerVisibility';

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const KEY = 'matchops_sub_timer_visibility';

describe('subTimerVisibility', () => {
  beforeEach(() => localStorage.clear());

  /** One mechanism by default: the plan, or the sub timer when there is none. */
  it('defaults to the sub timer exactly when the game has no plan; a choice overrides', () => {
    expect(isSubTimerShown(undefined, true)).toBe(false);
    expect(isSubTimerShown(undefined, false)).toBe(true);
    expect(isSubTimerShown(true, true)).toBe(true);
    expect(isSubTimerShown(false, false)).toBe(false);
  });

  it('remembers the choice per game', () => {
    expect(readSubTimerChoice('g1')).toBeUndefined();
    writeSubTimerChoice('g1', true);
    writeSubTimerChoice('g2', false);
    expect(readSubTimerChoice('g1')).toBe(true);
    expect(readSubTimerChoice('g2')).toBe(false);
    expect(readSubTimerChoice('g3')).toBeUndefined();
    expect(readSubTimerChoice(null)).toBeUndefined();
  });

  it('ignores a damaged or foreign stored value', () => {
    localStorage.setItem(KEY, 'not json');
    expect(readSubTimerChoice('g1')).toBeUndefined();
    localStorage.setItem(KEY, JSON.stringify({ g1: 'yes', g2: true }));
    expect(readSubTimerChoice('g1')).toBeUndefined();
    expect(readSubTimerChoice('g2')).toBe(true);
    localStorage.setItem(KEY, JSON.stringify([true]));
    expect(readSubTimerChoice('0')).toBeUndefined();
  });

  /** @edge-case one entry for all games, capped: the oldest choices drop first. */
  it('keeps only the most recently set games', () => {
    for (let i = 0; i <= MAX_REMEMBERED_GAMES; i++) writeSubTimerChoice(`g${i}`, true);
    expect(readSubTimerChoice('g0')).toBeUndefined();
    expect(readSubTimerChoice('g1')).toBe(true);
    expect(readSubTimerChoice(`g${MAX_REMEMBERED_GAMES}`)).toBe(true);
    // Setting an old game again makes it the newest.
    writeSubTimerChoice('g1', false);
    writeSubTimerChoice('new', true);
    expect(readSubTimerChoice('g1')).toBe(false);
    expect(readSubTimerChoice('g2')).toBeUndefined();
  });
});
