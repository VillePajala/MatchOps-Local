import {
  computeSlotSegments,
  playerSecondsInGame,
  computePlanMinutes,
  fairnessBand,
  FAIR_SHARE_LOWER,
  FAIR_SHARE_UPPER,
  type PlannedGame,
  type PlannedPlan,
} from './minutes';

/**
 * Tests for the planner minutes engine.
 * @critical fairness math drives the whole planner UX
 */

const MIN = 60;

/** Build a game with n slots, each started by `starters[i]` (null-padded). */
const makeGame = (
  id: string,
  totalSeconds: number,
  starters: (string | null)[],
  subs: PlannedGame['subs'] = [],
  included = true,
): PlannedGame => ({
  id,
  totalSeconds,
  slots: starters.map((startPlayerId, i) => ({ slotId: `slot-${i}`, startPlayerId })),
  subs,
  included,
});

describe('fairnessBand', () => {
  it('classifies null / under / fair / over', () => {
    expect(fairnessBand(null)).toBe('none');
    expect(fairnessBand(0)).toBe('under');
    expect(fairnessBand(FAIR_SHARE_LOWER - 0.001)).toBe('under');
    expect(fairnessBand(FAIR_SHARE_LOWER)).toBe('fair');
    expect(fairnessBand(1)).toBe('fair');
    expect(fairnessBand(FAIR_SHARE_UPPER - 0.001)).toBe('fair');
    expect(fairnessBand(FAIR_SHARE_UPPER)).toBe('over');
    expect(fairnessBand(2)).toBe('over');
  });
});

describe('computeSlotSegments', () => {
  it('gives one full-game segment when there are no subs', () => {
    const g = makeGame('g', 25 * MIN, ['a']);
    expect(computeSlotSegments(g, 'slot-0')).toEqual([
      { slotId: 'slot-0', startSeconds: 0, endSeconds: 25 * MIN, playerId: 'a' },
    ]);
  });

  it('splits into two halves at a mid-game sub', () => {
    const g = makeGame('g', 25 * MIN, ['a'], [
      { slotId: 'slot-0', timeSeconds: 12 * MIN, inPlayerId: 'b' },
    ]);
    expect(computeSlotSegments(g, 'slot-0')).toEqual([
      { slotId: 'slot-0', startSeconds: 0, endSeconds: 12 * MIN, playerId: 'a' },
      { slotId: 'slot-0', startSeconds: 12 * MIN, endSeconds: 25 * MIN, playerId: 'b' },
    ]);
  });

  it('honours multiple subs in the same slot in time order', () => {
    const g = makeGame('g', 30 * MIN, ['a'], [
      { slotId: 'slot-0', timeSeconds: 20 * MIN, inPlayerId: 'c' },
      { slotId: 'slot-0', timeSeconds: 10 * MIN, inPlayerId: 'b' },
    ]);
    const segs = computeSlotSegments(g, 'slot-0');
    expect(segs.map((s) => s.playerId)).toEqual(['a', 'b', 'c']);
    expect(segs.map((s) => [s.startSeconds, s.endSeconds])).toEqual([
      [0, 10 * MIN],
      [10 * MIN, 20 * MIN],
      [20 * MIN, 30 * MIN],
    ]);
  });

  it('clamps a sub time beyond the game length (no zero-length tail)', () => {
    const g = makeGame('g', 25 * MIN, ['a'], [
      { slotId: 'slot-0', timeSeconds: 40 * MIN, inPlayerId: 'b' },
    ]);
    const segs = computeSlotSegments(g, 'slot-0');
    // Sub is clamped to the final whistle, so 'b' never actually plays.
    expect(segs).toEqual([
      { slotId: 'slot-0', startSeconds: 0, endSeconds: 25 * MIN, playerId: 'a' },
    ]);
  });

  it('drops the starter when a sub happens at kickoff (t=0)', () => {
    const g = makeGame('g', 25 * MIN, ['a'], [
      { slotId: 'slot-0', timeSeconds: 0, inPlayerId: 'b' },
    ]);
    expect(computeSlotSegments(g, 'slot-0')).toEqual([
      { slotId: 'slot-0', startSeconds: 0, endSeconds: 25 * MIN, playerId: 'b' },
    ]);
  });

  it('represents an empty slot as a null-player segment', () => {
    const g = makeGame('g', 25 * MIN, [null]);
    expect(computeSlotSegments(g, 'slot-0')).toEqual([
      { slotId: 'slot-0', startSeconds: 0, endSeconds: 25 * MIN, playerId: null },
    ]);
  });

  it('fills a slot that starts empty and gets a player mid-game', () => {
    const g = makeGame('g', 25 * MIN, [null], [
      { slotId: 'slot-0', timeSeconds: 10 * MIN, inPlayerId: 'b' },
    ]);
    expect(computeSlotSegments(g, 'slot-0')).toEqual([
      { slotId: 'slot-0', startSeconds: 0, endSeconds: 10 * MIN, playerId: null },
      { slotId: 'slot-0', startSeconds: 10 * MIN, endSeconds: 25 * MIN, playerId: 'b' },
    ]);
  });
});

