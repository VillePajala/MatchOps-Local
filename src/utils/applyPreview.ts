/**
 * Apply-time diff calculator for the planning editor.
 *
 * Given a saved game's current state and the editor's draft, produces
 * a structured diff that the preview UI can display and the user can
 * opt out of per-game before committing the Apply.
 *
 * Pure functions; no side effects, no React, no i18n. The UI is
 * responsible for translating change kinds into localized strings.
 */

import { roleForCoord } from '@/utils/planApply';
import type { AppState, ScheduledSub } from '@/types/game';
import type {
  DraftScheduledSub,
  PlanDraft,
  PlayerId,
  RoleName,
} from '@/utils/planSwapEngine';
import type { FormationPreset } from '@/config/formationPresets';

/** Player coming onto the field at a specific role. */
export interface LineupAddChange {
  playerId: PlayerId;
  role: RoleName;
}

/** Player leaving the field. The role is the role they currently occupy. */
export type LineupRemoveChange = LineupAddChange;

/** Player staying on the field but switching roles. */
export interface LineupMoveChange {
  playerId: PlayerId;
  fromRole: RoleName;
  toRole: RoleName;
}

/**
 * Compact representation of a scheduled sub for diff purposes.
 * `outPlayer` is omitted from drafts (computed lazily) but present on
 * stored ScheduledSub records — the diff shows the *current saved*
 * outPlayer for context where available.
 */
export interface SubDiffEntry {
  id: string;
  timeSeconds: number;
  positionRole: RoleName;
  inPlayer: PlayerId;
  outPlayer?: PlayerId;
}

export interface SubModifyChange {
  before: SubDiffEntry;
  after: SubDiffEntry;
}

export interface ApplyDiff {
  /** The game this diff is for. */
  gameId: string;
  /** True when there are no changes — the UI can hide this game from the preview. */
  isEmpty: boolean;
  lineupAdded: LineupAddChange[];
  lineupRemoved: LineupRemoveChange[];
  lineupMoved: LineupMoveChange[];
  subsAdded: SubDiffEntry[];
  subsRemoved: SubDiffEntry[];
  subsModified: SubModifyChange[];
}

const subDiffFromDraft = (s: DraftScheduledSub): SubDiffEntry => ({
  id: s.id,
  timeSeconds: s.timeSeconds,
  positionRole: s.positionRole,
  inPlayer: s.inPlayer,
});

const subDiffFromSaved = (s: ScheduledSub): SubDiffEntry => ({
  id: s.id,
  timeSeconds: s.timeSeconds,
  positionRole: s.positionRole,
  inPlayer: s.inPlayer,
  outPlayer: s.outPlayer,
});

const subsDiffer = (a: SubDiffEntry, b: SubDiffEntry): boolean =>
  a.timeSeconds !== b.timeSeconds ||
  a.positionRole !== b.positionRole ||
  a.inPlayer !== b.inPlayer;

/**
 * Compute the per-game diff between the saved game and the draft.
 *
 * Lineup logic:
 * - Map each `game.playersOnField` entry to a role via `roleForCoord`
 *   on the (possibly different) draft preset. Off-formation players
 *   (drift, legacy data) fall through to no-role and are treated as
 *   "removed" if they're not in the draft's startingXI.
 * - Compare role→player maps; surface added / removed / moved entries.
 *
 * Scheduled subs logic:
 * - Match by id. Added = in draft, not in game. Removed = in game, not
 *   in draft. Modified = same id but different fields (excluding
 *   computed outPlayer; the draft doesn't carry it).
 */
export function computeApplyDiff(
  gameId: string,
  game: AppState,
  draft: PlanDraft,
  preset: FormationPreset,
): ApplyDiff {
  // Build the current role→player map from playersOnField + preset coords.
  const currentByRole = new Map<RoleName, PlayerId>();
  for (const p of game.playersOnField ?? []) {
    if (!p.id) continue;
    const role = roleForCoord(preset, p.relX ?? 0.5, p.relY ?? 0.5);
    if (role && !currentByRole.has(role.name)) {
      currentByRole.set(role.name, p.id);
    }
  }

  const draftByRole = new Map<RoleName, PlayerId>(
    Object.entries(draft.startingXI),
  );

  const currentRolesByPlayer = new Map<PlayerId, RoleName>();
  for (const [role, pid] of currentByRole) currentRolesByPlayer.set(pid, role);
  const draftRolesByPlayer = new Map<PlayerId, RoleName>();
  for (const [role, pid] of draftByRole) draftRolesByPlayer.set(pid, role);

  const lineupAdded: LineupAddChange[] = [];
  const lineupMoved: LineupMoveChange[] = [];
  const lineupRemoved: LineupRemoveChange[] = [];

  // Players in the draft: either added (not on field) or moved
  // (different role from current).
  for (const [role, pid] of draftByRole) {
    const currentRole = currentRolesByPlayer.get(pid);
    if (!currentRole) {
      lineupAdded.push({ playerId: pid, role });
    } else if (currentRole !== role) {
      lineupMoved.push({ playerId: pid, fromRole: currentRole, toRole: role });
    }
  }
  // Players currently on the field but not in the draft → removed.
  for (const [role, pid] of currentByRole) {
    if (!draftRolesByPlayer.has(pid)) {
      lineupRemoved.push({ playerId: pid, role });
    }
  }

  // Scheduled-sub diff by id.
  const draftSubsById = new Map<string, DraftScheduledSub>();
  for (const s of draft.scheduledSubs) draftSubsById.set(s.id, s);
  const savedSubsById = new Map<string, ScheduledSub>();
  for (const s of game.scheduledSubs ?? []) savedSubsById.set(s.id, s);

  const subsAdded: SubDiffEntry[] = [];
  const subsModified: SubModifyChange[] = [];
  const subsRemoved: SubDiffEntry[] = [];

  for (const [id, drafted] of draftSubsById) {
    const saved = savedSubsById.get(id);
    if (!saved) {
      subsAdded.push(subDiffFromDraft(drafted));
      continue;
    }
    const before = subDiffFromSaved(saved);
    const after = subDiffFromDraft(drafted);
    if (subsDiffer(before, after)) {
      subsModified.push({ before, after });
    }
  }
  for (const [id, saved] of savedSubsById) {
    if (!draftSubsById.has(id)) {
      subsRemoved.push(subDiffFromSaved(saved));
    }
  }

  const isEmpty =
    lineupAdded.length === 0 &&
    lineupRemoved.length === 0 &&
    lineupMoved.length === 0 &&
    subsAdded.length === 0 &&
    subsRemoved.length === 0 &&
    subsModified.length === 0;

  return {
    gameId,
    isEmpty,
    lineupAdded,
    lineupRemoved,
    lineupMoved,
    subsAdded,
    subsRemoved,
    subsModified,
  };
}

/**
 * Total count of changes across all categories. Used by the preview UI
 * to show a per-game count badge ("3 changes") and to decide whether
 * the game's section can be collapsed.
 */
export function countDiffChanges(diff: ApplyDiff): number {
  return (
    diff.lineupAdded.length +
    diff.lineupRemoved.length +
    diff.lineupMoved.length +
    diff.subsAdded.length +
    diff.subsRemoved.length +
    diff.subsModified.length
  );
}
