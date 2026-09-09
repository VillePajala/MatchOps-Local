/**
 * Player match evidence: one player, one period, all fact.
 *
 * The reason the rating system existed was a good player overlooked by a head
 * coach who never sees the games. Ratings were one coach's opinion in numbers
 * and read as such. This is the case file instead: how many games, in which
 * positions, what they scored, and what the coach wrote down on the day, with
 * the date and the opponent. Nothing generated, nothing rated. A head coach can
 * argue with a judgement; not with "8 of 8 games, and here is 21.9."
 *
 * Minutes are deliberately absent: the app cannot keep them true without work
 * from the coach (owner, 2026-09-09). Games played is the number that matters.
 *
 * Pure and i18n-agnostic, like gameRecap.ts and tasoReport.ts.
 */

import type { GameStats } from '@/utils/playerStats';

export interface EvidenceNote {
  gameDate: string;
  opponentName: string;
  text: string;
}

export interface EvidenceGame {
  gameId: string;
  gameDate: string;
  opponentName: string;
  homeOrAway: 'home' | 'away';
  homeScore: number;
  awayScore: number;
  /** Position ids this player was recorded at in that game. */
  positions: string[];
}

export interface EvidenceInput {
  playerName: string;
  /** What the numbers cover, in the coach's words: "Seurakausi 25/26", "Aluesarja U10". */
  periodLabel: string;
  /** Games in scope that the player took part in, with the player's positions. */
  games: EvidenceGame[];
  /** Games in scope in total (the team's), so "8 of 9" can be said. */
  teamGamesInScope: number;
  /** Per-game lines from calculatePlayerStats, external games included. */
  stats: GameStats[];
  /** The coach's dated notes about this player, within scope. */
  notes: EvidenceNote[];
}

export type EvidenceTranslate = (key: string, fallback: string) => string;

const dayMonth = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])}.${Number(m[2])}.` : iso;
};

export function buildPlayerEvidence(input: EvidenceInput, t: EvidenceTranslate): string {
  const goals = input.stats.reduce((n, g) => n + g.goals, 0);
  const assists = input.stats.reduce((n, g) => n + g.assists, 0);
  // Only the app's own games can be a share of the team's games; external
  // games (played for another team, entered by hand) are counted apart, so
  // "2 / 9" is a fraction that actually composes.
  const played = input.stats.filter((s) => !s.isExternal).length;
  const external = input.stats.filter((s) => s.isExternal).length;

  const positionCounts = new Map<string, number>();
  input.games.forEach((g) => g.positions.forEach((p) => positionCounts.set(p, (positionCounts.get(p) ?? 0) + 1)));
  const positionLine = [...positionCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, n]) => `${t(`playingPositions.${id}.abbrev`, id.toUpperCase())} ${n}`)
    .join(', ');

  const scoreOf = (g: EvidenceGame) =>
    g.homeOrAway === 'home' ? `${g.homeScore}-${g.awayScore}` : `${g.awayScore}-${g.homeScore}`;
  const byId = new Map(input.games.map((g) => [g.gameId, g]));

  const gameLines = input.stats
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => {
      const g = byId.get(s.gameId);
      const parts = [
        `${dayMonth(s.date)} ${s.opponentName}${g ? ` ${scoreOf(g)}` : ''}${s.result === 'N/A' ? '' : ` ${s.result}`}`,
      ];
      if (g && g.positions.length) parts.push(g.positions.map((p) => t(`playingPositions.${p}.abbrev`, p.toUpperCase())).join('/'));
      const tally: string[] = [];
      if (s.goals) tally.push(`${s.goals} ${t('evidence.goalsShort', 'g')}`);
      if (s.assists) tally.push(`${s.assists} ${t('evidence.assistsShort', 'a')}`);
      if (tally.length) parts.push(tally.join(', '));
      if (s.isExternal) parts.push(t('evidence.external', 'external'));
      return parts.join(' | ');
    });

  const noteLines = input.notes
    .slice()
    .sort((a, b) => a.gameDate.localeCompare(b.gameDate))
    .map((n) => `${dayMonth(n.gameDate)} ${n.opponentName}: ${n.text.trim()}`);

  const blocks: string[] = [];
  blocks.push([`${input.playerName} - ${t('evidence.title', 'Player summary')}`, input.periodLabel].join('\n'));
  blocks.push([
    `${t('evidence.games', 'Games')}: ${played}${input.teamGamesInScope > 0 ? ` / ${input.teamGamesInScope} ${t('evidence.teamGames', 'team games')}` : ''}${external ? `, ${external} ${t('evidence.externalGames', 'external games')}` : ''}`,
    `${t('evidence.goals', 'Goals')} ${goals}, ${t('evidence.assists', 'assists')} ${assists}, ${t('evidence.points', 'points')} ${goals + assists}`,
    ...(positionLine ? [`${t('evidence.positions', 'Positions')}: ${positionLine}`] : []),
  ].join('\n'));
  if (noteLines.length) blocks.push([`${t('evidence.notes', 'Coach notes from the games')}:`, ...noteLines].join('\n'));
  if (gameLines.length) blocks.push([`${t('evidence.gamesList', 'Games')}:`, ...gameLines].join('\n'));
  return blocks.join('\n\n');
}
