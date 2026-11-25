/**
 * Day report ("Turnauspäivän raportti") building: record, per-game rows,
 * per-game positions, day totals and the exact share text.
 */
import type { AppState, GameEvent } from '@/types/game';
import type { Player } from '@/types';
import { TestFixtures } from '../../../tests/fixtures';
import {
  buildDayReport,
  buildDayReportShareText,
  formatDayRecord,
  isDayGamePlayed,
  NOT_IN_GAME,
  orderDayGames,
  type DayReportGameInput,
  type DayReportTranslate,
} from './dayReport';
import type { PlaytimePlan } from './types';

/** Finnish strings the report uses, so the share text is checked as the coach sees it. */
const FI: Record<string, string> = {
  'export.winShort': 'V',
  'export.tieShort': 'T',
  'export.lossShort': 'H',
  'planDayReport.gameOrdinal': '{{n}}.',
  'planDayReport.sharePlayersHeading': 'Pelaajat (pelipaikka {{games}} pelissä · maalit+syötöt):',
  'planDayReport.notPlayedYet': 'ei vielä pelattu',
  'planDayReport.penaltiesShort': 'rp.',
};
const t: DayReportTranslate = (key, fallback, options) => {
  const template = FI[key] ?? fallback;
  return template.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(options?.[k] ?? ''));
};

const player = (id: string, name: string, extra: Partial<Player> = {}): Player => ({ id, name, ...extra });
const EELI = player('eeli', 'Eeli Esimerkki');
const ONNI = player('onni', 'Onni Malli');
const AAPO = player('aapo', 'Aapo Testi');
const roster = [EELI, ONNI, AAPO];

const plan: PlaytimePlan = {
  id: 'plan1',
  name: 'Joulufutis 12.12.',
  version: 1,
  createdAt: '2026-12-01T00:00:00.000Z',
  updatedAt: '2026-12-01T00:00:00.000Z',
  players: [{ id: 'eeli', name: 'Eeli Esimerkki' }, { id: 'onni', name: 'Onni Malli' }, { id: 'aapo', name: 'Aapo Testi' }],
  games: ['pg1', 'pg2', 'pg3'].map((id, i) => ({
    id,
    label: `Peli ${i + 1}`,
    formationId: '5v5',
    numberOfPeriods: 1,
    periodMinutes: 15,
    included: true,
    startingSlots: [],
    subs: [],
  })),
};

const goal = (id: string, scorerId?: string, assisterId?: string): GameEvent => ({
  id,
  type: 'goal',
  time: 60,
  ...(scorerId ? { scorerId } : {}),
  ...(assisterId ? { assisterId } : {}),
});

const playedGame = (overrides: Partial<AppState>): AppState =>
  TestFixtures.games.completed({
    teamName: 'Kotkat P11',
    gameLocation: 'Hakalan halli',
    homeOrAway: 'home',
    availablePlayers: roster,
    playersOnField: [],
    selectedPlayerIds: ['eeli', 'onni', 'aapo'],
    gameEvents: [],
    playerPositions: undefined,
    shootoutKicks: undefined,
    gameNotes: '',
    ...overrides,
  });

/** The owner-approved example day: a win, a draw and a loss. */
const exampleDay = (): DayReportGameInput[] => [
  {
    planGameId: 'pg1',
    gameId: 'game_1',
    game: playedGame({
      opponentName: 'Kallion Kiri',
      homeScore: 2,
      awayScore: 1,
      playerPositions: { eeli: ['gk'], onni: ['lb'], aapo: ['rb'] },
      gameEvents: [goal('e1', 'eeli'), goal('e2', 'onni', 'aapo'), { id: 'o1', type: 'opponentGoal', time: 90 }],
      gameNotes: 'Hyvä avaus.',
    }),
  },
  {
    planGameId: 'pg2',
    gameId: 'game_2',
    game: playedGame({
      opponentName: 'Harjun Haukat',
      homeScore: 1,
      awayScore: 1,
      playerPositions: { eeli: ['gk'], onni: ['st'], aapo: ['rb'] },
      gameEvents: [goal('e3', undefined, 'onni')],
    }),
  },
  {
    planGameId: 'pg3',
    gameId: 'game_3',
    game: playedGame({
      opponentName: 'Rantakylän FC',
      homeOrAway: 'away',
      homeScore: 2,
      awayScore: 0,
      selectedPlayerIds: ['eeli', 'onni'],
      playerPositions: { eeli: ['lb'], onni: ['st'] },
    }),
  },
];

