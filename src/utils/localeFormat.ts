/**
 * Dates and numbers in the APP's language (review 8.4) - not the browser's, which
 * is what toLocaleDateString() with no locale used, and not JavaScript's fixed
 * "57.1" form, which a Finnish reader writes "57,1".
 */
import i18n from '@/i18n';

/**
 * The Intl locale for the current app language. Finnish: fi-FI. English: the
 * device's own English variant when it has one (a US coach keeps month-first
 * dates), else en-GB - never the device locale of another language.
 */
export const appLocale = (language: string | undefined = i18n.language): string => {
  if (!language?.startsWith('en')) return 'fi-FI';
  const device = typeof navigator !== 'undefined' ? navigator.language : undefined;
  return device?.toLowerCase().startsWith('en') ? device : 'en-GB';
};

/**
 * "2026-10-03" (a calendar date, read as local) or a timestamp -> "3.10.2026" /
 * "03/10/2026". `language` defaults to the app's; a component may pass the one from
 * its useTranslation so a memo can depend on it.
 */
export function formatAppDate(value: string | number | Date, language?: string): string {
  const date = toDate(value);
  return date ? date.toLocaleDateString(appLocale(language)) : String(value);
}

/**
 * A date span, written compactly in the app's language: "8.–9.8.2026" /
 * "08/08/2026 – 09/08/2026". One date when both ends are the same day or only
 * one end is set; '' when neither is.
 */
export function formatAppDateRange(start?: string, end?: string, language?: string): string {
  const from = start ? toDate(start) : null;
  const to = end ? toDate(end) : null;
  if (from && to && to.getTime() > from.getTime()) {
    return new Intl.DateTimeFormat(appLocale(language)).formatRange(from, to);
  }
  const one = from ?? to;
  return one ? one.toLocaleDateString(appLocale(language)) : '';
}

/** A moment, with the time: "3.10.2026 klo 14.05" / "03/10/2026, 14:05". */
export function formatAppDateTime(value: string | number | Date): string {
  const date = toDate(value);
  return date
    ? date.toLocaleString(appLocale(), { dateStyle: 'short', timeStyle: 'short' })
    : String(value);
}

/** 1.25 -> "1,3" (fi) / "1.3" (en); fixed digits, as toFixed gave. */
export function formatAppDecimal(value: number, digits = 1): string {
  return new Intl.NumberFormat(appLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** 57.14 (already a percentage) -> "57,1 %" (fi) / "57.1%" (en). */
export function formatAppPercent(percentage: number, digits = 1): string {
  return new Intl.NumberFormat(appLocale(), {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(percentage / 100);
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function toDate(value: string | number | Date): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    // A calendar date is the coach's local day: new Date('2026-10-03') would be UTC
    // midnight, the day before west of Greenwich.
    const m = DATE_ONLY.exec(value);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
