/**
 * Taso helper: the match, written out in the order Palloliitto's Taso
 * electronic match report wants it typed.
 *
 * Taso has no API a coach can write to (docs/10-analysis/taso-torneopal-api.md),
 * so the double entry after a match is a copy job at best. This makes it one:
 * two blocks of plain text, each matching a Taso screen.
 *
 * Before the match, Taso wants the squad with shirt numbers and the keeper
 * marked. After it: the final and half-time score, and every goal as minute,
 * scorer's number, assist's number - which is exactly the "Maalit" table.
 *
 * The app never records a periodEnd event (prod has none; the reducer emits
 * none): periods are arithmetic on numberOfPeriods and periodDurationMinutes,
 * and the timer stops at the nominal end, so there is no added time.
 *
 * What the app does not record is left out rather than guessed: cards, who
 * came on for whom, added time, attendance. The modal says so once.
 *
 * Pure and i18n-agnostic, like gameRecap.ts.
 */

import type { GameEvent } from '@/types/game';
import type { Player } from '@/types';

export interface TasoGame {
  teamName: string;
  opponentName: string;
  homeOrAway: 'home' | 'away';
  homeScore: number;
  awayScore: number;
  gameEvents: GameEvent[];
  selectedPlayerIds: string[];
  /** Who wore the armband; Taso asks for the captain on the lineup screen. */
  captainId?: string;
  numberOfPeriods: number;
  periodDurationMinutes: number;
}

export type TasoTranslate = (key: string, fallback: string) => string;

export interface TasoReport {
  /** The squad, in Taso's lineup form: number, full name, keeper mark. */
  lineup: string;
  /** Result, half-time, and the goals table. */
  report: string;
}

const numberOf = (p: Player | undefined): number | undefined => {
  const raw = (p?.jerseyNumber ?? '').trim();
  return /^\d+$/.test(raw) ? Number(raw) : undefined;
};

/**
 * Taso's minute on the app's clock.
 *
 * The clock runs on across periods and each period starts at its nominal
 * boundary (period 2 of 2x25 starts at 25:00), and the timer stops at the
 * nominal end, so there is no added time to write and the period a goal
 * belongs to is arithmetic. A goal logged exactly on a boundary (25:00) is the
 * last minute of the period that just ended, so the minute is the ceiling.
 */
export function tasoMinute(seconds: number): number {
  return Math.max(1, Math.ceil(Math.max(0, seconds) / 60));
}

/** 1-based period for a clock reading; a reading on the boundary belongs to the earlier period. */
export function tasoPeriod(seconds: number, numberOfPeriods: number, periodDurationMinutes: number): number {
  const len = periodDurationMinutes * 60;
  if (len <= 0 || numberOfPeriods <= 1) return 1;
  const p = seconds <= 0 ? 1 : Math.ceil(seconds / len);
  return Math.min(Math.max(1, p), numberOfPeriods);
}

export function buildTasoReport(game: TasoGame, players: Player[], t: TasoTranslate): TasoReport {
  const byId = new Map(players.map((p) => [p.id, p]));
  const squad = game.selectedPlayerIds
    .map((id) => byId.get(id))
    .filter((p): p is Player => !!p)
    .sort((a, b) => {
      const na = numberOf(a);
      const nb = numberOf(b);
      if (na === undefined && nb === undefined) return a.name.localeCompare(b.name);
      if (na === undefined) return 1;
      if (nb === undefined) return -1;
      return na - nb;
    });

  // Marks in Taso's own order: keeper first, then the armband. A player can be
  // both, and Taso's lineup screen has a box for each.
  const lineupLines = squad.map((p) => {
    const n = numberOf(p);
    const num = n === undefined ? t('taso.noNumber', '-') : String(n);
    const marks = [
      p.isGoalie ? t('taso.goalie', 'GK') : undefined,
      p.id === game.captainId ? t('taso.captain', 'C') : undefined,
    ].filter(Boolean);
    return `${num} ${p.name.trim()}${marks.length ? ` (${marks.join(', ')})` : ''}`;
  });
  const lineup = [t('taso.lineupTitle', 'Squad for Taso'), ...lineupLines].join('\n');

  const events = game.gameEvents.slice().sort((a, b) => a.time - b.time);
  const goals = events.filter((e) => e.type === 'goal' || e.type === 'opponentGoal');

  // Half-time = everything in period 1. Only meaningful with two halves; Taso
  // asks for it only then.
  // Half-time = everything in period 1, and only when the goal log accounts
  // for the whole score: a score typed in without its goals would otherwise
  // read as a 0-0 half, which is a guess dressed as a fact.
  const usGoalsTotal = game.homeOrAway === 'home' ? game.homeScore : game.awayScore;
  const themGoalsTotal = game.homeOrAway === 'home' ? game.awayScore : game.homeScore;
  const logComplete = goals.length === usGoalsTotal + themGoalsTotal;
  const atHalf = game.numberOfPeriods === 2 && game.periodDurationMinutes > 0 && logComplete
    ? goals.filter((e) => tasoPeriod(e.time, 2, game.periodDurationMinutes) === 1)
    : undefined;
  const ours = (list: GameEvent[]) => list.filter((e) => e.type === 'goal').length;
  const theirs = (list: GameEvent[]) => list.filter((e) => e.type === 'opponentGoal').length;

  // Taso writes the home team first.
  const home = game.homeOrAway === 'home';
  const score = (us: number, them: number) => (home ? `${us}-${them}` : `${them}-${us}`);
  const teams = home ? `${game.teamName} - ${game.opponentName}` : `${game.opponentName} - ${game.teamName}`;
  const usGoals = home ? game.homeScore : game.awayScore;
  const themGoals = home ? game.awayScore : game.homeScore;
  const halfPart = atHalf
    ? ` (${t('taso.halfTime', 'half-time')} ${score(ours(atHalf), theirs(atHalf))})`
    : '';
  const header = `${teams} ${score(usGoals, themGoals)}${halfPart}`;

  const ref = (id?: string) => {
    const p = id ? byId.get(id) : undefined;
    if (!p) return t('taso.unknownPlayer', 'unknown');
    const n = numberOf(p);
    return `#${n === undefined ? t('taso.noNumber', '-') : n} ${p.name.trim()}`;
  };
  const goalLines = goals.map((e) => {
    const min = tasoMinute(e.time);
    if (e.type === 'opponentGoal') return `${min}' ${t('taso.opponentGoal', 'opponent goal')}`;
    const assist = e.assisterId ? ` (${t('taso.assist', 'assist')} ${ref(e.assisterId)})` : '';
    return `${min}' ${ref(e.scorerId)}${assist}`;
  });

  const report = [
    t('taso.reportTitle', 'Match report for Taso'),
    header,
    ...(goalLines.length
      ? [`${t('taso.goals', 'Goals (minute, scorer, assist)')}:`, ...goalLines]
      : [t('taso.noGoals', 'No goals recorded.')]),
  ].join('\n');

  return { lineup, report };
}
