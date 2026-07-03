import { buildPrefillFromPlan } from './prefill';
import type { PlaytimePlan, PlanGame } from './types';
import type { Player } from '@/types';

const roster: Player[] = [
  { id: 'a', name: 'Alex' },
  { id: 'b', name: 'Sam' },
  { id: 'c', name: 'Jo' },
  { id: 'd', name: 'Max' },
  { id: 'e', name: 'Kai' },
  { id: 'f', name: 'Niko' }, // bench, comes on as a sub
];

// 5v5-2-2 -> GK + 4 field slots (s0..s3).
const planGame = (over: Partial<PlanGame> = {}): PlanGame => ({
  id: 'g1',
  label: 'Game 1',
  formationId: '5v5-2-2',
  numberOfPeriods: 2,
  periodMinutes: 12,
  included: true,
  startingSlots: [
    { slotId: 'gk', playerId: 'a' },
    { slotId: 's0', playerId: 'b' },
    { slotId: 's1', playerId: 'c' },
    { slotId: 's2', playerId: 'd' },
    { slotId: 's3', playerId: 'e' },
  ],
  subs: [{ id: 'x', slotId: 's0', timeSeconds: 720, inPlayerId: 'f' }],
  ...over,
});

const plan = (game: PlanGame, playerIds = ['a', 'b', 'c', 'd', 'e', 'f']): PlaytimePlan => ({
  id: 'p',
  name: 'Plan',
  version: 1,
  createdAt: 'x',
  updatedAt: 'x',
  players: playerIds.map((id) => ({ id, name: id })),
  games: [game],
});

describe('buildPrefillFromPlan', () => {
  /** @critical the planned XI must land on the field at the right formation positions. */
  it('places the planned XI on the field at their formation slots', () => {
    const g = planGame();
    const res = buildPrefillFromPlan(plan(g), g, roster);
    expect(res.playersOnField).toHaveLength(5);
    // Every placed player carries 0..1 coordinates and keeps their identity.
    for (const p of res.playersOnField) {
      expect(typeof p.relX).toBe('number');
      expect(typeof p.relY).toBe('number');
      expect(p.relX).toBeGreaterThanOrEqual(0);
      expect(p.relX).toBeLessThanOrEqual(1);
    }
    const gk = res.playersOnField.find((p) => p.id === 'a')!;
    expect(gk.isGoalie).toBe(true);
    expect(gk.relY).toBe(0.92); // GK_SLOT
    expect(res.playersOnField.find((p) => p.id === 'b')!.isGoalie).toBe(false);
    expect(res.playersOnField.find((p) => p.id === 'b')!.name).toBe('Sam');
  });

  it('selects the plan squad, limited to players still in the roster', () => {
    const g = planGame();
    const res = buildPrefillFromPlan(plan(g), g, roster);
    expect(res.selectedPlayerIds.sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  /** @critical planned subs drive the live prompt, so in/out must be right. */
  it('maps subs and fills outPlayerId from the slot starter', () => {
    const g = planGame();
    const res = buildPrefillFromPlan(plan(g), g, roster);
    expect(res.plannedSubs).toEqual([
      { id: 'x', slotId: 's0', timeSeconds: 720, inPlayerId: 'f', outPlayerId: 'b' },
    ]);
  });

  it('reports and skips planned players not in the roster', () => {
    const g = planGame({
      startingSlots: [
        { slotId: 'gk', playerId: 'ghost' }, // not in roster
        { slotId: 's0', playerId: 'b' },
      ],
    });
    const res = buildPrefillFromPlan(plan(g, ['ghost', 'b']), g, roster);
    expect(res.missingPlayerIds).toEqual(['ghost']);
    expect(res.playersOnField.map((p) => p.id)).toEqual(['b']); // ghost skipped
    expect(res.selectedPlayerIds).toEqual(['b']); // ghost filtered out of the squad
  });

  it('leaves empty slots unplaced (partial lineup prefills what exists)', () => {
    const g = planGame({
      startingSlots: [
        { slotId: 'gk', playerId: 'a' },
        { slotId: 's0', playerId: 'b' },
      ],
      subs: [],
    });
    const res = buildPrefillFromPlan(plan(g), g, roster);
    expect(res.playersOnField.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(res.plannedSubs).toEqual([]);
  });

  it('skips an incomplete sub with no incoming player', () => {
    const g = planGame({
      subs: [
        { id: 'x', slotId: 's0', timeSeconds: 720, inPlayerId: 'f' },
        { id: 'y', slotId: 's1', timeSeconds: 720, inPlayerId: null }, // incomplete
      ],
    });
    const res = buildPrefillFromPlan(plan(g), g, roster);
    expect(res.plannedSubs.map((s) => s.id)).toEqual(['x']);
  });

  it('gives a sub whose slot starter is a ghost a null outPlayerId (no one on field to sub off)', () => {
    const g = planGame({
      startingSlots: [
        { slotId: 'gk', playerId: 'a' },
        { slotId: 's0', playerId: 'ghost' }, // starter not in roster -> not on field
      ],
      subs: [{ id: 'x', slotId: 's0', timeSeconds: 720, inPlayerId: 'f' }],
    });
    const res = buildPrefillFromPlan(plan(g, ['a', 'ghost', 'f']), g, roster);
    expect(res.plannedSubs[0].outPlayerId).toBeNull();
  });

  /** @edge-case a sub bringing on a roster-missing player must be dropped, not leaked. */
  it('reports and drops a sub whose incoming player is missing from the roster', () => {
    const g = planGame({
      subs: [{ id: 'x', slotId: 's0', timeSeconds: 720, inPlayerId: 'ghost-in' }],
    });
    const res = buildPrefillFromPlan(plan(g), g, roster);
    expect(res.missingPlayerIds).toContain('ghost-in');
    expect(res.plannedSubs).toEqual([]); // ghost incoming player not brought on
  });

  /** @edge-case two subs on one slot: the second names the first sub-in as its out-player. */
  it('chains outPlayerId across sequential subs on the same slot', () => {
    const g = planGame({
      startingSlots: [{ slotId: 's0', playerId: 'b' }],
      subs: [
        { id: 'first', slotId: 's0', timeSeconds: 600, inPlayerId: 'f' }, // f on for starter b
        { id: 'second', slotId: 's0', timeSeconds: 900, inPlayerId: 'c' }, // c on for f (not b)
      ],
    });
    const res = buildPrefillFromPlan(plan(g), g, roster);
    expect(res.plannedSubs).toEqual([
      { id: 'first', slotId: 's0', timeSeconds: 600, inPlayerId: 'f', outPlayerId: 'b' },
      { id: 'second', slotId: 's0', timeSeconds: 900, inPlayerId: 'c', outPlayerId: 'f' },
    ]);
  });

  it('reports a non-starter squad member missing from the roster', () => {
    const g = planGame(); // starters a..e, sub-in f - none missing
    const res = buildPrefillFromPlan(plan(g, ['a', 'b', 'c', 'd', 'e', 'f', 'bench-ghost']), g, roster);
    expect(res.missingPlayerIds).toEqual(['bench-ghost']);
  });

  it('gives an out-of-plan sub a null outPlayerId (empty slot at sub time)', () => {
    const g = planGame({
      startingSlots: [{ slotId: 'gk', playerId: 'a' }], // s0 empty
      subs: [{ id: 'y', slotId: 's0', timeSeconds: 600, inPlayerId: 'f' }],
    });
    const res = buildPrefillFromPlan(plan(g), g, roster);
    expect(res.plannedSubs[0].outPlayerId).toBeNull();
  });
});
