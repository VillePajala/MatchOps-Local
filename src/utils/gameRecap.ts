/**
 * Game recap generator.
 *
 * Builds a compact, ready-to-paste TEXT recap of a single game for the team
 * chat (score, our scorers/assisters, the coach's own game notes). Pure and
 * i18n-agnostic: all labels come from the injected translate function, so it is
 * fully unit-testable. Our players are named (nickname or first name); opponent
 * scorers stay anonymous, matching the app's opponent-anonymity pattern.
 */

import type { GameEvent, ShootoutKick } from '@/types/game';
import type { Player } from '@/types';
import { resolveGameResult } from '@/utils/gameResult';
import { orderPositionIds, POSITION_ABBREV_FALLBACK } from '@/config/positions';
import { extraTimeGoals } from './matchStructure';
import { getPositionLabel, isSidelinePosition } from './positionLabels';

/** Minimal shape needed to build a recap (a subset of AppState). */
export interface RecapGame {
  teamName: string;
  opponentName: string;
  gameDate: string; // ISO 'yyyy-mm-dd'
  gameLocation?: string;
  homeScore: number;
  awayScore: number;
  homeOrAway: 'home' | 'away';
  gameEvents: GameEvent[];
  gameNotes?: string;
  shootoutKicks?: ShootoutKick[];
  /** Position id(s) each player was assigned, keyed by player id. */
  playerPositions?: Record<string, string[]>;
  /**
   * The pitch as saved (the starting line-up). The line-up falls back to it
   * when no actual positions were recorded - the same source the match sheet
   * (tasoReport.ts) falls back to.
   */
  playersOnField?: Array<Pick<Player, 'id' | 'relX' | 'relY'>>;
  /** The game's squad; limits the starting-position fallback to it when given. */
  selectedPlayerIds?: string[];
  /** Match structure, for the extra-time score (review 11.1). */
  numberOfPeriods?: number;
  periodDurationMinutes?: number;
  extraTimePeriods?: number;
  extraTimeMinutes?: number;
}

/** key + fallback -> localized string (a thin slice of i18next's `t`). */
export type RecapTranslate = (key: string, fallback: string) => string;

const firstName = (fullName: string): string => fullName.trim().split(/\s+/)[0] ?? fullName;

const displayName = (id: string, players: Player[], t: RecapTranslate): string => {
  const p = players.find(pl => pl.id === id);
  if (!p) return t('recap.unknownPlayer', 'Unknown');
  return (p.nickname?.trim() || firstName(p.name)) || t('recap.unknownPlayer', 'Unknown');
};

