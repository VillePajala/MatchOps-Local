/**
 * L.2 pruning-cascade semantics: removals are detected only against a
 * PREVIOUS in-session snapshot - never on first observation.
 */
import { diffRemovedRosterIds } from './rosterRemovalDiff';
import type { Player } from '@/types';

const p = (id: string): Player => ({ id, name: id, jerseyNumber: '', notes: '', nickname: '' });

describe('diffRemovedRosterIds (L.2 pruning cascade)', () => {
  it('first snapshot reports no removals (legacy games with long-gone players untouched)', () => {
    const { removedIds, nextSnapshot } = diffRemovedRosterIds(null, [p('a'), p('b')]);
    expect(removedIds.size).toBe(0);
    expect([...nextSnapshot].sort()).toEqual(['a', 'b']);
  });

  it('detects players removed since the previous snapshot', () => {
    const first = diffRemovedRosterIds(null, [p('a'), p('b'), p('c')]);
    const second = diffRemovedRosterIds(first.nextSnapshot, [p('a'), p('c')]);
    expect([...second.removedIds]).toEqual(['b']);
  });

  it('ignores additions and unchanged rosters', () => {
    const first = diffRemovedRosterIds(null, [p('a')]);
    const second = diffRemovedRosterIds(first.nextSnapshot, [p('a'), p('new')]);
    expect(second.removedIds.size).toBe(0);
    const third = diffRemovedRosterIds(second.nextSnapshot, [p('a'), p('new')]);
    expect(third.removedIds.size).toBe(0);
  });

  it('handles an emptied roster and undefined input', () => {
    const first = diffRemovedRosterIds(null, [p('a'), p('b')]);
    const second = diffRemovedRosterIds(first.nextSnapshot, []);
    expect([...second.removedIds].sort()).toEqual(['a', 'b']);
    const third = diffRemovedRosterIds(second.nextSnapshot, undefined);
    expect(third.removedIds.size).toBe(0);
  });
});
