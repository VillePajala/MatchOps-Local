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

/**
 * A game's result as the lists show it: W/L/D, or 'N/A' for a game with no
 * result to show (not played yet, or an external game logged without a score).
 */
export type ResultTone = GameResult | 'N/A';

/**
 * Result → classes: the ONE place the result colours are picked, so the home
 * screen, saved games, player stats and external games cannot drift apart.
 * Green / red are for results only (amber is action / selection).
 *
 * - `disc`: the round V / T / H badge.
 * - `numeral`: the italic score numerals (gradient text, globals.css). A game
 *   without a result keeps a dim neutral score.
 * - `strip`: a thin edge bar marking a card by result.
 */
export const RESULT_CLASSES: Record<ResultTone, { disc: string; numeral: string; strip: string }> = {
  W: { disc: 'bg-win/15 text-win', numeral: 's1-numeral-win', strip: 'bg-win' },
  D: { disc: 'bg-white/10 text-draw', numeral: 's1-numeral-draw', strip: 'bg-draw' },
  L: { disc: 'bg-loss/15 text-loss', numeral: 's1-numeral-loss', strip: 'bg-loss' },
  'N/A': { disc: 'bg-white/[0.06] text-ink-3', numeral: 'text-ink-3', strip: 'bg-white/15' },
};

/**
 * The LIVE score's numeral class during a match, from our team's side
 * (`homeOrAway`): leading → win colour, trailing → loss colour, level
 * (including 0-0) → the neutral white numeral. It is the situation on the
 * pitch, not a result, so a level score is never 'draw'-tinted and a
 * shootout is not consulted.
 */
export const liveScoreNumeralClass = (
  homeScore: number,
  awayScore: number,
  homeOrAway: 'home' | 'away',
): string => {
  const ours = homeOrAway === 'home' ? homeScore : awayScore;
  const theirs = homeOrAway === 'home' ? awayScore : homeScore;
  if (ours > theirs) return RESULT_CLASSES.W.numeral;
  if (ours < theirs) return RESULT_CLASSES.L.numeral;
  return 's1-numeral';
};
