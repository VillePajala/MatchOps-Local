import {
  aggregatePlanMinutes,
  fairShareBand,
} from '../planMinutesAggregate';
import type { PlanDraft } from '../planSwapEngine';
import type { AppState } from '@/types/game';

const game = (mins: number, periods = 2): AppState =>
  ({
    numberOfPeriods: periods,
    periodDurationMinutes: mins,
    teamId: 't1',
    teamName: 'Pepo',
  }) as unknown as AppState;

const draftBasic: PlanDraft = {
  startingXI: { GK: 'p0', LB: 'p1', RB: 'p2' },
  bench: ['p3'],
  scheduledSubs: [],
};

describe('aggregatePlanMinutes', () => {
  it('returns an empty result when there are no gameIds', () => {
    const out = aggregatePlanMinutes(draftBasic, [], {});
    expect(out.perPlayer).toEqual([]);
    expect(out.fairShareSeconds).toBe(0);
    expect(out.totalFieldSeconds).toBe(0);
    // No games → nobody played → empty referenced set. Distinguishes
    // "denominator includes you because you'd play" (old) from
    // "denominator includes you because you actually played" (new).
    expect(out.referencedPlayerIds).toEqual([]);
  });

  it('returns an empty result when the draft has no starting XI or subs', () => {
    const empty: PlanDraft = { startingXI: {}, bench: [], scheduledSubs: [] };
    const out = aggregatePlanMinutes(empty, ['g1'], { g1: game(10) });
    expect(out.perPlayer).toEqual([]);
    expect(out.fairShareSeconds).toBe(0);
    expect(out.referencedPlayerIds).toEqual([]);
  });

  it('aggregates seconds across multiple games with the same draft', () => {
    // Two games, 2 periods × 10 min = 1200s each. 3 starting players,
    // no subs → each starting player gets 1200s per game = 2400s total.
    const out = aggregatePlanMinutes(
      draftBasic,
      ['g1', 'g2'],
      { g1: game(10), g2: game(10) },
    );
    const byId = new Map(out.perPlayer.map((e) => [e.playerId, e]));
    expect(byId.get('p0')?.totalSeconds).toBe(2400);
    expect(byId.get('p1')?.totalSeconds).toBe(2400);
    expect(byId.get('p2')?.totalSeconds).toBe(2400);
    // Total field seconds = 1200 * 3 starters * 2 games = 7200.
    expect(out.totalFieldSeconds).toBe(7200);
    // Fair share = 7200 / 3 referenced = 2400. Each player at the
    // target, so shareRatio === 1.
    expect(out.fairShareSeconds).toBe(2400);
    for (const entry of out.perPlayer) expect(entry.shareRatio).toBe(1);
  });

  it('weights games by their individual durations', () => {
    // Game 1: 10 min × 2 periods = 1200s. Game 2: 25 min × 2 = 3000s.
    // Same draft applies to both.
    const out = aggregatePlanMinutes(
      draftBasic,
      ['g1', 'g2'],
      { g1: game(10), g2: game(25) },
    );
    const byId = new Map(out.perPlayer.map((e) => [e.playerId, e]));
    expect(byId.get('p0')?.totalSeconds).toBe(4200); // 1200 + 3000
    expect(out.totalFieldSeconds).toBe(12_600); // 4200 * 3 starters
  });

  it('returns an empty aggregate when every gameId is missing from savedGames', () => {
    // Every id is missing — totals stays empty, fair share is 0, no
    // perPlayer entries. The dashboard's empty-state fires from this.
    const out = aggregatePlanMinutes(
      draftBasic,
      ['missing1', 'missing2'],
      {},
    );
    expect(out.perPlayer).toEqual([]);
    expect(out.referencedPlayerIds).toEqual([]);
    expect(out.fairShareSeconds).toBe(0);
    expect(out.totalFieldSeconds).toBe(0);
  });

  it('skips games whose savedGames entry is missing', () => {
    // gx not in savedGames — must not throw, must contribute 0.
    const out = aggregatePlanMinutes(
      draftBasic,
      ['g1', 'gx'],
      { g1: game(10) },
    );
    const byId = new Map(out.perPlayer.map((e) => [e.playerId, e]));
    expect(byId.get('p0')?.totalSeconds).toBe(1200);
    expect(out.totalFieldSeconds).toBe(3600);
  });

  it('a sub-only player counts toward the referenced denominator', () => {
    // p3 starts on the bench but is subbed in at 5:00 for LB.
    // referencedPlayerIds = [p0, p1, p2, p3] → fair share spread
    // across 4 players. Total seconds = 1200 * 3 = 3600.
    // Fair share = 3600 / 4 = 900s per player.
    const draft: PlanDraft = {
      startingXI: { GK: 'p0', LB: 'p1', RB: 'p2' },
      bench: ['p3'],
      scheduledSubs: [
        { id: 's1', timeSeconds: 300, inPlayer: 'p3', positionRole: 'LB' },
      ],
    };
    const out = aggregatePlanMinutes(draft, ['g1'], { g1: game(10) });
    expect(out.fairShareSeconds).toBe(900);
    const byId = new Map(out.perPlayer.map((e) => [e.playerId, e]));
    // p1 played 0-5min = 300s; p3 played 5-20min = 900s.
    expect(byId.get('p1')?.totalSeconds).toBe(300);
    expect(byId.get('p3')?.totalSeconds).toBe(900);
    // p3 shareRatio = 900/900 = 1. p1 shareRatio = 300/900 ≈ 0.333.
    expect(byId.get('p3')?.shareRatio).toBeCloseTo(1, 5);
    expect(byId.get('p1')?.shareRatio).toBeCloseTo(1 / 3, 5);
  });

  it('excludes inPlayers of unreachable subs from the fair-share denominator', () => {
    // p3 is the inPlayer of a sub scheduled at 25:00 in a 20:00 game
    // — unreachable. computePlayerSeconds clamps the sub time and p3
    // contributes 0s. p3 must NOT count toward the denominator —
    // otherwise active players would appear over their share.
    const draft: PlanDraft = {
      startingXI: { GK: 'p0', LB: 'p1', RB: 'p2' },
      bench: ['p3'],
      scheduledSubs: [
        { id: 's1', timeSeconds: 1500, inPlayer: 'p3', positionRole: 'LB' },
      ],
    };
    const out = aggregatePlanMinutes(draft, ['g1'], { g1: game(10) });
    // 3 active players, 1200s each = 3600s total. Fair share = 3600 / 3
    // = 1200s, NOT 3600 / 4 = 900s.
    expect(out.fairShareSeconds).toBe(1200);
    // referencedPlayerIds is sorted by id for deterministic equality.
    expect(out.referencedPlayerIds).toEqual(['p0', 'p1', 'p2']);
    expect(out.referencedPlayerIds).not.toContain('p3');
    // Active players are at exactly fair share.
    for (const entry of out.perPlayer) expect(entry.shareRatio).toBe(1);
  });

  it('handles 0-duration games without dividing by zero', () => {
    // Duration 0 should be skipped (no contribution to either totals
    // or totalFieldSeconds), not produce NaN ratios.
    const out = aggregatePlanMinutes(
      draftBasic,
      ['g1', 'g2'],
      { g1: game(0), g2: game(10) },
    );
    expect(out.totalFieldSeconds).toBe(3600);
    for (const entry of out.perPlayer) {
      expect(Number.isFinite(entry.shareRatio)).toBe(true);
      expect(entry.shareRatio).toBe(1);
    }
  });
});

describe('fairShareBand', () => {
  it.each([
    [0.0, 'under'],
    [0.5, 'under'],
    [0.69, 'under'],
    [0.7, 'low'],
    [0.85, 'low'],
    [0.9, 'fair'],
    [1.0, 'fair'],
    [1.1, 'fair'],
    [1.11, 'over'],
    [1.3, 'over'],
    [1.31, 'heavy-over'],
    [2.0, 'heavy-over'],
  ])('ratio %f → %s', (ratio, expected) => {
    expect(fairShareBand(ratio)).toBe(expected);
  });
});
