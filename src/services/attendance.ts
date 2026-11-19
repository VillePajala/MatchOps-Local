/**
 * "Ketkä ovat paikalla?" - who is here for one game (Onboarding v3, step 7).
 *
 * One sheet for every coach: the game's players as ticked name chips; the coach
 * taps the absent ones. What saving does depends on the game:
 *
 *  - A game made from a plan (it has a plan link and the plan still exists):
 *    the absentees are marked absent for THIS game in the plan (`absentIds`,
 *    the same field the planner's own per-game absences use). The coach's plan
 *    for the game is KEPT (keeper, swaps, positions, sub timing); only the
 *    absent players' stretches are filled from the attending players
 *    (`planWithAbsences`). The plan is then re-applied to the game (line-up +
 *    squad + planned subs). An absent player is out of the game's squad, so the
 *    game does not count as played for them.
 *  - Any other game: the squad (`selectedPlayerIds`) becomes the present
 *    players and absent players leave the pitch.
 *
 * Only before kick-off: a game whose clock has started, or that has any play
 * event, is never touched (the planner's own re-apply rule, `isGamePlayed`).
 *
 * Nothing here is UI; storage is injected so the order of writes and every
 * refusal are unit-tested without a DataStore.
 */

import type { AppState, Player } from '@/types';
import type { PlaytimePlan, PlanGame } from '@/utils/playtimePlanner/types';
import type { PlanLink } from '@/utils/playtimePlanner/planLinks';
import type { PlannedGameSub } from '@/utils/playtimePlanner/gameSubs';
import { buildReapplyPatch, isGamePlayed } from '@/utils/playtimePlanner/reapply';
import { ensureStartingSlots, getGameSlots } from '@/utils/playtimePlanner/lineup';
import { toEngineGame } from '@/utils/playtimePlanner/adapter';
import { computeSlotSegments, type SlotSegment } from '@/utils/playtimePlanner/minutes';
import { generateSubId } from '@/utils/playtimePlanner/subs';
import { gameTotalSeconds } from '@/utils/playtimePlanner/types';
import { syncPairedGame } from '@/services/nextGamePair';

export interface AttendancePlayer {
  id: string;
  /** What the chip shows: the nickname (the disc label) or the name. */
  label: string;
}

interface AttendanceBase {
  gameId: string;
  /** Everyone the sheet lists, in squad order. */
  players: AttendancePlayer[];
  /** Ticked when the sheet opens. */
  presentIds: string[];
}

export type AttendanceContext =
  /** The game has kicked off: the sheet only says so. */
  | (AttendanceBase & { kind: 'started' })
  /** A game made from a plan that still exists. */
  | (AttendanceBase & {
      kind: 'plan';
      plan: PlaytimePlan;
      planGameId: string;
      /**
       * The pitch differs from what the plan would put there - the coach moved
       * discs by hand since the plan was applied. Saving a change re-applies
       * the plan to the pitch, so the sheet warns first.
       */
      handEdited: boolean;
    })
  /** A game with no plan: attendance is just the squad. */
  | (AttendanceBase & { kind: 'squad' });

export interface AttendanceDeps {
  getGame: (gameId: string) => Promise<AppState | null>;
  saveGame: (gameId: string, game: AppState) => Promise<AppState>;
  getPlanLink: (gameId: string) => Promise<PlanLink | null>;
  getPlan: (planId: string) => Promise<PlaytimePlan | null>;
  savePlan: (plan: PlaytimePlan) => Promise<PlaytimePlan | null>;
  getMasterRoster: () => Promise<Player[]>;
  setGameSubs: (gameId: string, subs: PlannedGameSub[]) => Promise<boolean>;
}

export type AttendanceSaveResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: 'started' | 'missing' | 'failed' };

const chipLabel = (p: Pick<Player, 'name' | 'nickname'>): string => p.nickname?.trim() || p.name;

/** Positions are compared to three decimals: a disc nudged by a hand counts, float noise does not. */
const pos = (n: number | undefined): string => (typeof n === 'number' ? n.toFixed(3) : '-');

/** A comparable fingerprint of the pitch: who stands where (starters and parked subs). */
function fieldSignature(field: AppState['playersOnField'] | undefined): string {
  return (field ?? [])
    .map((p) => `${p.id}@${pos(p.relX)},${pos(p.relY)}`)
    .sort()
    .join('|');
}

