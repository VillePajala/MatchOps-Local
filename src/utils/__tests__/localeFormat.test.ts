/**
 * Review 8.4: dates and numbers follow the app language, not the browser locale or
 * JavaScript's fixed "57.1" form.
 */
import { act } from '@testing-library/react';
import i18n from '@/i18n';
import { formatAppDate, formatAppDateTime, formatAppDecimal, formatAppPercent } from '../localeFormat';

const inLanguage = async (lng: string, run: () => void) => {
  await act(async () => { await i18n.changeLanguage(lng); });
  try { run(); } finally {
    await act(async () => { await i18n.changeLanguage('en'); });
  }
};

const setDeviceLanguage = (lng: string) =>
  jest.spyOn(window.navigator, 'language', 'get').mockReturnValue(lng);

describe('localeFormat', () => {
  beforeEach(() => {
    setDeviceLanguage('en-GB');
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('Finnish: day-first date, decimal comma, spaced percent', async () => {
    await inLanguage('fi', () => {
      expect(formatAppDate('2026-10-03')).toBe('3.10.2026');
      expect(formatAppDecimal(1.25)).toBe('1,3');
      expect(formatAppPercent(57.14)).toMatch(/^57,1\s%$/);
    });
  });

  it('English: day-first (en-GB) date, decimal point', async () => {
    await inLanguage('en', () => {
      expect(formatAppDate('2026-10-03')).toBe('03/10/2026');
      expect(formatAppDecimal(1.25)).toBe('1.3');
      expect(formatAppPercent(57.14)).toBe('57.1%');
    });
  });

  it('English follows the device\'s English variant (a US device keeps month-first)', () => {
    setDeviceLanguage('en-US');
    expect(formatAppDate('2026-10-03')).toBe('10/3/2026');
  });

  it('a Finnish device with the app in English gets day-first en-GB', () => {
    setDeviceLanguage('fi-FI');
    expect(formatAppDate('2026-10-03')).toBe('03/10/2026');
  });

  it('formats in an explicitly passed language', () => {
    expect(formatAppDate('2026-10-03', 'fi')).toBe('3.10.2026');
  });

  it('a calendar date is the local day, not UTC midnight', () => {
    expect(formatAppDate('2026-01-01')).toBe('01/01/2026');
  });

  it('formats a moment with its time; leaves unparseable input as it was', () => {
    expect(formatAppDateTime(new Date(2026, 9, 3, 14, 5))).toMatch(/03\/10\/2026.*14:05/);
    expect(formatAppDate('not a date')).toBe('not a date');
  });

  it('keeps fixed digits like toFixed did', () => {
    expect(formatAppDecimal(0)).toBe('0.0');
    expect(formatAppDecimal(2)).toBe('2.0');
  });
});
