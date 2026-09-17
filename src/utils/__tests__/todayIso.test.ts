/**
 * @critical - every date rule in game creation and on the home dashboard is
 * built on "today". Getting it wrong by a day shifts the "not played yet"
 * default, which exists to keep unplayed matches out of the season record.
 */
import { todayIso } from '../todayIso';

describe('todayIso', () => {
  it('reads the local calendar date', () => {
    expect(todayIso(new Date(2026, 8, 17, 12, 0, 0))).toBe('2026-09-17');
  });

  /**
   * The bug this exists to prevent: at 00:30 in Finland (UTC+3) the UTC date is
   * still the 16th, so toISOString() would date a match created just after
   * midnight to yesterday.
   */
  it('still says today just after local midnight', () => {
    const justAfterMidnight = new Date(2026, 8, 17, 0, 30, 0);

    expect(todayIso(justAfterMidnight)).toBe('2026-09-17');
    // What the old expression would have produced, whenever local is ahead of UTC:
    const utcDate = justAfterMidnight.toISOString().split('T')[0];
    if (justAfterMidnight.getTimezoneOffset() < 0) {
      expect(utcDate).toBe('2026-09-16');
    }
  });

  it('still says today just before local midnight', () => {
    expect(todayIso(new Date(2026, 8, 17, 23, 45, 0))).toBe('2026-09-17');
  });

  it('pads single-digit months and days', () => {
    expect(todayIso(new Date(2026, 0, 5, 9, 0, 0))).toBe('2026-01-05');
  });

  it('handles the last day of a year', () => {
    expect(todayIso(new Date(2026, 11, 31, 22, 0, 0))).toBe('2026-12-31');
  });

  it('defaults to now', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
