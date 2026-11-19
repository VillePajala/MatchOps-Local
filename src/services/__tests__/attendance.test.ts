/**
 * "Ketkä ovat paikalla?" (Onboarding v3): marking a player absent before
 * kick-off updates the plan (absentIds + a fresh suggestion) and the game
 * (squad + line-up); a started game is never touched; a line-up edited by hand
 * is detected so the sheet can warn before it is redone.
 * @critical
 */
import {
  attendanceChanged,
  lineupMatchesPlan,
  loadAttendance,
  planWithAbsences,
  saveAttendance,
  type AttendanceDeps,
} from '../attendance';
import { buildFirstPlan, type NextGamePairInput } from '../nextGamePair';
import { buildReapplyPatch } from '@/utils/playtimePlanner/reapply';
import { ensureStartingSlots } from '@/utils/playtimePlanner/lineup';
import { TestFixtures } from '../../../tests/fixtures';
import type { PlaytimePlan } from '@/utils/playtimePlanner/types';
import type { PlannedGameSub } from '@/utils/playtimePlanner/gameSubs';
import type { AppState, Player } from '@/types';

jest.mock('@/utils/logger', () => {
  const log = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() };
  return { __esModule: true, default: log, createLogger: () => log };
});
jest.mock('@/datastore/factory', () => ({ getDataStore: jest.fn() }));

const NAMES = ['Onni', 'Toivo', 'Aatos', 'Otso', 'Aapo', 'Elias', 'Leevi', 'Eeli', 'Eino', 'Niilo', 'Veeti', 'Leo', 'Väinö', 'Oliver'];
const squad: Player[] = NAMES.map((name, i) => ({ id: `p${i + 1}`, name }));
const GAME_ID = 'game-1';

const input: NextGamePairInput = {
  team: { id: 'team-1', name: 'MePa P12' },
  players: squad,
  fieldSize: '8v8',
  gameType: 'soccer',
  ageGroup: 'U12',
  numberOfPeriods: 2,
  periodMinutes: 25,
  gameDate: '2026-11-22',
  opponentName: 'Rantakylän FC',
};

/** An in-memory store holding one game made from a one-game plan, lined up from it. */
function setup(opts: { withPlan?: boolean } = {}) {
  const withPlan = opts.withPlan ?? true;
  const plan = buildFirstPlan(input);
  const base = TestFixtures.games.newGame({
    teamName: 'MePa P12',
    opponentName: 'Rantakylän FC',
    availablePlayers: squad,
    selectedPlayerIds: squad.map((p) => p.id),
    playersOnField: [],
    gameEvents: [],
  }) as AppState;
  // Line the game up exactly as the plan does (what creation/re-apply write).
  const patch = buildReapplyPatch(base, plan, plan.games[0], squad).patch!;
  const games = new Map<string, AppState>([[GAME_ID, { ...base, ...patch }]]);
  const plans = new Map<string, PlaytimePlan>([[plan.id, plan]]);
  const subs = new Map<string, PlannedGameSub[]>();
  const deps: AttendanceDeps = {
    getGame: jest.fn(async (id) => games.get(id) ?? null),
    saveGame: jest.fn(async (id, g) => {
      games.set(id, g);
      return g;
    }),
    getPlanLink: jest.fn(async (id) =>
      withPlan && id === GAME_ID ? { planId: plan.id, planGameId: plan.games[0].id } : null,
    ),
    getPlan: jest.fn(async (id) => plans.get(id) ?? null),
    savePlan: jest.fn(async (p) => {
      plans.set(p.id, p);
      return p;
    }),
    getMasterRoster: jest.fn(async () => squad),
    setGameSubs: jest.fn(async (id, s) => {
      subs.set(id, s);
      return true;
    }),
  };
  return { plan, games, plans, subs, deps };
}

describe('loadAttendance', () => {
  it('lists the plan players, everyone present, for a game made from a plan', async () => {
    const { deps } = setup();
    const ctx = await loadAttendance(deps, GAME_ID);
    expect(ctx?.kind).toBe('plan');
    expect(ctx?.players.map((p) => p.label)).toEqual(NAMES);
    expect(ctx?.presentIds).toHaveLength(14);
    expect(ctx?.kind === 'plan' && ctx.handEdited).toBe(false);
  });

  /** @edge-case */
  it('detects a line-up moved by hand since the plan was applied', async () => {
    const { deps, games } = setup();
    const game = games.get(GAME_ID)!;
    const [first, ...rest] = game.playersOnField;
    games.set(GAME_ID, { ...game, playersOnField: [{ ...first, relX: (first.relX ?? 0) + 0.1 }, ...rest] });
    const ctx = await loadAttendance(deps, GAME_ID);
    expect(ctx?.kind === 'plan' && ctx.handEdited).toBe(true);
  });

  it('reports a started game (clock run or a goal) as started', async () => {
    const { deps, games } = setup();
    games.set(GAME_ID, { ...games.get(GAME_ID)!, gameStatus: 'inProgress' });
    expect((await loadAttendance(deps, GAME_ID))?.kind).toBe('started');
  });

  it('uses the squad for a game with no plan', async () => {
    const { deps, games } = setup({ withPlan: false });
    games.set(GAME_ID, { ...games.get(GAME_ID)!, selectedPlayerIds: ['p1', 'p2', 'p3'] });
    const ctx = await loadAttendance(deps, GAME_ID);
    expect(ctx?.kind).toBe('squad');
    expect(ctx?.presentIds).toEqual(['p1', 'p2', 'p3']);
  });

  it('is null for a game that does not exist', async () => {
    const { deps } = setup();
    expect(await loadAttendance(deps, 'nope')).toBeNull();
  });
});

