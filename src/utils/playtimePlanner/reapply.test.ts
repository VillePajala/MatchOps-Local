import {
  buildReapplyPatch,
  countReapplicableGames,
  isGamePlayed,
  reapplyPlanToGame,
  reapplyPlanToLinkedGames,
  type ReapplyDeps,
} from './reapply';
import { replacePlayerInPlan, removePlayerFromPlan } from './roster';
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
    // GK keeps identity + goalie flag.
    const gk = res.patch!.playersOnField.find((p) => p.id === 'a')!;
    expect(gk.isGoalie).toBe(true);
    // Planned sub schedule carried through (prefill names the out-player too).
    expect(res.plannedSubs).toEqual([
      { id: 'x', slotId: 's0', timeSeconds: 720, inPlayerId: 'f', outPlayerId: 'b' },
    ]);
  });

  it('re-adds a planned player missing from the game roster (plan is authoritative)', () => {
    // Game roster drifted - lost Kai (id 'e', a planned starter) since creation.
    // The plan still has Kai, so re-apply re-adds him to the squad and places him
    // (the old behaviour silently dropped him; that was the same bug class).
    const g = planGame();
    const res = buildReapplyPatch(makeGame({ availablePlayers: roster.filter((p) => p.id !== 'e') }), plan(g), g);
    expect(res.ok).toBe(true);
    const onFieldIds = res.patch!.playersOnField.map((p) => p.id);
    const selected = res.patch!.selectedPlayerIds;
    const available = res.patch!.availablePlayers!.map((p) => p.id);
    expect(available).toContain('e'); // re-added from the plan
    expect(onFieldIds).toContain('e'); // now placeable
    expect(res.missingPlayerIds).toHaveLength(0); // nothing dropped
    // Rule 3: playersOnField ⊆ selectedPlayerIds ⊆ availablePlayers.
    for (const id of onFieldIds) expect(selected).toContain(id);
    for (const id of selected) expect(available).toContain(id);
  });

  it('replacing a starter with a NEW player adds them to the game roster and places them', () => {
    const g = planGame();
    const edited = replacePlayerInPlan(plan(g), 'b', { id: 'z', name: 'Zeb' }); // 'z' not in the game roster
    const res = buildReapplyPatch(makeGame(), edited, edited.games[0]);
    const available = res.patch!.availablePlayers!.map((p) => p.id);
    const onField = res.patch!.playersOnField.map((p) => p.id);
    expect(available).toContain('z'); // added to the squad
    expect(available).not.toContain('b'); // replaced-out player gone
    expect(onField).toContain('z'); // placed in b's slot
    expect(onField).not.toContain('b');
  });

  it('enriches a newly-added plan player from the master roster (nickname + number kept)', () => {
    const g = planGame();
    const edited = replacePlayerInPlan(plan(g), 'b', { id: 'z', name: 'Zeb' });
    const master: Player[] = [{ id: 'z', name: 'Zeb', nickname: 'Z', jerseyNumber: '7' }];
    const res = buildReapplyPatch(makeGame(), edited, edited.games[0], master);
    const z = res.patch!.availablePlayers!.find((p) => p.id === 'z')!;
    expect(z.nickname).toBe('Z'); // the disc label survives, not stripped to bare name
    expect(z.jerseyNumber).toBe('7');
  });

  it('removing a player from the plan removes them from the linked game', () => {
    const g = planGame();
    const edited = removePlayerFromPlan(plan(g), 'c'); // 'c' was a starter
    const res = buildReapplyPatch(makeGame(), edited, edited.games[0]);
    const available = res.patch!.availablePlayers!.map((p) => p.id);
    const onField = res.patch!.playersOnField.map((p) => p.id);
    expect(available).not.toContain('c'); // gone from the squad
    expect(onField).not.toContain('c'); // gone from the field
    expect(res.patch!.selectedPlayerIds).not.toContain('c');
  });

  it('syncs the roster + lineup fields, and no "what happened" keys', () => {
    const g = planGame();
    const res = buildReapplyPatch(makeGame(), plan(g), g);
    expect(Object.keys(res.patch!).sort()).toEqual(
      ['availablePlayers', 'formationSnapPoints', 'playersOnField', 'selectedPlayerIds'].sort(),
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
      getMasterRoster: async () => roster,
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

  it('throws when the planned-subs write reports failure, and reverts the lineup write', async () => {
    // setGameSubs catches internally and returns false - a stale sub schedule
    // under a new lineup must surface as an error, not a success toast. The
    // lineup save has already landed by then, so it is reverted (best-effort)
    // to keep the stored lineup and sub schedule consistent with each other.
    const game = makeGame();
    const { deps, saveGame } = makeDeps({ setGameSubs: jest.fn(async () => false) });
    await expect(reapplyPlanToGame(deps, 'game-1', game)).rejects.toThrow(
      /Planned-subs write failed/,
    );
    expect(saveGame).toHaveBeenCalledTimes(2);
    // Second write restores the ORIGINAL game blob.
    expect(saveGame.mock.calls[1]).toEqual(['game-1', game]);
  });

  it('blocks when the PLAN roster is empty (nothing to build a lineup from)', async () => {
    // Roster is now synced FROM the plan, so an empty game roster is restored, not
    // blocked - the only "empty" that blocks is an empty plan roster.
    const emptyPlan: PlaytimePlan = { ...plan(planGame()), players: [] };
    const { deps, saveGame } = makeDeps({ getPlan: async () => emptyPlan });
    const res = await reapplyPlanToGame(deps, 'game-1', makeGame());
    expect(res).toEqual({ ok: false, reason: 'empty-roster' });
    expect(saveGame).not.toHaveBeenCalled();
  });

  it('restores an empty game roster from the plan (roster is re-synced)', async () => {
    const { deps, saveGame } = makeDeps();
    const res = await reapplyPlanToGame(deps, 'game-1', makeGame({ availablePlayers: [] }));
    expect(res.ok).toBe(true);
    const savedGame = saveGame.mock.calls[0][1];
    expect(savedGame.availablePlayers.map((p: Player) => p.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(savedGame.playersOnField.length).toBeGreaterThan(0);
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
        getMasterRoster: async () => roster,
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
      skippedNoRoster: 0,
      failed: 0,
      missingTotal: 0,
      missingNames: [],
    });
    expect(saveGame).toHaveBeenCalledTimes(2); // a + b, not the played one, not g2
    expect(setGameSubs).toHaveBeenCalledTimes(2);
  });

  it('restores an empty-roster linked game from the plan instead of skipping it', async () => {
    const games: Record<string, AppState> = {
      a: makeGame(),
      empty: makeGame({ availablePlayers: [] }),
    };
    const links = {
      a: { planId: 'plan-1', planGameId: 'g1' },
      empty: { planId: 'plan-1', planGameId: 'g1' },
    };
    const { deps, saveGame } = makeBulkDeps(games, links);
    const summary = await reapplyPlanToLinkedGames(deps, plan(planGame()), 'g1');

    expect(summary.matched).toBe(2);
    expect(summary.updated).toBe(2); // the empty-roster game is now restored from the plan
    expect(summary.skippedNoRoster).toBe(0);
    // The accounting invariant the toast relies on.
    expect(summary.matched).toBe(
      summary.updated + summary.skippedPlayed + summary.skippedNoRoster + summary.failed,
    );
    expect(saveGame).toHaveBeenCalledTimes(2);
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

  it('counts a false planned-subs write as a failure and reverts that game\'s lineup', async () => {
    const gameA = makeGame();
    const links = {
      a: { planId: 'plan-1', planGameId: 'g1' },
      b: { planId: 'plan-1', planGameId: 'g1' },
    };
    const { deps, saveGame, setGameSubs } = makeBulkDeps({ a: gameA, b: makeGame() }, links);
    setGameSubs.mockImplementationOnce(async () => false); // first game's subs write fails

    const summary = await reapplyPlanToLinkedGames(deps, plan(planGame()), 'g1');
    expect(summary.updated).toBe(1);
    expect(summary.failed).toBe(1);
    // a: patched write + revert to original; b: patched write only.
    expect(saveGame).toHaveBeenCalledTimes(3);
    expect(saveGame.mock.calls[1]).toEqual(['a', gameA]);
  });

  it('re-adds planned players missing from linked game rosters (plan is authoritative)', async () => {
    // Both linked games drifted - missing Kai (a planned starter). Re-apply now
    // re-adds him from the plan to each game's roster and field, so nothing is
    // "missing" any more.
    const drifted = () => makeGame({ availablePlayers: roster.filter((p) => p.id !== 'e') });
    const links = {
      a: { planId: 'plan-1', planGameId: 'g1' },
      b: { planId: 'plan-1', planGameId: 'g1' },
    };
    const { deps, saveGame } = makeBulkDeps({ a: drifted(), b: drifted() }, links);
    const summary = await reapplyPlanToLinkedGames(deps, plan(planGame()), 'g1');
    expect(summary.updated).toBe(2);
    expect(summary.missingTotal).toBe(0); // nothing missing - re-added from the plan
    expect(summary.missingNames).toEqual([]);
    const savedA = saveGame.mock.calls.find((c) => c[0] === 'a')![1];
    expect(savedA.availablePlayers.map((p: Player) => p.id)).toContain('e');
    expect(savedA.playersOnField.map((p: Player) => p.id)).toContain('e');
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
      skippedNoRoster: 0,
      failed: 0,
      missingTotal: 0,
      missingNames: [],
    });
    expect(saveGame).not.toHaveBeenCalled();
  });
});
