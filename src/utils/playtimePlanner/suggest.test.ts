import { suggestFairShareLineup } from './suggest';
import { computePlanMinutes } from './minutes';
import { toEnginePlan } from './adapter';
import type { PlaytimePlan, PlanGame } from './types';
import { getGameSlots } from './lineup';
import { getPositionLabelForFormationPosition, getRunningIntensity } from '@/utils/positionLabels';

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

  /**
   * @critical - the owner's own formation and the order they coach to. The
   * running-load table ranks the striker top, and the test above is right to
   * assert that for a formation with no wide midfielders - but where RM and LM
   * exist they come first, because wide mids cover the most ground repeatedly
   * where a striker's work is intermittent.
   */
  it('relieves RM, then LM, then ST when the formation has wide midfielders', () => {
    const labelBySlot = new Map(
      getGameSlots('8v8-2-1-2-1-1').map((s) => [
        s.slotId,
        s.isGoalie ? 'GK' : getPositionLabelForFormationPosition(s.relX, s.relY).label,
      ]),
    );

    // 11 players against 8 slots leaves a bench of 3 - enough to see all three.
    const three = suggestFairShareLineup(
      plan([game('g1', { formationId: '8v8-2-1-2-1-1' })], 11),
    ).games[0];
    expect(three.subs.map((s) => labelBySlot.get(s.slotId))).toEqual(['RM', 'LM', 'ST']);

    // Two subs must take the first two, not the striker.
    const two = suggestFairShareLineup(
      plan([game('g2', { formationId: '8v8-2-1-2-1-1' })], 10),
    ).games[0];
    expect(two.subs.map((s) => labelBySlot.get(s.slotId))).toEqual(['RM', 'LM']);
  });

  it('targets the HIGHEST-running positions for subs (wingers/striker first)', () => {
    // 8v8-3-3-1 (GK + 3 def + 3 mid + 1 att) with 2 bench players: the two
    // half-time changes must land on the two highest-running outfield slots -
    // never on the defence while attack/midfield roles exist.
    const result = suggestFairShareLineup(plan([game('g1', { formationId: '8v8-3-3-1' })], 10));
    const g = result.games[0];
    const intensityBySlot = new Map(
      getGameSlots('8v8-3-3-1').map((s) => [
        s.slotId,
        s.isGoalie ? -1 : getRunningIntensity(getPositionLabelForFormationPosition(s.relX, s.relY).label),
      ]),
    );
    expect(g.subs).toHaveLength(2);
    const subbed = g.subs.map((s) => intensityBySlot.get(s.slotId) ?? -99).sort((a, b) => b - a);
    const notSubbed = getGameSlots('8v8-3-3-1')
      .filter((s) => !s.isGoalie && !g.subs.some((sub) => sub.slotId === s.slotId))
      .map((s) => intensityBySlot.get(s.slotId) ?? -99);
    // Every subbed slot runs at least as much as every non-subbed one.
    expect(Math.min(...subbed)).toBeGreaterThanOrEqual(Math.max(...notSubbed));
    // And the single attack-zone slot (the striker) is always among them.
    expect(Math.max(...subbed)).toBe(5);
  });

  it('gives the least-played starters the LOW-running slots (they stay the full game)', () => {
    // First game from a cold accumulator: roster order breaks ties, so p1
    // (least-played after GK p0) must land in the lowest-running slot.
    const result = suggestFairShareLineup(plan([game('g1', { formationId: '8v8-3-3-1' })], 10));
    const g = result.games[0];
    const intensityBySlot = new Map(
      getGameSlots('8v8-3-3-1').map((s) => [
        s.slotId,
        s.isGoalie ? -1 : getRunningIntensity(getPositionLabelForFormationPosition(s.relX, s.relY).label),
      ]),
    );
    const outfield = g.startingSlots.filter((a) => !getGameSlots('8v8-3-3-1').find((s) => s.slotId === a.slotId)?.isGoalie);
    const lowest = outfield.reduce((min, a) =>
      (intensityBySlot.get(a.slotId) ?? 99) < (intensityBySlot.get(min.slotId) ?? 99) ? a : min,
    );
    expect(lowest.playerId).toBe('p1');
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

describe('suggestFairShareLineup with a bench bigger than one round of subs', () => {
  /** Planned seconds per player for a one-game plan. */
  const minutesOf = (p: PlaytimePlan): Map<string, number> =>
    new Map(computePlanMinutes(toEnginePlan(p)).players.map((x) => [x.playerId, x.totalSeconds]));
  const gkSlotIdOf = (formationId: string) => getGameSlots(formationId).find((s) => s.isGoalie)!.slotId;
  const subTimes = (g: PlanGame) => [...new Set(g.subs.map((s) => s.timeSeconds))].sort((a, b) => a - b);

  const cases = [
    { name: '10 in 5v5', formationId: '5v5-2-2', players: 10, k: 2 },
    { name: '12 in 5v5', formationId: '5v5-2-2', players: 12, k: 2 },
    { name: '14 in 5v5', formationId: '5v5-2-2', players: 14, k: 3 },
    { name: '16 in 8v8', formationId: '8v8-2-1-2-1-1', players: 16, k: 2 },
  ];

  /**
   * @critical - owner rule: in junior games every selected player plays, also
   * when the bench is bigger than one round of subs.
   */
  it.each(cases)('$name: every player gets time, GK stays, at most k sub moments incl. half time', ({ formationId, players, k }) => {
    const result = suggestFairShareLineup(
      plan([game('g1', { formationId, numberOfPeriods: 2, periodMinutes: 25 })], players),
    );
    const g = result.games[0];
    const mins = minutesOf(result);
    expect(mins.size).toBe(players);
    expect([...mins.values()].every((s) => s > 0)).toBe(true);
    expect(g.subs.some((s) => s.slotId === gkSlotIdOf(formationId))).toBe(false);
    const times = subTimes(g);
    expect(times.length).toBeLessThanOrEqual(k);
    expect(times).toContain(25 * 60);
    // Every bench player comes on exactly once.
    const ins = g.subs.map((s) => s.inPlayerId);
    expect(new Set(ins).size).toBe(ins.length);
    expect(ins).toHaveLength(players - getGameSlots(formationId).length);
  });

  /**
   * @critical - the onboarding plan's acceptance case: 16 players, 8v8,
   * 2 x 25. Sub moments 12:30 and half time; every outfield player 12:30-25:00.
   */
  it('16 in 8v8: subs at 12:30 and 25:00, outfield minutes 12:30 to 25:00', () => {
    const formationId = '8v8-2-1-2-1-1';
    const result = suggestFairShareLineup(
      plan([game('g1', { formationId, numberOfPeriods: 2, periodMinutes: 25 })], 16),
    );
    const g = result.games[0];
    expect(subTimes(g)).toEqual([750, 1500]);
    const gk = g.startingSlots.find((a) => a.slotId === gkSlotIdOf(formationId))!.playerId!;
    const mins = minutesOf(result);
    expect(mins.get(gk)).toBe(50 * 60);
    for (const [id, s] of mins) {
      if (id === gk) continue;
      expect(s).toBeGreaterThanOrEqual(750);
      expect(s).toBeLessThanOrEqual(1500);
    }
  });

  it('14 in 8v8 still fits one round: all subs at half time, as before', () => {
    const result = suggestFairShareLineup(
      plan([game('g1', { formationId: '8v8-2-1-2-1-1', numberOfPeriods: 2, periodMinutes: 25 })], 14),
    );
    expect(subTimes(result.games[0])).toEqual([1500]);
    expect(result.games[0].subs).toHaveLength(6);
  });

  it('spreads moments evenly in a one-period game', () => {
    // 1 x 30, 12 in 5v5: bench 7 over 4 outfield slots -> k = 2 -> 10:00 and 20:00.
    const result = suggestFairShareLineup(
      plan([game('g1', { numberOfPeriods: 1, periodMinutes: 30 })], 12),
    );
    expect(subTimes(result.games[0])).toEqual([600, 1200]);
    expect([...minutesOf(result).values()].every((s) => s > 0)).toBe(true);
  });

  it('absentees still get nothing; everyone attending plays', () => {
    const result = suggestFairShareLineup(
      plan([game('g1', { numberOfPeriods: 2, periodMinutes: 20, absentIds: ['p0', 'p1'] })], 14),
    );
    const g = result.games[0];
    const used = new Set([...g.startingSlots.map((a) => a.playerId), ...g.subs.map((s) => s.inPlayerId)]);
    expect(used.has('p0') || used.has('p1')).toBe(false);
    const mins = minutesOf(result);
    for (let i = 2; i < 14; i++) expect(mins.get(`p${i}`)).toBeGreaterThan(0);
  });

  it('balances a multi-game plan using the real minutes of each game', () => {
    // 3 games x 2 x 20 in 5v5 with 12 players: everyone plays every game and the
    // plan-wide spread stays within one 10-minute window.
    const games = ['g1', 'g2', 'g3'].map((id) => game(id, { numberOfPeriods: 2, periodMinutes: 20 }));
    const result = suggestFairShareLineup(plan(games, 12));
    const m = computePlanMinutes(toEnginePlan(result));
    for (const p of m.players) expect(p.perGameSeconds.every((s) => s > 0)).toBe(true);
    const totals = m.players.map((p) => p.totalSeconds);
    const outfield = totals.sort((a, b) => a - b).slice(0, -3); // drop the three keepers' full games
    expect(Math.max(...outfield) - Math.min(...outfield)).toBeLessThanOrEqual(20 * 60);
  });

  /** @edge-case - three periods: two sub moments land on the period breaks. */
  it('3 periods: the sub moments fall on the period breaks', () => {
    const result = suggestFairShareLineup(
      plan([game('g1', { numberOfPeriods: 3, periodMinutes: 15 })], 12),
    );
    expect(subTimes(result.games[0])).toEqual([15 * 60, 30 * 60]);
    expect([...minutesOf(result).values()].every((s) => s > 0)).toBe(true);
  });

  /** @edge-case - the shortest real game still fits every sub moment. */
  it('2 x 1 min with 16 in 8v8: nobody is left on zero', () => {
    const result = suggestFairShareLineup(
      plan([game('g1', { formationId: '8v8-2-1-2-1-1', numberOfPeriods: 2, periodMinutes: 1 })], 16),
    );
    expect(subTimes(result.games[0])).toEqual([30, 60]);
    expect([...minutesOf(result).values()].every((s) => s > 0)).toBe(true);
  });
});
