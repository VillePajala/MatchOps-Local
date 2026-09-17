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

export default todayIso;
