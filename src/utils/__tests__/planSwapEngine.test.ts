/**
 * Pure-logic tests for the planner's in-memory swap engine.
 *
 * @critical These cases pin down the swap contract before the editor UI
 * lands. Same starting-XI semantics the standalone planner uses.
 */

import {
  performSwap,
  createEmptyDraft,
  checkRosterIntegrity,
  BENCH,
  type PlanDraft,
} from '@/utils/planSwapEngine';

const roster = ['p1', 'p2', 'p3', 'p4', 'p5'];

const draftWith = (overrides: Partial<PlanDraft> = {}): PlanDraft => ({
  startingXI: { GK: 'p1', LB: 'p2', RB: 'p3' },
  bench: ['p4', 'p5'],
  ...overrides,
});

describe('createEmptyDraft', () => {
  it('puts every roster player on the bench in order', () => {
    const draft = createEmptyDraft(roster);
    expect(draft.startingXI).toEqual({});
    expect(draft.bench).toEqual(roster);
  });

  it('returns a fresh array (not the input)', () => {
    const draft = createEmptyDraft(roster);
    expect(draft.bench).not.toBe(roster);
  });
});

describe('performSwap — invalid ops are no-ops', () => {
  it('source === target is a no-op', () => {
    const draft = draftWith();
    expect(performSwap(draft, { source: 'GK', target: 'GK' })).toBe(draft);
  });

  it('bench → bench is a no-op', () => {
    const draft = draftWith();
    expect(performSwap(draft, { source: BENCH, target: BENCH })).toBe(draft);
  });

  it('bench op without benchPlayerId is a no-op', () => {
    const draft = draftWith();
    expect(performSwap(draft, { source: BENCH, target: 'CM' })).toBe(draft);
  });

  it('bench op with unknown benchPlayerId is a no-op', () => {
    const draft = draftWith();
    expect(
      performSwap(draft, { source: BENCH, target: 'CM', benchPlayerId: 'nope' }),
    ).toBe(draft);
  });

  it('field → bench when role is empty is a no-op', () => {
    const draft = draftWith({ startingXI: {}, bench: roster });
    expect(performSwap(draft, { source: 'GK', target: BENCH })).toBe(draft);
  });

  it('field-to-field where both roles are empty is a no-op', () => {
    const draft = draftWith({ startingXI: {} });
    expect(performSwap(draft, { source: 'CM', target: 'ST' })).toBe(draft);
  });
});

describe('performSwap — field ↔ field', () => {
  it('swaps two assigned roles', () => {
    const draft = draftWith();
    const next = performSwap(draft, { source: 'GK', target: 'LB' });
    expect(next.startingXI).toEqual({ GK: 'p2', LB: 'p1', RB: 'p3' });
    expect(next.bench).toEqual(['p4', 'p5']);
  });

  it('moves player into an empty role and clears the source', () => {
    const draft = draftWith();
    const next = performSwap(draft, { source: 'GK', target: 'CM' });
    expect(next.startingXI.CM).toBe('p1');
    expect(next.startingXI.GK).toBeUndefined();
  });

  it('does not mutate the input draft (startingXI or bench)', () => {
    const draft = draftWith();
    const benchSnapshot = [...draft.bench];
    performSwap(draft, { source: 'GK', target: 'LB' });
    expect(draft.startingXI).toEqual({ GK: 'p1', LB: 'p2', RB: 'p3' });
    expect(draft.bench).toEqual(benchSnapshot);
  });
});

describe('performSwap — bench ↔ field', () => {
  it('bench → empty role: assigns and removes from bench', () => {
    const draft = draftWith();
    const next = performSwap(draft, {
      source: BENCH,
      target: 'CM',
      benchPlayerId: 'p4',
    });
    expect(next.startingXI.CM).toBe('p4');
    expect(next.bench).toEqual(['p5']);
  });

  it('bench → assigned role: displaced player goes to bench tail', () => {
    const draft = draftWith();
    const next = performSwap(draft, {
      source: BENCH,
      target: 'GK',
      benchPlayerId: 'p4',
    });
    expect(next.startingXI.GK).toBe('p4');
    // p1 was displaced; bench was [p4, p5] minus p4 plus p1 = [p5, p1]
    expect(next.bench).toEqual(['p5', 'p1']);
  });

  it('field → bench: clears the role, appends to bench tail', () => {
    const draft = draftWith();
    const next = performSwap(draft, { source: 'GK', target: BENCH });
    expect(next.startingXI.GK).toBeUndefined();
    expect(next.bench).toEqual(['p4', 'p5', 'p1']);
  });

  it('bench-to-field and field-to-bench each preserve roster integrity (different ops, both clean)', () => {
    const draft = draftWith();
    const a = performSwap(draft, {
      source: BENCH,
      target: 'GK',
      benchPlayerId: 'p4',
    });
    const b = performSwap(draft, {
      source: 'GK',
      target: BENCH,
    });
    // a: bench player p4 replaces GK p1; p1 displaced to bench tail.
    // b: GK p1 moved to bench; GK slot becomes empty.
    // Different state, but each individually preserves roster integrity.
    expect(checkRosterIntegrity(a, roster)).toEqual({
      duplicates: [],
      missing: [],
      orphans: [],
    });
    expect(checkRosterIntegrity(b, roster)).toEqual({
      duplicates: [],
      missing: [],
      orphans: [],
    });
  });
});

describe('checkRosterIntegrity', () => {
  it('returns no violations for a healthy draft', () => {
    expect(checkRosterIntegrity(draftWith(), roster)).toEqual({
      duplicates: [],
      missing: [],
      orphans: [],
    });
  });

  it('flags duplicate players (in startingXI and bench)', () => {
    const broken: PlanDraft = {
      startingXI: { GK: 'p1', LB: 'p2' },
      bench: ['p1', 'p3'], // p1 appears twice
    };
    const r = checkRosterIntegrity(broken, ['p1', 'p2', 'p3']);
    expect(r.duplicates).toEqual(['p1']);
  });

  it('flags missing players (roster has them, draft does not)', () => {
    const broken: PlanDraft = { startingXI: { GK: 'p1' }, bench: ['p2'] };
    const r = checkRosterIntegrity(broken, ['p1', 'p2', 'p3']);
    expect(r.missing).toEqual(['p3']);
  });

  it('flags orphan players (in draft but not in roster)', () => {
    const broken: PlanDraft = {
      startingXI: { GK: 'pX' },
      bench: ['p2'],
    };
    const r = checkRosterIntegrity(broken, ['p1', 'p2']);
    expect(r.orphans).toEqual(['pX']);
    expect(r.missing).toEqual(['p1']);
  });

  it('healthy after a sequence of swaps', () => {
    let draft = createEmptyDraft(roster);
    draft = performSwap(draft, { source: BENCH, target: 'GK', benchPlayerId: 'p1' });
    draft = performSwap(draft, { source: BENCH, target: 'LB', benchPlayerId: 'p2' });
    draft = performSwap(draft, { source: 'GK', target: 'LB' });
    draft = performSwap(draft, { source: 'GK', target: BENCH });
    const r = checkRosterIntegrity(draft, roster);
    expect(r).toEqual({ duplicates: [], missing: [], orphans: [] });
  });
});
