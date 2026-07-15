/**
 * Simultaneity conflicts: a player may hold many positions across a game -
 * rotations, re-entry after coming off - but never two slots during the same
 * minutes. The detector flags exactly those windows and nothing else.
 */
import { findSimultaneityConflicts, conflictedPlayerIds, conflictedSlotIds } from './conflicts';
import type { PlanGame } from './types';

// Real preset '5v5-2-2': slots gk + s0..s3, 2x25' game (3000s).
const baseGame = (over: Partial<PlanGame> = {}): PlanGame => ({
  id: 'g1',
  label: 'Game 1',
  formationId: '5v5-2-2',
  numberOfPeriods: 2,
  periodMinutes: 25,
  included: true,
  startingSlots: [],
  subs: [],
  ...over,
});

describe('findSimultaneityConflicts', () => {
  it('a clean lineup with rotations has no conflicts', () => {
    // A and B alternate slot s0 every 10 minutes - the exact pattern the
    // feature request demands must be legal.
    const game = baseGame({
      startingSlots: [{ slotId: 's0', playerId: 'a' }],
      subs: [
        { id: '1', slotId: 's0', timeSeconds: 600, inPlayerId: 'b' },
        { id: '2', slotId: 's0', timeSeconds: 1200, inPlayerId: 'a' },
        { id: '3', slotId: 's0', timeSeconds: 1800, inPlayerId: 'b' },
      ],
    });
    expect(findSimultaneityConflicts(game)).toEqual([]);
  });

  it('re-entry in ANOTHER slot after coming off is legal', () => {
    // A starts s0, comes off at 15' (B in), re-enters s1 at 20'.
    const game = baseGame({
      startingSlots: [
        { slotId: 's0', playerId: 'a' },
        { slotId: 's1', playerId: 'c' },
      ],
      subs: [
        { id: '1', slotId: 's0', timeSeconds: 900, inPlayerId: 'b' },
        { id: '2', slotId: 's1', timeSeconds: 1200, inPlayerId: 'a' },
      ],
    });
    expect(findSimultaneityConflicts(game)).toEqual([]);
  });

  it('flags a player scheduled in two slots at the same minutes', () => {
    // A starts s0 the whole game AND subs into s1 at 20' - impossible from 20' on.
    const game = baseGame({
      startingSlots: [
        { slotId: 's0', playerId: 'a' },
        { slotId: 's1', playerId: 'c' },
      ],
      subs: [{ id: '1', slotId: 's1', timeSeconds: 1200, inPlayerId: 'a' }],
    });
    const conflicts = findSimultaneityConflicts(game);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      playerId: 'a',
      overlapStartSeconds: 1200,
      overlapEndSeconds: 3000,
    });
    expect([conflicts[0].slotIdA, conflicts[0].slotIdB].sort()).toEqual(['s0', 's1']);
    expect([...conflictedPlayerIds(conflicts)]).toEqual(['a']);
    expect([...conflictedSlotIds(conflicts)].sort()).toEqual(['s0', 's1']);
  });

  it('no conflict when the windows only touch (out at 25\', in elsewhere at 25\')', () => {
    const game = baseGame({
      startingSlots: [
        { slotId: 's0', playerId: 'a' },
        { slotId: 's1', playerId: 'c' },
      ],
      subs: [
        { id: '1', slotId: 's0', timeSeconds: 1500, inPlayerId: 'b' },
        { id: '2', slotId: 's1', timeSeconds: 1500, inPlayerId: 'a' },
      ],
    });
    expect(findSimultaneityConflicts(game)).toEqual([]);
  });

  it('flags a partial overlap window precisely', () => {
    // A holds s0 from 0-20' (B in at 20'); A also subs into s1 at 15'.
    // Overlap: 15'-20'.
    const game = baseGame({
      startingSlots: [
        { slotId: 's0', playerId: 'a' },
        { slotId: 's1', playerId: 'c' },
      ],
      subs: [
        { id: '1', slotId: 's0', timeSeconds: 1200, inPlayerId: 'b' },
        { id: '2', slotId: 's1', timeSeconds: 900, inPlayerId: 'a' },
      ],
    });
    const conflicts = findSimultaneityConflicts(game);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      playerId: 'a',
      overlapStartSeconds: 900,
      overlapEndSeconds: 1200,
    });
  });
});
