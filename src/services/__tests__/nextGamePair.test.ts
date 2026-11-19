/**
 * The next-game + one-game-plan pair (Onboarding v3). This is where a new
 * coach's first real game is created, so: the game is unplayed, linked to its
 * plan, lined up from the suggestion, and a failure never leaves a plan
 * without its game.
 * @critical
 */
import {
  buildFirstPlan,
  buildNextGameRequest,
  changePlanGameLength,
  createNextGamePair,
  reshufflePlan,
  syncPairedGame,
  type NextGamePairInput,
} from '../nextGamePair';
import { TestFixtures } from '../../../tests/fixtures';
import { ensureStartingSlots } from '@/utils/playtimePlanner/lineup';
import { gameTotalSeconds, type PlaytimePlan } from '@/utils/playtimePlanner/types';
import type { AppState, Player } from '@/types';
import type { StartNewGameRequest } from '@/components/HomePage/utils/newGameHandlers';

jest.mock('@/utils/logger', () => {
  const log = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() };
  return { __esModule: true, default: log, createLogger: () => log };
});
// The pure helpers are under test; storage is injected, so the DataStore
// factory behind `createPlan`'s module never has to load.
jest.mock('@/datastore/factory', () => ({ getDataStore: jest.fn() }));

const NAMES = ['Onni', 'Toivo', 'Aatos', 'Otso', 'Aapo', 'Elias', 'Leevi', 'Eeli', 'Eino', 'Niilo', 'Veeti', 'Leo', 'Väinö', 'Oliver'];
const squad: Player[] = NAMES.map((name, i) => ({ id: `p${i + 1}`, name }));

const input = (overrides: Partial<NextGamePairInput> = {}): NextGamePairInput => ({
  team: { id: 'team-1', name: 'MePa P12' },
  players: squad,
  fieldSize: '8v8',
  gameType: 'soccer',
  ageGroup: 'U12',
  numberOfPeriods: 2,
  periodMinutes: 25,
  gameDate: '2026-11-22',
  opponentName: 'Rantakylän FC',
  ...overrides,
});

const minutesOf = (plan: PlaytimePlan): number => {
  const g = plan.games[0];
  return ensureStartingSlots(g).filter((s) => s.playerId).length;
};

describe('buildFirstPlan', () => {
  it('is one game, in the chosen format and length, filled by the suggestion', () => {
    const plan = buildFirstPlan(input());
    expect(plan.games).toHaveLength(1);
    expect(plan.teamId).toBe('team-1');
    expect(plan.players.map((p) => p.name)).toEqual(NAMES);
    const g = plan.games[0];
    expect(g.formationId).toBe('8v8-2-1-2-1-1');
    expect(g).toMatchObject({ numberOfPeriods: 2, periodMinutes: 25, label: 'Rantakylän FC' });
    // 8 starters placed, and the six on the bench come on.
    expect(minutesOf(plan)).toBe(8);
    expect(g.subs.filter((s) => s.inPlayerId)).toHaveLength(6);
  });
});

describe('buildNextGameRequest', () => {
  it('describes an unplayed, team-linked game prefilled from the plan', () => {
    const plan = buildFirstPlan(input());
    const req = buildNextGameRequest(input(), plan);
    expect(req).toMatchObject({
      homeTeamName: 'MePa P12',
      opponentName: 'Rantakylän FC',
      gameDate: '2026-11-22',
      numPeriods: 2,
      periodDuration: 25,
      isPlayed: false,
      teamId: 'team-1',
      seasonId: null,
      tournamentId: null,
      gameType: 'soccer',
      ageGroup: 'U12',
      formationPresetId: '8v8-2-1-2-1-1',
    });
    expect(req.prefill?.sourcePlanId).toBe(plan.id);
    expect(req.prefill?.sourcePlanGameId).toBe(plan.games[0].id);
    // Starters + the six waiting subs on the sideline.
    expect(req.prefill?.playersOnField).toHaveLength(14);
    expect(req.prefill?.plannedSubs).toHaveLength(6);
    expect(new Set(req.initialSelectedPlayerIds)).toEqual(new Set(squad.map((p) => p.id)));
  });
});

describe('createNextGamePair', () => {
  it('saves the plan, then creates the game from it', async () => {
    const order: string[] = [];
    const savePlan = jest.fn(async (p: PlaytimePlan) => {
      order.push('plan');
      return p;
    });
    const createGame = jest.fn(async (_req: StartNewGameRequest) => {
      order.push('game');
      return { gameId: 'game-1' };
    });
    const deletePlan = jest.fn(async () => true);

    const pair = await createNextGamePair({ savePlan, deletePlan, createGame }, input());

    expect(order).toEqual(['plan', 'game']);
    const saved = savePlan.mock.calls[0][0];
    expect(pair).toEqual({ gameId: 'game-1', planId: saved.id, planGameId: saved.games[0].id });
    expect(createGame.mock.calls[0][0].prefill?.sourcePlanId).toBe(saved.id);
    expect(deletePlan).not.toHaveBeenCalled();
  });

  it('removes the plan again when the game cannot be created (no orphan plan)', async () => {
    const savePlan = jest.fn(async (p: PlaytimePlan) => p);
    const deletePlan = jest.fn(async () => true);
    const createGame = jest.fn(async () => null);

    await expect(createNextGamePair({ savePlan, deletePlan, createGame }, input())).rejects.toThrow();
    expect(deletePlan).toHaveBeenCalledWith(savePlan.mock.calls[0][0].id);
  });

  it('treats a throwing game creation the same way', async () => {
    const savePlan = jest.fn(async (p: PlaytimePlan) => p);
    const deletePlan = jest.fn(async () => true);
    const createGame = jest.fn(async () => {
      throw new Error('offline');
    });

    await expect(createNextGamePair({ savePlan, deletePlan, createGame }, input())).rejects.toThrow();
    expect(deletePlan).toHaveBeenCalledTimes(1);
  });

  it('creates no game when the plan cannot be saved', async () => {
    const createGame = jest.fn();
    await expect(
      createNextGamePair({ savePlan: async () => null, deletePlan: async () => true, createGame }, input()),
    ).rejects.toThrow();
    expect(createGame).not.toHaveBeenCalled();
  });

  it('refuses an empty squad (nothing to plan)', async () => {
    const savePlan = jest.fn();
    await expect(
      createNextGamePair({ savePlan, deletePlan: jest.fn(), createGame: jest.fn() }, input({ players: [] })),
    ).rejects.toThrow();
    expect(savePlan).not.toHaveBeenCalled();
  });
});

