import {
  addPlayerToPlan,
  removePlayerFromPlan,
  replacePlayerInPlan,
  playerPlanImpact,
} from './roster';
import type { PlaytimePlan, PlanGame } from './types';

const game = (over: Partial<PlanGame> = {}): PlanGame => ({
  id: 'g1',
  label: 'Game 1',
  formationId: '5v5-2-2',
  numberOfPeriods: 2,
  periodMinutes: 12,
  included: true,
  startingSlots: [
    { slotId: 'gk', playerId: 'a' },
    { slotId: 's0', playerId: 'b' },
    { slotId: 's1', playerId: null },
  ],
  subs: [{ id: 'x', slotId: 's0', timeSeconds: 720, inPlayerId: 'c' }],
  ...over,
});

const plan = (games: PlanGame[] = [game()]): PlaytimePlan => ({
  id: 'p',
  name: 'Plan',
  version: 1,
  createdAt: 'x',
  updatedAt: 'x',
  players: [
    { id: 'a', name: 'Alex' },
    { id: 'b', name: 'Sam' },
    { id: 'c', name: 'Jo' },
  ],
  games,
});

describe('playerPlanImpact', () => {
  it('counts starting slots and incoming subs across all games', () => {
    const p = plan([
      game(),
      game({ id: 'g2', startingSlots: [{ slotId: 'gk', playerId: 'a' }], subs: [] }),
    ]);
    expect(playerPlanImpact(p, 'a')).toEqual({ startingCount: 2, subCount: 0 });
    expect(playerPlanImpact(p, 'c')).toEqual({ startingCount: 0, subCount: 1 });
    expect(playerPlanImpact(p, 'nobody')).toEqual({ startingCount: 0, subCount: 0 });
  });
});

describe('addPlayerToPlan', () => {
  it('appends a new player and is a no-op for an existing one', () => {
    const p = plan();
    const added = addPlayerToPlan(p, { id: 'd', name: 'Max' });
    expect(added.players.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
    // Existing member: same reference back (no pointless autosave).
    expect(addPlayerToPlan(p, { id: 'a', name: 'Alex' })).toBe(p);
  });
});

describe('replacePlayerInPlan', () => {
  it('swaps the roster entry in place and inherits every slot and sub (injury flow)', () => {
    const p = plan([
      game(),
      game({
        id: 'g2',
        startingSlots: [{ slotId: 'gk', playerId: 'b' }],
        subs: [{ id: 'y', slotId: 'gk', timeSeconds: 600, inPlayerId: 'b' }],
      }),
    ]);
    const next = replacePlayerInPlan(p, 'b', { id: 'e', name: 'Eino' });
    // Roster: e takes b's position in the list.
    expect(next.players.map((x) => x.id)).toEqual(['a', 'e', 'c']);
    // Every slot and every sub that referenced b now references e.
    expect(next.games[0].startingSlots.find((s) => s.slotId === 's0')!.playerId).toBe('e');
    expect(next.games[1].startingSlots[0].playerId).toBe('e');
    expect(next.games[1].subs[0].inPlayerId).toBe('e');
    // Untouched references stay put.
    expect(next.games[0].startingSlots.find((s) => s.slotId === 'gk')!.playerId).toBe('a');
    expect(next.games[0].subs[0].inPlayerId).toBe('c');
  });

  it('refuses to replace with an existing plan member (would double-book them)', () => {
    const p = plan();
    expect(replacePlayerInPlan(p, 'b', { id: 'a', name: 'Alex' })).toBe(p);
  });

  it('is a no-op when the outgoing player is not in the plan', () => {
    const p = plan();
    expect(replacePlayerInPlan(p, 'nobody', { id: 'e', name: 'Eino' })).toBe(p);
  });
});

describe('removePlayerFromPlan', () => {
  it('drops the roster entry, empties their slots, deletes their incoming subs', () => {
    const p = plan();
    const next = removePlayerFromPlan(p, 'b');
    expect(next.players.map((x) => x.id)).toEqual(['a', 'c']);
    // Slot survives but is now empty (slot ids must stay stable for the formation).
    expect(next.games[0].startingSlots.find((s) => s.slotId === 's0')!.playerId).toBeNull();
    // Their incoming subs would dangle - but OTHER players' subs stay.
    expect(next.games[0].subs).toHaveLength(1);
    const removedC = removePlayerFromPlan(p, 'c');
    expect(removedC.games[0].subs).toHaveLength(0);
  });

  it('is a no-op for a player not in the plan', () => {
    const p = plan();
    expect(removePlayerFromPlan(p, 'nobody')).toBe(p);
  });
});

describe('absentIds hygiene on roster edits', () => {
  const base = {
    id: 'p', name: 'Plan', version: 1, createdAt: 'x', updatedAt: 'x',
    players: [{ id: 'p1', name: 'Alex' }, { id: 'p2', name: 'Sam' }],
    games: [{
      id: 'g1', label: 'G1', formationId: '5v5-2-2', numberOfPeriods: 2,
      periodMinutes: 12, included: true, startingSlots: [], subs: [],
      absentIds: ['p1'],
    }],
  } as never;

  it('removePlayerFromPlan prunes the id from absentIds (no phantom count, no silent re-absence)', async () => {
    const { removePlayerFromPlan } = await import('./roster');
    const out = removePlayerFromPlan(base, 'p1');
    expect(out.games[0].absentIds).toEqual([]);
  });

  it('replacePlayerInPlan drops the leaver from absentIds WITHOUT transferring absence', async () => {
    const { replacePlayerInPlan } = await import('./roster');
    const out = replacePlayerInPlan(base, 'p1', { id: 'p9', name: 'New' });
    expect(out.games[0].absentIds).toEqual([]);
  });
});

describe('normalizePlanAbsences (self-healing for older/merged plans)', () => {
  it('drops absent ids for removed players AND for players placed in that game', async () => {
    const { normalizePlanAbsences } = await import('./roster');
    const plan = {
      id: 'p', name: 'Plan', version: 1, createdAt: 'x', updatedAt: 'x',
      players: [{ id: 'p1', name: 'Alex' }, { id: 'p2', name: 'Sam' }],
      games: [{
        id: 'g1', label: 'G1', formationId: '5v5-2-2', numberOfPeriods: 2,
        periodMinutes: 12, included: true,
        startingSlots: [{ slotId: 'gk', playerId: 'p1' }],
        subs: [],
        // p1 is PLACED yet marked absent (cross-copy merge damage);
        // p9 left the roster before pruning existed; p2 is a valid absence.
        absentIds: ['p1', 'p9', 'p2'],
      }],
    } as never;
    const healed = normalizePlanAbsences(plan);
    expect(healed).not.toBe(plan);
    expect(healed.games[0].absentIds).toEqual(['p2']);
  });

  it('returns the SAME reference when nothing needs fixing (no phantom edit)', async () => {
    const { normalizePlanAbsences } = await import('./roster');
    const plan = {
      id: 'p', name: 'Plan', version: 1, createdAt: 'x', updatedAt: 'x',
      players: [{ id: 'p1', name: 'Alex' }],
      games: [{
        id: 'g1', label: 'G1', formationId: '5v5-2-2', numberOfPeriods: 2,
        periodMinutes: 12, included: true, startingSlots: [], subs: [],
        absentIds: ['p1'],
      }],
    } as never;
    expect(normalizePlanAbsences(plan)).toBe(plan);
  });
});
