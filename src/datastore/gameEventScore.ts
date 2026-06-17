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
