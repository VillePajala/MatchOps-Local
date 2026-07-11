import {
  defaultSubTimeSeconds,
  makeSub,
  addSub,
  removeSub,
  availableSubInIds,
  removeSubsBringingOn,
  generateSubId,
} from './subs';
import type { PlanGame, PlanSlotAssignment, PlanSub } from './types';

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

describe('availableSubInIds', () => {
  const roster = ['p1', 'p2', 'p3', 'p4', 'p5'];
  const starting: PlanSlotAssignment[] = [
    { slotId: 'gk', playerId: 'p1' },
    { slotId: 's0', playerId: 'p2' },
  ];

  it('excludes starters', () => {
    expect(availableSubInIds(roster, starting, [])).toEqual(['p3', 'p4', 'p5']);
  });

  it('excludes players already coming on in another sub', () => {
    const subs = [makeSub('s0', 'p3', 720)];
    expect(availableSubInIds(roster, starting, subs)).toEqual(['p4', 'p5']);
  });

  it('does not exclude the incoming player of the sub being edited', () => {
    const editing = makeSub('s0', 'p3', 720);
    const subs = [editing, makeSub('gk', 'p4', 720)];
    // Editing this sub: p3 should be selectable again, p4 (other sub) stays excluded.
    expect(availableSubInIds(roster, starting, subs, editing.id)).toEqual(['p3', 'p5']);
  });
});

describe('removeSubsBringingOn', () => {
  it('drops the subs scheduled to bring on the newly placed starter', () => {
    const subs = [makeSub('s0', 'p3', 720), makeSub('gk', 'p4', 720)];
    const result = removeSubsBringingOn(subs, 'p3');
    // p3 was just placed in the starting lineup - being scheduled to "come on"
    // too would double-count their minutes.
    expect(result.map((s) => s.inPlayerId)).toEqual(['p4']);
  });

  it('returns the same array when nothing conflicts (no pointless re-renders)', () => {
    const subs = [makeSub('s0', 'p3', 720)];
    expect(removeSubsBringingOn(subs, 'p5')).toBe(subs);
    expect(removeSubsBringingOn(subs, null)).toBe(subs); // clearing a slot
  });
});