describe('playerSecondsInGame', () => {
  it('sums a player across two slots (rare, but supported)', () => {
    const g = makeGame('g', 20 * MIN, ['a', 'a']); // same player two slots
    expect(playerSecondsInGame(g, 'a')).toBe(40 * MIN);
  });

  it('counts half a game for a half-time starter and their replacement', () => {
    const g = makeGame('g', 24 * MIN, ['a'], [
      { slotId: 'slot-0', timeSeconds: 12 * MIN, inPlayerId: 'b' },
    ]);
    expect(playerSecondsInGame(g, 'a')).toBe(12 * MIN);
    expect(playerSecondsInGame(g, 'b')).toBe(12 * MIN);
    expect(playerSecondsInGame(g, 'z')).toBe(0);
  });
});

describe('computePlanMinutes', () => {
  it('gives everyone an equal share when the lineup is symmetric', () => {
    // 2 games, 2 slots, 25 min each. 4 players, each plays one full game.
    const plan: PlannedPlan = {
      playerIds: ['a', 'b', 'c', 'd'],
      games: [makeGame('g1', 25 * MIN, ['a', 'b']), makeGame('g2', 25 * MIN, ['c', 'd'])],
    };
    const res = computePlanMinutes(plan);
    // available = 2 games * 25min * 2 slots = 100 player-min; /4 players = 25 min each.
    expect(res.totalAvailableSeconds).toBe(100 * MIN);
    expect(res.fairShareSeconds).toBe(25 * MIN);
    expect(res.includedGameCount).toBe(2);
    for (const p of res.players) {
      expect(p.totalSeconds).toBe(25 * MIN);
      expect(p.ratio).toBeCloseTo(1);
      expect(p.deviationSeconds).toBe(0);
      expect(p.band).toBe('fair');
    }
  });

  it('flags an over-played and an under-played player', () => {
    // 1 game, 2 slots, 20 min. 'a' plays the whole game, 'b'/'c' split the other slot.
    const plan: PlannedPlan = {
      playerIds: ['a', 'b', 'c', 'd'],
      games: [
        makeGame('g1', 20 * MIN, ['a', 'b'], [
          { slotId: 'slot-1', timeSeconds: 10 * MIN, inPlayerId: 'c' },
        ]),
      ],
    };
    const res = computePlanMinutes(plan);
    // available = 20 * 2 = 40 player-min; /4 = 10 min fair share.
    expect(res.fairShareSeconds).toBe(10 * MIN);
    const byId = Object.fromEntries(res.players.map((p) => [p.playerId, p]));
    expect(byId.a.totalSeconds).toBe(20 * MIN);
    expect(byId.a.ratio).toBeCloseTo(2);
    expect(byId.a.deviationSeconds).toBe(10 * MIN);
    expect(byId.a.band).toBe('over');
    expect(byId.b.totalSeconds).toBe(10 * MIN);
    expect(byId.b.band).toBe('fair');
    expect(byId.d.totalSeconds).toBe(0); // never played
    expect(byId.d.ratio).toBeCloseTo(0);
    expect(byId.d.deviationSeconds).toBe(-10 * MIN);
    expect(byId.d.band).toBe('under');
  });

  it('excludes non-included games from totals and from the fair share', () => {
    const plan: PlannedPlan = {
      playerIds: ['a', 'b'],
      games: [
        makeGame('g1', 20 * MIN, ['a', 'b']),
        makeGame('g2', 20 * MIN, ['a', 'b'], [], /* included */ false),
      ],
    };
    const res = computePlanMinutes(plan);
    // Only g1 counts: available = 20 * 2 = 40; /2 = 20 fair share.
    expect(res.includedGameCount).toBe(1);
    expect(res.fairShareSeconds).toBe(20 * MIN);
    const a = res.players.find((p) => p.playerId === 'a')!;
    expect(a.totalSeconds).toBe(20 * MIN); // g2 not counted
    // perGameSeconds still reports the excluded game for display.
    expect(a.perGameSeconds).toEqual([20 * MIN, 20 * MIN]);
    expect(a.band).toBe('fair');
  });

  it('returns a null fair share and none band when no games are included', () => {
    const plan: PlannedPlan = {
      playerIds: ['a', 'b'],
      games: [makeGame('g1', 20 * MIN, ['a', 'b'], [], false)],
    };
    const res = computePlanMinutes(plan);
    expect(res.totalAvailableSeconds).toBe(0);
    expect(res.fairShareSeconds).toBeNull();
    expect(res.includedGameCount).toBe(0);
    for (const p of res.players) {
      expect(p.ratio).toBeNull();
      expect(p.deviationSeconds).toBe(0);
      expect(p.band).toBe('none');
    }
  });

  it('uses an explicit rosterSize as the fair-share denominator', () => {
    // Only 'a' and 'b' hold slots, but the squad is 5 (three not yet placed).
    const plan: PlannedPlan = {
      playerIds: ['a', 'b'],
      rosterSize: 5,
      games: [makeGame('g1', 25 * MIN, ['a', 'b'])],
    };
    const res = computePlanMinutes(plan);
    // available = 25 * 2 = 50 player-min; /5 = 10 min fair share.
    expect(res.fairShareSeconds).toBe(10 * MIN);
    const a = res.players.find((p) => p.playerId === 'a')!;
    expect(a.ratio).toBeCloseTo(2.5);
    expect(a.band).toBe('over');
  });

  it('keeps rosterSize and absences on the same denominator', () => {
    // Squad of 4 (two not yet listed); 'b' misses g2. The per-game split must
    // use the SAME rosterSize base as the plan-wide share: an absentee vacates
    // one seat of the notional roster, they don't shrink it to the listed two.
    const g2 = { ...makeGame('g2', 20 * MIN, ['a', null]), absentIds: ['b'] };
    const plan: PlannedPlan = {
      playerIds: ['a', 'b'],
      rosterSize: 4,
      games: [makeGame('g1', 20 * MIN, ['a', 'b']), g2],
    };
    const res = computePlanMinutes(plan);
    // Each game offers 20 * 2 = 40 player-min; plan-wide share = 80 / 4 = 20.
    expect(res.fairShareSeconds).toBe(20 * MIN);
    const a = res.players.find((p) => p.playerId === 'a')!;
    const b = res.players.find((p) => p.playerId === 'b')!;
    // b attends only g1: share = 40 / 4 = 10 min (NOT 40 / 2 = 20).
    expect(b.totalSeconds).toBe(20 * MIN);
    expect(b.deviationSeconds).toBeCloseTo(10 * MIN);
    // a attends both: 40/4 + 40/(4-1) = 10 + 13.33 min.
    expect(a.totalSeconds).toBe(40 * MIN);
    expect(a.deviationSeconds).toBeCloseTo(40 * MIN - (10 * MIN + (40 * MIN) / 3));
  });

  it('preserves playerIds order in the output', () => {
    const plan: PlannedPlan = {
      playerIds: ['z', 'm', 'a'],
      games: [makeGame('g1', 10 * MIN, ['z', 'm', 'a'])],
    };
    const res = computePlanMinutes(plan);
    expect(res.players.map((p) => p.playerId)).toEqual(['z', 'm', 'a']);
  });

  it('does not double-count time when two slots share an id (malformed input)', () => {
    // Defensive: duplicate slotId must not count the same field-time twice.
    const plan: PlannedPlan = {
      playerIds: ['a', 'b'],
      games: [
        {
          id: 'g1',
          totalSeconds: 20 * MIN,
          slots: [
            { slotId: 'dup', startPlayerId: 'a' },
            { slotId: 'dup', startPlayerId: 'a' },
          ],
          subs: [],
          included: true,
        },
      ],
    };
    const res = computePlanMinutes(plan);
    // One distinct slot -> 20 * 1 = 20 available player-min, not 40.
    expect(res.totalAvailableSeconds).toBe(20 * MIN);
    const a = res.players.find((p) => p.playerId === 'a')!;
    expect(a.totalSeconds).toBe(20 * MIN); // counted once
  });

  it('handles two subs on the same slot at the identical time (last wins)', () => {
    const g = makeGame('g', 20 * MIN, ['a'], [
      { slotId: 'slot-0', timeSeconds: 10 * MIN, inPlayerId: 'b' },
      { slotId: 'slot-0', timeSeconds: 10 * MIN, inPlayerId: 'c' },
    ]);
    const segs = computeSlotSegments(g, 'slot-0');
    // a plays [0,10]; the two same-time subs leave the last (c) holding [10,20].
    expect(segs).toEqual([
      { slotId: 'slot-0', startSeconds: 0, endSeconds: 10 * MIN, playerId: 'a' },
      { slotId: 'slot-0', startSeconds: 10 * MIN, endSeconds: 20 * MIN, playerId: 'c' },
    ]);
  });

  it('returns a null fair share when the roster is empty but games are included', () => {
    const plan: PlannedPlan = {
      playerIds: [],
      games: [makeGame('g1', 25 * MIN, ['a', 'b'])],
    };
    const res = computePlanMinutes(plan);
    expect(res.totalAvailableSeconds).toBe(50 * MIN);
    expect(res.fairShareSeconds).toBeNull(); // no roster to divide by
    expect(res.players).toEqual([]);
  });

  it('treats an explicit rosterSize of 0 as no roster (null fair share)', () => {
    const plan: PlannedPlan = {
      playerIds: ['a', 'b'],
      rosterSize: 0,
      games: [makeGame('g1', 25 * MIN, ['a', 'b'])],
    };
    const res = computePlanMinutes(plan);
    expect(res.fairShareSeconds).toBeNull();
    for (const p of res.players) {
      expect(p.ratio).toBeNull();
      expect(p.band).toBe('none');
    }
  });

  it('handles an empty games array', () => {
    const res = computePlanMinutes({ playerIds: ['a'], games: [] });
    expect(res.totalAvailableSeconds).toBe(0);
    expect(res.fairShareSeconds).toBeNull();
    expect(res.includedGameCount).toBe(0);
    expect(res.players[0]).toMatchObject({ totalSeconds: 0, perGameSeconds: [], band: 'none' });
  });

  it('ignores subs that reference an unknown slot (no phantom playtime)', () => {
    const plan: PlannedPlan = {
      playerIds: ['a', 'b'],
      games: [
        makeGame('g1', 20 * MIN, ['a'], [
          { slotId: 'ghost', timeSeconds: 5 * MIN, inPlayerId: 'b' },
        ]),
      ],
    };
    // Directly: unknown slot yields no segments.
    expect(computeSlotSegments(plan.games[0], 'ghost')).toEqual([]);
    const b = computePlanMinutes(plan).players.find((p) => p.playerId === 'b')!;
    expect(b.totalSeconds).toBe(0);
  });

  it('does not double-count a player who is subbed within the same game', () => {
    // 'a' starts, comes off at 10, comes back on (other slot) later.
    const plan: PlannedPlan = {
      playerIds: ['a', 'b', 'c'],
      games: [
        makeGame('g1', 20 * MIN, ['a', 'b'], [
          { slotId: 'slot-0', timeSeconds: 10 * MIN, inPlayerId: 'c' }, // a off
          { slotId: 'slot-1', timeSeconds: 10 * MIN, inPlayerId: 'a' }, // a back on other slot
        ]),
      ],
    };
    const a = computePlanMinutes(plan).players.find((p) => p.playerId === 'a')!;
    // a: slot-0 [0,10] + slot-1 [10,20] = full 20 min.
    expect(a.totalSeconds).toBe(20 * MIN);
  });
});

