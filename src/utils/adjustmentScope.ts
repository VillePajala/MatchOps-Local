/**
 * Does a hand-recorded external game belong in the view on screen?
 *
 * One rule, used by the stats table and by the per-player drill-down. They
 * used to each carry their own version, which is how a team's totals came to
 * include games played for other teams, and how the table and the drill-down
 * came to disagree once one of them was fixed.
 *
 * The principle: an adjustment counts only where it can be SHOWN to belong.
 * These are games the app never saw, described by whatever the coach typed, so
 * where there is nothing to judge by, the honest answer is to leave it out. A
 * total that quietly folds in another team's games is worse than one that
 * omits a game it cannot place.
 */

import type { PlayerStatAdjustment } from '@/types';
import type { GameType, Gender } from '@/types/game';
import { getClubSeasonForDate } from '@/utils/clubSeason';
import { DEFAULT_CLUB_SEASON_START_DATE, DEFAULT_CLUB_SEASON_END_DATE } from '@/config/clubSeasonDefaults';

export interface AdjustmentScope {
  /** Team id, 'legacy' for games naming no team, or 'all'. */
  teamFilter?: string | 'all' | 'legacy';
  /** Club season label such as '24/25', or 'all'. */
  clubSeason?: string | 'all';
  clubSeasonStartDate?: string;
  clubSeasonEndDate?: string;
  gameTypeFilter?: GameType | 'all';
  genderFilter?: Gender | 'all';
}

export function adjustmentInScope(
  adj: PlayerStatAdjustment,
  {
    teamFilter = 'all',
    clubSeason = 'all',
    clubSeasonStartDate = DEFAULT_CLUB_SEASON_START_DATE,
    clubSeasonEndDate = DEFAULT_CLUB_SEASON_END_DATE,
    gameTypeFilter = 'all',
    genderFilter = 'all',
  }: AdjustmentScope,
): boolean {
  // Team: an external game recorded against another team, or against none, is
  // not part of THIS team's record. 'legacy' is its own scope - the games that
  // name no team - not the absence of a filter.
  if (teamFilter !== 'all') {
    if (teamFilter === 'legacy') {
      if ((adj.teamId ?? '') !== '') return false;
    } else if (adj.teamId !== teamFilter) {
      return false;
    }
  }

  // Year: placed by the date the coach recorded. No date, no year.
  if (clubSeason !== 'all') {
    if (!adj.gameDate) return false;
    if (getClubSeasonForDate(adj.gameDate, clubSeasonStartDate, clubSeasonEndDate) !== clubSeason) {
      return false;
    }
  }

  // Sport and gender are not recorded on an adjustment at all, so under a
  // specific filter there is no way to say it belongs.
  if (gameTypeFilter !== 'all') return false;
  if (genderFilter !== 'all') return false;

  return true;
}
