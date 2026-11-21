/**
 * Launch timing marks and the once-per-launch report (loading-speed stage 1).
 */
import * as Sentry from '@sentry/nextjs';
import {
  markLaunch,
  launchTimingSummary,
  reportLaunchTiming,
  resetLaunchTimingForTests,
  LAUNCH_REPORT_DEADLINE_MS,
} from '../launchTiming';
import { applyDiagnosticsPreference } from '../diagnosticsPreference';

describe('launchTiming', () => {
  let clock = 0;
  let nowSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    resetLaunchTimingForTests();
    applyDiagnosticsPreference(true);
    (Sentry.addBreadcrumb as jest.Mock).mockClear();
    clock = 100;
    nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => clock);
  });

  afterEach(() => {
    nowSpy.mockRestore();
    resetLaunchTimingForTests();
    applyDiagnosticsPreference(true);
    jest.useRealTimers();
  });

  const at = (ms: number, mark: Parameters<typeof markLaunch>[0]) => {
    clock = ms;
    markLaunch(mark);
  };
  const launchCrumbs = () =>
    (Sentry.addBreadcrumb as jest.Mock).mock.calls.filter(([crumb]) => crumb.category === 'launch');

  it('records each step and its duration, first pass only', () => {
    at(100, 'auth_init_start');
    at(400, 'auth_init_end');
    at(900, 'auth_init_end'); // a later repeat is ignored
    at(450, 'check_app_state_start');
    at(500, 'check_app_state_end');

    expect(launchTimingSummary()).toEqual(expect.objectContaining({
      auth_init_start: 100,
      auth_init_end: 400,
      auth_init_ms: 300,
      check_app_state_ms: 50,
    }));
  });

  it('reports once the app is on screen when no launch pull is running', () => {
    at(100, 'auth_init_start');
    at(300, 'auth_init_end');
    expect(launchCrumbs()).toHaveLength(0);

    at(600, 'app_visible');

    expect(launchCrumbs()).toHaveLength(1);
    expect(launchCrumbs()[0][0].data).toEqual(expect.objectContaining({ app_visible: 600, auth_init_ms: 200 }));
  });

  it('waits for the launch pull to end before reporting', () => {
    at(200, 'launch_pull_start');
    at(600, 'app_visible');
    expect(launchCrumbs()).toHaveLength(0);

    at(2600, 'launch_pull_end');

    expect(launchCrumbs()).toHaveLength(1);
    expect(launchCrumbs()[0][0].data).toEqual(expect.objectContaining({ launch_pull_ms: 2400 }));
  });

  it('reports anyway when the pull has not ended by the deadline', () => {
    at(200, 'launch_pull_start');
    at(600, 'app_visible');

    jest.advanceTimersByTime(LAUNCH_REPORT_DEADLINE_MS);

    expect(launchCrumbs()).toHaveLength(1);
    expect(launchCrumbs()[0][0].data).not.toHaveProperty('launch_pull_ms');
  });

  it('reports only once per page load', () => {
    at(600, 'app_visible');
    reportLaunchTiming();
    at(700, 'match_wait_start');
    jest.advanceTimersByTime(LAUNCH_REPORT_DEADLINE_MS);

    expect(launchCrumbs()).toHaveLength(1);
  });

  it('sends nothing to Sentry while error reporting is switched off', () => {
    applyDiagnosticsPreference(false);

    at(600, 'app_visible');

    expect(launchCrumbs()).toHaveLength(0);
  });
});
