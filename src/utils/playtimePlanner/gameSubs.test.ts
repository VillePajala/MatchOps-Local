/**
 * Tests for the Phase-2 planned-sub store (local-only, keyed by game id).
 * @critical prefilled sub reminders must round-trip and tolerate corrupt storage
 */

import { getGameSubs, setGameSubs, deleteGameSubs, followPlayersOnField, type PlannedGameSub } from './gameSubs';
import { PLAYTIME_GAME_SUBS_KEY } from '@/config/storageKeys';

// Cloud sync PR 3: the public module is a shim over getDataStore(). Back it
// with the LOCAL raw store so these tests keep exercising the full round trip
// against the in-memory storage mock above.
jest.mock('@/datastore/factory', () => ({
  getDataStore: async () => {
    const { createLocalPlanStore } = jest.requireActual('./localPlanStore');
    // Bind the factory store to THIS suite's in-memory '@/utils/storage' mock,
    // preserving the full shim -> store -> raw round trip under test.
    const storage = jest.requireMock('@/utils/storage') as {
      getStorageJSON: <T>(key: string, opts: { defaultValue?: T }) => Promise<T>;
      setStorageJSON: (key: string, value: unknown) => Promise<void>;
    };
    const local = createLocalPlanStore({
      getJSON: <T,>(key: string, defaultValue: T) =>
        storage.getStorageJSON<T>(key, { defaultValue }),
      setJSON: (key: string, value: unknown) => storage.setStorageJSON(key, value),
    });
    return {
      getPlaytimePlans: local.getPlans,
      savePlaytimePlan: local.savePlan,
      deletePlaytimePlan: local.deletePlan,
      getPlaytimePlanLinks: local.getAllPlanLinks,
      setPlaytimePlanLink: local.setPlanLink,
      deletePlaytimePlanLink: local.deletePlanLink,
      deletePlaytimePlanLinksForPlan: local.deletePlanLinksForPlan,
      getPlaytimeGameSubs: local.getGameSubs,
      getAllPlaytimeGameSubs: local.getAllGameSubs,
      setPlaytimeGameSubs: local.setGameSubs,
      deletePlaytimeGameSubs: local.deleteGameSubs,
    };
  },
}));


// In-memory mirror of getStorageJSON/setStorageJSON (JSON round-trip).
let store: Record<string, string> = {};

jest.mock('@/utils/storage', () => ({
  getStorageJSON: jest.fn(async (key: string, opts: { defaultValue?: unknown } = {}) => {
    const raw = store[key];
    if (raw === undefined) return opts.defaultValue ?? null;
    try {
      return JSON.parse(raw);
    } catch {
      return opts.defaultValue ?? null;
    }
  }),
  setStorageJSON: jest.fn(async (key: string, value: unknown) => {
    store[key] = JSON.stringify(value);
  }),
}));

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

beforeEach(() => {
  store = {};
  jest.clearAllMocks();
});

const sub = (over: Partial<PlannedGameSub> = {}): PlannedGameSub => ({
  id: 's1',
  timeSeconds: 720,
  slotId: 'gk',
  inPlayerId: 'p2',
  outPlayerId: 'p1',
  ...over,
});

