import {
  halftimeSec,
  classifyRoleSplit,
  addHalftimeSplit,
  keepStarter,
  keepSub,
} from '../planHalftimeSplit';
import type { PlanDraft } from '../planSwapEngine';
import type { AppState } from '@/types/game';

const game = (mins = 10, periods: 1 | 2 = 2): AppState =>
  ({
    teamId: 't1',
    teamName: 'Pepo',
    numberOfPeriods: periods,
    periodDurationMinutes: mins,
  }) as unknown as AppState;

const draft = (over: Partial<PlanDraft> = {}): PlanDraft => ({
  startingXI: { GK: 'p0', LB: 'p1' },
  bench: ['p2', 'p3'],
  scheduledSubs: [],
  ...over,
});

describe('halftimeSec', () => {
  it('returns half the total game duration in whole seconds', () => {
    // 2 periods × 10 min = 1200s total → halftime = 600s
    expect(halftimeSec(game(10))).toBe(600);
  });

  it('rounds to a whole second so it lines up with sub.timeSeconds', () => {
    // 2 × 12.5 min = 1500s; half = 750. (Standalone planner uses 750.)
    expect(halftimeSec(game(12.5))).toBe(750);
  });

  it('returns 0 for a missing game', () => {
    expect(halftimeSec(undefined)).toBe(0);
  });

  it('returns 0 for a 0-duration game (no division by zero)', () => {
    expect(halftimeSec(game(0))).toBe(0);
  });

  it('returns 0 for a 1-period game (no halftime concept in single-period match)', () => {
    // Futsal-style single-period games have no halftime break.
    // Surfacing the affordance would create a sub at "half" that
    // doesn't correspond to any real game pause.
    expect(halftimeSec(game(20, 1))).toBe(0);
  });
});

describe('classifyRoleSplit', () => {
  it('returns "no-sub" with canSplit=true when role has no subs and bench is non-empty', () => {
    const r = classifyRoleSplit(draft(), 'GK', game(10));
    expect(r.kind).toBe('no-sub');
    if (r.kind === 'no-sub') expect(r.canSplit).toBe(true);
  });

  it('returns "no-sub" with canSplit=false when bench is empty', () => {
    const r = classifyRoleSplit(draft({ bench: [] }), 'GK', game(10));
    if (r.kind === 'no-sub') expect(r.canSplit).toBe(false);
  });

  it('returns "no-sub" with canSplit=false when game duration is 0', () => {
    const r = classifyRoleSplit(draft(), 'GK', game(0));
    if (r.kind === 'no-sub') expect(r.canSplit).toBe(false);
  });

  it('returns "split" when role has exactly one sub at halftime', () => {
    const r = classifyRoleSplit(
      draft({
        scheduledSubs: [
          { id: 's1', timeSeconds: 600, inPlayer: 'p2', positionRole: 'GK' },
        ],
      }),
      'GK',
      game(10),
    );
    expect(r.kind).toBe('split');
    if (r.kind === 'split') {
      expect(r.starter).toBe('p0');
      expect(r.subId).toBe('s1');
      expect(r.subPlayer).toBe('p2');
    }
  });

  it('returns "complex" when role has one sub NOT at halftime', () => {
    const r = classifyRoleSplit(
      draft({
        scheduledSubs: [
          { id: 's1', timeSeconds: 300, inPlayer: 'p2', positionRole: 'GK' },
        ],
      }),
      'GK',
      game(10),
    );
    expect(r.kind).toBe('complex');
  });

  it('returns "complex" when role has 2+ subs', () => {
    const r = classifyRoleSplit(
      draft({
        scheduledSubs: [
          { id: 's1', timeSeconds: 600, inPlayer: 'p2', positionRole: 'GK' },
          { id: 's2', timeSeconds: 900, inPlayer: 'p3', positionRole: 'GK' },
        ],
      }),
      'GK',
      game(10),
    );
    expect(r.kind).toBe('complex');
  });

  it('returns "complex" for a 1-period game even with a sub at timeSeconds === 0', () => {
    // Without the half > 0 guard, halftimeSec returns 0 for a
    // 1-period game and a sub at timeSeconds === 0 would misclassify
    // as 'split' — surfacing the Keep-starter / Keep-sub UI in a
    // game that has no halftime concept.
    const r = classifyRoleSplit(
      draft({
        scheduledSubs: [
          { id: 's1', timeSeconds: 0, inPlayer: 'p2', positionRole: 'GK' },
        ],
      }),
      'GK',
      game(20, 1),
    );
    expect(r.kind).toBe('complex');
  });

  it('classifies each role independently when other roles have subs', () => {
    const d = draft({
      scheduledSubs: [
        { id: 's1', timeSeconds: 600, inPlayer: 'p2', positionRole: 'LB' },
      ],
    });
    expect(classifyRoleSplit(d, 'GK', game(10)).kind).toBe('no-sub');
    expect(classifyRoleSplit(d, 'LB', game(10)).kind).toBe('split');
  });
});

