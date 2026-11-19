/**
 * "Ketkä ovat paikalla?" - who is here for one game (Onboarding v3, step 7).
 *
 * One sheet for every coach: the game's players as ticked name chips; the coach
 * taps the absent ones. What saving does depends on the game:
 *
 *  - A game made from a plan (it has a plan link and the plan still exists):
 *    the absentees are marked absent for THIS game in the plan (`absentIds`,
 *    the same field the planner's own per-game absences use), the planner's
 *    suggestion is re-run for this game, and the plan is re-applied to the game
 *    (line-up + squad + planned subs). An absent player is out of the game's
 *    squad, so the game does not count as played for them.
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
import { suggestFairShareLineup } from '@/utils/playtimePlanner/suggest';
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
       * The game's line-up differs from what the plan would put there - the
       * coach moved discs by hand since the plan was applied. Saving a change
       * redoes the line-up, so the sheet warns first.
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

/** A comparable fingerprint of a line-up: who is on the pitch where, and who is in the squad. */
function lineupSignature(lineup: Pick<AppState, 'playersOnField' | 'selectedPlayerIds'>): string {
  const field = (lineup.playersOnField ?? [])
    .map((p) => `${p.id}@${pos(p.relX)},${pos(p.relY)}`)
    .sort()
    .join('|');
  const squad = [...(lineup.selectedPlayerIds ?? [])].sort().join(',');
  return `${field}#${squad}`;
}

/**
 * Whether the game's line-up still is what the plan puts there. False means
 * the coach changed it by hand after the plan was applied.
 */
export function lineupMatchesPlan(
  game: AppState,
  plan: PlaytimePlan,
  planGame: PlanGame,
  masterRoster: Player[],
): boolean {
  const expected = buildReapplyPatch(game, plan, planGame, masterRoster);
  if (!expected.ok || !expected.patch) return true; // nothing to compare against - nothing to lose
  return lineupSignature(game) === lineupSignature(expected.patch);
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

/**
 * The plan with `absentIds` set for one game and a fresh suggestion for THAT
 * game only. Absentees leave their starting places and incoming subs first
 * (the planner's own toggle does the same), then the suggestion fills the game
 * from the attending players. Every other game of the plan is left exactly as
 * it was - in a multi-game plan the coach may have tuned them by hand.
 */
export function planWithAbsences(plan: PlaytimePlan, planGameId: string, absentIds: string[]): PlaytimePlan {
  const absent = new Set(absentIds);
  const marked: PlaytimePlan = {
    ...plan,
    games: plan.games.map((g) =>
      g.id !== planGameId
        ? g
        : {
            ...g,
            absentIds: [...absent],
            startingSlots: g.startingSlots.map((s) => (s.playerId && absent.has(s.playerId) ? { ...s, playerId: null } : s)),
            subs: g.subs.filter((sub) => !sub.inPlayerId || !absent.has(sub.inPlayerId)),
          },
    ),
  };
  const suggested = suggestFairShareLineup(marked);
  const fresh = suggested.games.find((g) => g.id === planGameId);
  return {
    ...marked,
    games: marked.games.map((g) => (g.id === planGameId && fresh ? fresh : g)),
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