describe('computePlanMinutes with per-game absences', () => {
  it('splits each game among ATTENDING players and nulls fully-absent ratios', () => {
    // Two 20-minute 2-slot games, roster of 4 (a, b, c, d).
    // d is absent from BOTH games; c is absent from game 2.
    const g1: PlannedGame = {
      ...({} as PlannedGame),
      id: 'g1',
      totalSeconds: 20 * MIN,
      slots: [
        { slotId: 's0', startPlayerId: 'a' },
        { slotId: 's1', startPlayerId: 'b' },
      ],
      subs: [],
      included: true,
      absentIds: ['d'],
    };
    const g2: PlannedGame = {
      ...g1,
      id: 'g2',
      slots: [
        { slotId: 's0', startPlayerId: 'a' },
        { slotId: 's1', startPlayerId: 'b' },
      ],
      absentIds: ['c', 'd'],
    };
    const plan: PlannedPlan = { games: [g1, g2], playerIds: ['a', 'b', 'c', 'd'] };
    const m = computePlanMinutes(plan);
    const by = Object.fromEntries(m.players.map((p) => [p.playerId, p]));

    // Game capacities: 40 player-min each. g1 splits among 3 attending
    // (a,b,c -> 13.33 min each); g2 among 2 (a,b -> 20 min each).
    // a plays 40 min vs share 33.33 -> ratio 1.2
    expect(by.a.ratio).toBeCloseTo((40 * MIN) / ((40 / 3 + 20) * MIN), 5);
    // c attends only g1: share 13.33 min, plays 0 -> ratio 0 (not null).
    expect(by.c.ratio).toBe(0);
    expect(by.c.deviationSeconds).toBeCloseTo(-(40 / 3) * MIN, 3);
    // d attends nothing: no share, neutral (null) - never "deep red".
    expect(by.d.ratio).toBeNull();
    expect(by.d.band).toBe('none');
  });

  it('reduces EXACTLY to the legacy plan-wide share when nobody is absent', () => {
    const g: PlannedGame = {
      id: 'g1',
      totalSeconds: 24 * MIN,
      slots: [
        { slotId: 's0', startPlayerId: 'a' },
        { slotId: 's1', startPlayerId: null },
      ],
      subs: [],
      included: true,
    };
    const plan: PlannedPlan = { games: [g], playerIds: ['a', 'b', 'c'] };
    const m = computePlanMinutes(plan);
    const a = m.players.find((p) => p.playerId === 'a')!;
    // Plan-wide share: 48 player-min / 3 = 16 min. a plays 24.
    expect(m.fairShareSeconds).toBe(16 * MIN);
    expect(a.ratio).toBeCloseTo((24 * MIN) / (16 * MIN), 10);
  });
});

describe('all-absent games and the plan-wide share', () => {
  it('a game nobody attends does not inflate fairShareSeconds', () => {
    const attended: PlannedGame = {
      id: 'g1', totalSeconds: 20 * MIN,
      slots: [{ slotId: 's0', startPlayerId: 'a' }], subs: [], included: true,
    };
    const ghost: PlannedGame = { ...attended, id: 'g2', absentIds: ['a', 'b'] };
    const plan: PlannedPlan = { games: [attended, ghost], playerIds: ['a', 'b'] };
    const m = computePlanMinutes(plan);
    // Only the attended game's 20 player-min / 2 players = 10 min share.
    expect(m.fairShareSeconds).toBe(10 * MIN);
    expect(m.includedGameCount).toBe(1);
  });
});