/**
 * Whether the game's pitch still is what the plan puts there. False means the
 * coach moved players on the pitch by hand after the plan was applied, and
 * re-applying the plan would overwrite that. Only the pitch counts: the squad
 * follows the plan's attendance anyway.
 */
export function lineupMatchesPlan(
  game: AppState,
  plan: PlaytimePlan,
  planGame: PlanGame,
  masterRoster: Player[],
): boolean {
  const expected = buildReapplyPatch(game, plan, planGame, masterRoster);
  if (!expected.ok || !expected.patch) return true; // nothing to compare against - nothing to lose
  return fieldSignature(game.playersOnField) === fieldSignature(expected.patch.playersOnField);
}

/** What the sheet shows for a game, or null when the game does not exist. */
export async function loadAttendance(deps: AttendanceDeps, gameId: string): Promise<AttendanceContext | null> {
  const game = await deps.getGame(gameId);
  if (!game) return null;

  const link = await deps.getPlanLink(gameId);
  const plan = link ? await deps.getPlan(link.planId) : null;
  const planGame = plan?.games.find((g) => g.id === link?.planGameId) ?? null;

  if (plan && planGame && link) {
    const roster = await deps.getMasterRoster();
    const known = new Map<string, Pick<Player, 'name' | 'nickname'>>([
      ...roster.map((p) => [p.id, p] as const),
      ...(game.availablePlayers ?? []).map((p) => [p.id, p] as const),
    ]);
    const players = plan.players.map((p) => ({ id: p.id, label: chipLabel(known.get(p.id) ?? { name: p.name }) }));
    const absent = new Set(planGame.absentIds ?? []);
    const base = { gameId, players, presentIds: plan.players.map((p) => p.id).filter((id) => !absent.has(id)) };
    if (isGamePlayed(game)) return { ...base, kind: 'started' };
    return {
      ...base,
      kind: 'plan',
      plan,
      planGameId: planGame.id,
      handEdited: !lineupMatchesPlan(game, plan, planGame, roster),
    };
  }

  const players = (game.availablePlayers ?? []).map((p) => ({ id: p.id, label: chipLabel(p) }));
  const selected = new Set(game.selectedPlayerIds ?? []);
  const base = { gameId, players, presentIds: players.map((p) => p.id).filter((id) => selected.has(id)) };
  return isGamePlayed(game) ? { ...base, kind: 'started' } : { ...base, kind: 'squad' };
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
};

/** Whether `presentIds` differs from what the sheet opened with. */
export function attendanceChanged(ctx: AttendanceContext, presentIds: readonly string[]): boolean {
  return !sameSet(ctx.presentIds, presentIds);
}

/** A stretch of one slot that nobody holds because its player is not coming. */
type Hole = { kind: 'start'; slotId: string } | { kind: 'sub'; subId: string };

const holeTime = (game: PlanGame, hole: Hole): number =>
  hole.kind === 'start' ? 0 : (game.subs.find((s) => s.id === hole.subId)?.timeSeconds ?? Number.POSITIVE_INFINITY);

/** Every on-pitch stretch of the game, slot by slot (the minutes engine's own walk). */
function gameSegments(game: PlanGame): SlotSegment[] {
  const engine = toEngineGame(game);
  return engine.slots.flatMap((slot) => computeSlotSegments(engine, slot.slotId));
}

/**
 * Fill one hole from the attending players: whoever is off the pitch when it
 * opens. Someone who can cover the whole stretch beats a partial cover, then
 * the fewest minutes in this game (an unused bench player has none, so the
 * bench goes first), then roster order. A partial cover leaves the rest of the
 * stretch as a new hole (a planned change at the moment the cover has to go
 * elsewhere). Returns the game and that follow-up hole, if any.
 */
