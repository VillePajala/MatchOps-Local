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
      { id: 'a', minute: 10, name: 'Tomppa', waveIndex: 0 },
      { id: 'b', minute: 20, name: 'Petja', waveIndex: 1 },
      { id: 'c', minute: 30, name: 'Tomppa', waveIndex: 2 },
    ]);
  });

  /**
   * @critical - the point of the wave index. Junior changes come in waves -
   * three players on together at half-time - but the plan is read position by
   * position, so a wave was only findable by matching numbers across eight
   * pills by eye. Same minute anywhere on the pitch must share an index.
   */
  it('gives every change at the same minute the same wave, across positions', () => {
    const chains = buildPlannedChains(
      [
        sub({ id: 'a', timeSeconds: 600, positionLabel: 'LM' }),
        sub({ id: 'b', timeSeconds: 600, positionLabel: 'RM' }),
        sub({ id: 'c', timeSeconds: 600, positionLabel: 'ST' }),
      ],
      points,
      players,
    );
    const waves = chains.flatMap((c) => c.entries.map((e) => e.waveIndex));
    expect(waves).toEqual([0, 0, 0]);
  });

  it('numbers waves by time, earliest first', () => {
    const chains = buildPlannedChains(
      [
        sub({ id: 'late', timeSeconds: 1800, positionLabel: 'RM' }),
        sub({ id: 'early', timeSeconds: 600, positionLabel: 'LM' }),
        sub({ id: 'mid', timeSeconds: 1200, positionLabel: 'ST' }),
      ],
      points,
      players,
    );
    const byId = new Map(chains.flatMap((c) => c.entries).map((e) => [e.id, e.waveIndex]));
    expect(byId.get('early')).toBe(0);
    expect(byId.get('mid')).toBe(1);
    expect(byId.get('late')).toBe(2);
  });

  /** A change nobody can name is dropped, and must not consume a wave number. */
  it('does not let a skipped change burn a wave index', () => {
    const chains = buildPlannedChains(
      [
        sub({ id: 'ghost', timeSeconds: 300, positionLabel: 'LM', inPlayerId: 'nobody' }),
        sub({ id: 'real', timeSeconds: 600, positionLabel: 'LM' }),
      ],
      points,
      players,
    );
    const lm = chains.find((c) => c.positionLabel === 'LM')!;
    expect(lm.entries).toHaveLength(1);
    expect(lm.entries[0].waveIndex).toBe(0);
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

  /**
   * @critical - the keeper vanished from the first build of this view. The
   * obvious-looking `isFieldPosition` helper excludes relY > 0.9 because it
   * exists to decide which positions get a SIDELINE SUB SLOT, and the keeper
   * does not. A view claiming to show every position must not borrow it.
   */
  it('includes the goalkeeper, who sits below the outfield cutoff', () => {
    const withKeeper = [...points, { relX: 0.5, relY: 0.92 }];
    const keeper = [...players, { id: 'g1', name: 'Jasper', relX: 0.5, relY: 0.92 }] as Player[];
    const chains = buildPlannedChains([], withKeeper, keeper);
    expect(chains.map((c) => c.positionLabel)).toContain('GK');
    expect(chains.find((c) => c.positionLabel === 'GK')!.starterName).toBe('Jasper');
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