describe('planned game subs store', () => {
  it('returns [] for a game with no planned subs', async () => {
    expect(await getGameSubs('game-x')).toEqual([]);
  });

  it('saves and reads a game\'s planned subs back', async () => {
    const subs = [sub(), sub({ id: 's2', timeSeconds: 900, inPlayerId: 'p3', outPlayerId: null })];
    expect(await setGameSubs('g1', subs)).toBe(true);
    expect(await getGameSubs('g1')).toEqual(subs);
  });

  it('keeps games side by side and overwrites in place', async () => {
    await setGameSubs('g1', [sub()]);
    await setGameSubs('g2', [sub({ id: 'x' })]);
    await setGameSubs('g1', [sub({ id: 's1b', timeSeconds: 600 })]); // overwrite g1
    expect(await getGameSubs('g1')).toEqual([sub({ id: 's1b', timeSeconds: 600 })]);
    expect(await getGameSubs('g2')).toEqual([sub({ id: 'x' })]);
  });

  it('clears the entry when saved with an empty array (no empty keys linger)', async () => {
    await setGameSubs('g1', [sub()]);
    await setGameSubs('g1', []);
    expect(await getGameSubs('g1')).toEqual([]);
    expect(JSON.parse(store[PLAYTIME_GAME_SUBS_KEY])).toEqual({});
  });

  it('deletes a game\'s planned subs', async () => {
    await setGameSubs('g1', [sub()]);
    expect(await deleteGameSubs('g1')).toBe(true);
    expect(await getGameSubs('g1')).toEqual([]);
  });

  it('delete of a missing game is a no-op success', async () => {
    expect(await deleteGameSubs('nope')).toBe(true);
  });

  it('drops only a corrupt entry, keeping valid games', async () => {
    store[PLAYTIME_GAME_SUBS_KEY] = JSON.stringify({
      good: [sub()],
      bad: [{ id: 's', timeSeconds: 'not-a-number', slotId: 'gk', inPlayerId: 'p2', outPlayerId: null }],
    });
    expect(await getGameSubs('good')).toEqual([sub()]);
    expect(await getGameSubs('bad')).toEqual([]);
  });

  it('tolerates unparseable JSON (returns empty)', async () => {
    store[PLAYTIME_GAME_SUBS_KEY] = '{ not json';
    expect(await getGameSubs('g1')).toEqual([]);
  });

  it('serializes concurrent saves so no sibling game is dropped (withKeyLock)', async () => {
    await Promise.all([
      setGameSubs('a', [sub({ id: 'a1' })]),
      setGameSubs('b', [sub({ id: 'b1' })]),
      setGameSubs('a', [sub({ id: 'a2' })]),
    ]);
    expect(await getGameSubs('a')).toEqual([sub({ id: 'a2' })]); // last write for a wins
    expect(await getGameSubs('b')).toEqual([sub({ id: 'b1' })]); // b not clobbered
  });
});

/**
 * The plan follows the PLAYERS when the coach moves them on the match field
 * (owner decision A). Demo game, `rm0` + `st0` absent, applied to a game; then
 * the coach swaps `lm0` (LM) and `rm20` (RM) on the field.
 * @critical
 */
