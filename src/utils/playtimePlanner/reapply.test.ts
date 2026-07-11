import {
  buildReapplyPatch,
  isGamePlayed,
  reapplyPlanToGame,
  type ReapplyDeps,
} from './reapply';
import type { PlaytimePlan, PlanGame } from './types';
import type { AppState, Player } from '@/types';

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
const makeGame = (over: Partial<AppState> = {}): AppState =>
  ({
    gameStatus: 'notStarted',
    gameEvents: [],
    availablePlayers: roster,
    selectedPlayerIds: [],
    playersOnField: [],
    formationSnapPoints: [],
    sourcePlanId: 'plan-1',
    sourcePlanGameId: 'g1',
    homeScore: 0,
    awayScore: 0,
    gameNotes: 'keep me',
    ...over,
  }) as unknown as AppState;

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
      saveGame,
      setGameSubs,
      ...over,
    };
    return { deps, saveGame, setGameSubs };
  };

  it('blocks a game with no plan link', async () => {
    const { deps, saveGame } = makeDeps();
    const res = await reapplyPlanToGame(deps, 'game-1', makeGame({ sourcePlanId: undefined }));
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
    const { deps } = makeDeps();
    const res = await reapplyPlanToGame(deps, 'game-1', makeGame({ sourcePlanGameId: 'gone' }));
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
