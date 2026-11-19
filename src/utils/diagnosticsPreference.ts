/**
 * Settings -> Data "Error reporting and usage statistics" (privacy 2026-11).
 *
 * ONE switch, per account (`AppSettings.diagnosticsEnabled`, cloud column
 * `diagnostics_enabled`, migration 063), ON by default. When it is off:
 * - Sentry sends nothing for this user from the next event on
 *   (instrumentation-client.ts gates beforeSend / beforeSendTransaction /
 *   tracesSampler on `isDiagnosticsEnabled()`, stops the replay buffer and
 *   closes the client through `onDiagnosticsPreferenceChange`);
 * - the onboarding milestones are not written (onboardingMilestones.ts reads
 *   the setting itself on every write, so it never depends on this cache).
 *
 * The account setting is the source of truth. This module keeps the
 * in-memory value Sentry reads synchronously, plus a per-device cache of the
 * last known choice so a coach who turned it off is not reported in the
 * moments before their settings load at the next start.
 */

import type { AppSettings } from '@/types/settings';

const CACHE_KEY = 'matchops_diagnostics_enabled';

type Listener = (enabled: boolean) => void;

function readCache(): boolean {
  try {
    return globalThis.localStorage?.getItem(CACHE_KEY) !== 'false';
  } catch {
    return true;
  }
}

let enabled: boolean = readCache();
const listeners = new Set<Listener>();

/** The account's choice: anything but an explicit false is on. */
export function diagnosticsEnabledFromSettings(
  settings: Pick<AppSettings, 'diagnosticsEnabled'> | null | undefined,
): boolean {
  return settings?.diagnosticsEnabled !== false;
}

/** Whether error reporting may send anything right now. */
export function isDiagnosticsEnabled(): boolean {
  return enabled;
}

/**
 * Apply the account's choice to this device: memory, the per-device cache,
 * and every listener (Sentry). A no-op when nothing changes.
 */
export function applyDiagnosticsPreference(value: boolean): void {
  if (value === enabled) return;
  enabled = value;
  try {
    globalThis.localStorage?.setItem(CACHE_KEY, value ? 'true' : 'false');
  } catch {
    // Storage blocked: the in-memory value still applies for this session.
  }
  listeners.forEach((listener) => {
    try {
      listener(value);
    } catch {
      // A listener must never break the switch itself.
    }
  });
}

/** Subscribe to changes; returns the unsubscribe function. */
export function onDiagnosticsPreferenceChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: re-read the device cache and drop every listener. */
export function resetDiagnosticsPreferenceForTests(): void {
  enabled = readCache();
  listeners.clear();
}
