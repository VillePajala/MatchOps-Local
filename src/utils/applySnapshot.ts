// Pre-apply snapshot used by the post-Apply undo banner to restore
// the three fields handleApply mutates.

import type { Player } from '@/types';
import type { AppState, ScheduledSub } from '@/types/game';

// Optional so the snapshot can preserve undefined from legacy games —
// some load paths treat undefined and [] differently.
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
  appliedAt: number;
  games: ApplySnapshotEntry[];
}

// Shallow-clone existing arrays so future in-place mutations on the
// live game can't retroactively corrupt the snapshot. undefined stays
// undefined so undo is lossless.
export const captureApplyableFields = (game: AppState): ApplyableFields => ({
  playersOnField: game.playersOnField ? [...game.playersOnField] : undefined,
  selectedPlayerIds: game.selectedPlayerIds
    ? [...game.selectedPlayerIds]
    : undefined,
  scheduledSubs: game.scheduledSubs ? [...game.scheduledSubs] : undefined,
});

export const UNDO_WINDOW_MS = 30_000;
