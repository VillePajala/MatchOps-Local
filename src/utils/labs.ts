/**
 * Device-local "labs" switch (privacy 2026-11).
 *
 * Experimental features that are not ready for every coach - today only the
 * AI assistant ("Kirjuri": voice notes, transcription, report drafting,
 * translation, note summaries) - are hidden unless this switch is on. It is
 * turned on and off by tapping the app version line in Settings seven times.
 *
 * Per DEVICE, not per account, on purpose: no database migration, nothing
 * synced or backed up, and nothing a normal coach can stumble on. Turning it
 * off never deletes anything - an AI setup already on the device (key,
 * consent, recordings) stays, it just cannot be reached until labs is on
 * again (`aiProvider` reports the AI as not connected while labs is off).
 */

import { useSyncExternalStore } from 'react';

const LABS_KEY = 'matchops_labs_enabled';

/** Taps on the version line that toggle the switch. */
export const LABS_TAP_COUNT = 7;

const listeners = new Set<() => void>();

function readStored(): boolean {
  try {
    return globalThis.localStorage?.getItem(LABS_KEY) === '1';
  } catch {
    return false;
  }
}

let enabled: boolean | null = null;

/** Whether experimental features are shown on this device. Off by default. */
export function isLabsEnabled(): boolean {
  if (enabled === null) enabled = readStored();
  return enabled;
}

export function setLabsEnabled(value: boolean): void {
  enabled = value;
  try {
    if (value) globalThis.localStorage?.setItem(LABS_KEY, '1');
    else globalThis.localStorage?.removeItem(LABS_KEY);
  } catch {
    // Storage blocked: the in-memory value still applies for this session.
  }
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // A listener must never break the switch itself.
    }
  });
}

/** Subscribe to changes; returns the unsubscribe function. */
export function onLabsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getServerSnapshot = () => false;

export function useLabsEnabled(): boolean {
  return useSyncExternalStore(onLabsChange, isLabsEnabled, getServerSnapshot);
}

/** Test seam: forget the cached value (re-read from storage next time). */
export function resetLabsForTests(): void {
  enabled = null;
}
