/**
 * Pasted squad lists (onboarding wizard, D8). A coach pastes the list from
 * WhatsApp; every row must become one clean first-name row.
 * @critical
 */
import { looksLikeNameList, splitPastedNames, stripListMarker } from './splitPastedNames';

describe('splitPastedNames', () => {
  it('splits a numbered WhatsApp list and strips the numbers (not shirt numbers)', () => {
    expect(splitPastedNames('1. Onni\n2. Toivo\n3. Aatos')).toEqual(['Onni', 'Toivo', 'Aatos']);
  });

  it.each([
    ['7 Onni', 'Onni'],
    ['12) Toivo', 'Toivo'],
    ['3: Aatos', 'Aatos'],
    ['- Otso', 'Otso'],
    ['• Aapo', 'Aapo'],
    ['* Elias', 'Elias'],
    ['10 - Leevi', 'Leevi'],
  ])('strips the leading marker from "%s"', (line, expected) => {
    expect(splitPastedNames(line)).toEqual([expected]);
  });

  it('keeps "Surname, First" on one line when the list has line breaks', () => {
    expect(splitPastedNames('Meikäläinen, Matti\nVirtanen, Ville')).toEqual([
      'Meikäläinen, Matti',
      'Virtanen, Ville',
    ]);
  });

  it('splits on commas or semicolons when there are no line breaks', () => {
    expect(splitPastedNames('Eeli, Onni')).toEqual(['Eeli', 'Onni']);
    expect(splitPastedNames('Eeli; Onni')).toEqual(['Eeli', 'Onni']);
    // Semicolons win over commas.
    expect(splitPastedNames('Meikäläinen, Matti; Virtanen, Ville')).toEqual([
      'Meikäläinen, Matti',
      'Virtanen, Ville',
    ]);
  });

  it('handles Windows line breaks, blank lines and extra spaces', () => {
    expect(splitPastedNames('1. Onni\r\n\r\n  2.   Toivo   Virtanen  \r\n')).toEqual(['Onni', 'Toivo Virtanen']);
  });

  it('drops a line that is only a number', () => {
    expect(splitPastedNames('1.\nOnni\n2')).toEqual(['Onni']);
  });

  it('caps the list and each name', () => {
    const many = Array.from({ length: 61 }, (_, i) => `${i + 1}. Pelaaja${i + 1}`).join('\n');
    expect(splitPastedNames(many)).toHaveLength(60);
    expect(splitPastedNames('x'.repeat(150))[0]).toHaveLength(100);
    expect(splitPastedNames('Onni\nToivo\nAatos', { maxNames: 2 })).toEqual(['Onni', 'Toivo']);
    expect(splitPastedNames('Aleksanteri', { maxNameLength: 4 })).toEqual(['Alek']);
  });

  it('returns an empty list for empty input', () => {
    expect(splitPastedNames('')).toEqual([]);
    expect(splitPastedNames('\n\n')).toEqual([]);
  });
});

describe('helpers', () => {
  it('stripListMarker keeps names that merely contain digits later on', () => {
    expect(stripListMarker('Onni 2')).toBe('Onni 2');
  });

  it('looksLikeNameList spots separators', () => {
    expect(looksLikeNameList('Onni')).toBe(false);
    expect(looksLikeNameList('Onni\nToivo')).toBe(true);
    expect(looksLikeNameList('Onni, Toivo')).toBe(true);
  });
});
