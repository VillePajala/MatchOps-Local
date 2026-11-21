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
import type { Season, Team, Tournament } from '@/types';
import { getTeamDisplayName } from './teams';

export type HomeTeamScope = string;

export interface HomeTeamScopeOption {
  id: string;
  label: string;
  /** The team's kit colour, when set - the Tilastot "Joukkueet" card's swatch. */
  color?: string;
}

/**
 * The pill labels.
 *
 * Junior clubs name teams after colours and reuse them per competition, so a
 * coach can have three "PePo Lila" with different rosters. The bare name told
 * them apart nowhere. Same display name as the stats and load-game filters,
 * so a team reads the same on every surface.
 */
export function buildHomeTeamScopeOptions(
  teams: Team[],
  seasons: Season[],
  tournaments: Tournament[],
  labels: { futsal: string; level: (level: string) => string },
): HomeTeamScopeOption[] {
  return teams.map((team) => ({
    id: team.id,
    label: getTeamDisplayName(team, seasons, tournaments, {
      futsalLabel: labels.futsal,
      seriesLabel: labels.level,
    }),
    ...(team.color ? { color: team.color } : {}),
  }));
}

/**
 * The club name the Seura card can honestly show, or null.
 *
 * The app has no club-name field. What it does have is team names, and junior
 * clubs name their teams "<club> <age group> <colour>" ("Kotkat P12 Musta",
 * "Kotkat T11"). When EVERY team starts with the same words, those words are
 * the club as the coach typed it. Rules, so it never shows something that is
 * not a club name:
 *  - at least two different team names (one team's name is a team, not a club);
 *  - the shared words stop before the first word with a digit (the age group);
 *  - every team has something after them (two teams "Lila" and "Lila Futsal"
 *    share "Lila", which is a team).
 * Takes the pill labels; the "(competition)" suffix they carry is dropped.
 */
export function commonClubName(teamLabels: readonly string[]): string | null {
  const names = Array.from(
    new Set(teamLabels.map((l) => l.replace(/\s*\([^()]*\)\s*$/, '').trim()).filter(Boolean)),
  );
  if (names.length < 2) return null;
  const split = names.map((n) => n.split(/\s+/));
  const shared: string[] = [];
  for (let i = 0; ; i++) {
    const word = split[0][i];
    if (word === undefined || /\d/.test(word)) break;
    if (!split.every((w) => w[i] === word)) break;
    shared.push(word);
  }
  if (shared.length === 0) return null;
  if (!split.every((w) => w.length > shared.length)) return null;
  const name = shared.join(' ');
  return name.length >= 2 ? name : null;
}

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
 * The team of the most recently played match.
 *
 * Excludes the scratch workspace, like every other reader of a saved-games
 * collection: a phantom entry must never decide which team Home opens on.
 */
export function mostRecentTeamId(
  games: Record<string, { teamId?: string; gameDate?: string; isPlayed?: boolean } | undefined> | null,
  scratchId: string,
): string | null {
  const played = Object.entries(games ?? {})
    .filter(([id, g]) => id !== scratchId && g && g.isPlayed !== false && !!g.gameDate)
    .sort((a, b) => (b[1]!.gameDate || '').localeCompare(a[1]!.gameDate || ''));
  return played[0]?.[1]?.teamId || null;
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
  recentTeamId: string | null,
): HomeTeamScope {
  if (remembered === 'all' || remembered === 'legacy') return remembered;
  if (remembered && knownTeamIds.includes(remembered)) return remembered;
  if (recentTeamId && knownTeamIds.includes(recentTeamId)) return recentTeamId;
  return 'all';
}
