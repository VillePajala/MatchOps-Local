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

// Clone arrays + each Player object so future in-place mutations on the
// live game can't retroactively corrupt the snapshot. undefined stays
// undefined so undo is lossless.
//
// Each Player gets a shallow object clone — applyDraftToGame already
// produces new Player objects today (via `{ ...player, relX, relY }`),
// but a future caller mutating Player.relX/relY in place would otherwise
// silently break undo without any test failure pointing at this file.
// Cost is ~22 player objects per Apply, immeasurable.
export const captureApplyableFields = (game: AppState): ApplyableFields => ({
  playersOnField: game.playersOnField
    ? game.playersOnField.map((p) => ({ ...p }))
    : undefined,
  selectedPlayerIds: game.selectedPlayerIds
    ? [...game.selectedPlayerIds]
    : undefined,
  scheduledSubs: game.scheduledSubs ? [...game.scheduledSubs] : undefined,
});

export const UNDO_WINDOW_MS = 30_000;
