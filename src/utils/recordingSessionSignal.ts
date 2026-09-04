/**
 * Cross-cutting signal: is a Kirjuri recording session armed?
 *
 * Set by the recording controller (Kirjuri PR 2) while the coach may dictate;
 * read by useGameTimer to hold the screen wake lock and (PR 2) by useAppResume
 * to suppress the long-background force-reload - the same role
 * `matchTimerSignal` plays for the running clock. A module store (like
 * `setupWizardActive.ts`) so the timer hook and the recorder share ONE wake
 * lock instance instead of fighting over two.
 */

import { useSyncExternalStore } from 'react';

let active = false;
const listeners = new Set<() => void>();

export const setRecordingSessionActive = (next: boolean): void => {
  if (active === next) return;
  active = next;
  listeners.forEach((listener) => listener());
};

export const isRecordingSessionActive = (): boolean => active;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => active;
const getServerSnapshot = () => false;

export const useRecordingSessionActive = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
