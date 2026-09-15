/**
 * Your record against each opponent.
 *
 * THIS IS WHY OPPONENT SPELLING WAS MADE STABLE. Head-to-head is the first
 * thing in the app that reads the opponent name as data rather than as a
 * caption, and it is only honest if one team is one row. Grouping is by the
 * SAME normalised key the rest of the opponent work uses, so "LAUTP/Sininen"
 * and "Lautp / Sininen" are one opponent here exactly as they are everywhere
 * else - and "IPS/Punainen" and "IPS/Sininen" stay two, because they are.
 *
 * SCOPE IS THE CALLER'S. This tallies whatever games it is handed and makes no
 * decision about which ones belong together. That matters: a coach's record
 * against a club name is a different thing inside one league than it is across
 * every competition they have ever played, because the squad behind a club
 * name changes between them (see `opponentNames.ts`). The caller passes the
 * already-scoped set, so the figure always means "in this competition".
 *
 * @module headToHead
 * @category Utils
 */

import type { AppState } from '@/types/game';
import { computeTeamRecord, type TeamRecord } from '@/utils/teamRecord';
import { normalizeOpponentName, preferredSpellings } from '@/utils/opponentNames';

export interface HeadToHeadRow extends TeamRecord {
  /** The normalised key these games share. Not for display. */
  key: string;
  /** The spelling to show: the most used among these games. */
  opponent: string;
}

/**
 * One row per opponent, most-played first.
 *
 * Games with no opponent name are skipped rather than collected into a blank
 * row - an unnamed opponent is missing data, not a team called "".
 */
export function computeHeadToHead(games: readonly AppState[]): HeadToHeadRow[] {
  const byOpponent = new Map<string, AppState[]>();

  for (const game of games) {
    const key = normalizeOpponentName(game?.opponentName);
    if (!key) continue;
    const bucket = byOpponent.get(key);
    if (bucket) bucket.push(game);
    else byOpponent.set(key, [game]);
  }

  return [...byOpponent.entries()]
    .map(([key, bucketGames]) => ({
      key,
      // The spelling these particular games use most, by the same rule the
      // game form and the sweep tool follow.
      opponent:
        preferredSpellings(bucketGames.map((g) => g.opponentName ?? ''))[0] ??
        bucketGames[0].opponentName ??
        '',
      ...computeTeamRecord([...bucketGames]),
    }))
    // Most-played first: the team you meet six times is the one worth reading
    // about. Ties fall back to goal difference, then the name, so the order is
    // stable rather than dependent on which game was loaded first.
    .sort(
      (a, b) =>
        b.gamesPlayed - a.gamesPlayed ||
        b.goalDifference - a.goalDifference ||
        a.key.localeCompare(b.key),
    );
}

export default computeHeadToHead;
