/**
 * Tests for normalization.ts
 *
 * Validates string normalization utilities used for consistent name handling
 * across players, teams, seasons, tournaments, and personnel.
 */

import { normalizeName, normalizeNameForCompare } from '../normalization';

describe('normalization', () => {
  describe('normalizeName', () => {
    it('returns a clean string unchanged', () => {
      expect(normalizeName('John Doe')).toBe('John Doe');
    });

    it('trims leading whitespace', () => {
      expect(normalizeName('  John Doe')).toBe('John Doe');
    });

    it('trims trailing whitespace', () => {
      expect(normalizeName('John Doe   ')).toBe('John Doe');
    });

    it('trims both leading and trailing whitespace', () => {
      expect(normalizeName('  John Doe  ')).toBe('John Doe');
    });

    it('trims tab characters', () => {
      expect(normalizeName('\tJohn Doe\t')).toBe('John Doe');
    });

    it('trims newline characters', () => {
      expect(normalizeName('\nJohn Doe\n')).toBe('John Doe');
    });

    it('preserves internal whitespace', () => {
      expect(normalizeName('John  Doe')).toBe('John  Doe');
    });

    it('preserves case', () => {
      expect(normalizeName('JOHN DOE')).toBe('JOHN DOE');
    });

    it('returns empty string for empty input', () => {
      expect(normalizeName('')).toBe('');
    });

    it('returns empty string for whitespace-only input', () => {
      expect(normalizeName('   ')).toBe('');
    });

    it('returns empty string for tab-only input', () => {
      expect(normalizeName('\t\t')).toBe('');
    });

    it('preserves accented characters', () => {
      expect(normalizeName('  Pekka Virtanen  ')).toBe('Pekka Virtanen');
    });

    it('preserves Finnish characters', () => {
      expect(normalizeName('  Jarkko Makela  ')).toBe('Jarkko Makela');
    });

    it('preserves Unicode characters', () => {
      expect(normalizeName('  Muller  ')).toBe('Muller');
    });
  });

  describe('normalizeNameForCompare', () => {
    it('trims whitespace', () => {
      expect(normalizeNameForCompare('  John  ')).toBe('john');
    });

    it('lowercases ASCII characters', () => {
      expect(normalizeNameForCompare('JOHN DOE')).toBe('john doe');
    });

    it('lowercases mixed case', () => {
      expect(normalizeNameForCompare('JoHn DoE')).toBe('john doe');
    });

    it('lowercases accented characters', () => {
      expect(normalizeNameForCompare('MAKELA')).toBe('makela');
    });

    it('returns empty string for empty input', () => {
      expect(normalizeNameForCompare('')).toBe('');
    });

    it('returns empty string for whitespace-only input', () => {
      expect(normalizeNameForCompare('   ')).toBe('');
    });

    it('normalizes Unicode ligature fi to fi via NFKC', () => {
      // U+FB01 LATIN SMALL LIGATURE FI should decompose to 'fi' under NFKC
      expect(normalizeNameForCompare('\uFB01nland')).toBe('finland');
    });

    it('normalizes Unicode ligature fl to fl via NFKC', () => {
      // U+FB02 LATIN SMALL LIGATURE FL should decompose to 'fl' under NFKC
      expect(normalizeNameForCompare('\uFB02oor')).toBe('floor');
    });

    it('normalizes Unicode ligature ff to ff via NFKC', () => {
      // U+FB00 LATIN SMALL LIGATURE FF should decompose to 'ff' under NFKC
      expect(normalizeNameForCompare('o\uFB00ice')).toBe('office');
    });

    it('makes names with different casing compare equal', () => {
      expect(normalizeNameForCompare('John Doe')).toBe(
        normalizeNameForCompare('john doe')
      );
    });

    it('makes names with different whitespace compare equal', () => {
      expect(normalizeNameForCompare('  John Doe  ')).toBe(
        normalizeNameForCompare('John Doe')
      );
    });

    it('makes names with ligatures compare equal to expanded forms', () => {
      // "fi" as ligature vs "fi" as two chars
      expect(normalizeNameForCompare('\uFB01nd')).toBe(
        normalizeNameForCompare('find')
      );
    });

    it('preserves accented characters after normalization', () => {
      // NFKC should preserve standard accented characters
      // but the result is lowercased
      const result = normalizeNameForCompare('Caf\u00E9');
      expect(result).toBe('caf\u00E9');
    });

    it('normalizes superscript digits via NFKC', () => {
      // U+00B2 SUPERSCRIPT TWO should normalize to '2'
      expect(normalizeNameForCompare('team\u00B2')).toBe('team2');
    });

    it('normalizes fullwidth latin letters via NFKC', () => {
      // U+FF21 FULLWIDTH LATIN CAPITAL LETTER A should normalize to 'A', then lowercase to 'a'
      expect(normalizeNameForCompare('\uFF21\uFF22\uFF23')).toBe('abc');
    });

    it('preserves internal spacing after normalization', () => {
      expect(normalizeNameForCompare('  John  Doe  ')).toBe('john  doe');
    });
  });
});
