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
  /** The logged penalty-shootout kicks; a decided shootout breaks a level score. */
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
 * 2. Level score **and** a decided penalty shootout (logged kicks with a winner)
 *    → win/loss from the shootout winner. A penalty win counts as a Win. The
 *    kicks themselves are the authority — there is no separate flag to keep in
 *    sync — so a recorded shootout always resolves the result.
 * 3. Otherwise (incl. a tied/incomplete shootout, or no kicks) → Draw.
 *
 * Back-compat: games without `shootoutKicks` resolve exactly like the old inline
 * comparisons, so existing stats are unchanged.
 */
export const resolveGameResult = (game: ResolvableGame): GameResult => {
  const { homeScore, awayScore, homeOrAway } = game;
  const weAreHome = homeOrAway === 'home';

  if (homeScore > awayScore) return weAreHome ? 'W' : 'L';
  if (awayScore > homeScore) return weAreHome ? 'L' : 'W';

  // Level score — a decided penalty shootout breaks the tie.
  const winner = getShootoutWinner(game.shootoutKicks);
  if (winner) return (winner === 'home') === weAreHome ? 'W' : 'L';

  return 'D';
};
