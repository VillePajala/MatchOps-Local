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
 * Single active game at a time; the stored `gameId` guards against applying a
 * stale anchor to a different game.
 */

const ANCHOR_KEY = 'matchops_timer_anchor';

export interface TimerAnchor {
  gameId: string;
  /** Match clock (seconds) at the moment the anchor was written. */
  elapsedSeconds: number;
  /** Wall-clock time (ms epoch) the anchor was written. */
  wallClockMs: number;
}

/** Synchronously persist the running-clock anchor. Safe to call frequently. */
export function writeTimerAnchor(gameId: string, elapsedSeconds: number): void {
  if (typeof window === 'undefined' || !gameId) return;
  try {
    const anchor: TimerAnchor = { gameId, elapsedSeconds, wallClockMs: Date.now() };
    window.localStorage.setItem(ANCHOR_KEY, JSON.stringify(anchor));
  } catch {
    // localStorage can throw (private mode, quota). Recovery is best-effort.
  }
}

/** Read the anchor, or null if absent/unparseable. */
export function readTimerAnchor(): TimerAnchor | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ANCHOR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.gameId === 'string' &&
      typeof parsed.elapsedSeconds === 'number' &&
      typeof parsed.wallClockMs === 'number'
    ) {
      return parsed as TimerAnchor;
    }
    return null;
  } catch {
    return null;
  }
}

/** Remove the anchor (timer stopped, or anchor consumed at boot). */
export function clearTimerAnchor(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ANCHOR_KEY);
  } catch {
    // Best-effort.
  }
}
