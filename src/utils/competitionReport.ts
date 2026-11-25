/**
 * Reports over a COMPETITION's games ("Turnauksen raportti", "Sarjaraportti").
 *
 * - A tournament is a few days of short games: it uses the day report's
 *   game-by-game layout as it is (dayReport.ts), with the tournament's played
 *   games in date/time order.
 * - A league (sarja / Season) runs 15-20 games, too many for a column per
 *   game, so it is reported in TOTALS: the results list, the record and goals
 *   for/against, and per player the games, goals, assists and how often each
 *   position was played ("ST ×6, LB ×4").
 *
 * Same position source and labels as the day report (positionsForGame: the
 * recorded positions, else the pitch label; GK for the goalkeeper). No
 * minutes anywhere - the app does not measure playing time.
 *
 * Pure: the caller supplies the games, the roster and `t`.
 */

import type { AppState } from '@/types/game';
import type { Player } from '@/types';
import type { GameResult } from '@/utils/gameResult';
import {
  buildDayReport,
  formatDayRecord,
  formatDayScore,
  isDayGamePlayed,
  positionsForGame,
  type DayReport,
  type DayReportGameInput,
  type DayReportGameRow,
  type DayReportTranslate,
} from '@/utils/playtimePlanner/dayReport';

export type CompetitionKind = 'tournament' | 'season';

/**
 * Whether a competition's game belongs in its report: not a fixture marked
 * not-played, and played by the day report's own rule (started, play events
 * or a score).
 */
export function isCompetitionGamePlayed(game: AppState): boolean {
  return game.isPlayed !== false && isDayGamePlayed(game);
}

/** "2026-09-20" + "18:30" -> a sortable key; a missing time sorts first within its day. */
const playedAtKey = (game: AppState): string => `${game.gameDate ?? ''}T${game.gameTime ?? ''}`;

/**
 * The competition's PLAYED games, oldest first (date, then kick-off time, then
 * id for a stable order), as report inputs.
 */
export function orderCompetitionGames(
  games: Record<string, AppState>,
  kind: CompetitionKind,
  competitionId: string,
): DayReportGameInput[] {
  return Object.entries(games)
    .filter(([, game]) => {
      if (!game) return false;
      const linked = kind === 'tournament' ? game.tournamentId === competitionId : game.seasonId === competitionId;
      return linked && isCompetitionGamePlayed(game);
    })
    .sort(([idA, a], [idB, b]) => playedAtKey(a).localeCompare(playedAtKey(b)) || idA.localeCompare(idB))
    .map(([gameId, game]) => ({ planGameId: gameId, gameId, game }));
}

// ── League totals ─────────────────────────────────────────────────────────────

export interface SeriesReportGameRow extends DayReportGameRow {
  /** "20.9." - the games of a league are weeks apart, so the date matters. */
  dayMonth: string;
}

export interface SeriesPositionCount {
  label: string;
  count: number;
}

export interface SeriesReportPlayerRow {
  playerId: string;
  name: string;
  /** Played games this player was part of. */
  games: number;
  goals: number;
  assists: number;
  /** Positions played, most played first ("ST" ×6 before "LB" ×4). */
  positions: SeriesPositionCount[];
}

export interface SeriesReport {
  name: string;
  teamName?: string;
  record: DayReport['record'];
  goalsFor: number;
  goalsAgainst: number;
  /** Played games only, oldest first. */
  games: SeriesReportGameRow[];
  players: SeriesReportPlayerRow[];
}

