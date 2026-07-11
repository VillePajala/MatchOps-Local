import {
  buildReapplyPatch,
  countReapplicableGames,
  isGamePlayed,
  reapplyPlanToGame,
  reapplyPlanToLinkedGames,
  type ReapplyDeps,
} from './reapply';
import type { PlaytimePlan, PlanGame } from './types';
import type { AppState, Player } from '@/types';

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

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

const plan = (game: PlanGame): PlaytimePlan => ({
  id: 'plan-1',
  name: 'Tournament plan',
  version: 1,
  createdAt: 'x',
  updatedAt: 'x',
  players: roster.map((p) => ({ id: p.id, name: p.name })),
  games: [game],
});

// Minimal AppState carrying only what re-apply reads/writes. The unused game fields
// (score, events, notes, ...) stand in for "what happened" and must be preserved.
// The plan link is NOT on the game - it lives in the local link store (planLinks).
const makeGame = (over: Partial<AppState> = {}): AppState =>
  ({
    gameStatus: 'notStarted',
    gameEvents: [],
    availablePlayers: roster,
    selectedPlayerIds: [],
    playersOnField: [],
    formationSnapPoints: [],
    homeScore: 0,
    awayScore: 0,
    gameNotes: 'keep me',
    ...over,
  }) as unknown as AppState;

const LINK = { planId: 'plan-1', planGameId: 'g1' };

describe('isGamePlayed', () => {
  it('is false for a fresh, unstarted game', () => {
    expect(isGamePlayed(makeGame())).toBe(false);
  });
  it('is true once the game has started', () => {
    expect(isGamePlayed(makeGame({ gameStatus: 'inProgress' }))).toBe(true);
  });
  it('is true once the game has recorded events', () => {
    expect(isGamePlayed(makeGame({ gameEvents: [{ id: 'g' }] as unknown as AppState['gameEvents'] }))).toBe(
      true,
    );
  });
});

describe('buildReapplyPatch', () => {
  it('blocks a played game (never clobbers what happened)', () => {
    const res = buildReapplyPatch(makeGame({ gameStatus: 'inProgress' }), plan(planGame()), planGame());
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('played');
    expect(res.patch).toBeUndefined();
  });

  it('rebuilds the lineup and planned subs from the current plan', () => {
    const g = planGame();
    const res = buildReapplyPatch(makeGame(), plan(g), g);
    expect(res.ok).toBe(true);
    // 5 starters on the field + 1 parked sub (Niko) = 6 discs.
    expect(res.patch!.playersOnField).toHaveLength(6);
    expect(res.startersCount).toBe(5);
    expect(res.subsCount).toBe(1);
    // GK keeps identity + goalie flag.
    const gk = res.patch!.playersOnField.find((p) => p.id === 'a')!;
    expect(gk.isGoalie).toBe(true);
    // Planned sub schedule carried through (prefill names the out-player too).
    expect(res.plannedSubs).toEqual([
      { id: 'x', slotId: 's0', timeSeconds: 720, inPlayerId: 'f', outPlayerId: 'b' },
    ]);
  });

  it('keeps Rule 3 when the roster drifted (planned player left the game roster)', () => {
    // Game roster lost Kai (id 'e', a planned starter) since creation.
    const g = planGame();
    const res = buildReapplyPatch(makeGame({ availablePlayers: roster.filter((p) => p.id !== 'e') }), plan(g), g);
    expect(res.ok).toBe(true);
    const onFieldIds = res.patch!.playersOnField.map((p) => p.id);
    const selected = res.patch!.selectedPlayerIds;
    expect(onFieldIds).not.toContain('e'); // dropped - not in the roster
    // playersOnField ⊆ selectedPlayerIds, and selected excludes the missing player.
    for (const id of onFieldIds) expect(selected).toContain(id);
    expect(selected).not.toContain('e');
    expect(res.missingPlayerIds).toContain('e');
  });

  it('only touches lineup fields - the patch has no "what happened" keys', () => {
    const g = planGame();
    const res = buildReapplyPatch(makeGame(), plan(g), g);
    expect(Object.keys(res.patch!).sort()).toEqual(
      ['formationSnapPoints', 'playersOnField', 'selectedPlayerIds'].sort(),
    );
  });
});

