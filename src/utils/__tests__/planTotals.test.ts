import { computePlanTotals, totalBand, GOALKEEPER_ROLE } from '../planTotals';
import type { PlanDraft } from '../planSwapEngine';
import type { AppState } from '@/types/game';

const game = (mins: number, periods = 2): AppState =>
  ({
    numberOfPeriods: periods,
    periodDurationMinutes: mins,
    teamId: 't1',
    teamName: 'Pepo',
  }) as unknown as AppState;

const draft = (over: Partial<PlanDraft> = {}): PlanDraft => ({
  startingXI: { GK: 'p0', LB: 'p1', RB: 'p2' },
  bench: ['p3'],
  scheduledSubs: [],
  ...over,
});

describe('computePlanTotals', () => {
  it('returns empty matrix for empty inputs', () => {
    const out = computePlanTotals({}, [], {});
    expect(out.rows).toEqual([]);
    expect(out.fairShareSeconds).toBe(0);
  });

  it('builds one row per referenced player, sorted by playerId', () => {
    const out = computePlanTotals(
      { g1: draft() },
      ['g1'],
      { g1: game(10) },
    );
    const ids = out.rows.map((r) => r.playerId);
    // p0/p1/p2 start the field; p3 is bench (no minutes) → not referenced.
    expect(ids).toEqual(['p0', 'p1', 'p2']);
  });

  it('per-game seconds reflect the per-tab draft, not a shared draft', () => {
    // PR-A's foundational change: each game has its own draft. Assert
    // that the matrix follows that model — p0 starts only in g1, p1
    // only in g2 → distinct per-game cells.
    const out = computePlanTotals(
      {
        g1: { startingXI: { GK: 'p0' }, bench: [], scheduledSubs: [] },
        g2: { startingXI: { GK: 'p1' }, bench: [], scheduledSubs: [] },
      },
      ['g1', 'g2'],
      { g1: game(10), g2: game(10) },
    );
    const byId = new Map(out.rows.map((r) => [r.playerId, r]));
    expect(byId.get('p0')?.perGame.map((c) => c.seconds)).toEqual([1200, 0]);
    expect(byId.get('p1')?.perGame.map((c) => c.seconds)).toEqual([0, 1200]);
    expect(byId.get('p0')?.totalSeconds).toBe(1200);
    expect(byId.get('p1')?.totalSeconds).toBe(1200);
  });

  it('excluded games show their seconds in cells but skip the row total', () => {
    // includedGameIds = ['g1'] → g2 excluded. Row total only counts g1.
    const out = computePlanTotals(
      { g1: draft(), g2: draft() },
      ['g1', 'g2'],
      { g1: game(10), g2: game(10) },
      ['g1'],
    );
    const p0 = out.rows.find((r) => r.playerId === 'p0')!;
    // Both per-game cells still report 1200s — the cell value is
    // informational; the totalSeconds is the included-only sum.
    expect(p0.perGame.map((c) => c.seconds)).toEqual([1200, 1200]);
    expect(p0.totalSeconds).toBe(1200);
  });

  it('undefined includedGameIds means "all included"', () => {
    const out = computePlanTotals(
      { g1: draft(), g2: draft() },
      ['g1', 'g2'],
      { g1: game(10), g2: game(10) },
      // no includedGameIds → all included
    );
    const p0 = out.rows.find((r) => r.playerId === 'p0')!;
    expect(p0.totalSeconds).toBe(2400); // both games count
  });

  it('flags GK presence as "full" when the same player starts and never gets subbed at GK', () => {
    const out = computePlanTotals(
      { g1: draft() },
      ['g1'],
      { g1: game(10) },
    );
    const p0 = out.rows.find((r) => r.playerId === 'p0')!;
    expect(p0.perGame[0].gk).toBe('full');
  });

  it('flags GK presence as "partial" when the GK role gets subbed mid-game', () => {
    const out = computePlanTotals(
      {
        g1: draft({
          scheduledSubs: [
            {
              id: 's1',
              timeSeconds: 600,
              inPlayer: 'p3',
              positionRole: GOALKEEPER_ROLE,
            },
          ],
        }),
      },
      ['g1'],
      { g1: game(10) },
    );
    const p0 = out.rows.find((r) => r.playerId === 'p0')!;
    const p3 = out.rows.find((r) => r.playerId === 'p3')!;
    // p0 started GK but was subbed off at 600s — partial GK.
    expect(p0.perGame[0].gk).toBe('partial');
    // p3 came on as GK at 600s — also partial (didn't start the game).
    expect(p3.perGame[0].gk).toBe('partial');
  });

  it('GK presence is null for players never at GK', () => {
    const out = computePlanTotals(
      { g1: draft() },
      ['g1'],
      { g1: game(10) },
    );
    const p1 = out.rows.find((r) => r.playerId === 'p1')!; // LB starter
    expect(p1.perGame[0].gk).toBeNull();
  });

  it('skips games whose draft is missing (no contribution, no throw)', () => {
    // A sparse Record (legacy session reopened pre-rebuild) leaves
    // some gameIds without entries. They produce { 0, null } cells
    // and don't contribute to totalSeconds or fairShareSeconds.
    const out = computePlanTotals(
      { g1: draft() }, // g2 missing
      ['g1', 'g2'],
      { g1: game(10), g2: game(10) },
    );
    const p0 = out.rows.find((r) => r.playerId === 'p0')!;
    expect(p0.perGame.map((c) => c.seconds)).toEqual([1200, 0]);
    expect(p0.perGame.map((c) => c.gk)).toEqual(['full', null]);
    expect(p0.totalSeconds).toBe(1200);
  });

  it('fairShareSeconds reflects only included games', () => {
    // 3 starters × 1200s × 1 included game = 3600s total field time;
    // 3 referenced players → 1200s fair share.
    const out = computePlanTotals(
      { g1: draft(), g2: draft() },
      ['g1', 'g2'],
      { g1: game(10), g2: game(10) },
      ['g1'],
    );
    expect(out.fairShareSeconds).toBe(1200);
  });
});

describe('totalBand', () => {
  it('returns "priority" when total is at or above fair share', () => {
    expect(totalBand(1200, 1200)).toBe('priority');
    expect(totalBand(2400, 1200)).toBe('priority');
  });

  it('returns "below-half" when total is under 50% of fair share', () => {
    expect(totalBand(0, 1200)).toBe('below-half');
    expect(totalBand(599, 1200)).toBe('below-half');
  });

  it('returns null between 50% and 100%', () => {
    expect(totalBand(600, 1200)).toBeNull();
    expect(totalBand(900, 1200)).toBeNull();
    expect(totalBand(1199, 1200)).toBeNull();
  });

  it('returns null when fair share is 0 (no included games)', () => {
    // No spurious red on an empty plan.
    expect(totalBand(0, 0)).toBeNull();
    expect(totalBand(100, 0)).toBeNull();
  });
});
