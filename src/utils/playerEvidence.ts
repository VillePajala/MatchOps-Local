/**
 * Player summary: one player, one period, all fact.
 *
 * The reason the rating system existed was a good player overlooked by a head
 * coach who never sees the games. Ratings were one coach's opinion in numbers
 * and read as such. This is the case file instead: how many games, in which
 * positions and competitions, what they scored, and what the coach wrote down
 * on the day. Nothing generated, nothing rated. A head coach can argue with a
 * judgement; not with "12 games, and here is what happened on 21.9."
 *
 * Minutes are deliberately absent: the app cannot keep them true without work
 * from the coach (owner, 2026-09-09). Games played is the number that matters.
 *
 * External games are NOT counted apart. They are a way of recording a match
 * the coach could not sit and track; to the player's record it is a game like
 * any other, and splitting the count only invited the question "which nine?".
 *
 * A season's worth of matches makes the game list far longer than anything
 * anyone reads, so the caller chooses which blocks to include.
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

/** A league or a tournament the player appeared in, with what they did there. */
export interface EvidenceCompetition {
  name: string;
  games: number;
  goals: number;
  assists: number;
}

/** Which blocks to write. The game list is off by default: it is the long one. */
export interface EvidenceSections {
  totals: boolean;
  competitions: boolean;
  notes: boolean;
  games: boolean;
}

export const DEFAULT_EVIDENCE_SECTIONS: EvidenceSections = {
  totals: true,
  competitions: true,
  notes: true,
  games: false,
};

export interface EvidenceInput {
  playerName: string;
  /** What the numbers cover, in the coach's words: "Seurakausi 25/26". */
  periodLabel: string;
  /** Games in scope that the player took part in, with the player's positions. */
  games: EvidenceGame[];
  /**
   * Games played, from calculatePlayerStats.
   *
   * NOT stats.length: one external entry can stand for several games ("5 games
   * for another team"), or for none at all when it only corrects goals. Taking
   * the row count would put a smaller number in the summary than the same
   * screen shows two inches above it.
   */
  gamesPlayed: number;
  /**
   * Games this player wore the armband. Left out of the text entirely when it
   * is zero: "captain 0 times" says nothing about a player and reads as a mark
   * against them, which is the opposite of what this page is for.
   */
  captaincies: number;
  /** Per-game lines from calculatePlayerStats, external games included. */
  stats: GameStats[];
  /** Leagues and tournaments in scope, each with this player's tally. */
  competitions: EvidenceCompetition[];
  /** The coach's dated notes about this player, within scope. */
  notes: EvidenceNote[];
  sections: EvidenceSections;
}

export type EvidenceTranslate = (
  key: string,
  fallback: string,
  options?: Record<string, unknown>,
) => string;

const dayMonth = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])}.${Number(m[2])}.` : iso;
};

export function buildPlayerEvidence(input: EvidenceInput, t: EvidenceTranslate): string {
  const goals = input.stats.reduce((n, g) => n + g.goals, 0);
  const assists = input.stats.reduce((n, g) => n + g.assists, 0);

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
      return parts.join(' | ');
    });

  const noteLines = input.notes
    .slice()
    .sort((a, b) => a.gameDate.localeCompare(b.gameDate))
    .map((n) => `${dayMonth(n.gameDate)} ${n.opponentName}: ${n.text.trim()}`);

  // Counted words, because Finnish inflects them: "1 ottelu" but "8 ottelua".
  const counted = (n: number, key: string, one: string, many: string) =>
    t(`evidence.${key}`, n === 1 ? one : many, { count: n });

  const competitionLines = input.competitions.map((c) => {
    const tally = [counted(c.games, 'gamesCount', '{{count}} game', '{{count}} games')];
    if (c.goals) tally.push(counted(c.goals, 'goalsCount', '{{count}} goal', '{{count}} goals'));
    if (c.assists) tally.push(counted(c.assists, 'assistsCount', '{{count}} assist', '{{count}} assists'));
    return `${c.name}: ${tally.join(', ')}`;
  });

  const blocks: string[] = [];
  blocks.push([`${input.playerName} - ${t('evidence.title', 'Player summary')}`, input.periodLabel].join('\n'));
  if (input.sections.totals) {
    blocks.push([
      `${t('evidence.games', 'Games')}: ${input.gamesPlayed}`,
      `${t('evidence.goals', 'Goals')} ${goals}, ${t('evidence.assists', 'assists')} ${assists}, ${t('evidence.points', 'points')} ${goals + assists}`,
      ...(positionLine ? [`${t('evidence.positions', 'Positions')}: ${positionLine}`] : []),
      ...(input.captaincies > 0
        ? [`${t('evidence.captain', 'Captain')}: ${counted(input.captaincies, 'gamesCount', '{{count}} game', '{{count}} games')}`]
        : []),
    ].join('\n'));
  }
  if (input.sections.competitions && competitionLines.length) {
    blocks.push([`${t('evidence.competitions', 'Leagues and tournaments')}:`, ...competitionLines].join('\n'));
  }
  if (input.sections.notes && noteLines.length) {
    blocks.push([`${t('evidence.notes', 'Coach notes from the games')}:`, ...noteLines].join('\n'));
  }
  if (input.sections.games && gameLines.length) {
    blocks.push([`${t('evidence.gamesList', 'Games')}:`, ...gameLines].join('\n'));
  }
  return blocks.join('\n\n');
}
