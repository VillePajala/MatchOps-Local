/**
 * Tournament and league reports: which games, in what order, the league
 * totals with position counts, and the exact share text.
 */
import type { AppState, GameEvent } from '@/types/game';
import type { Player } from '@/types';
import { TestFixtures } from '../../tests/fixtures';
import type { DayReportTranslate } from '@/utils/playtimePlanner/dayReport';
import {
  buildSeriesReport,
  buildSeriesReportShareText,
  dayMonth,
  formatPositionCounts,
  isCompetitionGamePlayed,
  orderCompetitionGames,
} from './competitionReport';

const FI: Record<string, string> = {
  'export.winShort': 'V',
  'export.tieShort': 'T',
  'export.lossShort': 'H',
  'competitionReport.goalsLine': 'maalit {{for}}–{{against}}',
  'competitionReport.sharePlayersHeading': 'Pelaajat (pelit · maalit+syötöt · pelipaikat):',
};
const t: DayReportTranslate = (key, fallback, options) =>
  (FI[key] ?? fallback).replace(/\{\{(\w+)\}\}/g, (_m, k) => String(options?.[k] ?? ''));

const EELI = { id: 'eeli', name: 'Eeli Esimerkki' } as Player;
const ONNI = { id: 'onni', name: 'Onni Malli' } as Player;
const roster = [EELI, ONNI];

const goal = (id: string, scorerId: string, assisterId?: string): GameEvent => ({
  id,
  type: 'goal',
  time: 60,
  scorerId,
  ...(assisterId ? { assisterId } : {}),
});

const game = (over: Partial<AppState>): AppState =>
  TestFixtures.games.completed({
    teamName: 'Kotkat P11',
    homeOrAway: 'home',
    availablePlayers: roster,
    playersOnField: [],
    selectedPlayerIds: ['eeli', 'onni'],
    gameEvents: [],
    playerPositions: undefined,
    shootoutKicks: undefined,
    gameNotes: '',
    isPlayed: true,
    seasonId: 'season1',
    tournamentId: '',
    ...over,
  });

describe('orderCompetitionGames', () => {
  /** @critical tournament report order: date, then kick-off time */
  it('lists the competition\'s played games by date and time', () => {
    const games: Record<string, AppState> = {
      g_late: game({ tournamentId: 't1', gameDate: '2026-12-12', gameTime: '14:00', opponentName: 'C' }),
      g_day2: game({ tournamentId: 't1', gameDate: '2026-12-13', gameTime: '09:00', opponentName: 'D' }),
      g_early: game({ tournamentId: 't1', gameDate: '2026-12-12', gameTime: '09:30', opponentName: 'A' }),
      g_mid: game({ tournamentId: 't1', gameDate: '2026-12-12', gameTime: '11:15', opponentName: 'B' }),
    };
    expect(orderCompetitionGames(games, 'tournament', 't1').map((i) => i.game.opponentName)).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
  });

  it('leaves out other competitions, unplayed games and fixtures marked not played', () => {
    const games: Record<string, AppState> = {
      mine: game({ tournamentId: 't1', gameDate: '2026-12-12' }),
      other: game({ tournamentId: 't2', gameDate: '2026-12-12' }),
      notYet: game({ tournamentId: 't1', gameDate: '2026-12-13', gameStatus: 'notStarted', homeScore: 0, awayScore: 0 }),
      fixture: game({ tournamentId: 't1', gameDate: '2026-12-13', isPlayed: false }),
    };
    expect(orderCompetitionGames(games, 'tournament', 't1').map((i) => i.gameId)).toEqual(['mine']);
    expect(isCompetitionGamePlayed(games.fixture)).toBe(false);
  });

  it('reads a league\'s games by seasonId', () => {
    const games: Record<string, AppState> = {
      a: game({ seasonId: 's1', gameDate: '2026-09-20' }),
      b: game({ seasonId: 's2', gameDate: '2026-09-21' }),
    };
    expect(orderCompetitionGames(games, 'season', 's1').map((i) => i.gameId)).toEqual(['a']);
  });
});

describe('buildSeriesReport (league totals)', () => {
  const inputs = orderCompetitionGames(
    {
      g1: game({
        gameDate: '2026-09-20',
        opponentName: 'Kallion Kiri',
        homeScore: 2,
        awayScore: 1,
        playerPositions: { eeli: ['gk'], onni: ['st'] },
        gameEvents: [goal('e1', 'onni', 'eeli'), goal('e2', 'onni')],
      }),
      g2: game({
        gameDate: '2026-09-27',
        opponentName: 'Harjun Haukat',
        homeOrAway: 'away',
        homeScore: 2,
        awayScore: 0,
        playerPositions: { eeli: ['gk'], onni: ['lb', 'st'] },
      }),
      g3: game({
        gameDate: '2026-10-04',
        opponentName: 'Rantakylän FC',
        homeScore: 1,
        awayScore: 1,
        selectedPlayerIds: ['eeli'],
        // No recorded positions: the pitch label. Eeli on the bench = SUB.
        playersOnField: [],
        gameEvents: [goal('e3', 'eeli')],
      }),
    },
    'season',
    'season1',
  );
  const report = buildSeriesReport('Harrastesarja syksy', inputs, roster, t);

  it('totals the record and the goals', () => {
    expect(report.record).toEqual({ wins: 1, draws: 1, losses: 1 });
    expect(report.goalsFor).toBe(3);
    expect(report.goalsAgainst).toBe(4);
    expect(report.games.map((g) => g.dayMonth)).toEqual(['20.9.', '27.9.', '4.10.']);
  });

  /** @critical position counts, GK label, bench not counted as a position */
  it('counts games, goals, assists and positions per player', () => {
    expect(report.players).toEqual([
      { playerId: 'eeli', name: 'Eeli', games: 3, goals: 1, assists: 1, positions: [{ label: 'GK', count: 2 }] },
      {
        playerId: 'onni',
        name: 'Onni',
        games: 2,
        goals: 2,
        assists: 0,
        positions: [
          { label: 'ST', count: 2 },
          { label: 'LB', count: 1 },
        ],
      },
    ]);
    expect(formatPositionCounts(report.players[1].positions)).toBe('ST ×2, LB ×1');
  });

  it('shares in the day report\'s style', () => {
    expect(buildSeriesReportShareText(report, '  Hyvä syksy.  ', t)).toBe(
      [
        '⚽ Kotkat P11 · Harrastesarja syksy',
        '1V 1T 1H · maalit 3–4',
        '',
        '✅ 20.9. Kallion Kiri 2–1',
        '❌ 27.9. Harjun Haukat 0–2',
        '➖ 4.10. Rantakylän FC 1–1',
        '',
        'Pelaajat (pelit · maalit+syötöt · pelipaikat):',
        'Eeli: 3 · 1+1 · GK ×2',
        'Onni: 2 · 2+0 · ST ×2, LB ×1',
        '',
        'Hyvä syksy.',
      ].join('\n'),
    );
  });

  it('leaves out an empty coach text', () => {
    expect(buildSeriesReportShareText(report, '', t).endsWith('Onni: 2 · 2+0 · ST ×2, LB ×1')).toBe(true);
  });

  it('formats dates as d.m.', () => {
    expect(dayMonth('2026-01-05')).toBe('5.1.');
    expect(dayMonth(undefined)).toBe('');
  });
});
