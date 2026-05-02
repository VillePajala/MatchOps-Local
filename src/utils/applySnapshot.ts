/**
 * Pre-apply snapshot for the post-Apply undo banner.
 *
 * `PlanningEditor` captures one of these immediately before mutating
 * each game so the modal-level undo banner can restore the prior
 * state by replaying the snapshot through `applyToGame`. Fields are
 * the same three that handleApply writes — restoring those rolls the
 * game back atomically from the user's perspective.
 *
 * Pure types + a small builder; no React, no i18n.
 */

import type { Player } from '@/types';
import type { AppState, ScheduledSub } from '@/types/game';

/**
 * The three fields handleApply mutates; restoring them undoes the
 * apply. All fields are optional so a snapshot can preserve
 * `undefined` from a legacy game that had never set them — this
 * matters because some load paths (`gameData?.playersOnField ||
 * initialState.playersOnField`) treat `[]` and `undefined`
 * differently, and capturing `[]` would silently change behavior on
 * undo.
 */
export interface ApplyableFields {
  playersOnField?: Player[];
  selectedPlayerIds?: string[];
  scheduledSubs?: ScheduledSub[];
}

export interface ApplySnapshotEntry {
  gameId: string;
  before: ApplyableFields;
}

export interface ApplySnapshot {
  /** Wall-clock time when the apply succeeded; used for the 30s window. */
  appliedAt: number;
  /** Per-game pre-apply state. Empty array means nothing to undo. */
  games: ApplySnapshotEntry[];
}

/**
 * Extracts the three undoable fields from a saved game without
 * normalizing missing values — `undefined` is preserved so undo can
 * be lossless. The forward apply path always writes concrete arrays
 * (built by applyDraftToGame), so the snapshot only ever holds
 * `undefined` for legacy games whose original state had it.
 */
export const captureApplyableFields = (game: AppState): ApplyableFields => ({
  playersOnField: game.playersOnField,
  selectedPlayerIds: game.selectedPlayerIds,
  scheduledSubs: game.scheduledSubs,
});

/** Default undo window for the post-apply banner (ms). */
export const UNDO_WINDOW_MS = 30_000;
