/**
 * Device memory: has ANY account ever signed in on this device?
 *
 * Decides which auth form opens first. A fresh device belongs to the new-coach
 * funnel (Create account); a device that has held a session once - signed out,
 * session expired, reinstalled without clearing data - opens on Sign in. Per
 * device, not per account; "clear all data" resets it.
 *
 * Device-local localStorage flag (same pattern as the tour/wizard flags):
 * never synced, never in backups. A tiny external store so React can read it
 * hydration-safely (server snapshot = false).
 */

import { useSyncExternalStore } from 'react';

const KEY = 'matchops_device_signed_in';
const listeners = new Set<() => void>();

export function deviceHasSignedIn(): boolean {
  try {
    // eslint-disable-next-line no-restricted-globals -- device-local UI hint, not app data
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Call wherever a real sign-in lands (AuthProvider.markSignedInThisSession). */
export function markDeviceHasSignedIn(): void {
  try {
    // eslint-disable-next-line no-restricted-globals -- device-local UI hint, not app data
    localStorage.setItem(KEY, '1');
  } catch {
    // Not persistable - the next launch simply defaults to Create account again.
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getServerSnapshot = () => false;

export function useDeviceHasSignedIn(): boolean {
  return useSyncExternalStore(subscribe, deviceHasSignedIn, getServerSnapshot);
}
