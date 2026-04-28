/**
 * Bridge: `ImportedPlanGame` (from PR 4's planExport reader) →
 * `PlanDraft` (the in-memory editor state).
 *
 * Pure conversion. Filters startingXI to roster members + assigns
 * everyone else to bench. Surfaces dropped player ids so the caller can
 * warn ("plan references players not in your roster: …").
 */

import type { Player } from '@/types';
import type { ImportedPlanGame } from '@/utils/planExport';
import type { PlanDraft, PlayerId } from '@/utils/planSwapEngine';

export interface PlanFromImportResult {
  draft: PlanDraft;
  /** Player ids referenced in startingXI that aren't in the roster. */
  unknownPlayerIds: PlayerId[];
}

/**
 * Build a draft from an imported game's `startingXI` map and the current
 * team roster.
 *
 * - `startingXI` is filtered to roster members (unknown ids are stripped
 *   and surfaced via `unknownPlayerIds`).
 * - `bench` = roster minus the assigned starters, in roster order
 *   (deterministic for snapshot tests).
 */
export function planDraftFromImport(
  imported: Pick<ImportedPlanGame, 'startingXI'>,
  roster: readonly Player[],
): PlanFromImportResult {
  const rosterIds = new Set(roster.map((p) => p.id));
  const startingXI: Record<string, PlayerId> = {};
  const unknownPlayerIds: PlayerId[] = [];
  const seenInXI = new Set<PlayerId>();

  for (const [role, playerId] of Object.entries(imported.startingXI)) {
    if (!playerId) continue; // skip unfilled slots from the standalone
    if (!rosterIds.has(playerId)) {
      unknownPlayerIds.push(playerId);
      continue;
    }
    startingXI[role] = playerId;
    seenInXI.add(playerId);
  }

  const bench = roster.filter((p) => !seenInXI.has(p.id)).map((p) => p.id);
  return { draft: { startingXI, bench }, unknownPlayerIds };
}