describe('reshufflePlan', () => {
  it('changes the lineup but keeps the roster order', () => {
    const plan = buildFirstPlan(input());
    // Reverse order: Math.random() -> 0 makes Fisher-Yates rotate deterministically.
    const next = reshufflePlan(plan, () => 0);
    expect(next.players).toEqual(plan.players);
    expect(next.games[0].startingSlots).not.toEqual(plan.games[0].startingSlots);
    expect(minutesOf(next)).toBe(8);
  });

  it('is deterministic for the same random source', () => {
    const plan = buildFirstPlan(input());
    const seq = () => {
      let i = 0;
      const values = [0.1, 0.7, 0.3, 0.9, 0.5];
      return () => values[i++ % values.length];
    };
    // Sub ids are fresh per call; the lineup and the schedule are what matter.
    const shape = (p: PlaytimePlan) => ({
      slots: p.games[0].startingSlots,
      subs: p.games[0].subs.map(({ slotId, timeSeconds, inPlayerId }) => ({ slotId, timeSeconds, inPlayerId })),
    });
    expect(shape(reshufflePlan(plan, seq()))).toEqual(shape(reshufflePlan(plan, seq())));
  });
});

describe('changePlanGameLength', () => {
  it('keeps the lineup and moves each change to the same relative moment', () => {
    const plan = buildFirstPlan(input({ periodMinutes: 25 }));
    const gameId = plan.games[0].id;
    const halfBefore = plan.games[0].subs.map((s) => s.timeSeconds);
    expect(new Set(halfBefore)).toEqual(new Set([25 * 60]));

    const next = changePlanGameLength(plan, gameId, 2, 15);
    const g = next.games[0];
    expect(g).toMatchObject({ numberOfPeriods: 2, periodMinutes: 15 });
    expect(g.startingSlots).toEqual(plan.games[0].startingSlots);
    expect(new Set(g.subs.map((s) => s.timeSeconds))).toEqual(new Set([15 * 60]));
    expect(g.subs.every((s) => s.timeSeconds > 0 && s.timeSeconds < gameTotalSeconds(g))).toBe(true);
  });
});

describe('syncPairedGame', () => {
  const makeDeps = (game: AppState) => {
    const store: Record<string, AppState> = { 'game-1': game };
    return {
      store,
      deps: {
        savePlan: jest.fn(async (p: PlaytimePlan) => p),
        getGame: jest.fn(async (id: string) => store[id] ?? null),
        saveGame: jest.fn(async (id: string, g: AppState) => {
          store[id] = g;
          return g;
        }),
        getPlanLink: jest.fn(async () => null as null | { planId: string; planGameId: string }),
        getMasterRoster: jest.fn(async () => squad),
        setGameSubs: jest.fn(async () => true),
      },
    };
  };

  it('saves the plan and re-applies its lineup and subs to the linked, unplayed game', async () => {
    const plan = buildFirstPlan(input());
    const game = TestFixtures.games.newGame({ availablePlayers: squad, selectedPlayerIds: [], playersOnField: [] });
    const { deps, store } = makeDeps(game);
    deps.getPlanLink.mockResolvedValue({ planId: plan.id, planGameId: plan.games[0].id });

    const res = await syncPairedGame(deps, plan, 'game-1', { gameDate: '2026-11-29' });

    expect(res).toEqual({ applied: true });
    expect(deps.savePlan).toHaveBeenCalledWith(plan);
    expect(store['game-1'].gameDate).toBe('2026-11-29');
    expect(store['game-1'].playersOnField.length).toBeGreaterThanOrEqual(8);
    expect(deps.setGameSubs).toHaveBeenCalledWith('game-1', expect.any(Array));
  });

  it('still writes the date/length change when the game can no longer be re-applied', async () => {
    const plan = buildFirstPlan(input());
    const game = TestFixtures.games.inProgress({ availablePlayers: squad });
    const { deps, store } = makeDeps(game);
    deps.getPlanLink.mockResolvedValue({ planId: plan.id, planGameId: plan.games[0].id });

    const res = await syncPairedGame(deps, plan, 'game-1', { periodDurationMinutes: 20 });

    expect(res).toEqual({ applied: false, reason: 'played' });
    expect(store['game-1'].periodDurationMinutes).toBe(20);
    expect(deps.setGameSubs).not.toHaveBeenCalled();
  });

  it('throws when the plan cannot be saved', async () => {
    const plan = buildFirstPlan(input());
    const { deps } = makeDeps(TestFixtures.games.newGame());
    deps.savePlan.mockResolvedValue(null as unknown as PlaytimePlan);
    await expect(syncPairedGame(deps, plan, 'game-1')).rejects.toThrow();
  });
});
