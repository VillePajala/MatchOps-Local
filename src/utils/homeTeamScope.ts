'use client';

/**
 * Which team the Home dashboard is showing, remembered between visits.
 *
 * A coach who runs one team per competition opens Home wanting one squad's
 * record, not every squad's added together. Remembering the choice means they
 * see that answer immediately rather than re-picking it every time.
 *
 * Device-local on purpose, like the other `matchops_*` keys: this is a view
 * preference, not data. It never syncs, never lands in a backup, and two
 * phones can sensibly be looking at two different teams.
 */

import logger from '@/utils/logger';

const STORAGE_KEY = 'matchops_home_team_scope';

/** A team id, 'legacy' for games naming no team, or 'all'. */
export type HomeTeamScope = string;

export function readHomeTeamScope(): HomeTeamScope | null {
  try {
    // eslint-disable-next-line no-restricted-globals -- device-local view preference, never synced
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    // A preference we cannot read is not worth failing Home over.
    return null;
  }
}

export function writeHomeTeamScope(scope: HomeTeamScope): void {
  try {
    // eslint-disable-next-line no-restricted-globals -- device-local view preference, never synced
    localStorage.setItem(STORAGE_KEY, scope);
  } catch (error) {
    logger.warn('[homeTeamScope] could not remember the chosen team', {
      name: error instanceof Error ? error.name : 'unknown',
    });
  }
}

/**
 * The scope to open on.
 *
 * A remembered team wins, but only while it still exists - a deleted team must
 * not leave Home showing an empty record with no way to tell why. Otherwise the
 * team of the most recent played game, which is almost always the one the coach
 * just finished. Failing that, everything.
 */
export function resolveHomeTeamScope(
  remembered: HomeTeamScope | null,
  knownTeamIds: string[],
  mostRecentTeamId: string | null,
): HomeTeamScope {
  if (remembered === 'all' || remembered === 'legacy') return remembered;
  if (remembered && knownTeamIds.includes(remembered)) return remembered;
  if (mostRecentTeamId && knownTeamIds.includes(mostRecentTeamId)) return mostRecentTeamId;
  return 'all';
}