function fillHole(
  game: PlanGame,
  hole: Hole,
  candidates: readonly string[],
): { game: PlanGame; next: Hole | null } {
  const total = gameTotalSeconds(game);
  const slotId = hole.kind === 'start' ? hole.slotId : game.subs.find((s) => s.id === hole.subId)?.slotId;
  const at = holeTime(game, hole);
  if (!slotId || !(at < total)) {
    // A planned change at or after full time brings nobody on - drop it.
    return { game: hole.kind === 'sub' ? { ...game, subs: game.subs.filter((s) => s.id !== hole.subId) } : game, next: null };
  }

  const segments = gameSegments(game);
  const stretch = segments.find((seg) => seg.slotId === slotId && seg.startSeconds === at && seg.playerId === null);
  const end = stretch?.endSeconds ?? total;
  // Who held the slot just before the hole (they could simply stay on).
  const previous = segments.find((seg) => seg.slotId === slotId && seg.endSeconds === at)?.playerId ?? null;

  const ranked = candidates
    .map((id, order) => {
      const own = segments.filter((seg) => seg.playerId === id);
      if (own.some((seg) => seg.startSeconds <= at && at < seg.endSeconds)) return null; // on the pitch already
      const nextOn = own.filter((seg) => seg.startSeconds > at).reduce((m, seg) => Math.min(m, seg.startSeconds), total);
      const until = Math.min(end, nextOn);
      if (until <= at) return null;
      const minutes = own.reduce((sum, seg) => sum + (seg.endSeconds - seg.startSeconds), 0);
      return { id, order, until, full: until >= end, minutes };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort(
      (a, b) =>
        Number(b.full) - Number(a.full) ||
        (a.full ? 0 : b.until - a.until) ||
        a.minutes - b.minutes ||
        a.order - b.order,
    );
  const pick = ranked[0];
  // Nobody is free: the slot stays empty for that stretch (more absentees than
  // the squad can cover).
  if (!pick) return { game, next: null };

  let filled: PlanGame;
  if (hole.kind === 'start') {
    filled = {
      ...game,
      startingSlots: game.startingSlots.map((s) => (s.slotId === slotId ? { ...s, playerId: pick.id } : s)),
    };
  } else if (pick.id === previous) {
    // The player already there just stays on: the change is not needed.
    filled = { ...game, subs: game.subs.filter((s) => s.id !== hole.subId) };
  } else {
    filled = { ...game, subs: game.subs.map((s) => (s.id === hole.subId ? { ...s, inPlayerId: pick.id } : s)) };
  }

  if (pick.full) return { game: filled, next: null };
  // The cover has to go elsewhere at `until`: the rest of the stretch is a new hole.
  const gap = { id: generateSubId(), slotId, timeSeconds: pick.until, inPlayerId: null };
  return { game: { ...filled, subs: [...filled.subs, gap] }, next: { kind: 'sub', subId: gap.id } };
}

/**
 * A player coming back (marked present again) gets a share of the game again:
 * they take the second half of the longest outfield stretch of whoever plays
 * most in this game. One new planned change; nothing else moves.
 */
function giveTimeTo(game: PlanGame, playerId: string, order: readonly string[]): PlanGame {
  const segments = gameSegments(game);
  if (segments.some((seg) => seg.playerId === playerId)) return game;
  const goalie = new Set(getGameSlots(game.formationId).filter((s) => s.isGoalie).map((s) => s.slotId));
  const minutesOf = (id: string) =>
    segments.filter((seg) => seg.playerId === id).reduce((sum, seg) => sum + seg.endSeconds - seg.startSeconds, 0);
  const rank = (id: string) => order.indexOf(id);
  const donor = segments
    .filter((seg): seg is SlotSegment & { playerId: string } => seg.playerId !== null && !goalie.has(seg.slotId))
    .sort(
      (a, b) =>
        minutesOf(b.playerId) - minutesOf(a.playerId) ||
        rank(a.playerId) - rank(b.playerId) ||
        b.endSeconds - b.startSeconds - (a.endSeconds - a.startSeconds) ||
        a.startSeconds - b.startSeconds,
    )[0];
  if (!donor) return game;
  // Whole minutes, the way a coach says a change ("15'"), strictly inside the stretch.
  const mid = Math.round((donor.startSeconds + donor.endSeconds) / 2 / 60) * 60;
  const at = mid > donor.startSeconds && mid < donor.endSeconds ? mid : Math.round((donor.startSeconds + donor.endSeconds) / 2);
  if (!(at > donor.startSeconds && at < donor.endSeconds)) return game;
  return { ...game, subs: [...game.subs, { id: generateSubId(), slotId: donor.slotId, timeSeconds: at, inPlayerId: playerId }] };
}

/**
 * The plan with `absentIds` set for one game, KEEPING the coach's edits to it
 * (keeper, swaps, positions, sub timing). Only what an absentee was going to
 * do is redone: each stretch they would have played is handed to an attending
 * player who is off the pitch then - an unused bench player first, otherwise
 * whoever has the fewest minutes in this game. A player marked present again
 * takes half of one stretch from the most-played outfield player. Every other
 * game of the plan is left exactly as it was.
 */
export function planWithAbsences(plan: PlaytimePlan, planGameId: string, absentIds: string[]): PlaytimePlan {
  const absent = new Set(absentIds);
  const order = plan.players.map((p) => p.id);
  const attending = order.filter((id) => !absent.has(id));
  return {
    ...plan,
    games: plan.games.map((g) => {
      if (g.id !== planGameId) return g;
      const wasAbsent = new Set(g.absentIds ?? []);
      const holes: Hole[] = [];
      let game: PlanGame = {
        ...g,
        absentIds: [...absent],
        startingSlots: ensureStartingSlots(g).map((s) => {
          if (!s.playerId || !absent.has(s.playerId)) return s;
          holes.push({ kind: 'start', slotId: s.slotId });
          return { ...s, playerId: null };
        }),
        subs: g.subs.map((sub) => {
          if (!sub.inPlayerId || !absent.has(sub.inPlayerId)) return sub;
          holes.push({ kind: 'sub', subId: sub.id });
          return { ...sub, inPlayerId: null };
        }),
      };
      // Earliest first, so a later stretch sees who an earlier fill put on.
      const queue = [...holes].sort((a, b) => holeTime(game, a) - holeTime(game, b));
      // Bounded: each pass fills a hole or ends it; a partial cover only ever
      // moves the hole later, at most once per planned moment per player.
      let guard = 1000;
      while (queue.length > 0 && guard-- > 0) {
        const hole = queue.shift()!;
        const { game: filled, next } = fillHole(game, hole, attending);
        game = filled;
        if (next) {
          queue.push(next);
          queue.sort((a, b) => holeTime(game, a) - holeTime(game, b));
        }
      }
      for (const id of attending) {
        if (wasAbsent.has(id)) game = giveTimeTo(game, id, order);
      }
      return game;
    }),
  };
}

/**
 * Save the attendance. Re-reads the game first: the sheet may have been open
 * while the clock started on another screen, and the refusal must hold then too.
 */
export async function saveAttendance(
  deps: AttendanceDeps,
  ctx: AttendanceContext,
  presentIds: readonly string[],
): Promise<AttendanceSaveResult> {
  if (ctx.kind === 'started') return { ok: false, reason: 'started' };
  if (!attendanceChanged(ctx, presentIds)) return { ok: true, changed: false };

  const game = await deps.getGame(ctx.gameId);
  if (!game) return { ok: false, reason: 'missing' };
  if (isGamePlayed(game)) return { ok: false, reason: 'started' };

  const present = new Set(presentIds);
  const absentIds = ctx.players.map((p) => p.id).filter((id) => !present.has(id));

  if (ctx.kind === 'plan') {
    const next = planWithAbsences(ctx.plan, ctx.planGameId, absentIds);
    const result = await syncPairedGame(
      {
        savePlan: deps.savePlan,
        getGame: deps.getGame,
        saveGame: deps.saveGame,
        getPlanLink: deps.getPlanLink,
        getMasterRoster: deps.getMasterRoster,
        setGameSubs: deps.setGameSubs,
      },
      next,
      ctx.gameId,
    );
    if (result.applied) return { ok: true, changed: true };
    return { ok: false, reason: result.reason === 'played' ? 'started' : 'failed' };
  }

  // No plan: the squad is who is here, and nobody absent stays on the pitch
  // (playersOnField ⊆ selectedPlayerIds ⊆ availablePlayers, Rule 3).
  const available = new Set((game.availablePlayers ?? []).map((p) => p.id));
  await deps.saveGame(ctx.gameId, {
    ...game,
    selectedPlayerIds: [...present].filter((id) => available.has(id)),
    playersOnField: (game.playersOnField ?? []).filter((p) => present.has(p.id)),
  });
  return { ok: true, changed: true };
}
