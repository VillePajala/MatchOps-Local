/**
 * Thin indirection over window.location.reload().
 *
 * Exists so destructive flows (hard reset, re-sync, factory reset) are unit
 * testable: JSDOM's window.location is non-replaceable, so tests mock THIS
 * module instead. Other reload callsites can migrate here opportunistically.
 */
import { isMatchTimerRunning } from '@/utils/matchTimerSignal';
import { isRecordingSessionActive } from '@/utils/recordingSessionSignal';
import logger from '@/utils/logger';

export function reloadApp(): void {
  window.location.reload();
}

const RELOAD_ONCE_PREFIX = 'matchops.reloadOnce.';

/**
 * Claim the single recovery reload for `reason`, at most once per tab.
 *
 * Returns the DECISION and does not reload - the caller does that. Splitting
 * the two keeps the whole policy testable: jsdom's `window.location` cannot be
 * replaced, so anything that calls `reload()` directly can only be tested by
 * mocking this module, which is no use when this module is the thing under
 * test. The caller is left with one unconditional line.
 *
 * WHY A RELOAD IS THE REMEDY AT ALL. Some failures are properties of the page,
 * not of the operation - a stale client, a connection that will not reopen -
 * and retrying the same call in the same context can never clear them. Cloud
 * hydration on a first sign-in behaves exactly this way: every retry fails and
 * closing the app fixes it, which is the coach doing the reload by hand. This
 * lets the app do it for them.
 *
 * `sessionStorage` is the right scope precisely because it dies with the tab:
 * the one thing a coach might do after this is close the app, and that should
 * restore the single attempt rather than remember it was spent.
 *
 * TWO REFUSALS, both meaning "not now":
 * - A running match clock or an active recording. Reloading mid-match throws
 *   away the in-game view for the sake of a background concern, which is why
 *   `useAppResume` suppresses its own force-reload for the same signals. The
 *   attempt is NOT spent, so it survives until the match ends.
 * - Storage being unreadable (private mode, blocked cookies). If the attempt
 *   cannot be recorded it cannot be limited either, and an unbounded reload
 *   loop is far worse than the failure it is recovering from.
 */
export function claimReloadAttempt(reason: string): boolean {
  if (isMatchTimerRunning() || isRecordingSessionActive()) {
    logger.warn('[reloadApp] Recovery reload suppressed: match or recording in progress', { reason });
    return false;
  }

  const key = `${RELOAD_ONCE_PREFIX}${reason}`;
  try {
    if (sessionStorage.getItem(key) === '1') {
      logger.warn('[reloadApp] Recovery reload already spent this session', { reason });
      return false;
    }
    sessionStorage.setItem(key, '1');
  } catch {
    logger.warn('[reloadApp] Recovery reload skipped: session storage unavailable', { reason });
    return false;
  }

  logger.warn('[reloadApp] Recovery reload claimed', { reason });
  return true;
}

/** Give the attempt back once the thing it was recovering has worked. */
export function clearReloadOnce(reason: string): void {
  try {
    sessionStorage.removeItem(`${RELOAD_ONCE_PREFIX}${reason}`);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

export default reloadApp;
