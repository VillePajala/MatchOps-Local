import { computePlanPositions, slotZone } from './positions';
import type { PlaytimePlan, PlanGame } from './types';

// 8v8-3-3-1 slot→zone (verified against getGameSlots + positionLabels):
//   gk → gk | s0,s1,s2 → def | s3,s4,s5 → mid | s6 → att
const FORMATION = '8v8-3-3-1';

const game = (over: Partial<PlanGame> = {}): PlanGame => ({
  id: 'g1',
  label: 'Game 1',
  formationId: FORMATION,
  numberOfPeriods: 1,
  periodMinutes: 10, // 600s
  included: true,
  startingSlots: [],
  subs: [],
  ...over,
});

const plan = (games: PlanGame[], playerIds: string[]): PlaytimePlan => ({
  id: 'p1',
  name: 'Plan',
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  players: playerIds.map((id) => ({ id, name: id })),
  games,
});

describe('slotZone', () => {
  it('fixes the goalie to gk regardless of coordinates', () => {
    expect(slotZone(0.5, 0.1, true)).toBe('gk');
  });
  it('maps outfield coordinates to def/mid/att', () => {
    expect(slotZone(0.5, 0.78, false)).toBe('def');
    expect(slotZone(0.5, 0.55, false)).toBe('mid');
    expect(slotZone(0.5, 0.30, false)).toBe('att');
  });
});

describe('computePlanPositions', () => {
  it('attributes a full game to each starter’s zone (GK / DEF / ATT)', () => {
    const p = plan(
      [
        game({
          startingSlots: [
            { slotId: 'gk', playerId: 'keeper' },
            { slotId: 's0', playerId: 'back' }, // def
            { slotId: 's6', playerId: 'striker' }, // att
          ],
        }),
      ],
      ['keeper', 'back', 'striker', 'bench'],
    );
    const { players, includedGameCount } = computePlanPositions(p);
    const by = (id: string) => players.find((x) => x.playerId === id)!;

    expect(includedGameCount).toBe(1);
    expect(by('keeper').byZone).toEqual({ gk: 600, def: 0, mid: 0, att: 0 });
    expect(by('back').byZone).toEqual({ gk: 0, def: 600, mid: 0, att: 0 });
    expect(by('striker').byZone).toEqual({ gk: 0, def: 0, mid: 0, att: 600 });
    expect(by('keeper').zoneCount).toBe(1);
    expect(by('bench').totalSeconds).toBe(0);
    expect(by('bench').zoneCount).toBe(0);

    // Specific position labels (s0 = LB, s6 = ST, gk = GK).
    expect(by('keeper').byLabel).toEqual({ GK: 600 });
    expect(by('back').byLabel).toEqual({ LB: 600 });
    expect(by('striker').byLabel).toEqual({ ST: 600 });
    expect(by('striker').positionCount).toBe(1);
    expect(by('bench').positionCount).toBe(0);
  });

  it('counts two roles in the SAME zone as distinct (LB vs RB, both defence)', () => {
    // The cognitive-load case: same zone, different role.
    const p = plan(
      [
        game({ id: 'g1', startingSlots: [{ slotId: 's0', playerId: 'wide' }] }), // LB (def)
        game({ id: 'g2', startingSlots: [{ slotId: 's2', playerId: 'wide' }] }), // RB (def)
      ],
      ['wide'],
    );
    const wide = computePlanPositions(p).players.find((x) => x.playerId === 'wide')!;
    expect(wide.byZone).toEqual({ gk: 0, def: 1200, mid: 0, att: 0 });
    expect(wide.zoneCount).toBe(1); // both defence
    expect(wide.byLabel).toEqual({ LB: 600, RB: 600 });
    expect(wide.positionCount).toBe(2); // but two distinct roles
  });

  it('splits a slot between the starter and a sub by time', () => {
    const p = plan(
      [
        game({
          startingSlots: [{ slotId: 's0', playerId: 'starter' }], // def
          subs: [{ id: 'sub1', slotId: 's0', timeSeconds: 300, inPlayerId: 'reserve' }],
        }),
      ],
      ['starter', 'reserve'],
    );
    const by = (id: string) => computePlanPositions(p).players.find((x) => x.playerId === id)!;
    expect(by('starter').byZone.def).toBe(300);
    expect(by('reserve').byZone.def).toBe(300);
  });

  it('accumulates zone variety across games (def in one, att in another)', () => {
    const p = plan(
      [
        game({ id: 'g1', startingSlots: [{ slotId: 's0', playerId: 'rover' }] }), // def
        game({ id: 'g2', startingSlots: [{ slotId: 's6', playerId: 'rover' }] }), // att
      ],
      ['rover'],
    );
    const rover = computePlanPositions(p).players.find((x) => x.playerId === 'rover')!;
    expect(rover.byZone.def).toBe(600);
    expect(rover.byZone.att).toBe(600);
    expect(rover.zoneCount).toBe(2);
    expect(rover.totalSeconds).toBe(1200);
  });

  it('ignores games not marked included', () => {
    const p = plan(
      [game({ included: false, startingSlots: [{ slotId: 's0', playerId: 'back' }] })],
      ['back'],
    );
    const { players, includedGameCount } = computePlanPositions(p);
    expect(includedGameCount).toBe(0);
    expect(players.find((x) => x.playerId === 'back')!.totalSeconds).toBe(0);
  });
});