describe('isDayGamePlayed', () => {
  it('counts a started game, a game with play events, or a typed-in score', () => {
    const base = TestFixtures.games.newGame({ gameEvents: [], homeScore: 0, awayScore: 0 });
    expect(isDayGamePlayed(base)).toBe(false);
    expect(isDayGamePlayed({ ...base, gameStatus: 'gameEnd' })).toBe(true);
    expect(isDayGamePlayed({ ...base, gameEvents: [goal('g')] })).toBe(true);
    expect(isDayGamePlayed({ ...base, homeScore: 1 })).toBe(true);
  });

  /** @edge-case a dictated note before kick-off is not play */
  it('does not count a game whose only events are notes', () => {
    const base = TestFixtures.games.newGame({
      gameEvents: [{ id: 'n', type: 'note', time: 0, text: 'x' }],
      homeScore: 0,
      awayScore: 0,
    });
    expect(isDayGamePlayed(base)).toBe(false);
  });
});

describe('orderDayGames', () => {
  it('returns the existing games in PLAN order and skips planned games without one', () => {
    const games = { b: playedGame({}), a: playedGame({}) };
    const ordered = orderDayGames(plan, { pg3: 'b', pg1: 'a', pg2: 'missing' }, games);
    expect(ordered.map((g) => [g.planGameId, g.gameId])).toEqual([
      ['pg1', 'a'],
      ['pg3', 'b'],
    ]);
  });
});

describe('buildDayReport', () => {
  /** @critical the day at a glance: record, rows, players */
  it('builds the record, the game rows and per-game positions with day totals', () => {
    const report = buildDayReport(plan, exampleDay(), roster, t);
    expect(report.planName).toBe('Joulufutis 12.12.');
    expect(report.teamName).toBe('Kotkat P11');
    expect(report.venue).toBe('Hakalan halli');
    expect(report.record).toEqual({ wins: 1, draws: 1, losses: 1 });
    expect(report.games.map((g) => [g.opponentName, g.result, g.ourScore, g.theirScore])).toEqual([
      ['Kallion Kiri', 'W', 2, 1],
      ['Harjun Haukat', 'D', 1, 1],
      ['Rantakylän FC', 'L', 0, 2],
    ]);
    expect(report.playedGameNumbers).toEqual([1, 2, 3]);
    expect(report.players).toEqual([
      { playerId: 'eeli', name: 'Eeli', positions: ['GK', 'GK', 'LB'], goals: 1, assists: 0 },
      { playerId: 'onni', name: 'Onni', positions: ['LB', 'ST', 'ST'], goals: 1, assists: 1 },
      { playerId: 'aapo', name: 'Aapo', positions: ['RB', 'RB', NOT_IN_GAME], goals: 0, assists: 1 },
    ]);
  });

  it('falls back to the starting position on the pitch, labelled as the pitch labels it', () => {
    const report = buildDayReport(
      plan,
      [
        {
          planGameId: 'pg1',
          gameId: 'g',
          game: playedGame({
            opponentName: 'A',
            playerPositions: {},
            selectedPlayerIds: ['eeli', 'onni', 'aapo'],
            playersOnField: [
              { ...EELI, relX: 0.5, relY: 0.95 },
              { ...ONNI, relX: 0.5, relY: 0.2 },
            ],
          }),
        },
      ],
      roster,
      t,
    );
    // GK and ST from the pitch; Aapo was in the squad but not on it: SUB.
    expect(report.players.map((p) => [p.name, p.positions[0]])).toEqual([
      ['Eeli', 'GK'],
      ['Onni', 'ST'],
      ['Aapo', 'SUB'],
    ]);
  });

  it('lists several recorded positions back to front, and uses the nickname as on the pitch', () => {
    const report = buildDayReport(
      plan,
      [
        {
          planGameId: 'pg1',
          gameId: 'g',
          game: playedGame({
            opponentName: 'A',
            availablePlayers: [{ ...EELI, nickname: 'Eppu' }, ONNI, AAPO],
            selectedPlayerIds: ['eeli'],
            playerPositions: { eeli: ['st', 'gk'] },
          }),
        },
      ],
      roster,
      t,
    );
    expect(report.players).toEqual([
      { playerId: 'eeli', name: 'Eppu', positions: ['GK, ST'], goals: 0, assists: 0 },
    ]);
  });

  /** @edge-case an unplayed game stays in the list but out of every count */
  it('lists a game not played yet without counting it', () => {
    const day = exampleDay();
    day[1] = {
      ...day[1],
      game: TestFixtures.games.newGame({ opponentName: 'Harjun Haukat', gameEvents: [], homeScore: 0, awayScore: 0 }),
    };
    const report = buildDayReport(plan, day, roster, t);
    expect(report.games[1]).toMatchObject({ played: false, result: null });
    expect(report.record).toEqual({ wins: 1, draws: 0, losses: 1 });
    // Player columns are the played games only: 1 and 3.
    expect(report.playedGameNumbers).toEqual([1, 3]);
    expect(report.players.find((p) => p.playerId === 'onni')).toMatchObject({
      positions: ['LB', 'ST'],
      goals: 1,
      assists: 0,
    });
  });

  /** @edge-case a level score decided by penalties is a win, with the tally */
  it('resolves a shootout with the app result rules', () => {
    const report = buildDayReport(
      plan,
      [
        {
          planGameId: 'pg1',
          gameId: 'g',
          game: playedGame({
            opponentName: 'Kallion Kiri',
            homeOrAway: 'away',
            homeScore: 1,
            awayScore: 1,
            shootoutKicks: [
              { id: 'k1', team: 'home', scored: false, order: 1 },
              { id: 'k2', team: 'away', scored: true, order: 2 },
            ] as AppState['shootoutKicks'],
          }),
        },
      ],
      roster,
      t,
    );
    expect(report.games[0]).toMatchObject({ result: 'W', shootout: { us: 1, them: 0 } });
    expect(report.record).toEqual({ wins: 1, draws: 0, losses: 0 });
  });

  it('leaves out the team and venue when the games differ', () => {
    const day = exampleDay();
    day[2] = { ...day[2], game: { ...day[2].game, gameLocation: 'Muu halli', teamName: 'Kotkat P12' } };
    const report = buildDayReport(plan, day, roster, t);
    expect(report.teamName).toBeUndefined();
    expect(report.venue).toBeUndefined();
  });

  it('orders plan players first, then others by name', () => {
    const extra = player('zed', 'Bertta Ulkopuolinen');
    const day = exampleDay();
    day[0] = {
      ...day[0],
      game: { ...day[0].game, availablePlayers: [...roster, extra], selectedPlayerIds: ['zed', 'aapo', 'eeli', 'onni'] },
    };
    const report = buildDayReport(plan, day, roster, t);
    expect(report.players.map((p) => p.playerId)).toEqual(['eeli', 'onni', 'aapo', 'zed']);
  });
});

