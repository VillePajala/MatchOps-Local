import { toEnginePlan } from './adapter';
import { computePlanMinutes } from './minutes';
import type { PlaytimePlan, PlanGame } from './types';

const MIN = 60;

const game = (overrides: Partial<PlanGame>): PlanGame => ({
  id: 'g1',
  label: 'Game 1',
  formationId: '5v5-2-2', // GK + 4 field = 5 slots
  numberOfPeriods: 2,
  periodMinutes: 12,
  included: true,
  startingSlots: [],
  subs: [],
  ...overrides,
});

const plan = (games: PlanGame[], playerNames: string[]): PlaytimePlan => ({
  id: 'p',
  name: 'Plan',
  version: 1,
  createdAt: 'x',
  updatedAt: 'x',
  players: playerNames.map((n) => ({ id: n, name: n })),
  games,
});

describe('toEnginePlan', () => {
  it('maps game length (periods × minutes) to totalSeconds', () => {
    const eng = toEnginePlan(plan([game({})], ['a']));
    expect(eng.games[0].totalSeconds).toBe(24 * MIN); // 2 × 12
  });

  it('normalizes to the formation slots so available time counts all positions', () => {
    // 5v5-2-2 -> 5 slots. Only GK assigned, but availability must count 5 slots.
    const g = game({ startingSlots: [{ slotId: 'gk', playerId: 'a' }] });
    const eng = toEnginePlan(plan([g], ['a', 'b', 'c', 'd', 'e']));
    expect(eng.games[0].slots).toHaveLength(5);
    const res = computePlanMinutes(eng);
    // available = 24min × 5 slots = 120 player-min; /5 players = 24 fair share.
    expect(res.fairShareSeconds).toBe(24 * MIN);
    // 'a' plays the whole game as GK; others 0.
    const byId = Object.fromEntries(res.players.map((p) => [p.playerId, p]));
    expect(byId.a.totalSeconds).toBe(24 * MIN);
    expect(byId.b.totalSeconds).toBe(0);
  });

  it('carries subs through so a half-time swap splits the minutes', () => {
    const g = game({
      startingSlots: [{ slotId: 'gk', playerId: 'a' }],
      subs: [{ id: 's1', slotId: 'gk', timeSeconds: 12 * MIN, inPlayerId: 'b' }],
    });
    const res = computePlanMinutes(toEnginePlan(plan([g], ['a', 'b'])));
    const byId = Object.fromEntries(res.players.map((p) => [p.playerId, p]));
    expect(byId.a.totalSeconds).toBe(12 * MIN); // first half
    expect(byId.b.totalSeconds).toBe(12 * MIN); // second half
  });

  it('respects the included flag', () => {
    const eng = toEnginePlan(
      plan([game({ included: true }), game({ id: 'g2', included: false })], ['a']),
    );
    expect(eng.games.map((g) => g.included)).toEqual([true, false]);
  });
});