/** "2026-09-20" -> "20.9." (as on Home); '' for a missing date. */
export function dayMonth(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${Number(m[3])}.${Number(m[2])}.` : '';
}

/**
 * Build the league report from its played games (orderCompetitionGames).
 * The bench label (SUB) counts as a game but not as a position played.
 */
export function buildSeriesReport(
  name: string,
  inputs: DayReportGameInput[],
  roster: Player[],
  t: DayReportTranslate,
): SeriesReport {
  // The per-game rows, record, names and goals are exactly the day report's.
  const day = buildDayReport({ name, players: [] }, inputs, roster, t);
  const byId = new Map(inputs.map((i) => [i.gameId, i.game]));
  const games: SeriesReportGameRow[] = day.games
    .filter((g) => g.played)
    .map((g) => ({ ...g, dayMonth: dayMonth(byId.get(g.gameId)?.gameDate) }));

  const sub = t('positions.SUB', 'SUB');
  const gamesPlayed = new Map<string, number>();
  const positionCounts = new Map<string, Map<string, number>>();
  for (const g of games) {
    const game = byId.get(g.gameId);
    if (!game) continue;
    positionsForGame(game, t).forEach((labels, playerId) => {
      gamesPlayed.set(playerId, (gamesPlayed.get(playerId) ?? 0) + 1);
      const counts = positionCounts.get(playerId) ?? new Map<string, number>();
      for (const label of labels.split(', ')) {
        if (!label || label === sub) continue;
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      positionCounts.set(playerId, counts);
    });
  }

  const players: SeriesReportPlayerRow[] = day.players.map((p) => ({
    playerId: p.playerId,
    name: p.name,
    games: gamesPlayed.get(p.playerId) ?? 0,
    goals: p.goals,
    assists: p.assists,
    positions: [...(positionCounts.get(p.playerId) ?? new Map<string, number>())]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  }));

  let goalsFor = 0;
  let goalsAgainst = 0;
  for (const g of games) {
    goalsFor += g.ourScore;
    goalsAgainst += g.theirScore;
  }

  return {
    name: day.planName,
    ...(day.teamName ? { teamName: day.teamName } : {}),
    record: day.record,
    goalsFor,
    goalsAgainst,
    games,
    players,
  };
}

/** "ST ×6, LB ×4" ('' when none). */
export function formatPositionCounts(positions: SeriesPositionCount[]): string {
  return positions.map((p) => `${p.label} ×${p.count}`).join(', ');
}

const RESULT_EMOJI: Record<GameResult, string> = { W: '✅', D: '➖', L: '❌' };

/**
 * The league report as text, in the day report's style:
 *
 *   ⚽ Kotkat P11 · Harrastesarja syksy
 *   5V 2T 3H · maalit 24–15
 *
 *   ✅ 20.9. Kallion Kiri 2–1
 *   ❌ 27.9. Harjun Haukat 0–2
 *
 *   Pelaajat (pelit · maalit+syötöt · pelipaikat):
 *   Eeli: 8 · 1+0 · GK ×6, LB ×2
 *
 *   <the coach's own text>
 */
export function buildSeriesReportShareText(report: SeriesReport, coachText: string, t: DayReportTranslate): string {
  const blocks: string[] = [];
  const title = [report.teamName, report.name].filter(Boolean).join(' · ');
  const header = `⚽ ${title}`;
  blocks.push(
    report.games.length > 0
      ? `${header}\n${formatDayRecord(report.record, t)} · ${t('competitionReport.goalsLine', 'goals {{for}}–{{against}}', {
          for: report.goalsFor,
          against: report.goalsAgainst,
        })}`
      : header,
  );

  if (report.games.length > 0) {
    blocks.push(
      report.games
        .map((g) => {
          const opponent = g.opponentName || t('planDayReport.unknownOpponent', 'Opponent');
          const date = g.dayMonth ? `${g.dayMonth} ` : '';
          return `${RESULT_EMOJI[g.result ?? 'D']} ${date}${opponent} ${formatDayScore(g, t)}`;
        })
        .join('\n'),
    );
  }

  if (report.players.length > 0) {
    blocks.push(
      [
        t('competitionReport.sharePlayersHeading', 'Players (games · goals+assists · positions):'),
        ...report.players.map((p) => {
          const positions = formatPositionCounts(p.positions);
          return `${p.name}: ${p.games} · ${p.goals}+${p.assists}${positions ? ` · ${positions}` : ''}`;
        }),
      ].join('\n'),
    );
  }

  const text = coachText.trim();
  if (text) blocks.push(text);
  return blocks.join('\n\n');
}
