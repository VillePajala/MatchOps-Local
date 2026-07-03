/**
 * Position diversity / versatility aggregation.
 *
 * Rolls the per-game `playerPositions` map (playerId -> position ids the player
 * actually played that game) across a set of games into a per-player picture of
 * where each player has played, and how narrow that experience has been. It also
 * reports how many different players have covered each position/line.
 *
 * The point is to surface positional imbalance inside a competition so the coach
 * can broaden players who have been pigeonholed - it is descriptive and
 * compare-to-self, never a rating. Granularity is games-per-position (not
 * minutes): a player counts once per game for each position/line they appeared
 * in that game, so multi-position games are counted for each line involved.
 *
 * Pure and UI-agnostic: names/ordering are resolved by the caller from the
 * roster. See `player-positions-per-game-plan.md` (diversity extension).
 */

import { POSITION_CATEGORY, POSITION_IDS, type PositionCategory } from '@/config/positions';

/** The four pitch lines, back-to-front (matches the config order). */
export const LINES: readonly PositionCategory[] = ['gk', 'def', 'mid', 'att'];

export interface PlayerPositionSummary {
  playerId: string;
  /** Games in which the player was recorded at each position id. */
  byPosition: Record<string, number>;
  /** Games in which the player appeared in each line (gk/def/mid/att). */
  byLine: Record<PositionCategory, number>;
  /** Games with at least one recorded position for this player. */
  totalGames: number;
  distinctPositions: number;
  distinctLines: number;
  /** Most-frequent position id (ties broken by config order); null if none. */
  primaryPosition: string | null;
  /** Most-frequent line (ties broken by back-to-front order); null if none. */
  primaryLine: PositionCategory | null;
  /** Share of the player's games spent in their most-common line (0..1). */
  topLineShare: number;
  /** Flagged narrow: the player has only ever played one line (any game count). */
  narrow: boolean;
}

export interface PositionDiversityResult {
  /** One summary per player who has any recorded position, sorted by playerId. */
  players: PlayerPositionSummary[];
  /** positionId -> number of distinct players who played it. */
  positionCoverage: Record<string, number>;
  /** line -> number of distinct players who appeared there. */
  lineCoverage: Record<PositionCategory, number>;
  /** Games considered (those carrying any recorded positions). */
  totalGames: number;
}

/** Minimal shape needed from a saved game. */
export interface DiversityGame {
  playerPositions?: Record<string, string[]>;
}

const positionOrder = new Map(POSITION_IDS.map((id, i) => [id, i] as const));

const emptyLineTally = (): Record<PositionCategory, number> => ({ gk: 0, def: 0, mid: 0, att: 0 });

/** Highest-count position; ties broken by config (back-to-front) order. */
const pickPrimaryPosition = (posMap: Map<string, number>): string | null => {
  let best: string | null = null;
  let bestN = -1;
  let bestOrder = Infinity;
  for (const [id, n] of posMap) {
    const order = positionOrder.get(id) ?? Infinity;
    if (n > bestN || (n === bestN && order < bestOrder)) {
      best = id;
      bestN = n;
      bestOrder = order;
    }
  }
  return best;
};

/** Highest-count line; ties keep the earlier (back-to-front) line. */
const pickPrimaryLine = (lineMap: Record<PositionCategory, number>): PositionCategory | null => {
  let best: PositionCategory | null = null;
  let bestN = 0;
  for (const line of LINES) {
    if (lineMap[line] > bestN) {
      best = line;
      bestN = lineMap[line];
    }
  }
  return best;
};

export function computePositionDiversity(games: DiversityGame[]): PositionDiversityResult {
  const perPlayerPos = new Map<string, Map<string, number>>();
  const perPlayerLine = new Map<string, Record<PositionCategory, number>>();
  const perPlayerGames = new Map<string, number>();
  const positionPlayers = new Map<string, Set<string>>();
  const linePlayers: Record<PositionCategory, Set<string>> = {
    gk: new Set(),
    def: new Set(),
    mid: new Set(),
    att: new Set(),
  };

  let totalGames = 0;

  for (const game of games) {
    const pp = game.playerPositions;
    if (!pp) continue;
    let gameHadPositions = false;

    for (const [playerId, positionIds] of Object.entries(pp)) {
      const uniquePositions = [...new Set((positionIds ?? []).filter(Boolean))];
      if (uniquePositions.length === 0) continue;
      gameHadPositions = true;

      perPlayerGames.set(playerId, (perPlayerGames.get(playerId) ?? 0) + 1);

      const posMap = perPlayerPos.get(playerId) ?? new Map<string, number>();
      const lineMap = perPlayerLine.get(playerId) ?? emptyLineTally();
      const linesThisGame = new Set<PositionCategory>();

      for (const posId of uniquePositions) {
        posMap.set(posId, (posMap.get(posId) ?? 0) + 1);

        const players = positionPlayers.get(posId) ?? new Set<string>();
        players.add(playerId);
        positionPlayers.set(posId, players);

        const line = POSITION_CATEGORY[posId];
        if (line) linesThisGame.add(line);
      }

      // Each distinct line the player touched this game counts once for the game.
      linesThisGame.forEach(line => {
        lineMap[line] += 1;
        linePlayers[line].add(playerId);
      });

      perPlayerPos.set(playerId, posMap);
      perPlayerLine.set(playerId, lineMap);
    }

    if (gameHadPositions) totalGames += 1;
  }

  const players: PlayerPositionSummary[] = [...perPlayerGames.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map(playerId => {
      const posMap = perPlayerPos.get(playerId) ?? new Map<string, number>();
      const lineMap = perPlayerLine.get(playerId) ?? emptyLineTally();
      const games = perPlayerGames.get(playerId) ?? 0;

      const distinctLines = LINES.filter(l => lineMap[l] > 0).length;
      const topLineGames = Math.max(0, ...LINES.map(l => lineMap[l]));

      return {
        playerId,
        byPosition: Object.fromEntries(posMap),
        byLine: lineMap,
        totalGames: games,
        distinctPositions: posMap.size,
        distinctLines,
        primaryPosition: pickPrimaryPosition(posMap),
        primaryLine: pickPrimaryLine(lineMap),
        topLineShare: games > 0 ? topLineGames / games : 0,
        narrow: distinctLines <= 1,
      };
    });

  const positionCoverage = Object.fromEntries(
    [...positionPlayers.entries()].map(([pos, set]) => [pos, set.size]),
  );
  const lineCoverage: Record<PositionCategory, number> = {
    gk: linePlayers.gk.size,
    def: linePlayers.def.size,
    mid: linePlayers.mid.size,
    att: linePlayers.att.size,
  };

  return { players, positionCoverage, lineCoverage, totalGames };
}
