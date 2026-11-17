/**
 * The planner's public modules against the REAL local store (review 9.4). The unit
 * suites (gameSubs/planLinks/storage) back getDataStore() with a hand-built object
 * that re-states how LocalDataStore wires the plan store; this checks the real
 * wiring end to end, so the two cannot drift apart unnoticed.
 * @integration
 */
import { withRealLocalDataStore } from '../../../../tests/utils/realLocalDataStore';
import { createPlan, deletePlan, getPlan, getPlans, savePlan } from '../storage';
import { deletePlanLinksForPlan, getAllPlanLinks, getPlanLink, setPlanLink } from '../planLinks';
import { deleteGameSubs, getGameSubs, setGameSubs } from '../gameSubs';
import type { PlannedGameSub } from '../gameSubs';

jest.mock('@/utils/logger', () => {
  const fns = { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { __esModule: true, default: fns, createLogger: jest.fn(() => fns) };
});

withRealLocalDataStore();

describe('playtime planner on the real local store', () => {
  it('saves, reads, lists and deletes a plan', async () => {
    const plan = createPlan({ name: 'Cup', players: [], gameCount: 2, formationId: '5v5-2-2', numberOfPeriods: 2, periodMinutes: 25 });
    const saved = await savePlan(plan);
    expect(saved?.id).toBe(plan.id);
    expect((await getPlan(plan.id))?.name).toBe('Cup');
    expect(Object.keys(await getPlans())).toEqual([plan.id]);
    expect(await deletePlan(plan.id)).toBe(true);
    expect(await getPlan(plan.id)).toBeNull();
  });

  it('links real games to a plan game and removes the links with the plan', async () => {
    await setPlanLink('game_a', { planId: 'plan_1', planGameId: 'pg_1' });
    await setPlanLink('game_b', { planId: 'plan_2', planGameId: 'pg_9' });
    expect(await getPlanLink('game_a')).toEqual({ planId: 'plan_1', planGameId: 'pg_1' });
    await deletePlanLinksForPlan('plan_1');
    expect(Object.keys(await getAllPlanLinks())).toEqual(['game_b']);
  });

  it("stores a game's planned subs and clears them", async () => {
    const subs: PlannedGameSub[] = [{ id: 's1', timeSeconds: 720, slotId: 'gk', inPlayerId: 'p2', outPlayerId: 'p1' }];
    expect(await setGameSubs('g1', subs)).toBe(true);
    expect(await getGameSubs('g1')).toEqual(subs);
    expect(await deleteGameSubs('g1')).toBe(true);
    expect(await getGameSubs('g1')).toEqual([]);
  });
});
