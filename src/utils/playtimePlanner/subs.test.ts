import {
  defaultSubTimeSeconds,
  makeSub,
  addSub,
  removeSub,
  moveSubToSlot,
  setSubPlayer,
  generateSubId,
} from './subs';
import type { PlanGame, PlanSub } from './types';

const makeGame = (numberOfPeriods: number, periodMinutes: number): PlanGame => ({
  id: 'g1',
  label: 'Game 1',
  formationId: '5v5-2-2',
  numberOfPeriods,
  periodMinutes,
  included: true,
  startingSlots: [],
  subs: [],
});

describe('defaultSubTimeSeconds', () => {
  it('is the start of the second half for a two-period game', () => {
    expect(defaultSubTimeSeconds(makeGame(2, 12))).toBe(12 * 60);
  });

  it('is the midpoint for a single-period game', () => {
    expect(defaultSubTimeSeconds(makeGame(1, 20))).toBe(10 * 60);
  });
});

describe('generateSubId', () => {
  it('produces distinct ids', () => {
    expect(generateSubId()).not.toBe(generateSubId());
  });
});

describe('makeSub / addSub / removeSub', () => {
  it('builds a sub with the given slot, player, and time', () => {
    const sub = makeSub('s1', 'p2', 720);
    expect(sub).toMatchObject({ slotId: 's1', inPlayerId: 'p2', timeSeconds: 720 });
    expect(typeof sub.id).toBe('string');
    expect(sub.id.length).toBeGreaterThan(0);
  });

  it('appends and removes by id', () => {
    const a = makeSub('s1', 'p2', 720);
    const b = makeSub('s2', 'p3', 720);
    let subs: PlanSub[] = [];
    subs = addSub(subs, a);
    subs = addSub(subs, b);
    expect(subs).toHaveLength(2);
    subs = removeSub(subs, a.id);
    expect(subs.map((s) => s.id)).toEqual([b.id]);
  });
});

describe('moveSubToSlot / setSubPlayer (direct-manipulation stint edits)', () => {
  it('moves one sub to another slot, leaving the rest untouched', () => {
    const a = makeSub('s0', 'p2', 720);
    const b = makeSub('s1', 'p3', 900);
    const result = moveSubToSlot([a, b], a.id, 's2');
    expect(result.find((x) => x.id === a.id)).toMatchObject({ slotId: 's2', inPlayerId: 'p2', timeSeconds: 720 });
    expect(result.find((x) => x.id === b.id)).toEqual(b);
  });

  it('hands one sub to another player, leaving the rest untouched', () => {
    const a = makeSub('s0', 'p2', 720);
    const b = makeSub('s1', 'p3', 900);
    const result = setSubPlayer([a, b], a.id, 'p5');
    expect(result.find((x) => x.id === a.id)).toMatchObject({ slotId: 's0', inPlayerId: 'p5' });
    expect(result.find((x) => x.id === b.id)).toEqual(b);
  });
});

// availableSubInIds + removeSubsBringingOn were removed with the Phase-1
// single-swap-window limitation: any player is now schedulable into any sub;
// impossible same-minutes overlaps are flagged by conflicts.ts instead.
