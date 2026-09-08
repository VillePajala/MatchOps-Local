/**
 * The one report a Replace overwrote, kept so Undo survives leaving the screen.
 *
 * "Tidy up what I wrote" replaces the coach's report with the model's version
 * of it. The text it replaced lived only in the panel's own state, and every
 * hand-off the panel offers - open the squad, open assessments, open settings -
 * closes the modal the panel is inside. The Undo button went with it, and the
 * coach's original words were then gone: game notes have no version history.
 *
 * One slot, not a log. It holds the most recent replacement only, so the
 * previous report does not accumulate on the device after the coach has moved
 * on. Device-local like the other `matchops_*` keys: never synced, never in a
 * backup, never sent anywhere. It is the coach's own report text, already on
 * this device, and it is cleared the moment it is used or superseded.
 */

'use client';

import logger from '@/utils/logger';

const STORAGE_KEY = 'matchops_report_undo';

export interface ReportUndo {
  gameId: string;
  /** The report as it stood before the replacement. */
  text: string;
  /** ISO timestamp, so a stale slot can be recognised. */
  at: string;
}

/** Older than this and the coach has moved on; offering Undo would confuse. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function rememberReplacedReport(gameId: string, text: string): void {
  try {
    const entry: ReportUndo = { gameId, text, at: new Date().toISOString() };
    // eslint-disable-next-line no-restricted-globals -- device-local undo slot, never synced or backed up
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch (error) {
    // Losing the undo slot must never cost the coach the apply itself.
    logger.warn('[reportUndo] could not store the replaced report', {
      name: error instanceof Error ? error.name : 'unknown',
    });
  }
}

/** The replaced report for this game, if there is a fresh one. */
export function readReplacedReport(gameId: string): string | null {
  try {
    // eslint-disable-next-line no-restricted-globals -- device-local undo slot, never synced or backed up
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Partial<ReportUndo>;
    if (entry.gameId !== gameId || typeof entry.text !== 'string') return null;
    const at = Date.parse(entry.at ?? '');
    if (!Number.isFinite(at) || Date.now() - at > MAX_AGE_MS) return null;
    return entry.text;
  } catch {
    return null;
  }
}

export function forgetReplacedReport(): void {
  try {
    // eslint-disable-next-line no-restricted-globals -- device-local undo slot, never synced or backed up
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: a slot we cannot clear is re-checked for staleness on read.
  }
}
