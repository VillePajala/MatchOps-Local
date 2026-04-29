/**
 * Per-player on-field time computation for a PlanDraft.
 *
 * Walks each role's timeline (starting XI + scheduled subs) and sums
 * the seconds each player spends on the field. Mirrors the standalone
 * planner's `getCellSegments` model: between subs at the same role, a
 * single player occupies the slot; the role's first occupant comes
 * from `startingXI`, and each sub at that role hands the slot to its
 * `inPlayer`.
 *
 * Pure. Roster members not assigned to any role and never subbed in
 * report 0 seconds.
 */

import type { DraftScheduledSub, PlanDraft, PlayerId, RoleName } from './planSwapEngine';

/**
 * Group scheduled subs by role and sort each group ascending by time.
 * Stable across calls; safe to use in render paths.
 */
function subsByRole(
  subs: readonly DraftScheduledSub[],
): Map<RoleName, DraftScheduledSub[]> {
  const out = new Map<RoleName, DraftScheduledSub[]>();
  for (const s of subs) {
    const list = out.get(s.positionRole) ?? [];
    list.push(s);
    out.set(s.positionRole, list);
  }
  for (const list of out.values()) {
    list.sort((a, b) => a.timeSeconds - b.timeSeconds);
  }
  return out;
}

/**
 * Compute the total on-field time (in seconds) for every player
 * referenced by the draft, given the game's total duration.
 *
 * The returned map includes players in `startingXI` and players who
 * appear as a sub's `inPlayer`. Bench players never subbed in are
 * excluded; the caller is responsible for adding them with `0` if
 * they want a roster-complete report.
 *
 * Subs whose time is outside `[0, gameDurationSec]` are clamped to the
 * range — a sub at -10s acts as if it fired at 0; a sub past the end
 * yields zero seconds for the inPlayer at that role.
 *
 * Subs at the same time on the same role: the engine's contract says
 * timeSeconds determines order; ties are broken by array order. The
 * editor doesn't allow exact ties via the UI but the helper handles
 * them deterministically.
 */
export function computePlayerMinutes(
  draft: PlanDraft,
  gameDurationSec: number,
): Map<PlayerId, number> {
  const totals = new Map<PlayerId, number>();
  if (gameDurationSec <= 0) return totals;

  const grouped = subsByRole(draft.scheduledSubs);
  for (const [roleName, startingPlayer] of Object.entries(draft.startingXI)) {
    const roleSubs = grouped.get(roleName) ?? [];
    let curPlayer: PlayerId = startingPlayer;
    let curStart = 0;
    for (const sub of roleSubs) {
      const t = Math.max(0, Math.min(gameDurationSec, sub.timeSeconds));
      if (t > curStart && curPlayer) {
        totals.set(curPlayer, (totals.get(curPlayer) ?? 0) + (t - curStart));
      }
      curPlayer = sub.inPlayer;
      curStart = t;
    }
    if (gameDurationSec > curStart && curPlayer) {
      totals.set(
        curPlayer,
        (totals.get(curPlayer) ?? 0) + (gameDurationSec - curStart),
      );
    }
  }
  return totals;
}

/**
 * Per-role timeline segments for rendering.
 *
 * For each role: a contiguous list of `{ startSec, endSec, playerId }`
 * tuples covering `[0, gameDurationSec)`. Empty roles (not present in
 * `startingXI`) are excluded; the caller can render them as a single
 * dashed segment if desired.
 */
export interface RoleSegment {
  startSec: number;
  endSec: number;
  playerId: PlayerId;
}

export function getRoleSegments(
  draft: PlanDraft,
  roleName: RoleName,
  gameDurationSec: number,
): RoleSegment[] {
  if (gameDurationSec <= 0) return [];
  const startingPlayer = draft.startingXI[roleName];
  if (!startingPlayer) return [];
  const roleSubs = subsByRole(draft.scheduledSubs).get(roleName) ?? [];
  const segs: RoleSegment[] = [];
  let curPlayer = startingPlayer;
  let curStart = 0;
  for (const sub of roleSubs) {
    const t = Math.max(0, Math.min(gameDurationSec, sub.timeSeconds));
    if (t > curStart) {
      segs.push({ startSec: curStart, endSec: t, playerId: curPlayer });
    }
    curPlayer = sub.inPlayer;
    curStart = t;
  }
  if (gameDurationSec > curStart) {
    segs.push({ startSec: curStart, endSec: gameDurationSec, playerId: curPlayer });
  }
  return segs;
}
