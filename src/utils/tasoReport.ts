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
  const n = Number.parseInt((p?.jerseyNumber ?? '').trim(), 10);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Taso's minute. The clock runs on across periods, so the period a goal
 * belongs to comes from the periodEnd events, not from arithmetic on the
 * length. Past the period's nominal end the minute is written as Taso writes
 * added time: "45+2".
 */
export function tasoMinute(
  seconds: number,
  periodEnds: number[],
  periodDurationMinutes: number,
): string {
  const minute = Math.floor(Math.max(0, seconds) / 60) + 1;
  const period = periodEnds.filter((end) => seconds > end).length + 1;
  const nominalEnd = periodDurationMinutes * period;
  return minute > nominalEnd && periodDurationMinutes > 0
    ? `${nominalEnd}+${minute - nominalEnd}`
    : String(minute);
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

  const lineupLines = squad.map((p) => {
    const n = numberOf(p);
    const num = n === undefined ? t('taso.noNumber', '-') : String(n);
    return `${num} ${p.name.trim()}${p.isGoalie ? ` (${t('taso.goalie', 'GK')})` : ''}`;
  });
  const lineup = [t('taso.lineupTitle', 'Squad for Taso'), ...lineupLines].join('\n');

  const events = game.gameEvents.slice().sort((a, b) => a.time - b.time);
  const periodEnds = events.filter((e) => e.type === 'periodEnd').map((e) => e.time);
  const goals = events.filter((e) => e.type === 'goal' || e.type === 'opponentGoal');

  // Half-time = everything up to the first periodEnd. Only meaningful with two
  // halves; Taso asks for it only then.
  const firstEnd = periodEnds[0];
  const atHalf = firstEnd === undefined ? undefined : goals.filter((e) => e.time <= firstEnd);
  const ours = (list: GameEvent[]) => list.filter((e) => e.type === 'goal').length;
  const theirs = (list: GameEvent[]) => list.filter((e) => e.type === 'opponentGoal').length;

  // Taso writes the home team first.
  const home = game.homeOrAway === 'home';
  const score = (us: number, them: number) => (home ? `${us}-${them}` : `${them}-${us}`);
  const teams = home ? `${game.teamName} - ${game.opponentName}` : `${game.opponentName} - ${game.teamName}`;
  const usGoals = home ? game.homeScore : game.awayScore;
  const themGoals = home ? game.awayScore : game.homeScore;
  const halfPart = atHalf && game.numberOfPeriods === 2
    ? ` (${t('taso.halfTime', 'half-time')} ${score(ours(atHalf), theirs(atHalf))})`
    : '';
  const header = `${teams} ${score(usGoals, themGoals)}${halfPart}`;

  const ref = (id?: string) => {
    const p = id ? byId.get(id) : undefined;
    if (!p) return t('taso.unknownPlayer', 'unknown');
    const n = numberOf(p);
    return `${n === undefined ? '' : `#${n} `}${p.name.trim()}`;
  };
  const goalLines = goals.map((e) => {
    const min = tasoMinute(e.time, periodEnds, game.periodDurationMinutes);
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
