/**
 * Whole-game player swap: trades two players' ENTIRE timelines (kickoff slots
 * + every sub row) in one action. The Timo/Tapio/Sauli scenarios from the
 * feature request are pinned verbatim.
 */
import { placePlayerInSlot, swapPlayersInGame } from './swap';
import { toEngineGame } from './adapter';
import { computeSlotSegments } from './minutes';
import type { PlanGame } from './types';

// Real formation preset: '5v5-2-2' yields slots gk + s0..s3 - ensureStartingSlots
// normalizes stored assignments onto exactly these ids.
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

describe('swapPlayersInGame', () => {
  // Scenario: Timo starts attacker (slot A), Sauli subs in at 25'.
  // Tapio holds AM (slot B) all game.
  const scenario = (): PlanGame =>
    baseGame({
      startingSlots: [
        { slotId: 'gk', playerId: null },
        { slotId: 's0', playerId: 'timo' },
        { slotId: 's1', playerId: 'tapio' },
        { slotId: 's2', playerId: null },
      ],
      subs: [{ id: 's1', slotId: 's0', timeSeconds: 25 * 60, inPlayerId: 'sauli' }],
    });

  it('swap(Timo, Tapio): Tapio starts attacker and is subbed for Sauli; Timo plays AM all game', () => {
    const out = swapPlayersInGame(scenario(), 'timo', 'tapio');
    expect(out.startingSlots.find((s) => s.slotId === 's0')?.playerId).toBe('tapio');
    expect(out.startingSlots.find((s) => s.slotId === 's1')?.playerId).toBe('timo');
    // The sub row is untouched: Sauli still comes in at 25'.
    expect(out.subs).toEqual([{ id: 's1', slotId: 's0', timeSeconds: 1500, inPlayerId: 'sauli' }]);
  });

  it('swap(Sauli, Tapio): Timo still starts attacker, Tapio subs in at 25\', Sauli plays AM all game', () => {
    const out = swapPlayersInGame(scenario(), 'sauli', 'tapio');
    expect(out.startingSlots.find((s) => s.slotId === 's0')?.playerId).toBe('timo');
    expect(out.startingSlots.find((s) => s.slotId === 's1')?.playerId).toBe('sauli');
    expect(out.subs).toEqual([{ id: 's1', slotId: 's0', timeSeconds: 1500, inPlayerId: 'tapio' }]);
  });

  it('swapping with an unplaced player replaces every appearance (the other ends up unplaced)', () => {
    const out = swapPlayersInGame(scenario(), 'timo', 'pekka');
    expect(out.startingSlots.find((s) => s.slotId === 's0')?.playerId).toBe('pekka');
    // Timo appears nowhere any more.
    expect(out.startingSlots.some((s) => s.playerId === 'timo')).toBe(false);
    expect(out.subs.some((s) => s.inPlayerId === 'timo')).toBe(false);
  });

  it('swaps sub rows in BOTH directions (both players scheduled as incomers)', () => {
    const game = baseGame({
      startingSlots: [
        { slotId: 's0', playerId: 'a' },
        { slotId: 's1', playerId: 'b' },
      ],
      subs: [
        { id: 's1', slotId: 's0', timeSeconds: 600, inPlayerId: 'x' },
        { id: 's2', slotId: 's1', timeSeconds: 900, inPlayerId: 'y' },
      ],
    });
    const out = swapPlayersInGame(game, 'x', 'y');
    expect(out.subs.find((s) => s.id === 's1')?.inPlayerId).toBe('y');
    expect(out.subs.find((s) => s.id === 's2')?.inPlayerId).toBe('x');
  });

  it('is identity for equal ids and never duplicates a starter (permutation)', () => {
    const game = scenario();
    expect(swapPlayersInGame(game, 'timo', 'timo')).toBe(game);
    const out = swapPlayersInGame(game, 'timo', 'tapio');
    const assigned = out.startingSlots.map((s) => s.playerId).filter(Boolean);
    expect(new Set(assigned).size).toBe(assigned.length);
  });
});