describe('reapplyPlanToGame', () => {
  const makeDeps = (over: Partial<ReapplyDeps> = {}): { deps: ReapplyDeps; saveGame: jest.Mock; setGameSubs: jest.Mock } => {
    const saveGame = jest.fn(async (_id: string, game: AppState) => game);
    const setGameSubs = jest.fn(async () => true);
    const deps: ReapplyDeps = {
      getPlan: async (id) => (id === 'plan-1' ? plan(planGame()) : null),
      getPlanLink: async () => LINK,
      saveGame,
      setGameSubs,
      ...over,
    };
    return { deps, saveGame, setGameSubs };
  };

  it('blocks a game with no plan link', async () => {
    const { deps, saveGame } = makeDeps({ getPlanLink: async () => null });
    const res = await reapplyPlanToGame(deps, 'game-1', makeGame());
    expect(res).toEqual({ ok: false, reason: 'no-link' });
    expect(saveGame).not.toHaveBeenCalled();
  });

  it('blocks when the source plan was deleted', async () => {
    const { deps, saveGame } = makeDeps({ getPlan: async () => null });
    const res = await reapplyPlanToGame(deps, 'game-1', makeGame());
    expect(res).toEqual({ ok: false, reason: 'plan-missing' });
    expect(saveGame).not.toHaveBeenCalled();
  });

  it('blocks when the planned game was removed from the plan', async () => {
    const { deps } = makeDeps({ getPlanLink: async () => ({ planId: 'plan-1', planGameId: 'gone' }) });
    const res = await reapplyPlanToGame(deps, 'game-1', makeGame());
    expect(res).toEqual({ ok: false, reason: 'plan-missing' });
  });

  it('blocks a played game before writing anything', async () => {
    const { deps, saveGame, setGameSubs } = makeDeps();
    const res = await reapplyPlanToGame(deps, 'game-1', makeGame({ gameStatus: 'inProgress' }));
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('played');
    expect(saveGame).not.toHaveBeenCalled();
    expect(setGameSubs).not.toHaveBeenCalled();
  });

  it('persists the lineup patch + planned subs and preserves what happened', async () => {
    const { deps, saveGame, setGameSubs } = makeDeps();
    const game = makeGame({ homeScore: 2, awayScore: 1, gameNotes: 'notes stay' });
    const res = await reapplyPlanToGame(deps, 'game-1', game);
    expect(res.ok).toBe(true);

    expect(saveGame).toHaveBeenCalledTimes(1);
    const [savedId, savedGame] = saveGame.mock.calls[0];
    expect(savedId).toBe('game-1');
    // Lineup replaced...
    expect(savedGame.playersOnField).toHaveLength(6);
    // ...but "what happened" preserved.
    expect(savedGame.homeScore).toBe(2);
    expect(savedGame.awayScore).toBe(1);
    expect(savedGame.gameNotes).toBe('notes stay');
    expect(savedGame.gameStatus).toBe('notStarted');

    expect(setGameSubs).toHaveBeenCalledWith('game-1', [
      { id: 'x', slotId: 's0', timeSeconds: 720, inPlayerId: 'f', outPlayerId: 'b' },
    ]);
  });
});

describe('countReapplicableGames', () => {
  it('counts only unplayed games linked to the plan, keyed by planned-game id', () => {
    const games: Record<string, AppState> = {
      a: makeGame(),
      b: makeGame(),
      c: makeGame(),
      played: makeGame({ gameStatus: 'inProgress' }),
      noLink: makeGame(),
      otherPlan: makeGame(),
    };
    const links = {
      a: { planId: 'plan-1', planGameId: 'g1' },
      b: { planId: 'plan-1', planGameId: 'g1' },
      c: { planId: 'plan-1', planGameId: 'g2' },
      played: { planId: 'plan-1', planGameId: 'g1' },
      otherPlan: { planId: 'plan-9', planGameId: 'g1' },
      deletedGame: { planId: 'plan-1', planGameId: 'g1' }, // link outlived its game
    };
    expect(countReapplicableGames(games, links, 'plan-1')).toEqual({ g1: 2, g2: 1 });
  });
});

