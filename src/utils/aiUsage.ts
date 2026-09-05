/**
 * What the AI features have cost the coach on this device (Kirjuri PR 9c).
 *
 * The coach pays their provider directly, so the app cannot read their real
 * bill - but it can add up what it asked for. This is the number that answers
 * "is this costing me anything?" without making them log in to OpenAI.
 *
 * Honest by construction:
 * - Every figure is labelled an ESTIMATE, because list prices change and audio
 *   billing rounds in ways we do not model.
 * - Counted since a date the coach can see and reset, not "this season". The
 *   app has no way to know which season a device-local counter belongs to, and
 *   a wrong season label is worse than an honest date.
 * - Device-local like the key itself: never synced, never exported, never sent.
 *   Two phones show two counters, which is the truth about each device.
 */

'use client';

import { useSyncExternalStore } from 'react';
import logger from '@/utils/logger';

const STORAGE_KEY = 'matchops_ai_usage';

/**
 * 'readback' covers the requests that only ever produce text to READ - a
 * translation, a player's notes grouped into an account. Counting those as
 * report drafts made the breakdown say the coach had drafted reports they
 * never drafted, which is exactly what this module claims not to do.
 */
export type AiUsageKind = 'transcription' | 'drafting' | 'readback';

export interface AiUsage {
  /** ISO date the count started (first use, or the last reset). */
  since: string;
  transcriptions: number;
  drafts: number;
  /** Translations and grouped notes: text produced to read, never saved. */
  readbacks: number;
  /** Sum of per-request estimates, in USD. */
  estimatedUsd: number;
}

const EMPTY: AiUsage = { since: '', transcriptions: 0, drafts: 0, readbacks: 0, estimatedUsd: 0 };

const listeners = new Set<() => void>();
let snapshot: AiUsage | null = null;

function read(): AiUsage {
  try {
    // eslint-disable-next-line no-restricted-globals -- device-local counter, never synced or backed up
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<AiUsage>;
    return {
      since: typeof parsed.since === 'string' ? parsed.since : '',
      transcriptions: Number.isFinite(parsed.transcriptions) ? Number(parsed.transcriptions) : 0,
      drafts: Number.isFinite(parsed.drafts) ? Number(parsed.drafts) : 0,
      // Absent in counters written before this field existed.
      readbacks: Number.isFinite(parsed.readbacks) ? Number(parsed.readbacks) : 0,
      estimatedUsd: Number.isFinite(parsed.estimatedUsd) ? Number(parsed.estimatedUsd) : 0,
    };
  } catch {
    // A corrupt counter is not worth failing a feature over.
    return EMPTY;
  }
}

function write(next: AiUsage): void {
  try {
    // eslint-disable-next-line no-restricted-globals -- device-local counter, never synced or backed up
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    logger.warn('[aiUsage] Could not store the usage counter', {
      name: error instanceof Error ? error.name : 'unknown',
    });
  }
  snapshot = next;
  listeners.forEach((l) => l());
}

export function getAiUsage(): AiUsage {
  if (!snapshot) snapshot = read();
  return snapshot;
}

/** Add one request. `estimatedUsd` is this request's own estimate. */
export function recordAiUsage(kind: AiUsageKind, estimatedUsd: number): void {
  const current = getAiUsage();
  const usd = Number.isFinite(estimatedUsd) && estimatedUsd > 0 ? estimatedUsd : 0;
  write({
    since: current.since || new Date().toISOString().slice(0, 10),
    transcriptions: current.transcriptions + (kind === 'transcription' ? 1 : 0),
    drafts: current.drafts + (kind === 'drafting' ? 1 : 0),
    readbacks: current.readbacks + (kind === 'readback' ? 1 : 0),
    // Kept to four decimals: single requests here cost fractions of a cent.
    estimatedUsd: Math.round((current.estimatedUsd + usd) * 10_000) / 10_000,
  });
}

/** Back to zero, with a fresh start date on the next request. */
export function resetAiUsage(): void {
  write({ ...EMPTY });
}

export function useAiUsage(): AiUsage {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getAiUsage,
    () => EMPTY,
  );
}

/** Test helper: forget the cached snapshot so a cleared localStorage is read again. */
export function resetAiUsageStateForTests(): void {
  snapshot = null;
}
