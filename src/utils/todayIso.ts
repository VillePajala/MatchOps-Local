/**
 * Today, as the coach's calendar sees it.
 *
 * `new Date().toISOString().split('T')[0]` is the obvious way to do this and is
 * WRONG for anyone east of Greenwich: it extracts the UTC calendar date. A
 * Finnish coach is UTC+2 or +3, so between midnight and 03:00 local the UTC
 * date is still yesterday - and every rule built on "today" quietly shifts a
 * day. A match created at half past midnight would be dated yesterday, a
 * fixture happening today would count as one day away and read "Tomorrow", and
 * the "not played yet" default - which exists to keep unplayed matches out of
 * the season record - would be deciding against the wrong day.
 *
 * Built from the LOCAL date parts, which is the only thing a date without a
 * time can honestly mean.
 *
 * @module todayIso
 */
export function todayIso(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Whole calendar days from one ISO date ("2026-11-21") to another - never
 * negative, 0 for a malformed date. Both read as plain calendar days (UTC
 * midnight each), so no time zone or DST shift can make it off by one.
 */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86400000));
}

export default todayIso;