describe('formatDayRecord', () => {
  it('uses the app result letters, wins draws losses', () => {
    expect(formatDayRecord({ wins: 2, draws: 0, losses: 1 }, t)).toBe('2V 0T 1H');
  });
});

describe('buildDayReportShareText', () => {
  /** @critical the owner-approved format, character for character */
  it('produces the approved share text', () => {
    const report = buildDayReport(plan, exampleDay(), roster, t);
    const text = buildDayReportShareText(report, 'Yleiskuva:\nHyvä päivä.\n', t);
    expect(text).toBe(
      [
        '⚽ Kotkat P11 · Joulufutis 12.12. (Hakalan halli)',
        '1V 1T 1H',
        '',
        '✅ Kallion Kiri 2–1',
        '➖ Harjun Haukat 1–1',
        '❌ Rantakylän FC 0–2',
        '',
        'Pelaajat (pelipaikka 1./2./3. pelissä · maalit+syötöt):',
        'Eeli: GK / GK / LB · 1+0',
        'Onni: LB / ST / ST · 1+1',
        'Aapo: RB / RB / – · 0+1',
        '',
        'Yleiskuva:\nHyvä päivä.',
      ].join('\n'),
    );
  });

  it('marks an unplayed game, numbers only played games, and shows a shootout', () => {
    const day = exampleDay();
    day[1] = {
      ...day[1],
      game: TestFixtures.games.newGame({ opponentName: 'Harjun Haukat', gameEvents: [], homeScore: 0, awayScore: 0 }),
    };
    day[0] = {
      ...day[0],
      game: {
        ...day[0].game,
        homeScore: 1,
        awayScore: 1,
        shootoutKicks: [{ id: 'k', team: 'home', scored: true, order: 1 }] as AppState['shootoutKicks'],
      },
    };
    const text = buildDayReportShareText(buildDayReport(plan, day, roster, t), '', t);
    expect(text).toContain('✅ Kallion Kiri 1–1 (rp. 1–0)');
    expect(text).toContain('⏳ Harjun Haukat (ei vielä pelattu)');
    expect(text).toContain('Pelaajat (pelipaikka 1./3. pelissä · maalit+syötöt):');
    expect(text).toContain('Aapo: RB / – · 0+1');
    // No coach text: the text ends with the players block.
    expect(text.endsWith('Onni: LB / ST · 1+0\nAapo: RB / – · 0+1')).toBe(true);
  });

  it('leaves out the venue and the team when they are not common', () => {
    const report = { ...buildDayReport(plan, exampleDay(), roster, t), teamName: undefined, venue: undefined };
    expect(buildDayReportShareText(report, '', t).split('\n')[0]).toBe('⚽ Joulufutis 12.12.');
  });
});
