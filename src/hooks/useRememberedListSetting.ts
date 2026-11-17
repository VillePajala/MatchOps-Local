/**
 * A list setting this device remembers between visits (review 7.L10; owner
 * 2026-11-17: remember per device) - filters, sort order, "Show archived". Search
 * text is deliberately not remembered.
 *
 * Stored like the Home team scope: device-local localStorage, never synced. A
 * stored value that no longer fits (`isValid` false, e.g. an opponent filter for
 * a name no game uses any more) falls back to the default.
 */

import { useCallback, useState } from 'react';
import logger from '@/utils/logger';

const PREFIX = 'matchops_list_';

function read<T>(key: string, fallback: T, isValid: (value: unknown) => value is T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    // eslint-disable-next-line no-restricted-globals -- device-local view preference, never synced
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    // eslint-disable-next-line no-restricted-globals -- device-local view preference, never synced
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (error) {
    logger.warn('[useRememberedListSetting] could not remember a list setting', {
      key,
      name: error instanceof Error ? error.name : 'unknown',
    });
  }
}

export function useRememberedListSetting<T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): [T, (next: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback, isValid));
  const set = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(previous) : next;
        write(key, resolved);
        return resolved;
      });
    },
    [key],
  );
  return [value, set];
}

/** Validators for the common shapes. */
export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
export const isOneOf =
  <T extends string>(...allowed: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && (allowed as readonly string[]).includes(value);
export const isString = (value: unknown): value is string => typeof value === 'string';
