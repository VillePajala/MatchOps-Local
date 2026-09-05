/**
 * Kirjuri BYOK provider state - device-local, dependency-free.
 *
 * The coach's own AI key and the versioned consent that gates the whole AI
 * feature live here, in localStorage under `matchops_*` keys like the other
 * device-local flags. Structurally outside sync, backup and export: the full
 * backup is an explicit allowlist of DataStore keys, and this module never
 * touches the DataStore. The key value is never logged and never passed to
 * `logger.*` (Sentry scrubs `sk-` shapes as a second line of defence).
 *
 * See docs/03-active-plans/kirjuri-ai-plan.md - consent gate + data rules.
 */

import { useSyncExternalStore } from 'react';
import logger from '@/utils/logger';

/** Bump whenever the gate text changes; everyone re-accepts. */
export const AI_CONSENT_VERSION = '2026-09';

export type AiProviderId = 'openai';
export const AI_PROVIDERS: Record<AiProviderId, { label: string; host: string; keysUrl: string }> = {
  openai: { label: 'OpenAI', host: 'https://api.openai.com', keysUrl: 'https://platform.openai.com/api-keys' },
};

const KEY = 'matchops_ai_key';
const PROVIDER = 'matchops_ai_provider';
const CONSENT = 'matchops_ai_consent';
const PSEUDONYMIZE = 'matchops_ai_pseudonymize';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function read(name: string): string | null {
  try {
    // eslint-disable-next-line no-restricted-globals -- device-local secret/preference, never synced or backed up
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}

function write(name: string, value: string | null): void {
  try {
    // eslint-disable-next-line no-restricted-globals -- device-local secret/preference, never synced or backed up
    if (value === null) localStorage.removeItem(name);
    // eslint-disable-next-line no-restricted-globals -- device-local secret/preference, never synced or backed up
    else localStorage.setItem(name, value);
  } catch {
    // Not persistable on this device - the UI simply stays disconnected.
  }
}

export interface AiProviderState {
  provider: AiProviderId;
  hasKey: boolean;
  /** Last 4 characters, for the "connected as" line. Never the key itself. */
  keyHint: string | null;
  consentVersion: string | null;
  /** Consent for the CURRENT gate text. */
  hasConsent: boolean;
  /** Consent + key: the AI features are usable. */
  connected: boolean;
  pseudonymize: boolean;
}

// Cached snapshot: useSyncExternalStore needs referential stability.
let snapshot: AiProviderState | null = null;

function compute(): AiProviderState {
  const key = read(KEY);
  const consentVersion = read(CONSENT);
  const hasConsent = consentVersion === AI_CONSENT_VERSION;
  const hasKey = !!key;
  return {
    provider: (read(PROVIDER) as AiProviderId | null) ?? 'openai',
    hasKey,
    keyHint: key ? key.slice(-4) : null,
    consentVersion,
    hasConsent,
    connected: hasConsent && hasKey,
    pseudonymize: read(PSEUDONYMIZE) !== '0',
  };
}

export function getAiProviderState(): AiProviderState {
  if (!snapshot) snapshot = compute();
  return snapshot;
}

function refresh(): void {
  snapshot = compute();
  notify();
}

/** The raw key for a request. Callers must never log it or put it in a URL. */
export function getAiProviderKey(): string | null {
  return read(KEY);
}

export function setAiProviderKey(key: string, provider: AiProviderId = 'openai'): void {
  const trimmed = key.trim();
  if (!trimmed) return;
  write(KEY, trimmed);
  write(PROVIDER, provider);
  refresh();
}

export function clearAiProviderKey(): void {
  write(KEY, null);
  refresh();
}

export function acceptAiConsent(): void {
  write(CONSENT, AI_CONSENT_VERSION);
  refresh();
}

/** Disconnect fully: key and consent gone; the gate shows again next time. */
export function revokeAiConsent(): void {
  write(KEY, null);
  write(CONSENT, null);
  refresh();
}

export function setPseudonymizeNames(enabled: boolean): void {
  write(PSEUDONYMIZE, enabled ? '1' : '0');
  refresh();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const serverSnapshot: AiProviderState = {
  provider: 'openai', hasKey: false, keyHint: null, consentVersion: null, hasConsent: false, connected: false, pseudonymize: true,
};
const getServerSnapshot = () => serverSnapshot;

export function useAiProviderState(): AiProviderState {
  return useSyncExternalStore(subscribe, getAiProviderState, getServerSnapshot);
}

/** Test-only: drop the cached snapshot after the test cleared storage. */
export function resetAiProviderStateForTests(): void {
  snapshot = null;
}

export type AiKeyTestResult = 'ok' | 'unauthorized' | 'network';

/**
 * Cheapest authenticated call the provider offers. The key travels only in the
 * Authorization header of this one request; the result never includes it.
 */
export async function testAiProviderKey(key: string, provider: AiProviderId = 'openai'): Promise<AiKeyTestResult> {
  const trimmed = key.trim();
  if (!trimmed) return 'unauthorized';
  try {
    const response = await fetch(`${AI_PROVIDERS[provider].host}/v1/models?limit=1`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${trimmed}` },
    });
    if (response.ok) return 'ok';
    if (response.status === 401 || response.status === 403) return 'unauthorized';
    logger.warn('[aiProvider] key test returned an unexpected status', { status: response.status });
    return 'network';
  } catch {
    logger.warn('[aiProvider] key test could not reach the provider');
    return 'network';
  }
}
