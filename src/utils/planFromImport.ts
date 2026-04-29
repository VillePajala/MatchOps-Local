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
  /**
   * Roles dropped because the same player was already assigned to an
   * earlier role. The editor surfaces these as "the imported plan had
   * <player> in two roles; we kept the first." Order: first-seen wins.
   */
  duplicateRoleAssignments: Array<{ role: string; playerId: PlayerId }>;
}

/**
 * Build a draft from an imported game's `startingXI` map and the current
 * team roster.
 *
 * - `startingXI` is filtered to roster members (unknown ids are stripped
 *   and surfaced via `unknownPlayerIds`).
 * - The same player cannot occupy two roles. First role wins; later
 *   duplicates are dropped and reported via `duplicateRoleAssignments`.
 *   Iteration order over `Object.entries` is the insertion order from
 *   the importer (which is the standalone planner's role order), so
 *   first-seen is deterministic across runs.
 * - `bench` = roster minus the assigned starters, in roster order
 *   (deterministic for snapshot tests).
 */
export function planDraftFromImport(
  imported: Pick<ImportedPlanGame, 'startingXI' | 'scheduledSubs'>,
  roster: readonly Player[],
): PlanFromImportResult {
  const rosterIds = new Set(roster.map((p) => p.id));
  const startingXI: Record<string, PlayerId> = {};
  const unknownPlayerIds: PlayerId[] = [];
  const duplicateRoleAssignments: Array<{ role: string; playerId: PlayerId }> = [];
  const seenInXI = new Set<PlayerId>();

  for (const [role, playerId] of Object.entries(imported.startingXI)) {
    if (!playerId) continue; // skip unfilled slots from the standalone
    if (!rosterIds.has(playerId)) {
      unknownPlayerIds.push(playerId);
      continue;
    }
    if (seenInXI.has(playerId)) {
      // Player already placed at an earlier role — drop this assignment
      // so the editor never has the same player in two roles. The
      // imported plan was malformed at the source; first-seen wins.
      duplicateRoleAssignments.push({ role, playerId });
      continue;
    }
    startingXI[role] = playerId;
    seenInXI.add(playerId);
  }

  const bench = roster.filter((p) => !seenInXI.has(p.id)).map((p) => p.id);
  // Carry imported scheduled subs onto the draft, dropping the runtime
  // status (drafts have no concept of fired/skipped). Sorted ascending
  // by timeSeconds so the timeline editor can treat the array as
  // monotonic without an additional sort step.
  const importedSubs = imported.scheduledSubs ?? [];
  const scheduledSubs = importedSubs
    .map(({ id, timeSeconds, outPlayer, inPlayer, positionRole }) => ({
      id,
      timeSeconds,
      outPlayer,
      inPlayer,
      positionRole,
    }))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
  return {
    draft: { startingXI, bench, scheduledSubs },
    unknownPlayerIds,
    duplicateRoleAssignments,
  };
}
