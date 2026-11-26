import {
  buildBatchShared,
  buildPlanGameRequest,
  createGamesFromPlan,
  createdGameIdsForPlan,
  defaultOpponentFromLabel,
  notCreatedPlanGames,
  opponentFromLabel,
  planGameOrder,
  teamDefaultCompetition,
  validatePlanBatch,
  type PlanBatchRow,
  type PlanBatchShared,
  type CreateGamesFromPlanDeps,
} from './createFromPlan';
import type { PlanLinksCollection } from './planLinks';
import type { PlanGame, PlaytimePlan } from './types';
import type { Player, Season, Team, Tournament } from '@/types';
import { buildNewGameState, type StartNewGameRequest } from '@/components/HomePage/utils/newGameHandlers';
import { activePlayers } from '@/utils/gamePlayerList';

const roster: Player[] = [
  { id: 'a', name: 'Alex' },
  { id: 'b', name: 'Sam' },
  { id: 'c', name: 'Jo' },
  { id: 'd', name: 'Max' },
  { id: 'e', name: 'Kai' },
  { id: 'f', name: 'Niko' },
];

const planGame = (id: string, label: string, over: Partial<PlanGame> = {}): PlanGame => ({
  id,
  label,
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

const makePlan = (games: PlanGame[] = [planGame('g1', 'Peli 1'), planGame('g2', 'HJK'), planGame('g3', 'Peli 3')]): PlaytimePlan => ({
  id: 'plan1',
  name: 'Cup',
  version: 1,
  createdAt: 'x',
  updatedAt: 'x',
  players: ['a', 'b', 'c', 'd', 'e', 'f', 'gone'].map((id) => ({ id, name: id })),
  games,
});

const shared = (over: Partial<PlanBatchShared> = {}): PlanBatchShared => ({
  teamId: 'team1',
  teamName: 'FC Koti',
  seasonId: null,
  tournamentId: 't1',
  tournamentSeriesId: null,
  tournamentLevel: '',
  ageGroup: 'U10',
  gameType: 'soccer',
  leagueId: '',
  customLeagueName: '',
  ...over,
});

const row = (planGameId: string, over: Partial<PlanBatchRow> = {}): PlanBatchRow => ({
  planGameId,
  opponentName: `Opp ${planGameId}`,
  gameDate: '2026-12-06',
  gameTime: '',
  gameLocation: '',
  homeOrAway: 'home',
  ...over,
});

describe('createdGameIdsForPlan', () => {
  it('maps planned games to games that still exist, ignoring other plans and deleted games', () => {
    const links: PlanLinksCollection = {
      game_100_a: { planId: 'plan1', planGameId: 'g1' },
      game_200_b: { planId: 'plan1', planGameId: 'g2' }, // game deleted
      game_300_c: { planId: 'other', planGameId: 'g3' },
    };
    const games = { game_100_a: {}, game_300_c: {} };
    expect(createdGameIdsForPlan(games, links, 'plan1')).toEqual({ g1: 'game_100_a' });
  });

  /** @edge-case a deleted game frees its planned game for a new create */
  it('treats a planned game whose game was deleted as not created', () => {
    const plan = makePlan();
    const links: PlanLinksCollection = { game_1_x: { planId: 'plan1', planGameId: 'g2' } };
    const created = createdGameIdsForPlan({}, links, 'plan1');
    expect(notCreatedPlanGames(plan, created).map((g) => g.id)).toEqual(['g1', 'g2', 'g3']);
  });

  it('picks the newest game when one planned game produced several', () => {
    const links: PlanLinksCollection = {
      game_500_new: { planId: 'plan1', planGameId: 'g1' },
      game_100_old: { planId: 'plan1', planGameId: 'g1' },
    };
    expect(createdGameIdsForPlan({ game_500_new: {}, game_100_old: {} }, links, 'plan1')).toEqual({ g1: 'game_500_new' });
  });
});

describe('defaultOpponentFromLabel', () => {
  it('keeps a real name and drops the planner placeholders', () => {
    expect(defaultOpponentFromLabel('HJK P10')).toBe('HJK P10');
    expect(defaultOpponentFromLabel(' Peli 2 ')).toBe('');
    expect(defaultOpponentFromLabel('Game 12')).toBe('');
    expect(defaultOpponentFromLabel('Ottelu 1')).toBe('');
    expect(defaultOpponentFromLabel('')).toBe('');
  });

  /** @critical "(koti)" in a label is the side, not part of the opponent's name */
  it('strips a home/away suffix into the side, in Finnish and English', () => {
    expect(opponentFromLabel('PePo / Valkoinen (koti)')).toEqual({ opponent: 'PePo / Valkoinen', homeOrAway: 'home' });
    expect(opponentFromLabel('Ilves (vieras)')).toEqual({ opponent: 'Ilves', homeOrAway: 'away' });
    expect(opponentFromLabel('HJK (Home) ')).toEqual({ opponent: 'HJK', homeOrAway: 'home' });
    expect(opponentFromLabel('KuPS (away)')).toEqual({ opponent: 'KuPS', homeOrAway: 'away' });
    // A placeholder with a side still sets the side, but names no opponent.
    expect(opponentFromLabel('Peli 2 (vieras)')).toEqual({ opponent: '', homeOrAway: 'away' });
    // Brackets that are not a side stay in the name.
    expect(opponentFromLabel('HJK (P10)')).toEqual({ opponent: 'HJK (P10)' });
  });

  it("never prefills the coach's own team as the opponent", () => {
    expect(opponentFromLabel('FC Koti', ['FC Koti'])).toEqual({ opponent: '' });
    expect(opponentFromLabel('fc koti (koti)', ['FC Koti'])).toEqual({ opponent: '', homeOrAway: 'home' });
    expect(defaultOpponentFromLabel('HJK', ['FC Koti'])).toBe('HJK');
  });
});

describe('validatePlanBatch', () => {
  /** @critical every required game field is checked before anything is created */
  it('flags missing team name, opponent and date, and a malformed time', () => {
    const plan = makePlan();
    const result = validatePlanBatch(plan, shared({ teamName: '  ' }), [
      row('g1', { opponentName: ' ' }),
      row('g2', { gameDate: '' }),
      row('g3', { gameTime: '25:00' }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.teamName).toBe('required');
    expect(result.rows.g1).toEqual({ opponentName: 'required' });
    expect(result.rows.g2).toEqual({ gameDate: 'required' });
    expect(result.rows.g3).toEqual({ gameTime: 'invalid' });
  });

  it('accepts empty kick-off time and venue', () => {
    const result = validatePlanBatch(makePlan(), shared(), [row('g1'), row('g2', { gameTime: '09:30' })]);
    expect(result).toEqual({ ok: true, rows: {} });
  });

  it('rejects impossible dates, too-long names and a planned game without a length', () => {
    const plan = makePlan([planGame('g1', 'A', { periodMinutes: 0 }), planGame('g2', 'B')]);
    const result = validatePlanBatch(plan, shared(), [
      row('g1'),
      row('g2', { gameDate: '2026-02-30', opponentName: 'x'.repeat(500) }),
    ]);
    expect(result.rows.g1).toEqual({ periodMinutes: 'invalid' });
    expect(result.rows.g2).toEqual({ gameDate: 'invalid', opponentName: 'tooLong' });
  });
});

describe('buildPlanGameRequest', () => {
  it('prefills the planned line-up, format and link, with only players still in the roster', () => {
    const plan = makePlan();
    const req = buildPlanGameRequest(plan, plan.games[1], shared(), row('g2', { gameTime: '10:00', homeOrAway: 'away' }), roster);
    expect(req.prefill?.sourcePlanId).toBe('plan1');
    expect(req.prefill?.sourcePlanGameId).toBe('g2');
    expect(req.numPeriods).toBe(2);
    expect(req.periodDuration).toBe(12);
    expect(req.formationPresetId).toBe('5v5-2-2');
    expect(req.initialSelectedPlayerIds).not.toContain('gone');
    expect(req.initialSelectedPlayerIds.sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(req.isPlayed).toBe(false);
    expect(req.homeOrAway).toBe('away');
    expect(req.gameTime).toBe('10:00');
    expect(req.tournamentId).toBe('t1');
    expect(req.teamId).toBe('team1');
    expect(req.prefill?.plannedSubs).toHaveLength(1);
  });

  it("passes the venue's pin and street address on with its name", () => {
    const plan = makePlan();
    const req = buildPlanGameRequest(
      plan,
      plan.games[1],
      shared(),
      row('g2', { gameLocation: ' Areena ', locationLat: 61.87, locationLng: 28.88, locationAddress: 'Muurarinkatu 4' }),
      roster,
    );
    expect(req).toMatchObject({ gameLocation: 'Areena', locationLat: 61.87, locationLng: 28.88, locationAddress: 'Muurarinkatu 4' });
    const plain = buildPlanGameRequest(plan, plan.games[1], shared(), row('g2', { gameLocation: 'Tali' }), roster);
    expect(plain.locationLat).toBeUndefined();
    expect(plain.locationAddress).toBeUndefined();
  });

  it('leaves archived players out like the new-game form does', () => {
    const plan = makePlan();
    const req = buildPlanGameRequest(plan, plan.games[0], shared(), row('g1'), [
      ...roster.slice(0, 5),
      { ...roster[5], archived: true },
    ]);
    expect(req.initialSelectedPlayerIds).not.toContain('f');
  });

  /**
   * A team game created from a plan stores the same squad (availablePlayers)
   * as the normal new-game form for that team: the form keeps the whole
   * active club roster and only PRE-SELECTS the team's players
   * (NewGameSetupModal: "Always show master roster, pre-select team players").
   * @critical
   */
  it('stores the same availablePlayers as the new-game form for a team game', () => {
    const club: Player[] = [
      ...roster,
      { id: 'g', name: 'Other team kid' },
      { id: 'h', name: 'Left the club', archived: true },
    ];
    const plan = makePlan();
    const planReq = buildPlanGameRequest(plan, plan.games[0], shared(), row('g1'), club);
    // What NewGameSetupModal passes as availablePlayersForGame with team1 picked
    // (its pickableRoster; the team roster only drives the selection).
    const formReq: StartNewGameRequest = {
      ...planReq,
      initialSelectedPlayerIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      availablePlayersForGame: activePlayers(club),
      prefill: undefined,
    };
    const deps = { availablePlayers: club, defaultSubIntervalMinutes: 5 };
    const fromPlan = buildNewGameState(planReq, deps).gameState;
    const fromForm = buildNewGameState(formReq, deps).gameState;
    const ids = (players: Player[]) => players.map((p) => p.id).sort();
    expect(ids(fromPlan.availablePlayers)).toEqual(ids(fromForm.availablePlayers));
    expect(ids(fromPlan.availablePlayers)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    // Line-up from the plan; Rule 3 holds: onField ⊆ selected ⊆ available.
    const available = new Set(ids(fromPlan.availablePlayers));
    expect(fromPlan.selectedPlayerIds.every((id) => available.has(id))).toBe(true);
    expect(fromPlan.playersOnField.every((p) => fromPlan.selectedPlayerIds.includes(p.id))).toBe(true);
    expect(fromPlan.selectedPlayerIds).not.toContain('g');
  });

  it('stores the same availablePlayers as the new-game form without a team', () => {
    const plan = makePlan();
    const planReq = buildPlanGameRequest(plan, plan.games[0], shared({ teamId: null }), row('g1'), roster);
    expect(planReq.teamId).toBeNull();
    expect(planReq.availablePlayersForGame.map((p) => p.id)).toEqual(activePlayers(roster).map((p) => p.id));
  });
});

describe('createGamesFromPlan', () => {
  const setup = (over: Partial<CreateGamesFromPlanDeps> = {}) => {
    const calls: { request: StartNewGameRequest; createdAtMs: number }[] = [];
    const deps: CreateGamesFromPlanDeps = {
      getAllGames: async () => ({}),
      getAllPlanLinks: async () => ({}),
      createGame: async (request, createdAtMs) => {
        calls.push({ request, createdAtMs });
        return `game_${createdAtMs}_${request.prefill?.sourcePlanGameId}`;
      },
      now: () => 1000,
      ...over,
    };
    return { deps, calls };
  };

  /** @critical one press creates every row, linked to the plan, in plan order */
  it('creates each row in plan order with increasing creation times', async () => {
    const plan = makePlan();
    const { deps, calls } = setup();
    const result = await createGamesFromPlan(deps, plan, shared(), [row('g3'), row('g1'), row('g2')], roster);
    expect(calls.map((c) => c.request.prefill?.sourcePlanGameId)).toEqual(['g1', 'g2', 'g3']);
    expect(calls.map((c) => c.createdAtMs)).toEqual([1000, 1001, 1002]);
    expect(result.created.map((c) => c.planGameId)).toEqual(['g1', 'g2', 'g3']);
    expect(result.failed).toEqual([]);
  });

  it('throws on invalid input and creates nothing', async () => {
    const { deps, calls } = setup();
    await expect(createGamesFromPlan(deps, makePlan(), shared(), [row('g1', { opponentName: '' })], roster)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  /** @critical never create the same planned game twice */
  it('skips planned games that already have a game in storage, and duplicate rows', async () => {
    const { deps, calls } = setup({
      getAllGames: async () => ({ game_5_x: {} }),
      getAllPlanLinks: async () => ({ game_5_x: { planId: 'plan1', planGameId: 'g2' } }),
    });
    const result = await createGamesFromPlan(deps, makePlan(), shared(), [row('g1'), row('g1'), row('g2')], roster);
    expect(calls).toHaveLength(1);
    expect(result.skipped).toEqual(['g1', 'g2']);
    expect(result.created.map((c) => c.planGameId)).toEqual(['g1']);
  });

  it('re-creates a planned game whose earlier game was deleted', async () => {
    const { deps, calls } = setup({
      getAllGames: async () => ({}),
      getAllPlanLinks: async () => ({ game_5_x: { planId: 'plan1', planGameId: 'g2' } }),
    });
    const result = await createGamesFromPlan(deps, makePlan(), shared(), [row('g2')], roster);
    expect(calls).toHaveLength(1);
    expect(result.created).toEqual([{ planGameId: 'g2', gameId: 'game_1000_g2' }]);
  });

  /** @edge-case one failure is reported without stopping the others */
  it('reports a failed game (null or thrown) and keeps creating the rest', async () => {
    const { deps } = setup();
    const createGame = jest.fn(async (request: StartNewGameRequest, ms: number) => {
      const id = request.prefill?.sourcePlanGameId;
      if (id === 'g1') return null;
      if (id === 'g2') throw new Error('boom');
      return `game_${ms}`;
    });
    const result = await createGamesFromPlan({ ...deps, createGame }, makePlan(), shared(), [row('g1'), row('g2'), row('g3')], roster);
    expect(result.failed).toEqual(['g1', 'g2']);
    expect(result.created).toEqual([{ planGameId: 'g3', gameId: 'game_1002' }]);
  });

  it('reports a row whose planned game was removed meanwhile as failed', async () => {
    const { deps, calls } = setup();
    const plan = makePlan([planGame('g1', 'A')]);
    // validate passes per-row lengths only for known games; an unknown id is a length error
    await expect(createGamesFromPlan(deps, plan, shared(), [row('gX')], roster)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe('buildBatchShared / teamDefaultCompetition', () => {
  const season: Season = { id: 's1', name: 'Sarja', ageGroup: 'U11', leagueId: 'muu', customLeagueName: 'Oma', gender: 'girls' };
  const tournament: Tournament = {
    id: 't1',
    name: 'Cup',
    ageGroup: 'U10',
    series: [
      { id: 'se-bad', level: 'Nope' },
      { id: 'se1', level: 'Kilpa' },
    ],
  };
  const team: Team = { id: 'team1', name: 'FC Koti', boundTournamentId: 't1', createdAt: '', updatedAt: '' } as Team;

  it("starts from the team's bound competition and its first valid series", () => {
    expect(teamDefaultCompetition(team, [tournament])).toEqual({ kind: 'tournament', id: 't1', seriesId: 'se1' });
    expect(teamDefaultCompetition(undefined, [tournament])).toEqual({ kind: 'none' });
  });

  it('copies league, age group and gender from a league; team name from the team', () => {
    const result = buildBatchShared({
      team,
      teamName: 'ignored',
      competition: { kind: 'season', id: 's1' },
      gameType: 'futsal',
      seasons: [season],
      tournaments: [tournament],
    });
    expect(result).toMatchObject({
      teamId: 'team1',
      teamName: 'FC Koti',
      seasonId: 's1',
      tournamentId: null,
      ageGroup: 'U11',
      leagueId: 'muu',
      customLeagueName: 'Oma',
      gender: 'girls',
      gameType: 'futsal',
    });
  });

  it('uses the typed name without a team and the series level for a tournament', () => {
    const result = buildBatchShared({
      team: undefined,
      teamName: 'Typed FC',
      competition: { kind: 'tournament', id: 't1', seriesId: 'se1' },
      gameType: 'soccer',
      seasons: [],
      tournaments: [tournament],
    });
    expect(result).toMatchObject({ teamId: null, teamName: 'Typed FC', tournamentId: 't1', tournamentSeriesId: 'se1', tournamentLevel: 'Kilpa' });
  });
});

describe('planGameOrder', () => {
  it('maps games to their plan position and drops links to removed planned games', () => {
    const plan = makePlan();
    const links: PlanLinksCollection = {
      game_a: { planId: 'plan1', planGameId: 'g3' },
      game_b: { planId: 'plan1', planGameId: 'removed' },
      game_c: { planId: 'missing-plan', planGameId: 'g1' },
    };
    expect(planGameOrder(links, { plan1: plan })).toEqual({ game_a: { planId: 'plan1', index: 2 } });
  });
});
