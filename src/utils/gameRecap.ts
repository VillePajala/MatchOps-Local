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

/** Minimal shape needed to build a recap (a subset of AppState). */
export interface RecapGame {
  teamName: string;
  opponentName: string;
  gameDate: string; // ISO 'yyyy-mm-dd'
  gameLocation?: string;
  ageGroup?: string;
  homeScore: number;
  awayScore: number;
  homeOrAway: 'home' | 'away';
  gameEvents: GameEvent[];
  gameNotes?: string;
  shootoutKicks?: ShootoutKick[];
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
 * Count occurrences per player id, then render "Name 2, Other" ordered by count
 * (desc) then name (asc) for stable output. A count of 1 shows no number.
 */
const tally = (ids: string[], players: Player[], t: RecapTranslate): string => {
  const counts = new Map<string, number>();
  ids.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1));
  return Array.from(counts.entries())
    .map(([id, n]) => ({ name: displayName(id, players, t), n }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
    .map(({ name, n }) => (n > 1 ? `${name} ${n}` : name))
    .join(', ');
};

/**
 * Build the recap text for one game. Sections with no data (no goals, no
 * assists, empty notes, missing venue/age) are omitted.
 */
export function buildGameRecap(game: RecapGame, players: Player[], t: RecapTranslate): string {
  const teamGoals = game.homeOrAway === 'home' ? game.homeScore : game.awayScore;
  const oppGoals = game.homeOrAway === 'home' ? game.awayScore : game.homeScore;

  const result = resolveGameResult(game);
  const resultLabel =
    result === 'W' ? t('recap.resultWin', 'W')
    : result === 'L' ? t('recap.resultLoss', 'L')
    : t('recap.resultDraw', 'D');
  // A level raw score decided by a shootout (result is not a draw) is a penalty win/loss.
  const onPenalties = game.homeScore === game.awayScore && result !== 'D';
  const resultText = onPenalties ? `${resultLabel}, ${t('recap.onPenalties', 'on penalties')}` : resultLabel;

  const goalEvents = game.gameEvents.filter(e => e.type === 'goal');
  const scorerIds = goalEvents.map(e => e.scorerId).filter((id): id is string => !!id);
  const assisterIds = goalEvents.map(e => e.assisterId).filter((id): id is string => !!id);

  const lines: string[] = [];
  lines.push(`${game.teamName} ${teamGoals}-${oppGoals} ${game.opponentName} (${resultText})`);

  const meta = [formatRecapDate(game.gameDate), game.gameLocation, game.ageGroup]
    .map(s => s?.trim())
    .filter(Boolean)
    .join(' · ');
  if (meta) lines.push(meta);

  if (scorerIds.length) lines.push(`${t('recap.goals', 'Goals')}: ${tally(scorerIds, players, t)}`);
  if (assisterIds.length) lines.push(`${t('recap.assists', 'Assists')}: ${tally(assisterIds, players, t)}`);

  const notes = game.gameNotes?.trim();
  if (notes) {
    lines.push('');
    lines.push(`${t('recap.coachNotes', "Coach's notes")}:`);
    lines.push(notes);
  }

  return lines.join('\n');
}