describe('followPlayersOnField', () => {
  const { demoPlaytimePlan, DEMO_PLAN_GAME_ID } = jest.requireActual('../../../tests/fixtures/plans');
  const { planWithAbsences } = jest.requireActual('@/services/attendance');
  const { buildPrefillFromPlan } = jest.requireActual('./prefill');
  const { buildPlannedChains } = jest.requireActual('./plannedChains');
  const { groupSubs } = jest.requireActual('@/hooks/usePlannedSubPrompts');
  type P = import('@/types').Player;

  const applied = () => {
    const plan = planWithAbsences(demoPlaytimePlan(), DEMO_PLAN_GAME_ID, ['rm0', 'st0']);
    const roster: P[] = plan.players.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }));
    const prefill = buildPrefillFromPlan(plan, plan.games[0], roster);
    // The game merges the waiting subs into playersOnField (parked on the sideline).
    return { roster, field: [...prefill.playersOnField, ...prefill.sidelinePlayers] as P[], subs: prefill.plannedSubs as PlannedGameSub[], points: prefill.formationSnapPoints };
  };
  const swap = (field: P[], a: string, b: string): P[] => {
    const pa = field.find((p) => p.id === a)!;
    const pb = field.find((p) => p.id === b)!;
    return field.map((p) => (p.id === a ? { ...p, relX: pb.relX, relY: pb.relY } : p.id === b ? { ...p, relX: pa.relX, relY: pa.relY } : p));
  };
  const chain = (subs: PlannedGameSub[], points: unknown, field: P[], label: string) => {
    const c = buildPlannedChains(subs, points, field).find((x: { positionLabel: string }) => x.positionLabel === label);
    return [c.starterName, ...c.entries.map((e: { minute: number; name: string }) => `${e.minute}' ${e.name}`)];
  };
  const kickoff = { elapsedSeconds: 0, beforeKickoff: true };

  it('a swap of two field players takes each position\'s changes along', () => {
    const { field, subs, points } = applied();
    expect(chain(subs, points, field, 'LM')).toEqual(['lm0', "10' b10c"]);
    const after = swap(field, 'lm0', 'rm20');
    const next = followPlayersOnField(subs, field, after, points, kickoff);
    // lm0's chain (b10c on for him at 10') now stands at RM; rm20's at LM.
    expect(chain(next, points, after, 'RM')).toEqual(['lm0', "10' b10c"]);
    expect(chain(next, points, after, 'LM')[0]).toBe('rm20');
    expect(next.find((s) => s.inPlayerId === 'b10c')).toMatchObject({ outPlayerId: 'lm0', timeSeconds: 600, positionLabel: 'RM' });
    // Who comes on and off, and when, is exactly as before: the timer's
    // prompts read the same, and so do everyone's planned minutes.
    const strip = (list: PlannedGameSub[]) => list.map(({ id, timeSeconds, inPlayerId, outPlayerId }) => ({ id, timeSeconds, inPlayerId, outPlayerId }));
    expect(strip(next)).toEqual(strip(subs));
    const roster = applied().roster;
    expect(groupSubs(next, roster)).toEqual(groupSubs(subs, roster));
  });

  it('undo (the move back) restores the schedule exactly', () => {
    const { field, subs, points } = applied();
    const after = swap(field, 'lm0', 'rm20');
    const next = followPlayersOnField(subs, field, after, points, kickoff);
    expect(followPlayersOnField(next, after, field, points, kickoff)).toEqual(subs);
  });

  it('moving a player to an empty position takes his changes along; the empty one\'s go to the place left', () => {
    const { field, subs, points } = applied();
    const without = field.filter((p) => p.id !== 'rm20');
    const rm = field.find((p) => p.id === 'rm20')!;
    const moved = without.map((p) => (p.id === 'lm0' ? { ...p, relX: rm.relX, relY: rm.relY } : p));
    const next = followPlayersOnField(subs, without, moved, points, kickoff);
    expect(next.find((s) => s.inPlayerId === 'b10c')?.positionLabel).toBe('RM');
    expect(chain(next, points, moved, 'RM')).toEqual(['lm0', "10' b10c"]);
    expect(chain(next, points, moved, 'LM')).toEqual([null]);
  });

  it('only changes still ahead of the clock move once the game is on', () => {
    const { field, subs, points } = applied();
    const after = swap(field, 'lm0', 'rm20');
    const next = followPlayersOnField(subs, field, after, points, { elapsedSeconds: 900, beforeKickoff: false });
    expect(next.find((s) => s.inPlayerId === 'b10c')?.positionLabel).toBe('LM'); // 10' has happened
  });

  it('before kick-off, a bench player in a field player\'s place swaps roles with him', () => {
    const { field, subs, points } = applied();
    // b10c (due on for lm0 at 10', waiting on the sideline) is swapped with
    // lm0: b10c starts, lm0 waits on the sideline.
    const after = swap(field, 'lm0', 'b10c');
    const next = followPlayersOnField(subs, field, after, points, kickoff);
    expect(next.find((s) => s.id === 'x4')).toMatchObject({ inPlayerId: 'lm0', outPlayerId: 'b10c', positionLabel: 'LM' });
    // lm0's own later change (on at RB at 30') is now b10c's.
    expect(next.find((s) => s.id === 'x9')).toMatchObject({ inPlayerId: 'b10c' });
    // After kick-off the same move is a real substitution: the plan stays.
    expect(followPlayersOnField(subs, field, after, points, { elapsedSeconds: 560, beforeKickoff: false })).toBe(subs);
  });

  it('nothing moved: the same schedule back', () => {
    const { field, subs, points } = applied();
    expect(followPlayersOnField(subs, field, field.map((p) => ({ ...p })), points, kickoff)).toBe(subs);
  });
});
