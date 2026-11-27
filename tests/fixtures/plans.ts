/**
 * A one-game playing-time plan shaped like the live demo game the planner
 * fixes were found on (2x20, 8v8 2-1-2-1-1, changes at 2', 10', 20', 30').
 * Ids are synthetic; names are the ids. Formation slots: s0 LB, s1 RB,
 * s2 CDM, s3 LM, s4 RM, s5 CAM, s6 ST.
 *
 * `rm0` starts at RM and `rm20` is due on there at 20'; `lm0` starts at LM and
 * `b10c` replaces him at 10' (the "Sampo for Jim" change); `st0` starts at ST.
 */
import type { PlaytimePlan } from '@/utils/playtimePlanner/types';

export const DEMO_PLAN_GAME_ID = 'pg-1';
export const DEMO_PLAN_PLAYER_IDS = ['lb0', 'rb0', 'cdm0', 'lm0', 'rm0', 'cam0', 'st0', 'b2', 'b10a', 'b10b', 'gk', 'b10c', 'rm20'];

export const demoPlaytimePlan = (): PlaytimePlan => ({
  id: 'plan-demo',
  name: 'Demo',
  version: 1,
  createdAt: '2026-11-26T00:00:00.000Z',
  updatedAt: '2026-11-26T00:00:00.000Z',
  teamId: 'team-1',
  players: DEMO_PLAN_PLAYER_IDS.map((id) => ({ id, name: id })),
  games: [
    {
      id: DEMO_PLAN_GAME_ID,
      label: 'Demo',
      included: true,
      formationId: '8v8-2-1-2-1-1',
      periodMinutes: 20,
      numberOfPeriods: 2,
      startingSlots: [
        { slotId: 'gk', playerId: 'gk' },
        { slotId: 's0', playerId: 'lb0' },
        { slotId: 's1', playerId: 'rb0' },
        { slotId: 's2', playerId: 'cdm0' },
        { slotId: 's3', playerId: 'lm0' },
        { slotId: 's4', playerId: 'rm0' },
        { slotId: 's5', playerId: 'cam0' },
        { slotId: 's6', playerId: 'st0' },
      ],
      subs: [
        { id: 'x1', slotId: 's0', inPlayerId: 'b2', timeSeconds: 120 },
        { id: 'x2', slotId: 's1', inPlayerId: 'b10a', timeSeconds: 600 },
        { id: 'x3', slotId: 's2', inPlayerId: 'b10b', timeSeconds: 600 },
        { id: 'x4', slotId: 's3', inPlayerId: 'b10c', timeSeconds: 600 },
        { id: 'x5', slotId: 's4', inPlayerId: 'rm20', timeSeconds: 1200 },
        { id: 'x6', slotId: 's5', inPlayerId: 'lb0', timeSeconds: 1200 },
        { id: 'x7', slotId: 's6', inPlayerId: 'rb0', timeSeconds: 1200 },
        { id: 'x8', slotId: 's0', inPlayerId: 'cdm0', timeSeconds: 1800 },
        { id: 'x9', slotId: 's1', inPlayerId: 'lm0', timeSeconds: 1800 },
        { id: 'x10', slotId: 's2', inPlayerId: 'rm0', timeSeconds: 1800 },
      ],
    },
  ],
});
