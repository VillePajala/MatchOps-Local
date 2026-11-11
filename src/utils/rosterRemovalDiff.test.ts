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

  /**
   * Review 1.4: a roster read that comes back empty (or not loaded yet) must
   * not read as "every player was deleted" - that wiped live lineups.
   * @critical
   */
  it('prunes nothing when the roster suddenly goes empty, and keeps the last snapshot', () => {
    const first = diffRemovedRosterIds(null, [p('a'), p('b')]);
    const emptied = diffRemovedRosterIds(first.nextSnapshot, []);
    expect(emptied.removedIds.size).toBe(0);
    expect([...emptied.nextSnapshot].sort()).toEqual(['a', 'b']);
    const unloaded = diffRemovedRosterIds(emptied.nextSnapshot, undefined);
    expect(unloaded.removedIds.size).toBe(0);
    expect([...unloaded.nextSnapshot].sort()).toEqual(['a', 'b']);
    // The next real roster is still compared against the last good snapshot,
    // so a genuine deletion that happened meanwhile is still pruned.
    const recovered = diffRemovedRosterIds(unloaded.nextSnapshot, [p('a')]);
    expect([...recovered.removedIds]).toEqual(['b']);
  });

  it('handles an empty or missing first snapshot', () => {
    expect(diffRemovedRosterIds(null, undefined).removedIds.size).toBe(0);
    const empty = diffRemovedRosterIds(null, []);
    const added = diffRemovedRosterIds(empty.nextSnapshot, [p('a')]);
    expect(added.removedIds.size).toBe(0);
    expect(diffRemovedRosterIds(added.nextSnapshot, [p('a')]).removedIds.size).toBe(0);
  });
});