describe('saveAttendance - a game made from a plan', () => {
  /** @critical */
  it('marks the absent player in the plan, re-suggests, and re-applies line-up + squad', async () => {
    const { deps, games, plans, plan, subs } = setup();
    const ctx = (await loadAttendance(deps, GAME_ID))!;
    const leo = 'p12';
    const present = ctx.presentIds.filter((id) => id !== leo);

    const result = await saveAttendance(deps, ctx, present);
    expect(result).toEqual({ ok: true, changed: true });

    const savedPlan = plans.get(plan.id)!;
    expect(savedPlan.games[0].absentIds).toEqual([leo]);
    // The suggestion was re-run: Leo neither starts nor comes on.
    expect(ensureStartingSlots(savedPlan.games[0]).some((s) => s.playerId === leo)).toBe(false);
    expect(savedPlan.games[0].subs.some((s) => s.inPlayerId === leo)).toBe(false);
    // Every attending player still has a place (start or sub).
    const placed = new Set([
      ...ensureStartingSlots(savedPlan.games[0]).map((s) => s.playerId),
      ...savedPlan.games[0].subs.map((s) => s.inPlayerId),
    ]);
    for (const id of present) expect(placed.has(id)).toBe(true);

    const game = games.get(GAME_ID)!;
    // Out of the squad, so the game does not count as played for him.
    expect(game.selectedPlayerIds).not.toContain(leo);
    expect(game.playersOnField.some((p) => p.id === leo)).toBe(false);
    expect(game.selectedPlayerIds).toHaveLength(13);
    // The planned subs were rewritten for the new line-up.
    expect(subs.get(GAME_ID)?.some((s) => s.inPlayerId === leo)).toBe(false);
  });

  it('marking a player present again brings them back into the squad', async () => {
    const { deps, games } = setup();
    let ctx = (await loadAttendance(deps, GAME_ID))!;
    await saveAttendance(deps, ctx, ctx.presentIds.filter((id) => id !== 'p12'));
    ctx = (await loadAttendance(deps, GAME_ID))!;
    expect(ctx.presentIds).not.toContain('p12');
    await saveAttendance(deps, ctx, [...ctx.presentIds, 'p12']);
    expect(games.get(GAME_ID)!.selectedPlayerIds).toContain('p12');
  });

  it('writes nothing when nothing changed', async () => {
    const { deps } = setup();
    const ctx = (await loadAttendance(deps, GAME_ID))!;
    expect(await saveAttendance(deps, ctx, ctx.presentIds)).toEqual({ ok: true, changed: false });
    expect(deps.savePlan).not.toHaveBeenCalled();
    expect(deps.saveGame).not.toHaveBeenCalled();
  });

  /** @critical */
  it('refuses once the match has started, even if the sheet opened before kick-off', async () => {
    const { deps, games } = setup();
    const ctx = (await loadAttendance(deps, GAME_ID))!;
    games.set(GAME_ID, {
      ...games.get(GAME_ID)!,
      gameEvents: [{ id: 'g1', type: 'goal', time: 30, scorerId: 'p1' }],
    });
    const result = await saveAttendance(deps, ctx, ctx.presentIds.slice(1));
    expect(result).toEqual({ ok: false, reason: 'started' });
    expect(deps.savePlan).not.toHaveBeenCalled();
    expect(deps.saveGame).not.toHaveBeenCalled();
  });

  it('a started context never saves', async () => {
    const { deps, games } = setup();
    games.set(GAME_ID, { ...games.get(GAME_ID)!, gameStatus: 'inProgress' });
    const ctx = (await loadAttendance(deps, GAME_ID))!;
    expect(await saveAttendance(deps, ctx, [])).toEqual({ ok: false, reason: 'started' });
  });
});

describe('saveAttendance - a game with no plan', () => {
  it('sets the squad to the present players and takes the absent off the pitch', async () => {
    const { deps, games } = setup({ withPlan: false });
    const game = games.get(GAME_ID)!;
    const onPitch = game.playersOnField[0].id;
    const ctx = (await loadAttendance(deps, GAME_ID))!;
    const result = await saveAttendance(deps, ctx, ctx.presentIds.filter((id) => id !== onPitch));
    expect(result).toEqual({ ok: true, changed: true });
    const saved = games.get(GAME_ID)!;
    expect(saved.selectedPlayerIds).not.toContain(onPitch);
    expect(saved.playersOnField.some((p) => p.id === onPitch)).toBe(false);
    // Rule 3: playersOnField ⊆ selectedPlayerIds.
    for (const p of saved.playersOnField) expect(saved.selectedPlayerIds).toContain(p.id);
    expect(deps.savePlan).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('planWithAbsences re-suggests only the one game of a multi-game plan', () => {
    const one = buildFirstPlan(input);
    const second = { ...one.games[0], id: 'g2', label: 'Second' };
    const plan: PlaytimePlan = { ...one, games: [one.games[0], second] };
    const next = planWithAbsences(plan, one.games[0].id, ['p1']);
    expect(next.games[0].absentIds).toEqual(['p1']);
    expect(next.games[1]).toBe(second);
  });

  it('lineupMatchesPlan is true for a game lined up by the plan', () => {
    const { plan, games } = setup();
    expect(lineupMatchesPlan(games.get(GAME_ID)!, plan, plan.games[0], squad)).toBe(true);
  });

  it('attendanceChanged compares sets, not order', async () => {
    const { deps } = setup();
    const ctx = (await loadAttendance(deps, GAME_ID))!;
    expect(attendanceChanged(ctx, [...ctx.presentIds].reverse())).toBe(false);
    expect(attendanceChanged(ctx, ctx.presentIds.slice(1))).toBe(true);
  });
});
