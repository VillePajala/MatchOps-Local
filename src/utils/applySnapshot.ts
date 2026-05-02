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

/** The three fields handleApply mutates; restoring them undoes the apply. */
export interface ApplyableFields {
  playersOnField: Player[];
  selectedPlayerIds: string[];
  scheduledSubs: ScheduledSub[];
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
 * Extracts the three undoable fields from a saved game. Defaults make
 * the returned object safe to pass straight to applyToGame even when
 * the source game omitted any of the optional arrays.
 */
export const captureApplyableFields = (game: AppState): ApplyableFields => ({
  playersOnField: game.playersOnField ?? [],
  selectedPlayerIds: game.selectedPlayerIds ?? [],
  scheduledSubs: game.scheduledSubs ?? [],
});

/** Default undo window for the post-apply banner (ms). */
export const UNDO_WINDOW_MS = 30_000;
