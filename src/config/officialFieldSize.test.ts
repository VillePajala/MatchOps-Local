/**
 * @critical - this drives a hint shown while a coach creates a game. A wrong
 * answer here tells them their own league's format is wrong, which is worse
 * than saying nothing at all.
 */
import { officialFieldSize } from './officialFieldSize';

// Comfortably inside season 2027, and a date in the current season.
const IN_2027 = '2027-03-01';
const TODAY_2026 = '2026-09-16';

describe('officialFieldSize', () => {
  describe('football, from season 2027', () => {
    it('puts U10 on 5v5', () => {
      expect(officialFieldSize('U10', 'soccer', IN_2027)?.fieldSize).toBe('5v5');
    });

    it('puts U13 on 8v8 and U14 on 11v11', () => {
      expect(officialFieldSize('U13', 'soccer', IN_2027)?.fieldSize).toBe('8v8');
      expect(officialFieldSize('U14', 'soccer', IN_2027)?.fieldSize).toBe('11v11');
    });

    it('puts the youngest on 3v3', () => {
      expect(officialFieldSize('U7', 'soccer', IN_2027)?.fieldSize).toBe('3v3');
    });

    /**
     * THE ONE THAT MATTERS. Today a Finnish U10 football team plays 8v8 under
     * the old rules. Answering "5v5" now would tell a coach their own league
     * is wrong - worse than saying nothing.
     */
    it('says nothing before the new formats take effect', () => {
      expect(officialFieldSize('U10', 'soccer', TODAY_2026)).toBeNull();
    });

    /** It switches itself on; no release is needed when the season turns. */
    it('starts answering on the first day of the new season', () => {
      expect(officialFieldSize('U10', 'soccer', '2026-12-31')).toBeNull();
      expect(officialFieldSize('U10', 'soccer', '2027-01-01')?.fieldSize).toBe('5v5');
    });
  });

  describe('futsal, already in force', () => {
    it('answers today', () => {
      expect(officialFieldSize('U10', 'futsal', TODAY_2026)?.fieldSize).toBe('4v4');
    });

    /** The sports genuinely differ at the same age - the reason sport is a parameter. */
    it('differs from football at the same age group', () => {
      expect(officialFieldSize('U10', 'futsal', IN_2027)?.fieldSize).toBe('4v4');
      expect(officialFieldSize('U10', 'soccer', IN_2027)?.fieldSize).toBe('5v5');
    });

    it('puts U11 and up on 5v5', () => {
      expect(officialFieldSize('U11', 'futsal', TODAY_2026)?.fieldSize).toBe('5v5');
      expect(officialFieldSize('U15', 'futsal', TODAY_2026)?.fieldSize).toBe('5v5');
    });
  });

  describe('when there is no answer worth giving', () => {
    it('returns null for an unset age group', () => {
      expect(officialFieldSize(undefined, 'soccer', IN_2027)).toBeNull();
      expect(officialFieldSize('', 'soccer', IN_2027)).toBeNull();
    });

    /** "Senior" and the like are not U-numbers and must not land on a band. */
    it('returns null for anything that is not a U-number', () => {
      expect(officialFieldSize('Senior', 'soccer', IN_2027)).toBeNull();
      expect(officialFieldSize('P12', 'soccer', IN_2027)).toBeNull();
    });

    it('treats a missing sport as football', () => {
      expect(officialFieldSize('U10', undefined, IN_2027)?.fieldSize).toBe('5v5');
    });
  });

  it('names the band it came from, so a coach can check it', () => {
    expect(officialFieldSize('U10', 'soccer', IN_2027)?.sourceLabel).toBe('P/T8-10');
  });
});
