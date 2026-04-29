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
 */
export function computePlayerSeconds(
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
