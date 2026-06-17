/**
 * Shared score-adjustment logic for game-event removal.
 *
 * homeScore/awayScore are POSITIONAL (home-team tally vs away-team tally);
 * "our" goal maps to the home or away tally via homeOrAway. When a goal event
 * is removed, the matching tally must decrement so the stored score stays
 * consistent with the events. This mirrors the reducer's
 * DELETE_GAME_EVENT_WITH_SCORE so storage and in-memory state agree.
 */
import type { AppState } from '@/types';
import type { GameEvent } from '@/types/game';

/**
 * Recompute the positional score purely from the goal events — the events are
 * the source of truth. our goals = count of 'goal' events, opponent goals =
 * count of 'opponentGoal'; mapped to home/away via homeOrAway. Used by the
 * "recalculate score from goal log" action.
 */
export function computeScoreFromEvents(
  game: Pick<AppState, 'homeOrAway'> & { gameEvents?: GameEvent[] },
): { homeScore: number; awayScore: number } {
  const events = game.gameEvents ?? [];
  const ourGoals = events.filter((e) => e.type === 'goal').length;
  const opponentGoals = events.filter((e) => e.type === 'opponentGoal').length;
  return game.homeOrAway === 'home'
    ? { homeScore: ourGoals, awayScore: opponentGoals }
    : { homeScore: opponentGoals, awayScore: ourGoals };
}

export function adjustScoreForRemovedEvent(
  game: Pick<AppState, 'homeScore' | 'awayScore' | 'homeOrAway'>,
  removed: GameEvent | undefined,
): { homeScore: number; awayScore: number } {
  let homeScore = game.homeScore;
  let awayScore = game.awayScore;

  if (removed?.type === 'goal') {
    // Our goal
    if (game.homeOrAway === 'home') homeScore = Math.max(0, homeScore - 1);
    else awayScore = Math.max(0, awayScore - 1);
  } else if (removed?.type === 'opponentGoal') {
    // Opponent goal
    if (game.homeOrAway === 'home') awayScore = Math.max(0, awayScore - 1);
    else homeScore = Math.max(0, homeScore - 1);
  }

  return { homeScore, awayScore };
}
