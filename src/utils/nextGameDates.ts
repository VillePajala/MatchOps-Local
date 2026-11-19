/**
 * Small LOCAL-date helpers for the "Milloin seuraava peli?" step and the plan
 * screen. Game dates are calendar days (YYYY-MM-DD) in the coach's own time
 * zone; going through UTC (toISOString) would shift them by a day around
 * midnight, so everything here is built from local Y/M/D.
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/** A Date as a local YYYY-MM-DD string. */
export function toLocalIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parse YYYY-MM-DD as a LOCAL date (noon, so DST shifts never change the day). */
export function fromLocalIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The next Saturday and Sunday on or after `today` - where junior games are
 * played. On a Saturday that is today and tomorrow; on a Sunday, today and the
 * coming Saturday.
 */
export function upcomingWeekendDates(today: Date = new Date()): string[] {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const out: string[] = [];
  for (let i = 0; i < 7 && out.length < 2; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const day = d.getDay();
    if (day === 6 || day === 0) out.push(toLocalIsoDate(d));
  }
  return out.sort();
}

/** "La 22.11." / "Sat 22/11" - weekday + day + month, first letter capitalised. */
export function formatShortGameDay(iso: string, language: string): string {
  const d = fromLocalIsoDate(iso);
  if (!d) return iso;
  const locale = language.startsWith('fi') ? 'fi-FI' : 'en-GB';
  const text = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'numeric' }).format(d);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
