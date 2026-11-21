/**
 * Launch timing: how long each step of an app start takes on a real phone.
 *
 * Steps mark their start/end with `markLaunch` (performance.now(), ms since the page
 * started loading; repeats of a mark are ignored, so only the launch's first pass
 * counts). The marks are reported ONCE per page load, when the app is on screen and
 * the launch cloud pull (if one ran) has ended - or LAUNCH_REPORT_DEADLINE_MS after
 * the app appeared, whichever comes first:
 * - logger.debug (development builds),
 * - Sentry: a 'launch' breadcrumb, the 'launch_timing' context (so any later event
 *   from this session carries the numbers) and measurements on the active span -
 *   only while the "Error reporting and usage statistics" switch is on.
 *
 * Marks used:
 *   auth_init_start / auth_init_end        AuthProvider initAuth (session restore)
 *   subscription_fetch_start / _end        SubscriptionContext get_subscription_status
 *   check_app_state_start / _end           page.tsx checkAppState (first run)
 *   launch_pull_start / launch_pull_end    the launch cloud pull (useLaunchPullGate)
 *   match_wait_start / match_wait_end      a match held by the launch-pull gate
 *   app_visible                            the loading screen first came down
 * plus the page's navigation timing (service worker start, first response byte).
 */

import * as Sentry from '@sentry/nextjs';
import logger from '@/utils/logger';
import { isDiagnosticsEnabled } from '@/utils/diagnosticsPreference';

export type LaunchMark =
  | 'auth_init_start' | 'auth_init_end'
  | 'subscription_fetch_start' | 'subscription_fetch_end'
  | 'check_app_state_start' | 'check_app_state_end'
  | 'launch_pull_start' | 'launch_pull_end'
  | 'match_wait_start' | 'match_wait_end'
  | 'app_visible';

/** Report at the latest this long after the app appeared, pull or not. */
export const LAUNCH_REPORT_DEADLINE_MS = 30_000;

const marks: Partial<Record<LaunchMark, number>> = {};
let reported = false;
let deadline: ReturnType<typeof setTimeout> | null = null;

function now(): number | null {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? Math.round(performance.now())
    : null;
}

/** Records a step (first time only), and reports when the launch is complete. */
export function markLaunch(mark: LaunchMark): void {
  if (reported || mark in marks) return;
  const at = now();
  if (at === null) return;
  marks[mark] = at;

  if (mark === 'app_visible' && deadline === null) {
    deadline = setTimeout(reportLaunchTiming, LAUNCH_REPORT_DEADLINE_MS);
  }
  const pullPending = 'launch_pull_start' in marks && !('launch_pull_end' in marks);
  if ('app_visible' in marks && !pullPending) reportLaunchTiming();
}

/** Navigation timing of this page load (was it served by the service worker, how fast). */
function navigationTiming(): Record<string, number | boolean> {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (!nav) return {};
    return {
      sw_controlled: typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller,
      sw_start: Math.round(nav.workerStart),
      response_start: Math.round(nav.responseStart),
      dom_content_loaded: Math.round(nav.domContentLoadedEventEnd),
    };
  } catch {
    return {};
  }
}

/** The launch's numbers: every mark, the step durations and the navigation timing. */
export function launchTimingSummary(): Record<string, number | boolean> {
  const span = (start: LaunchMark, end: LaunchMark): Record<string, number> => {
    const a = marks[start];
    const b = marks[end];
    return a !== undefined && b !== undefined ? { [`${start.replace(/_start$/, '')}_ms`]: b - a } : {};
  };
  return {
    ...navigationTiming(),
    ...marks,
    ...span('auth_init_start', 'auth_init_end'),
    ...span('subscription_fetch_start', 'subscription_fetch_end'),
    ...span('check_app_state_start', 'check_app_state_end'),
    ...span('launch_pull_start', 'launch_pull_end'),
    ...span('match_wait_start', 'match_wait_end'),
  };
}

/** Reports once per page load (see the module comment). */
export function reportLaunchTiming(): void {
  if (reported) return;
  reported = true;
  if (deadline !== null) {
    clearTimeout(deadline);
    deadline = null;
  }
  const summary = launchTimingSummary();
  logger.debug('[launchTiming] Launch timing', summary);
  if (!isDiagnosticsEnabled()) return;
  try {
    Sentry.addBreadcrumb({ category: 'launch', message: 'Launch timing', level: 'info', data: summary });
    if (typeof Sentry.setContext === 'function') Sentry.setContext('launch_timing', summary);
    if (typeof Sentry.setMeasurement === 'function') {
      for (const [name, value] of Object.entries(summary)) {
        if (typeof value === 'number' && name.endsWith('_ms')) {
          Sentry.setMeasurement(`launch.${name}`, value, 'millisecond');
        }
      }
      if (typeof summary.app_visible === 'number') {
        Sentry.setMeasurement('launch.app_visible', summary.app_visible, 'millisecond');
      }
    }
  } catch {
    // Reporting must never affect the app.
  }
}

/** Test seam: forget every mark and allow a new report. */
export function resetLaunchTimingForTests(): void {
  for (const key of Object.keys(marks) as LaunchMark[]) delete marks[key];
  reported = false;
  if (deadline !== null) clearTimeout(deadline);
  deadline = null;
}
