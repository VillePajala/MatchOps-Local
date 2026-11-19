/**
 * The Settings -> Data error-reporting switch as Sentry reads it: account
 * value -> in-memory flag + per-device cache + listeners.
 * @critical
 */
import {
  applyDiagnosticsPreference,
  diagnosticsEnabledFromSettings,
  isDiagnosticsEnabled,
  onDiagnosticsPreferenceChange,
  resetDiagnosticsPreferenceForTests,
} from '../diagnosticsPreference';

const CACHE_KEY = 'matchops_diagnostics_enabled';

beforeEach(() => {
  localStorage.clear();
  resetDiagnosticsPreferenceForTests();
});

describe('diagnosticsEnabledFromSettings', () => {
  it('is on unless the account explicitly turned it off', () => {
    expect(diagnosticsEnabledFromSettings(undefined)).toBe(true);
    expect(diagnosticsEnabledFromSettings(null)).toBe(true);
    expect(diagnosticsEnabledFromSettings({})).toBe(true);
    expect(diagnosticsEnabledFromSettings({ diagnosticsEnabled: true })).toBe(true);
    expect(diagnosticsEnabledFromSettings({ diagnosticsEnabled: false })).toBe(false);
  });
});

describe('applyDiagnosticsPreference', () => {
  it('defaults to on with nothing cached', () => {
    expect(isDiagnosticsEnabled()).toBe(true);
  });

  it('turns off immediately, caches the choice and tells listeners once', () => {
    const listener = jest.fn();
    onDiagnosticsPreferenceChange(listener);

    applyDiagnosticsPreference(false);
    applyDiagnosticsPreference(false);

    expect(isDiagnosticsEnabled()).toBe(false);
    expect(localStorage.getItem(CACHE_KEY)).toBe('false');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(false);
  });

  /** @edge-case - the next app start must not report before settings load */
  it('starts off on the next start when the device last saw it off', () => {
    localStorage.setItem(CACHE_KEY, 'false');
    resetDiagnosticsPreferenceForTests();
    expect(isDiagnosticsEnabled()).toBe(false);
  });

  it('turns back on and notifies', () => {
    applyDiagnosticsPreference(false);
    const listener = jest.fn();
    const unsubscribe = onDiagnosticsPreferenceChange(listener);
    applyDiagnosticsPreference(true);
    expect(isDiagnosticsEnabled()).toBe(true);
    expect(listener).toHaveBeenCalledWith(true);

    unsubscribe();
    applyDiagnosticsPreference(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  /** @edge-case */
  it('a throwing listener does not stop the switch', () => {
    onDiagnosticsPreferenceChange(() => {
      throw new Error('boom');
    });
    const second = jest.fn();
    onDiagnosticsPreferenceChange(second);
    applyDiagnosticsPreference(false);
    expect(isDiagnosticsEnabled()).toBe(false);
    expect(second).toHaveBeenCalledWith(false);
  });
});