/** No player holds two slots at the same moment. */
const doubleBooked = (game: PlanGame): string[] => {
  const engine = toEngineGame(game);
  const segs = engine.slots.flatMap((slot) => computeSlotSegments(engine, slot.slotId)).filter((s) => s.playerId);
  const out = new Set<string>();
  segs.forEach((a, i) =>
    segs.forEach((b, j) => {
      if (i < j && a.playerId === b.playerId && a.startSeconds < b.endSeconds && b.startSeconds < a.endSeconds) {
        out.add(a.playerId!);
      }
    }),
  );
  return [...out];
};

describe('placePlayerInSlot', () => {
  // 2 x 15: Otso starts #1 (s0), Onni starts #5 (s3); Aatos comes on for Onni at 15'.
  const repro = (): PlanGame =>
    baseGame({
      numberOfPeriods: 2,
      periodMinutes: 15,
      startingSlots: [
        { slotId: 'gk', playerId: 'toivo' },
        { slotId: 's0', playerId: 'otso' },
        { slotId: 's1', playerId: 'eino' },
        { slotId: 's2', playerId: null },
        { slotId: 's3', playerId: 'onni' },
      ],
      subs: [{ id: 'x', slotId: 's3', timeSeconds: 15 * 60, inPlayerId: 'aatos' }],
    });

  /**
   * @critical - live repro h3-10: tap the starter Otso, then the bench player
   * Aatos who comes on at 15'. Aatos must not end up in #1 AND #5.
   */
  it('a bench player placed onto a held position swaps games with its holder', () => {
    const out = placePlayerInSlot(repro(), 's0', 'aatos');
    expect(doubleBooked(out)).toEqual([]);
    expect(out.startingSlots.find((s) => s.slotId === 's0')?.playerId).toBe('aatos');
    // Otso takes Aatos's planned change: on for Onni at 15'.
    expect(out.subs).toEqual([{ id: 'x', slotId: 's3', timeSeconds: 15 * 60, inPlayerId: 'otso' }]);
  });

  /** @critical - onto an empty spot: starts there, and the overlapping change goes. */
  it('a player with a planned change placed onto an empty position is never in two places', () => {
    const out = placePlayerInSlot(repro(), 's2', 'aatos');
    expect(doubleBooked(out)).toEqual([]);
    expect(out.startingSlots.find((s) => s.slotId === 's2')?.playerId).toBe('aatos');
    // Onni simply stays on in #5.
    expect(out.subs).toEqual([]);
  });

  it('keeps a later return that does not overlap', () => {
    const game = baseGame({
      startingSlots: [
        { slotId: 'gk', playerId: 'toivo' },
        { slotId: 's0', playerId: 'otso' },
        { slotId: 's1', playerId: null },
        { slotId: 's2', playerId: 'eino' },
        { slotId: 's3', playerId: 'onni' },
      ],
      subs: [
        // Elias comes on into the empty s1 at 10', ending Aatos's stint there...
        { id: 'a', slotId: 's1', timeSeconds: 10 * 60, inPlayerId: 'elias' },
        // ...and Aatos returns into s3 at 40', after his own stint in s1 ends at 10'.
        { id: 'b', slotId: 's3', timeSeconds: 40 * 60, inPlayerId: 'aatos' },
      ],
    });
    const out = placePlayerInSlot(game, 's1', 'aatos');
    expect(doubleBooked(out)).toEqual([]);
    expect(out.subs.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('clears a position with null and is a no-op for the same player', () => {
    const game = repro();
    expect(placePlayerInSlot(game, 's0', 'otso')).toBe(game);
    expect(placePlayerInSlot(game, 's0', null).startingSlots.find((s) => s.slotId === 's0')?.playerId).toBeNull();
  });
});
