import type { ShootoutKick } from '@/types/game';
import { getShootoutWinner } from '@/utils/shootout';

export type GameResult = 'W' | 'L' | 'D';

/**
 * The minimal shape needed to resolve a game's result from the coach's
 * perspective (`homeOrAway`).
 */
export interface ResolvableGame {
  homeScore: number;
  awayScore: number;
  homeOrAway: 'home' | 'away';
  /** Whether the game is marked as decided by penalties (gates the shootout tie-break). */
  wentToPenalties?: boolean;
  /** Present only for games decided by a penalty shootout. */
  shootoutKicks?: ShootoutKick[];
}

/**
 * Resolves a game to Win / Loss / Draw from the coach's perspective.
 *
 * This is the single source of truth for game results, replacing the W/L/D
 * comparison that was duplicated across stats, exports, and the load screen.
 *
 * Rules:
 * 1. Unequal score (which already includes any extra-time goals — OT goals are
 *    logged as normal goals) → win/loss by side.
 * 2. Level score, the game is marked decided by penalties (`wentToPenalties`),
 *    **and** the shootout has a winner → win/loss from the shootout winner. A
 *    penalty win counts as a Win (project decision). Gating on the flag means
 *    un-marking "decided by penalties" reverts the game to a draw even if the
 *    logged kicks are kept.
 * 3. Otherwise (incl. a tied/incomplete shootout, or not marked) → Draw.
 *
 * Back-compat: for games without `shootoutKicks` this is identical to the old
 * inline comparisons, so existing stats are unchanged.
 */
export const resolveGameResult = (game: ResolvableGame): GameResult => {
  const { homeScore, awayScore, homeOrAway } = game;
  const weAreHome = homeOrAway === 'home';

  if (homeScore > awayScore) return weAreHome ? 'W' : 'L';
  if (awayScore > homeScore) return weAreHome ? 'L' : 'W';

  // Level score — a penalty shootout breaks the tie, but only when the game is
  // marked as decided by penalties (the coach's authority).
  if (game.wentToPenalties) {
    const winner = getShootoutWinner(game.shootoutKicks);
    if (winner) return (winner === 'home') === weAreHome ? 'W' : 'L';
  }

  return 'D';
};