/** "d.M.yyyy" from an ISO date; returns the raw string if unparseable. */
const formatRecapDate = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])}.${Number(m[2])}.${m[1]}`;
};

/**
 * Count occurrences per player id, one "Name N" line each, ordered by count
 * (desc) then name (asc) for stable output. The count is always shown so the
 * list reads like a mini scoreboard.
 */
const tallyLines = (ids: string[], players: Player[], t: RecapTranslate): string[] => {
  const counts = new Map<string, number>();
  ids.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1));
  return Array.from(counts.entries())
    .map(([id, n]) => ({ name: displayName(id, players, t), n }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
    .map(({ name, n }) => `${name} ${n}`);
};

/**
 * The line-up, keyed by position (formation-style): invert the per-player
 * position map into position -> players and render "ABBR: Nick1, Nick2" per
 * position, in back-to-front order. A player in two positions appears under
 * both; a position with two players lists both. Positions with no players are
 * skipped. Returns [] when nothing is assigned.
 */
const buildLineupLines = (
  playerPositions: Record<string, string[]> | undefined,
  players: Player[],
  t: RecapTranslate,
): string[] => {
  if (!playerPositions) return [];
  const byPosition = new Map<string, string[]>();
  Object.entries(playerPositions).forEach(([playerId, positionIds]) => {
    (positionIds ?? []).forEach(posId => {
      const names = byPosition.get(posId) ?? [];
      names.push(displayName(playerId, players, t));
      byPosition.set(posId, names);
    });
  });
  return orderPositionIds([...byPosition.keys()]).map(posId => {
    const abbrev = t(`playingPositions.${posId}.abbrev`, POSITION_ABBREV_FALLBACK[posId] ?? posId.toUpperCase());
    const names = (byPosition.get(posId) ?? []).slice().sort((a, b) => a.localeCompare(b));
    return `${abbrev}: ${names.join(', ')}`;
  });
};

/**
 * The line-up from the starting positions on the pitch, for a game where no
 * actual positions were recorded: "ABBR: Nick1, Nick2" per position label the
 * pitch itself shows (GK, CB, ST ...), back to front. Players parked on the
 * sideline are substitutes, not a position, and are left out.
 */
const buildStartingLineupLines = (game: RecapGame, players: Player[], t: RecapTranslate): string[] => {
  const squad = game.selectedPlayerIds ? new Set(game.selectedPlayerIds) : null;
  const byLabel = new Map<string, { names: string[]; relY: number; relX: number }>();
  for (const p of game.playersOnField ?? []) {
    if (squad && !squad.has(p.id)) continue;
    if (typeof p.relX !== 'number' || typeof p.relY !== 'number' || isSidelinePosition(p.relX)) continue;
    const { label } = getPositionLabel(p.relX, p.relY);
    const entry = byLabel.get(label) ?? { names: [], relY: p.relY, relX: p.relX };
    entry.names.push(displayName(p.id, players, t));
    // The deepest, leftmost disc of a label decides where its line sorts.
    if (p.relY > entry.relY || (p.relY === entry.relY && p.relX < entry.relX)) {
      entry.relY = p.relY;
      entry.relX = p.relX;
    }
    byLabel.set(label, entry);
  }
  return [...byLabel.entries()]
    .sort(([, a], [, b]) => b.relY - a.relY || a.relX - b.relX)
    .map(([label, { names }]) => `${t(`positions.${label}`, label)}: ${names.slice().sort((a, b) => a.localeCompare(b)).join(', ')}`);
};

/**
 * Build the recap text for one game. Sections with no data (no goals, no
 * assists, empty notes, missing venue/age) are omitted.
 */
export function buildGameRecap(game: RecapGame, players: Player[], t: RecapTranslate): string {
  const teamGoals = game.homeOrAway === 'home' ? game.homeScore : game.awayScore;
  const oppGoals = game.homeOrAway === 'home' ? game.awayScore : game.homeScore;

  const result = resolveGameResult(game);
  // The scoreline already shows win/loss/draw, so the result is only annotated
  // when the raw score alone can't show it: a level score decided by a shootout.
  const onPenalties = game.homeScore === game.awayScore && result !== 'D';
  const resultLabel = result === 'W' ? t('recap.resultWin', 'Win') : t('recap.resultLoss', 'Loss');
  // Extra time is shown as its own score beside the final one (review 11.1, owner
  // 2026-11-17), so the recap tells how the match went.
  const extra = game.numberOfPeriods !== undefined && game.periodDurationMinutes !== undefined
    ? extraTimeGoals({ ...game, numberOfPeriods: game.numberOfPeriods, periodDurationMinutes: game.periodDurationMinutes }, game.gameEvents, { us: teamGoals, them: oppGoals })
    : null;
  const suffixParts = [
    extra ? `${t('recap.extraTime', 'extra time')} ${extra.us}-${extra.them}` : '',
    onPenalties ? `${resultLabel}, ${t('recap.onPenalties', 'on penalties')}` : '',
  ].filter(Boolean);
  const resultSuffix = suffixParts.length ? ` (${suffixParts.join(', ')})` : '';

  const goalEvents = game.gameEvents.filter(e => e.type === 'goal');
  const scorerIds = goalEvents.map(e => e.scorerId).filter((id): id is string => !!id);
  const assisterIds = goalEvents.map(e => e.assisterId).filter((id): id is string => !!id);

  // Each block is one visual group; present blocks are separated by a blank line.
  const blocks: string[] = [];

  // Header block: team + score on one line, then date and location each on
  // their own line (location omitted when empty).
  const headerLines = [
    `${game.teamName} ${teamGoals}-${oppGoals} ${game.opponentName}${resultSuffix}`,
    formatRecapDate(game.gameDate),
    game.gameLocation?.trim(),
  ].filter(Boolean);
  blocks.push(headerLines.join('\n'));

  const scorerLines = tallyLines(scorerIds, players, t);
  if (scorerLines.length) blocks.push([`${t('recap.goals', 'Goals')}:`, ...scorerLines].join('\n'));

  const assisterLines = tallyLines(assisterIds, players, t);
  if (assisterLines.length) blocks.push([`${t('recap.assists', 'Assists')}:`, ...assisterLines].join('\n'));

  // Actual positions when any were recorded; otherwise the starting line-up
  // (review R13), so a coach who never filled positions still shares one.
  const recordedLines = buildLineupLines(game.playerPositions, players, t);
  const lineupLines = recordedLines.length ? recordedLines : buildStartingLineupLines(game, players, t);
  if (lineupLines.length) blocks.push([`${t('recap.lineup', 'Lineup')}:`, ...lineupLines].join('\n'));

  const notes = game.gameNotes?.trim();
  if (notes) blocks.push(`${t('recap.coachNotes', 'Match report')}:\n${notes}`);

  return blocks.join('\n\n');
}
