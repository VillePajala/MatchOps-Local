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
  const resultSuffix = onPenalties ? ` (${resultLabel}, ${t('recap.onPenalties', 'on penalties')})` : '';

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

  const lineupLines = buildLineupLines(game.playerPositions, players, t);
  if (lineupLines.length) blocks.push([`${t('recap.lineup', 'Lineup')}:`, ...lineupLines].join('\n'));

  const notes = game.gameNotes?.trim();
  if (notes) blocks.push(`${t('recap.coachNotes', 'Match report')}:\n${notes}`);

  return blocks.join('\n\n');
}
