import { suggestFairShareLineup } from './suggest';
import { computePlanMinutes } from './minutes';
import { toEnginePlan } from './adapter';
import type { PlaytimePlan, PlanGame } from './types';

// 5v5-2-2: GK + 4 outfield = 5 slots.
const game = (id: string, over: Partial<PlanGame> = {}): PlanGame => ({
  id,
  label: id,
  formationId: '5v5-2-2',
  numberOfPeriods: 2,
  periodMinutes: 12,
  included: true,
  startingSlots: [],
  subs: [],
  ...over,
});

const plan = (games: PlanGame[], playerCount = 8): PlaytimePlan => ({
  id: 'p',
  name: 'Plan',
  version: 1,
  createdAt: 'x',
  updatedAt: 'x',
  players: Array.from({ length: playerCount }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` })),
  games,
});

describe('suggestFairShareLineup', () => {
  it('fills every slot and pairs every possible bench player as a half-time sub', () => {
    const result = suggestFairShareLineup(plan([game('g1')]));
    const g = result.games[0];
    // 5 slots filled, 3 bench players (8 - 5) all come on at half-time (12').
    expect(g.startingSlots).toHaveLength(5);
    expect(g.startingSlots.every((a) => a.playerId !== null)).toBe(true);
    expect(g.subs).toHaveLength(3);
    expect(g.subs.every((s) => s.timeSeconds === 12 * 60)).toBe(true);
    // No duplicate players anywhere in the game.
    const ids = [...g.startingSlots.map((a) => a.playerId), ...g.subs.map((s) => s.inPlayerId)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never subs the goalkeeper', () => {
    const result = suggestFairShareLineup(plan([game('g1'), game('g2'), game('g3')]));
    for (const g of result.games) {
      const gkSlotId = 'gk';
      expect(g.subs.some((s) => s.slotId === gkSlotId)).toBe(false);
      expect(g.startingSlots.find((a) => a.slotId === gkSlotId)?.playerId).toBeTruthy();
    }
  });

  it('rotates goal duty across games (the accumulator pushes the keeper down)', () => {
    const result = suggestFairShareLineup(plan([game('g1'), game('g2'), game('g3')]));
    const keepers = result.games.map(
      (g) => g.startingSlots.find((a) => a.slotId === 'gk')!.playerId,
    );
    expect(new Set(keepers).size).toBeGreaterThan(1);
  });

  it('produces a near-fair spread across a whole tournament', () => {
    // 5 games × 24 min × 5 on field = 600 player-minutes over 8 kids = 75' fair share.
    const result = suggestFairShareLineup(
      plan([game('g1'), game('g2'), game('g3'), game('g4'), game('g5')]),
    );
    const m = computePlanMinutes(toEnginePlan(result));
    const totals = m.players.map((p) => Math.round(p.totalSeconds / 60));
    const spread = Math.max(...totals) - Math.min(...totals);
    // Greedy half-time-granularity rotation: everyone within one half (12') of
    // each other.
    expect(spread).toBeLessThanOrEqual(12);
    expect(totals.every((t) => t > 0)).toBe(true);
  });

  it('leaves excluded games untouched and is deterministic', () => {
    const keep = game('g2', {
      included: false,
      startingSlots: [{ slotId: 'gk', playerId: 'p7' }],
      subs: [],
    });
    const input = plan([game('g1'), keep]);
    const a = suggestFairShareLineup(input);
    const b = suggestFairShareLineup(input);
    expect(a.games[1]).toBe(keep); // same reference: untouched
    // Determinism: identical output for identical input (ignoring generated sub ids).
    const strip = (p: PlaytimePlan) =>
      JSON.stringify(p.games.map((g) => ({ s: g.startingSlots, subs: g.subs.map(({ slotId, timeSeconds, inPlayerId }) => ({ slotId, timeSeconds, inPlayerId })) })));
    expect(strip(a)).toBe(strip(b));
  });

  it('returns the SAME reference when nothing is included (no phantom edit)', () => {
    const allExcluded = plan([game('g1', { included: false })]);
    expect(suggestFairShareLineup(allExcluded)).toBe(allExcluded);
    const noPlayers = plan([game('g1')], 0);
    expect(suggestFairShareLineup(noPlayers)).toBe(noPlayers);
  });

  it('handles a roster smaller than the formation (empty slots, no subs)', () => {
    const result = suggestFairShareLineup(plan([game('g1')], 3));
    const g = result.games[0];
    expect(g.startingSlots.filter((a) => a.playerId !== null)).toHaveLength(3);
    expect(g.subs).toHaveLength(0);
  });
});

describe('suggestFairShareLineup with absences', () => {
  it('never places or subs an absent player in that game', () => {
    const input = plan([
      game('g1', { absentIds: ['p0', 'p1'] }),
      game('g2'),
    ]);
    const result = suggestFairShareLineup(input);
    const g1 = result.games[0];
    const used = new Set([
      ...g1.startingSlots.map((a) => a.playerId),
      ...g1.subs.map((s) => s.inPlayerId),
    ]);
    expect(used.has('p0')).toBe(false);
    expect(used.has('p1')).toBe(false);
    // In game 2 they are back in the pool - and being least-played, they start.
    const g2 = result.games[1];
    const g2Starters = new Set(g2.startingSlots.map((a) => a.playerId));
    expect(g2Starters.has('p0') || g2.subs.some((s) => s.inPlayerId === 'p0')).toBe(true);
  });
});
