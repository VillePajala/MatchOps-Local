import {
  getGameSlots,
  ensureStartingSlots,
  assignPlayerToSlot,
  benchPlayerIds,
  GK_SLOT,
} from './lineup';
import type { PlanGame, PlanSlotAssignment } from './types';

const makeGame = (formationId: string, startingSlots: PlanSlotAssignment[] = []): PlanGame => ({
  id: 'g1',
  label: 'Game 1',
  formationId,
  numberOfPeriods: 2,
  periodMinutes: 12,
  included: true,
  startingSlots,
  subs: [],
});

describe('getGameSlots', () => {
  it('puts the goalkeeper first, then the formation field positions', () => {
    // 8v8-2-1-2-1-1 has 7 field players -> 8 slots incl. GK.
    const slots = getGameSlots('8v8-2-1-2-1-1');
    expect(slots).toHaveLength(8);
    expect(slots[0]).toEqual({ slotId: 'gk', relX: GK_SLOT.relX, relY: GK_SLOT.relY, isGoalie: true });
    expect(slots.slice(1).map((s) => s.slotId)).toEqual(['s0', 's1', 's2', 's3', 's4', 's5', 's6']);
    expect(slots.slice(1).every((s) => !s.isGoalie)).toBe(true);
  });

  it('returns just the goalkeeper for an unknown formation', () => {
    expect(getGameSlots('nope')).toEqual([
      { slotId: 'gk', relX: GK_SLOT.relX, relY: GK_SLOT.relY, isGoalie: true },
    ]);
  });
});

describe('ensureStartingSlots', () => {
  it('creates a null assignment per slot when none exist', () => {
    const slots = ensureStartingSlots(makeGame('5v5-2-2')); // 4 field + GK = 5
    expect(slots).toHaveLength(5);
    expect(slots.every((s) => s.playerId === null)).toBe(true);
  });

  it('preserves existing assignments by slot id', () => {
    const game = makeGame('5v5-2-2', [
      { slotId: 'gk', playerId: 'keeper' },
      { slotId: 's1', playerId: 'p1' },
    ]);
    const slots = ensureStartingSlots(game);
    expect(slots.find((s) => s.slotId === 'gk')?.playerId).toBe('keeper');
    expect(slots.find((s) => s.slotId === 's1')?.playerId).toBe('p1');
    expect(slots.find((s) => s.slotId === 's0')?.playerId).toBeNull();
  });

  it('drops stale assignments whose slot no longer exists in the formation', () => {
    // 3v3-1-1 has 2 field slots (s0,s1) + GK. A stale s5 must be dropped.
    const game = makeGame('3v3-1-1', [
      { slotId: 's0', playerId: 'p1' },
      { slotId: 's5', playerId: 'ghost' },
    ]);
    const slots = ensureStartingSlots(game);
    expect(slots.map((s) => s.slotId)).toEqual(['gk', 's0', 's1']);
    expect(slots.some((s) => s.playerId === 'ghost')).toBe(false);
  });
});

describe('assignPlayerToSlot', () => {
  const base: PlanSlotAssignment[] = [
    { slotId: 'gk', playerId: null },
    { slotId: 's0', playerId: null },
    { slotId: 's1', playerId: null },
  ];

  it('assigns a player to an empty slot', () => {
    const next = assignPlayerToSlot(base, 's0', 'p1');
    expect(next.find((s) => s.slotId === 's0')?.playerId).toBe('p1');
  });

  it('clears a slot with null', () => {
    const filled = assignPlayerToSlot(base, 's0', 'p1');
    const cleared = assignPlayerToSlot(filled, 's0', null);
    expect(cleared.find((s) => s.slotId === 's0')?.playerId).toBeNull();
  });

  it('moves a player out of their previous slot (one slot per player)', () => {
    const filled = assignPlayerToSlot(base, 's0', 'p1');
    const moved = assignPlayerToSlot(filled, 's1', 'p1');
    expect(moved.find((s) => s.slotId === 's0')?.playerId).toBeNull();
    expect(moved.find((s) => s.slotId === 's1')?.playerId).toBe('p1');
  });

  it('swaps are not implicit: assigning over an occupied slot keeps the displaced player off', () => {
    let slots = assignPlayerToSlot(base, 's0', 'p1');
    slots = assignPlayerToSlot(slots, 's1', 'p2');
    // Put p1 into s1 (occupied by p2): p1 leaves s0, p2 is overwritten (benched).
    slots = assignPlayerToSlot(slots, 's1', 'p1');
    expect(slots.find((s) => s.slotId === 's0')?.playerId).toBeNull();
    expect(slots.find((s) => s.slotId === 's1')?.playerId).toBe('p1');
    expect(slots.some((s) => s.playerId === 'p2')).toBe(false);
  });
});

describe('benchPlayerIds', () => {
  it('returns roster players not holding a slot', () => {
    const slots: PlanSlotAssignment[] = [
      { slotId: 'gk', playerId: 'p1' },
      { slotId: 's0', playerId: null },
      { slotId: 's1', playerId: 'p3' },
    ];
    expect(benchPlayerIds(['p1', 'p2', 'p3', 'p4'], slots)).toEqual(['p2', 'p4']);
  });

  it('returns the whole roster when nothing is assigned', () => {
    const slots: PlanSlotAssignment[] = [{ slotId: 'gk', playerId: null }];
    expect(benchPlayerIds(['a', 'b'], slots)).toEqual(['a', 'b']);
  });
});
