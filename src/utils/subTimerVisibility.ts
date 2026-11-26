/**
 * "Näytä vaihtoajastin" - the coach's per-game choice to show (or hide) the
 * interval sub timer on the big timer screen.
 *
 * The timer shows ONE sub mechanism by default: a game with planned subs shows
 * the plan's "Seuraava vaihto" block and hides the interval sub timer; a game
 * without a plan shows the sub timer. This store holds only the coach's
 * deliberate exception to that default, per game id. No entry = the default.
 *
 * WHY A DEVICE-LOCAL KEYED STORE AND NOT A FIELD ON THE GAME. The game blob is
 * rebuilt by the autosave snapshot and replaced by a cloud pull, and a new game
 * field would need a games-table column (a DB migration) to survive the cloud
 * round trip. The planned subs themselves live outside the game blob for the
 * same reason (see utils/playtimePlanner/gameSubs.ts). This is a view
 * preference of the phone that runs the clock, so it stays on that phone:
 * another device simply starts from the default, and nothing about the game's
 * data depends on it.
 *
 * One localStorage entry for all games (not a key per game), capped so it
 * cannot grow without bound: the most recently set games are kept.
 */

import logger from '@/utils/logger';

const KEY = 'matchops_sub_timer_visibility';
/** More games than a coach keeps a live choice for; the oldest choices drop. */
export const MAX_REMEMBERED_GAMES = 200;

type Stored = Record<string, boolean>;

function readAll(): Stored {
  if (typeof window === 'undefined') return {};
  try {
    // eslint-disable-next-line no-restricted-globals -- device-local view preference, never synced (see file comment)
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Stored = {};
    for (const [gameId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'boolean') out[gameId] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** The coach's choice for this game, or undefined when they have not made one. */
export function readSubTimerChoice(gameId: string | null | undefined): boolean | undefined {
  if (!gameId) return undefined;
  return readAll()[gameId];
}

/** Remembers the coach's choice for this game (the newest choice is kept last). */
export function writeSubTimerChoice(gameId: string, show: boolean): void {
  const all = readAll();
  delete all[gameId];
  all[gameId] = show;
  const ids = Object.keys(all);
  for (const old of ids.slice(0, Math.max(0, ids.length - MAX_REMEMBERED_GAMES))) delete all[old];
  try {
    // eslint-disable-next-line no-restricted-globals -- device-local view preference, never synced (see file comment)
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch (error) {
    // Not persistable (quota, blocked storage): the choice still holds for this page load.
    logger.warn('[subTimerVisibility] could not remember the sub timer choice', {
      name: error instanceof Error ? error.name : 'unknown',
    });
  }
}

/**
 * Whether the interval sub timer shows: the coach's choice for the game, else
 * the default - shown exactly when the game has no planned subs.
 */
export function isSubTimerShown(choice: boolean | undefined, hasPlan: boolean): boolean {
  return choice ?? !hasPlan;
}