describe('reapplyPlanToLinkedGames', () => {
  const makeBulkDeps = (
    games: Record<string, AppState>,
    links: Record<string, { planId: string; planGameId: string }>,
  ) => {
    const saveGame = jest.fn(async (_id: string, game: AppState) => game);
    const setGameSubs = jest.fn(async () => true);
    return {
      deps: {
        getAllGames: async () => games,
        getAllPlanLinks: async () => links,
        saveGame,
        setGameSubs,
      },
      saveGame,
      setGameSubs,
    };
  };

  it('updates every unplayed linked game and skips played ones', async () => {
    const games: Record<string, AppState> = {
      a: makeGame(),
      b: makeGame(),
      played: makeGame({ gameStatus: 'inProgress' }),
      otherGame: makeGame(),
    };
    const links = {
      a: { planId: 'plan-1', planGameId: 'g1' },
      b: { planId: 'plan-1', planGameId: 'g1' },
      played: { planId: 'plan-1', planGameId: 'g1' },
      otherGame: { planId: 'plan-1', planGameId: 'g2' },
    };
    const { deps, saveGame, setGameSubs } = makeBulkDeps(games, links);
    const summary = await reapplyPlanToLinkedGames(deps, plan(planGame()), 'g1');

    expect(summary).toEqual({
      matched: 3,
      updated: 2,
      updatedIds: ['a', 'b'],
      skippedPlayed: 1,
      failed: 0,
      missingTotal: 0,
    });
    expect(saveGame).toHaveBeenCalledTimes(2); // a + b, not the played one, not g2
    expect(setGameSubs).toHaveBeenCalledTimes(2);
  });

  it('isolates a failing write: the rest of the batch still updates and failures are counted', async () => {
    const games: Record<string, AppState> = { a: makeGame(), b: makeGame(), c: makeGame() };
    const links = {
      a: { planId: 'plan-1', planGameId: 'g1' },
      b: { planId: 'plan-1', planGameId: 'g1' },
      c: { planId: 'plan-1', planGameId: 'g1' },
    };
    const { deps, saveGame } = makeBulkDeps(games, links);
    // Game b's blob is bad - its save rejects; a and c must still go through.
    saveGame.mockImplementation(async (id: string, game: AppState) => {
      if (id === 'b') throw new Error('quota exceeded');
      return game;
    });

    const summary = await reapplyPlanToLinkedGames(deps, plan(planGame()), 'g1');

    expect(summary.matched).toBe(3);
    expect(summary.updated).toBe(2);
    expect(summary.updatedIds).toEqual(['a', 'c']);
    expect(summary.failed).toBe(1); // surfaced, not silent
  });

  it('tallies missing planned players across updated games (roster drift)', async () => {
    // Both linked games are missing Kai (a planned starter) from their roster.
    const drifted = () => makeGame({ availablePlayers: roster.filter((p) => p.id !== 'e') });
    const links = {
      a: { planId: 'plan-1', planGameId: 'g1' },
      b: { planId: 'plan-1', planGameId: 'g1' },
    };
    const { deps } = makeBulkDeps({ a: drifted(), b: drifted() }, links);
    const summary = await reapplyPlanToLinkedGames(deps, plan(planGame()), 'g1');
    expect(summary.updated).toBe(2);
    expect(summary.missingTotal).toBe(2); // one missing player per updated game
  });

  it('does nothing when the planned game is not in the plan', async () => {
    const { deps, saveGame } = makeBulkDeps(
      { a: makeGame() },
      { a: { planId: 'plan-1', planGameId: 'g1' } },
    );
    const summary = await reapplyPlanToLinkedGames(deps, plan(planGame()), 'nope');
    expect(summary).toEqual({
      matched: 0,
      updated: 0,
      updatedIds: [],
      skippedPlayed: 0,
      failed: 0,
      missingTotal: 0,
    });
    expect(saveGame).not.toHaveBeenCalled();
  });
});
