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

/**
 * Player leaving the field. `role` is undefined when the player was on
 * the field with off-formation coords (legacy data, coord drift) — the
 * preview UI should render that case explicitly so the user understands
 * the player is being removed even though they had no recognized role.
 */
export interface LineupRemoveChange {
  playerId: PlayerId;
  role?: RoleName;
}

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

/**
 * The `after` half of a sub modification comes from a DraftScheduledSub,
 * which never carries `outPlayer` (it's recomputed lazily at apply time).
 * Encoding that asymmetry in the type prevents the preview UI from
 * rendering an undefined outPlayer as if it were a real value.
 */
export interface SubModifyChange {
  before: SubDiffEntry;
  after: Omit<SubDiffEntry, 'outPlayer'>;
}

export interface ApplyDiff {
  /** The game this diff is for. */
  gameId: string;
  /** True when there are no changes — the UI can hide this game from the preview. */
  isEmpty: boolean;
  lineupAdded: LineupAddChange[];
  lineupRemoved: LineupRemoveChange[];
  lineupMoved: LineupMoveChange[];
  /**
   * Drafts never carry outPlayer (computed lazily at apply time), so
   * the type drops it explicitly — same modeling as
   * SubModifyChange.after.
   */
  subsAdded: Omit<SubDiffEntry, 'outPlayer'>[];
  subsRemoved: SubDiffEntry[];
  subsModified: SubModifyChange[];
}

const subDiffFromDraft = (
  s: DraftScheduledSub,
): Omit<SubDiffEntry, 'outPlayer'> => ({
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

// Second param is the draft side which never carries outPlayer (drafts
// compute it lazily). Encoding the asymmetry in the type makes the
// outPlayer omission visible at the signature, not just in the comment.
const subsDiffer = (
  a: SubDiffEntry,
  b: Omit<SubDiffEntry, 'outPlayer'>,
): boolean =>
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
  // Track every on-field player id, regardless of whether their coords
  // map to a recognized preset role. Off-formation players (legacy
  // coord drift) would otherwise be silently dropped from the diff and
  // Apply would still remove them — defeating the preview's safety
  // purpose. Mapped players also get a role recorded for display.
  const onFieldPlayerIds = new Set<PlayerId>();
  const currentRolesByPlayer = new Map<PlayerId, RoleName>();
  const occupiedRoles = new Set<RoleName>();
  for (const p of game.playersOnField ?? []) {
    if (!p.id) continue;
    if (onFieldPlayerIds.has(p.id)) continue;
    onFieldPlayerIds.add(p.id);
    // Skip the role lookup entirely when coords are missing — defaulting
    // to (0.5, 0.5) would snap malformed players onto whatever role is
    // closest to center, defeating the off-formation safety path. The
    // player still appears in onFieldPlayerIds → surfaces as removed
    // with role=undefined when not in the draft.
    const role =
      p.relX != null && p.relY != null
        ? roleForCoord(preset, p.relX, p.relY)
        : null;
    if (role && !occupiedRoles.has(role.name)) {
      occupiedRoles.add(role.name);
      currentRolesByPlayer.set(p.id, role.name);
    }
    // Off-formation players land in onFieldPlayerIds without a role;
    // the removed-loop below renders role=undefined for them.
  }

  const draftByRole = new Map<RoleName, PlayerId>(
    Object.entries(draft.startingXI),
  );
  const draftRolesByPlayer = new Map<PlayerId, RoleName>();
  for (const [role, pid] of draftByRole) draftRolesByPlayer.set(pid, role);

  const lineupAdded: LineupAddChange[] = [];
  const lineupMoved: LineupMoveChange[] = [];
  const lineupRemoved: LineupRemoveChange[] = [];

  // Players in the draft: either added (no recognized current role —
  // either not on field, or off-formation) or moved (different role).
  // TODO: disambiguate the off-formation→role case as "Assigned to
  // LB (was off-formation)" rather than "Added at LB" when the player
  // is already on the field with drifted coords.
  for (const [role, pid] of draftByRole) {
    const currentRole = currentRolesByPlayer.get(pid);
    if (!currentRole) {
      lineupAdded.push({ playerId: pid, role });
    } else if (currentRole !== role) {
      lineupMoved.push({ playerId: pid, fromRole: currentRole, toRole: role });
    }
  }
  // Players on the field but missing from the draft → removed (going to
  // bench). Iterates the full on-field set so off-formation players
  // surface here too. Role may be undefined for off-formation entries.
  for (const pid of onFieldPlayerIds) {
    if (!draftRolesByPlayer.has(pid)) {
      lineupRemoved.push({ playerId: pid, role: currentRolesByPlayer.get(pid) });
    }
  }

  // Scheduled-sub diff by id. Filter saved subs to `pending` only —
  // `fired`/`skipped` are historical events that already played out
  // during the live game and can't be undone by Apply. Including them
  // would cause the preview to surface "removed" entries the user
  // can't actually act on (and that Apply's underlying transform
  // wouldn't reverse).
  const draftSubsById = new Map<string, DraftScheduledSub>();
  for (const s of draft.scheduledSubs) draftSubsById.set(s.id, s);
  const savedSubsById = new Map<string, ScheduledSub>();
  for (const s of game.scheduledSubs ?? []) {
    if (s.status === 'pending') savedSubsById.set(s.id, s);
  }

  const subsAdded: Omit<SubDiffEntry, 'outPlayer'>[] = [];
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

  // Derived via countDiffChanges (defined below) so a future category
  // added to ApplyDiff doesn't silently leave isEmpty stale.
  const partial = {
    gameId,
    lineupAdded,
    lineupRemoved,
    lineupMoved,
    subsAdded,
    subsRemoved,
    subsModified,
    isEmpty: false,
  };
  return { ...partial, isEmpty: countDiffChanges(partial) === 0 };
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
