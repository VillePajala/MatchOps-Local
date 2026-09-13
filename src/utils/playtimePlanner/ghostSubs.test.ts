/**
 * @critical - these markers sit on a live match field. A ghost in the wrong
 * place tells a coach a player belongs somewhere they do not, and a ghost on
 * top of a real player makes the field lie about who is standing there.
 */
import { buildPlannedGhosts } from './ghostSubs';
import type { SubSlot } from '@/utils/formations';
import type { PlannedGameSub } from './gameSubs';
import type { Player } from '@/types';

const slots: SubSlot[] = [
  { relX: 0.96, relY: 0.3, positionLabel: 'RM' },
  { relX: 0.96, relY: 0.5, positionLabel: 'LM' },
  { relX: 0.96, relY: 0.7, positionLabel: 'CDM' },
];

const players = [
  { id: 'p1', name: 'Tomas' },
  { id: 'p2', name: 'Tiitus' },
  { id: 'p3', name: 'Petja', nickname: 'Pete' },
] as Player[];

const sub = (over: Partial<PlannedGameSub>): PlannedGameSub => ({
  id: 's1', timeSeconds: 600, slotId: 'x', inPlayerId: 'p1', outPlayerId: null, ...over,
});

describe('buildPlannedGhosts', () => {
  /**
   * @critical - the case this exists for. A sub parked at RM whose plan also
   * brings them on at LM later: the LM entry appeared nowhere before.
   */
  it('marks a later entry at a different position', () => {
    const parkedAtRM = [...players, { id: 'p1', name: 'Tomas', relX: 0.96, relY: 0.3 }] as Player[];
    const ghosts = buildPlannedGhosts(
      [sub({ id: 'a', positionLabel: 'RM' }), sub({ id: 'b', timeSeconds: 1800, positionLabel: 'LM' })],
      slots,
      parkedAtRM,
    );
    // RM already has the real disc; only the LM entry needs a marker.
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]).toMatchObject({ id: 'b', name: 'Tomas', relY: 0.5 });
  });

  /**
   * @critical - a ghost drawn under a real player makes the field claim two
   * people are in one place.
   */
  it('never marks a slot a real player is standing on', () => {
    const standing = [...players, { id: 'p2', name: 'Tiitus', relX: 0.96, relY: 0.5 }] as Player[];
    expect(buildPlannedGhosts([sub({ inPlayerId: 'p1', positionLabel: 'LM' })], slots, standing)).toEqual([]);
  });

  /**
   * @edge-case - discs are dragged by hand, so a coach nudging someone a few
   * pixels must not resurrect a ghost underneath them.
   */
  it('treats a nudged disc as still occupying its slot', () => {
    const nudged = [...players, { id: 'p2', name: 'Tiitus', relX: 0.95, relY: 0.51 }] as Player[];
    expect(buildPlannedGhosts([sub({ inPlayerId: 'p1', positionLabel: 'LM' })], slots, nudged)).toEqual([]);
  });

  it('shows one marker per player per position, however many entries', () => {
    const ghosts = buildPlannedGhosts(
      [
        sub({ id: 'a', positionLabel: 'LM' }),
        sub({ id: 'b', timeSeconds: 1200, positionLabel: 'LM' }),
        sub({ id: 'c', timeSeconds: 1800, positionLabel: 'CDM' }),
      ],
      slots,
      players,
    );
    expect(ghosts.map((g) => g.id)).toEqual(['a', 'c']);
  });

  /**
   * Guessing a position would put a coach's attention in the wrong place,
   * which is worse than saying nothing.
   */
  it('says nothing for a sub with no recorded position', () => {
    expect(buildPlannedGhosts([sub({ positionLabel: undefined })], slots, players)).toEqual([]);
  });

  it('says nothing for a position this formation does not have', () => {
    expect(buildPlannedGhosts([sub({ positionLabel: 'GK' })], slots, players)).toEqual([]);
  });

  it('says nothing for a player who is not in the roster', () => {
    expect(buildPlannedGhosts([sub({ inPlayerId: 'ghost', positionLabel: 'LM' })], slots, players)).toEqual([]);
  });

  it('prefers the nickname, which is what the disc shows', () => {
    const ghosts = buildPlannedGhosts([sub({ inPlayerId: 'p3', positionLabel: 'LM' })], slots, players);
    expect(ghosts[0].name).toBe('Pete');
  });

  it('survives having nothing to work with', () => {
    expect(buildPlannedGhosts([], slots, players)).toEqual([]);
    expect(buildPlannedGhosts([sub({ positionLabel: 'LM' })], [], players)).toEqual([]);
  });
});
