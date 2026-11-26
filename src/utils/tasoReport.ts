/**
 * Taso helper: the match, written out in the order Palloliitto's Taso
 * electronic match report wants it typed.
 *
 * Taso has no API a coach can write to (docs/10-analysis/taso-torneopal-api.md),
 * so the double entry after a match is a copy job at best. This makes it one:
 * two blocks of plain text, each matching a Taso screen.
 *
 * Before the match, Taso wants the squad with shirt numbers and the keeper
 * marked; each line also carries the player's position when one is known. After it: the final and half-time score, and every goal as minute,
 * scorer's number, assist's number - which is exactly the "Maalit" table.
 *
 * The app never records a periodEnd event (prod has none; the reducer emits
 * none): periods are arithmetic on numberOfPeriods and periodDurationMinutes,
 * and the timer stops at the nominal end, so there is no added time.
 *
 * A game decided on penalties gets the shootout result on its own line under
 * the final score ("Penalty shoot-out 3-2", home team first).
 *
 * What the app does not record is left out rather than guessed: cards, who
 * came on for whom, added time, attendance. The modal says so once.
 *
 * Pure and i18n-agnostic, like gameRecap.ts.
 */

import type { GameEvent, ShootoutKick } from '@/types/game';
import type { Player } from '@/types';
import { extraTimeGoals } from './matchStructure';
import { getShootoutTally } from './shootout';
import { orderPositionIds, POSITION_ABBREV_FALLBACK } from '@/config/positions';
import { getPositionLabel, isSidelinePosition } from './positionLabels';

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
  /** Extra time (review 11.1): its score is shown separately in the header. */
  extraTimePeriods?: number;
  extraTimeMinutes?: number;
  /**
   * The logged penalty-shootout kicks. A game decided on penalties keeps its
   * level final score; the shootout result is its own line under it.
   */
  shootoutKicks?: ShootoutKick[];
  /** Where each player actually played (post-game record), as gameRecap.ts reads it. */
  playerPositions?: Record<string, string[]>;
  /**
   * The pitch as saved. Used only for a player with no recorded position: their
   * spot on the field gives the label the field itself shows (CB, ST, ...).
   */
  playersOnField?: Array<Pick<Player, 'id' | 'relX' | 'relY'>>;
}

export type TasoTranslate = (key: string, fallback: string) => string;

export interface TasoReport {
  /** The squad, in Taso's lineup form: number, full name, keeper mark. */
  lineup: string;
  /** Result, half-time, and the goals table. */
  report: string;
  /**
   * The whole sheet as one text to copy (review R13): the title and the score
   * first - what anyone reading it wants to see before anything else - then
   * the line-up, then the goals.
   */
  text: string;
}

const numberOf = (p: Player | undefined): number | undefined => {
  const raw = (p?.jerseyNumber ?? '').trim();
  return /^\d+$/.test(raw) ? Number(raw) : undefined;
};

/** Whether the player has a shirt number Taso can use (digits only). */
export const hasTasoNumber = (p: Player): boolean => numberOf(p) !== undefined;

/**
 * What stands in the number column for a player without a number, so every
 * line-up row still starts "number name" and the names line up.
 */
export const TASO_NO_NUMBER = '–';

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

/**
 * A player's position for the line-up: the recorded positions when there are
 * any (in back-to-front order, joined with "/"), otherwise the label of their
 * spot on the pitch. A keeper already carries the keeper mark, so GK is not
 * repeated as their position. Undefined = nothing to show.
 */
function lineupPosition(p: Player, game: TasoGame, t: TasoTranslate): string | undefined {
  const recorded = orderPositionIds(game.playerPositions?.[p.id] ?? []).filter(id => !(p.isGoalie && id === 'gk'));
  if ((game.playerPositions?.[p.id]?.length ?? 0) > 0) {
    if (recorded.length === 0) return undefined;
    return recorded
      .map(id => t(`playingPositions.${id}.abbrev`, POSITION_ABBREV_FALLBACK[id] ?? id.toUpperCase()))
      .join('/');
  }
  if (p.isGoalie) return undefined;
  const onField = game.playersOnField?.find(f => f.id === p.id);
  if (!onField || typeof onField.relX !== 'number' || typeof onField.relY !== 'number') return undefined;
  if (isSidelinePosition(onField.relX)) return undefined;
  const { label } = getPositionLabel(onField.relX, onField.relY);
  return t(`positions.${label}`, label);
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
    // No number: a dash in its place, so the rows keep one shape (Taso needs
    // the number - the finish screen says how many are missing).
    const num = `${n === undefined ? TASO_NO_NUMBER : n} `;
    const marks = [
      p.isGoalie ? t('taso.goalie', 'GK') : undefined,
      p.id === game.captainId ? t('taso.captain', 'C') : undefined,
    ].filter(Boolean);
    // Position last, after a separator, so the line still pastes as
    // "number name" first: "7 Onni Virtanen (Mv, C) · CB".
    const position = lineupPosition(p, game, t);
    return `${num}${p.name.trim()}${marks.length ? ` (${marks.join(', ')})` : ''}${position ? ` · ${position}` : ''}`;
  });
  const lineup = [t('taso.lineupTitle', 'Squad'), ...lineupLines].join('\n');

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
  // Extra-time score beside the final one (review 11.1, owner 2026-11-17), from the
  // goals after the regulation end - only when the goal log accounts for the score
  // (the same rule as the recap, the info card and Excel).
  const extra = extraTimeGoals(game, goals, { us: usGoalsTotal, them: themGoalsTotal });
  const headerParts = [
    atHalf ? `${t('taso.halfTime', 'half-time')} ${score(ours(atHalf), theirs(atHalf))}` : '',
    extra ? `${t('taso.extraTime', 'extra time')} ${score(extra.us, extra.them)}` : '',
  ].filter(Boolean);
  const halfPart = headerParts.length ? ` (${headerParts.join(', ')})` : '';
  const resultLine = `${teams} ${score(usGoals, themGoals)}${halfPart}`;
  // A penalty shootout, as a match report states it: the final score stays the
  // score after play (and extra time), the shootout result is a line of its
  // own. Kick sides are the game's home/away, so the tally is home-first as is.
  const shootout = game.shootoutKicks?.length ? getShootoutTally(game.shootoutKicks) : undefined;
  const header = shootout
    ? `${resultLine}\n${t('taso.shootout', 'Penalty shoot-out')} ${shootout.home}-${shootout.away}`
    : resultLine;

  const ref = (id?: string) => {
    const p = id ? byId.get(id) : undefined;
    if (!p) return t('taso.unknownPlayer', 'unknown');
    const n = numberOf(p);
    return `${n === undefined ? '' : `${n} `}${p.name.trim()}`;
  };
  const goalLines = goals.map((e) => {
    const min = tasoMinute(e.time);
    if (e.type === 'opponentGoal') return `${min}' ${t('taso.opponentGoal', 'opponent goal')}`;
    const assist = e.assisterId ? ` (${t('taso.assist', 'assist')} ${ref(e.assisterId)})` : '';
    return `${min}' ${ref(e.scorerId)}${assist}`;
  });

  const title = t('taso.reportTitle', 'Match sheet');
  const goalsBlock = (goalLines.length
    ? [`${t('taso.goals', 'Goals (minute, scorer, assist)')}:`, ...goalLines]
    : [t('taso.noGoals', 'No goals recorded.')]
  ).join('\n');
  const report = [title, header, goalsBlock].join('\n');
  const text = [`${title}\n${header}`, lineup, goalsBlock].join('\n\n');

  return { lineup, report, text };
}
