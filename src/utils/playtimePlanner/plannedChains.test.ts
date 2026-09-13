/**
 * @critical - this view is read on the touchline to decide who goes on next.
 * A chain that names the wrong player, or drops one, sends a child on at the
 * wrong time.
 */
import { buildPlannedChains } from './plannedChains';
import type { PlannedGameSub } from './gameSubs';
import type { Player, Point } from '@/types';

// A slice of the 8v8 formation: ST, CAM and the two wide midfielders.
const points: Point[] = [
  { relX: 0.5, relY: 0.24 }, // ST
  { relX: 0.5, relY: 0.38 }, // CAM
  { relX: 0.25, relY: 0.52 }, // LM
  { relX: 0.75, relY: 0.52 }, // RM
];

const players = [
  { id: 'p1', name: 'Roope', relX: 0.5, relY: 0.24 },
  { id: 'p2', name: 'Eeli', relX: 0.5, relY: 0.38 },
  { id: 'p3', name: 'Petja', relX: 0.25, relY: 0.52 },
  { id: 'p4', name: 'Jooa', relX: 0.75, relY: 0.52 },
  { id: 'p5', name: 'Tomas', nickname: 'Tomppa' },
] as Player[];

const sub = (over: Partial<PlannedGameSub>): PlannedGameSub => ({
  id: 's1', timeSeconds: 600, slotId: 'x', inPlayerId: 'p5', outPlayerId: null, ...over,
});

describe('buildPlannedChains', () => {
  it('gives every field position its starter', () => {
    const chains = buildPlannedChains([], points, players);
    expect(chains.map((c) => [c.positionLabel, c.starterName])).toEqual([
      ['ST', 'Roope'],
      ['CAM', 'Eeli'],
      ['LM', 'Petja'],
      ['RM', 'Jooa'],
    ]);
  });

  /** The owner's requirement: the WHOLE chain, not just the next change. */
  it('lists every planned change at a position, earliest first', () => {
    const chains = buildPlannedChains(
      [
        sub({ id: 'b', timeSeconds: 1200, positionLabel: 'LM', inPlayerId: 'p3' }),
        sub({ id: 'a', timeSeconds: 600, positionLabel: 'LM', inPlayerId: 'p5' }),
        sub({ id: 'c', timeSeconds: 1800, positionLabel: 'LM', inPlayerId: 'p5' }),
      ],
      points,
      players,
    );
    const lm = chains.find((c) => c.positionLabel === 'LM')!;
    expect(lm.entries).toEqual([
      { id: 'a', minute: 10, name: 'Tomppa' },
      { id: 'b', minute: 20, name: 'Petja' },
      { id: 'c', minute: 30, name: 'Tomppa' },
    ]);
  });

  /** A settled position is information, not an omission. */
  it('keeps a position nobody leaves, with an empty chain', () => {
    const chains = buildPlannedChains([sub({ positionLabel: 'LM' })], points, players);
    expect(chains).toHaveLength(4);
    expect(chains.find((c) => c.positionLabel === 'ST')!.entries).toEqual([]);
  });

  /** This view hides the sideline, so a waiting sub is not a position. */
  it('ignores sideline points', () => {
    const withSideline = [...points, { relX: 0.96, relY: 0.46 }];
    expect(buildPlannedChains([], withSideline, players)).toHaveLength(4);
  });

  it('reports an unfilled position rather than inventing a starter', () => {
    const noStriker = players.filter((p) => p.id !== 'p1');
    const chains = buildPlannedChains([], points, noStriker);
    expect(chains.find((c) => c.positionLabel === 'ST')!.starterName).toBeNull();
  });

  /**
   * @edge-case - discs are dragged by hand, so a nudged starter must still
   * belong to their position.
   */
  it('claims a nudged disc for its position', () => {
    const nudged = players.map((p) => (p.id === 'p1' ? { ...p, relX: 0.52, relY: 0.26 } : p));
    const chains = buildPlannedChains([], points, nudged as Player[]);
    expect(chains.find((c) => c.positionLabel === 'ST')!.starterName).toBe('Roope');
  });

  /** Nearest wins, so one disc can never be claimed by two points in a row. */
  it('gives a disc to the nearest position, not the first match', () => {
    const between = [{ id: 'x', name: 'Drifter', relX: 0.3, relY: 0.52 }] as Player[];
    const chains = buildPlannedChains([], points, between);
    expect(chains.find((c) => c.positionLabel === 'LM')!.starterName).toBe('Drifter');
    expect(chains.find((c) => c.positionLabel === 'RM')!.starterName).toBeNull();
  });

  it('skips a change with no recorded position or unknown player', () => {
    const chains = buildPlannedChains(
      [sub({ positionLabel: undefined }), sub({ id: 'z', positionLabel: 'LM', inPlayerId: 'ghost' })],
      points,
      players,
    );
    expect(chains.every((c) => c.entries.length === 0)).toBe(true);
  });

  it('survives having nothing to work with', () => {
    expect(buildPlannedChains([], [], players)).toEqual([]);
  });
});