describe('addHalftimeSplit', () => {
  it('appends a sub at halftime with bench[0] as inPlayer', () => {
    const next = addHalftimeSplit(draft(), 'GK', game(10), 'sub_new');
    expect(next.scheduledSubs).toHaveLength(1);
    expect(next.scheduledSubs[0]).toEqual({
      id: 'sub_new',
      timeSeconds: 600,
      inPlayer: 'p2',
      positionRole: 'GK',
    });
  });

  it('removes the sub-in player from the bench (so post-Apply bench is accurate)', () => {
    const next = addHalftimeSplit(draft(), 'GK', game(10), 'sub_new');
    expect(next.bench).toEqual(['p3']);
  });

  it('is a no-op when bench is empty', () => {
    const d = draft({ bench: [] });
    expect(addHalftimeSplit(d, 'GK', game(10), 'sub_new')).toBe(d);
  });

  it('is a no-op when game has 0 duration', () => {
    const d = draft();
    expect(addHalftimeSplit(d, 'GK', game(0), 'sub_new')).toBe(d);
  });

  it('is a no-op when role already has a sub', () => {
    const d = draft({
      scheduledSubs: [
        { id: 's1', timeSeconds: 600, inPlayer: 'p2', positionRole: 'GK' },
      ],
    });
    expect(addHalftimeSplit(d, 'GK', game(10), 'sub_new')).toBe(d);
  });

  it('keeps scheduledSubs sorted by timeSeconds when other subs exist', () => {
    const d = draft({
      scheduledSubs: [
        // sub on a different role at 1200s
        { id: 's_late', timeSeconds: 1200, inPlayer: 'p3', positionRole: 'LB' },
      ],
    });
    const next = addHalftimeSplit(d, 'GK', game(10), 'sub_new');
    const times = next.scheduledSubs.map((s) => s.timeSeconds);
    expect(times).toEqual([600, 1200]);
  });
});

describe('keepStarter', () => {
  it('removes the half-time sub and returns the sub player to the bench', () => {
    const d = draft({
      scheduledSubs: [
        { id: 's1', timeSeconds: 600, inPlayer: 'p2', positionRole: 'GK' },
      ],
      bench: ['p3'],
    });
    const next = keepStarter(d, 'GK', game(10));
    expect(next.scheduledSubs).toEqual([]);
    // p2 (the previous sub) returns to the bench.
    expect(next.bench).toEqual(['p3', 'p2']);
    // Starter unchanged.
    expect(next.startingXI.GK).toBe('p0');
  });

  it('is a no-op for a complex role state', () => {
    const d = draft({
      scheduledSubs: [
        // Not at halftime → complex
        { id: 's1', timeSeconds: 300, inPlayer: 'p2', positionRole: 'GK' },
      ],
    });
    expect(keepStarter(d, 'GK', game(10))).toBe(d);
  });
});

describe('keepSub', () => {
  it('promotes the sub player to starter and benches the old starter', () => {
    const d = draft({
      scheduledSubs: [
        { id: 's1', timeSeconds: 600, inPlayer: 'p2', positionRole: 'GK' },
      ],
      bench: ['p3'],
    });
    const next = keepSub(d, 'GK', game(10));
    expect(next.scheduledSubs).toEqual([]);
    expect(next.startingXI.GK).toBe('p2');
    // p0 (the previous starter) returns to bench.
    expect(next.bench).toEqual(['p3', 'p0']);
  });

  it('is a no-op for a complex role state', () => {
    const d = draft({
      scheduledSubs: [
        { id: 's1', timeSeconds: 300, inPlayer: 'p2', positionRole: 'GK' },
        { id: 's2', timeSeconds: 600, inPlayer: 'p3', positionRole: 'GK' },
      ],
    });
    expect(keepSub(d, 'GK', game(10))).toBe(d);
  });

  it('handles a split where the role had no original starter (imported drafts)', () => {
    // Edge case: imported draft can have a split where startingXI[role]
    // is undefined. Promoting the sub still works; bench stays
    // unchanged since there's no starter to push onto it.
    const d = draft({
      startingXI: { LB: 'p1' }, // GK absent
      scheduledSubs: [
        { id: 's1', timeSeconds: 600, inPlayer: 'p2', positionRole: 'GK' },
      ],
      bench: ['p3'],
    });
    const next = keepSub(d, 'GK', game(10));
    expect(next.startingXI.GK).toBe('p2');
    expect(next.bench).toEqual(['p3']);
  });
});
