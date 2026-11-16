/**
 * Durable wall-clock anchor for the running match clock.
 *
 * Why this exists (confirmed from production Sentry data):
 * On Android the OS freezes/kills the WebView while the phone is locked
 * mid-match. The previous recovery path persisted a "wasRunning" marker via
 * an ASYNC IndexedDB write that never flushes before the freeze (boot saw
 * recordFound:false), and the in-session resume path actively CLEARED it right
 * before the OS reloaded — so after the reload the in-progress game loaded
 * PAUSED with the clock behind real time.
 *
 * This anchor is written **synchronously to localStorage**, so the write
 * completes inside the event handler before the OS can suspend the WebView, and
 * it survives both freeze and kill. On boot we recompute the true elapsed from
 * wall-clock: `elapsed = anchor.elapsedSeconds + (now - anchor.wallClockMs)/1000`.
 *
 * Keyed by game (see below); a lookup by `gameId` can never apply one game's
 * anchor to a different game.
 */

const ANCHOR_KEY = 'matchops_timer_anchor';

/**
 * One anchor PER GAME (review 4.22). The single shared slot was cleared by
 * opening or creating any other game, and the boot consumed it on READ - so a
 * second remount before the first tick, or a look at another game's line-up,
 * lost the running clock. Now an anchor exists for game G exactly while G's clock
 * runs: it is removed only by G's own pause, period end, reset or deletion, and
 * a gameId-keyed lookup can never apply it to another game.
 *
 * Entries older than this are never returned, and are dropped on the next write:
 * no real match runs this long (periods, breaks, a shootout), so an older anchor
 * belongs to a game that was abandoned mid-period (phone died, another game opened
 * and never returned to). Applying it would jump that game's clock to the period
 * end days later; ignoring it opens the game at its last saved time, as before.
 */
export const STALE_ANCHOR_MS = 6 * 60 * 60 * 1000;

export interface TimerAnchor {
  gameId: string;
  /** Match clock (seconds) at the moment the anchor was written. */
  elapsedSeconds: number;
  /** Wall-clock time (ms epoch) the anchor was written. */
  wallClockMs: number;
}

type AnchorMap = Record<string, TimerAnchor>;

const isAnchor = (value: unknown): value is TimerAnchor => {
  const a = value as TimerAnchor | null;
  return !!a
    && typeof a.gameId === 'string'
    && typeof a.elapsedSeconds === 'number'
    && typeof a.wallClockMs === 'number';
};

/** All anchors. Reads the pre-4.22 single-anchor format as a map of one, so a
 *  clock running across the app update is not lost. */
function readAll(): AnchorMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(ANCHOR_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    const now = Date.now();
    const fresh = (a: TimerAnchor) => now - a.wallClockMs <= STALE_ANCHOR_MS;
    if (isAnchor(parsed)) return fresh(parsed) ? { [parsed.gameId]: parsed } : {}; // legacy single slot
    if (parsed && typeof parsed === 'object') {
      const map: AnchorMap = {};
      for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (isAnchor(value) && value.gameId === id && fresh(value)) map[id] = value;
      }
      return map;
    }
    return {};
  } catch {
    return {};
  }
}

function writeAll(map: AnchorMap): void {
  try {
    if (Object.keys(map).length === 0) window.localStorage.removeItem(ANCHOR_KEY);
    else window.localStorage.setItem(ANCHOR_KEY, JSON.stringify(map));
  } catch {
    // localStorage can throw (private mode, quota). Recovery is best-effort.
  }
}

/** Synchronously persist the running-clock anchor for a game. Safe to call
 *  frequently (every tick). */
export function writeTimerAnchor(gameId: string, elapsedSeconds: number): void {
  if (typeof window === 'undefined' || !gameId) return;
  const map = readAll(); // stale entries are already left out
  map[gameId] = { gameId, elapsedSeconds, wallClockMs: Date.now() };
  writeAll(map);
}

/** The running-clock anchor for this game, or null. Reading never removes it. */
export function readTimerAnchor(gameId: string): TimerAnchor | null {
  if (!gameId) return null;
  return readAll()[gameId] ?? null;
}

/** Remove this game's anchor: its clock stopped (pause, period end, reset) or
 *  the game was deleted. Never call it for a game whose clock is not the one
 *  being stopped. */
export function clearTimerAnchor(gameId: string): void {
  if (typeof window === 'undefined' || !gameId) return;
  const map = readAll();
  if (!(gameId in map)) return;
  delete map[gameId];
  writeAll(map);
}
