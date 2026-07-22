/**
 * Launch auto-resume policy - the two-level restructure's game-day guardrail
 * (PR 1.1): on app launch (or an OS-forced reload mid-match), a LIVE match
 * must restore straight into the match view with zero extra taps. The start/
 * home screen is only for sessions that aren't mid-game.
 *
 * The decision reads the PERSISTED game status rather than a session flag:
 * it survives full process kills and device restarts, where sessionStorage
 * may not.
 */
import type { AppState } from '@/types';

export type LaunchResumeGame = Pick<AppState, 'gameStatus'>;

/**
 * True when launch should skip the start screen and land in the match.
 *
 * @param isFirstCheck only the FIRST app-state check after a page load may
 *   auto-resume - later refresh-triggered checks must never yank a user who
 *   is intentionally on the start screen back into the game.
 * @param game the last-open saved game, if any.
 */
export function shouldAutoResumeOnLaunch(
  isFirstCheck: boolean,
  game: LaunchResumeGame | undefined | null,
): boolean {
  if (!isFirstCheck || !game) return false;
  // A match is LIVE during play AND at period breaks - half-time is the single
  // most common moment a coach backgrounds the phone, and they must land back
  // in the match without paying a tap. Before kick-off and after full time the
  // start screen is the right place to be.
  return game.gameStatus === 'inProgress' || game.gameStatus === 'periodEnd';
}
