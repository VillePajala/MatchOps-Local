/**
 * Whole-game player swap: trades two players' ENTIRE timelines (kickoff slots
 * + every sub row) in one action. The Timo/Tapio/Sauli scenarios from the
 * feature request are pinned verbatim.
 */
import { swapPlayersInGame } from './swap';
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
