/**
 * TEMPORARY timer diagnostics → Sentry.
 *
 * We have a production-only bug we can't reproduce locally: after locking the
 * phone mid-match, on return the match clock has advanced LESS than the lock
 * duration and is paused (it appears to stop partway through the background).
 * Production strips logger.info/log/debug and we can't read console on an
 * installed TWA, so we send structured diagnostics to Sentry instead.
 *
 * Each call captures one Sentry message tagged `timer_diag` (+ a `phase` tag),
 * so they're trivial to filter and to remove once the bug is understood.
 * Keep payloads small; only call on the timer lifecycle transitions below.
 *
 * REMOVE once the lock/resume clock bug is diagnosed and fixed.
 */
import * as Sentry from '@sentry/nextjs';

export type TimerDiagPhase =
  | 'hide' // app backgrounded while a match clock was running
  | 'resume' // in-session foreground reanchor (no reload happened)
  | 'boot-correction'; // boot path consumed the persisted timer record after a reload

export function reportTimerDiag(
  phase: TimerDiagPhase,
  data: Record<string, number | string | boolean | null | undefined>
): void {
  try {
    Sentry.captureMessage(`[timer-diag] ${phase}`, {
      level: 'info',
      tags: { timer_diag: phase },
      extra: { phase, ...data },
    });
  } catch {
    // Diagnostics must never affect timer behavior.
  }
}
