/** Per-player on-field time computation for a PlanDraft. Pure. */

import type { DraftScheduledSub, PlanDraft, PlayerId, RoleName } from './planSwapEngine';

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
 * Total on-field seconds per player. Subs outside [0, gameDurationSec]
 * are clamped; bench players never subbed in are excluded from the map.
 *
 * Counts the UNION of a player's intervals across all roles, not the
 * sum: validation prevents within-role duplicates and (in==out) within
 * a single sub, but does not prevent a sub bringing in a player who is
 * already on-field at another role. Summing per-role would
 * double-count that overlap (e.g. sub puts p1 into GK while p1 is
 * still starting at LB). For well-formed drafts the two approaches
 * agree; for malformed ones the union is the correct on-field time.
 */
export function computePlayerSeconds(
  draft: PlanDraft,
  gameDurationSec: number,
): Map<PlayerId, number> {
  const totals = new Map<PlayerId, number>();
  if (gameDurationSec <= 0) return totals;

  const intervals = new Map<PlayerId, Array<[number, number]>>();
  const pushInterval = (player: PlayerId, start: number, end: number) => {
    if (!player || end <= start) return;
    const list = intervals.get(player) ?? [];
    list.push([start, end]);
    intervals.set(player, list);
  };

  const grouped = subsByRole(draft.scheduledSubs);
  for (const [roleName, startingPlayer] of Object.entries(draft.startingXI)) {
    const roleSubs = grouped.get(roleName) ?? [];
    let curPlayer: PlayerId = startingPlayer;
    let curStart = 0;
    for (const sub of roleSubs) {
      const t = Math.max(0, Math.min(gameDurationSec, sub.timeSeconds));
      pushInterval(curPlayer, curStart, t);
      curPlayer = sub.inPlayer;
      curStart = t;
    }
    pushInterval(curPlayer, curStart, gameDurationSec);
  }

  // Merge each player's intervals — they may overlap across roles in
  // malformed drafts — and sum the union.
  for (const [playerId, segs] of intervals) {
    segs.sort((a, b) => a[0] - b[0]);
    let total = 0;
    let mergeStart = segs[0][0];
    let mergeEnd = segs[0][1];
    for (let i = 1; i < segs.length; i++) {
      const [s, e] = segs[i];
      if (s <= mergeEnd) {
        if (e > mergeEnd) mergeEnd = e;
      } else {
        total += mergeEnd - mergeStart;
        mergeStart = s;
        mergeEnd = e;
      }
    }
    total += mergeEnd - mergeStart;
    totals.set(playerId, total);
  }
  return totals;
}

/** Per-role contiguous timeline segments covering [0, gameDurationSec). */
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
