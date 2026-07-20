/**
 * Home dashboard summary - pure computation of the Pelit-tab dashboard data
 * (the current club-season "Vuosi" record + a recent-games strip) from the saved
 * games. Computed once upstream (page.tsx) and passed to StartScreen, which stays
 * presentational.
 *
 * "Season" here always means the CLUB SEASON (Vuosi), derived from today's date
 * and the coach's configured season window - never one of the coach's Kaudet.
 */
import type { SavedGamesCollection, AppState } from '@/types';
import { DEFAULT_GAME_ID } from '@/config/constants';
import { filterGameIds } from '@/components/GameStatsModal/utils/gameFilters';
import { getClubSeasonForDate } from './clubSeason';
import { resolveGameResult, type GameResult } from './gameResult';
import { computeTeamRecord, type TeamRecord } from './teamRecord';

export interface HomeRecentGame {
  id: string;
  opponent: string;
  ourScore: number;
  theirScore: number;
  result: GameResult;
  date: string;
  isFriendly: boolean;
}

export interface HomeVuosi extends TeamRecord {
  /** Club-season label, e.g. "24/25". */
  label: string;
}

export interface HomeResumeGame {
  id: string;
  opponent: string;
  ourScore: number;
  theirScore: number;
  homeOrAway: 'home' | 'away';
  /** false while a match is still in progress (drives a "kesken" hint). */
  isPlayed: boolean;
  currentPeriod?: number;
  timeElapsedSeconds?: number;
}

export interface HomeSummary {
  /** The resumable game (current game id) as a card - null when none. */
  resume: HomeResumeGame | null;
  /** Current club-season record - null when season dates are not configured. */
  vuosi: HomeVuosi | null;
  /** Most recent played games, newest first. */
  recent: HomeRecentGame[];
}

export interface HomeSummaryOptions {
  /** Today, ISO YYYY-MM-DD - injected so the computation stays pure/testable. */
  today: string;
  clubSeasonStartDate?: string;
  clubSeasonEndDate?: string;
  /** The Vuosi bar only shows once the coach has configured season dates. */
  hasConfiguredSeasonDates?: boolean;
  /** How many recent games to surface (default 6). */
  recentLimit?: number;
  /** The persisted current game id - drives the resume card. */
  currentGameId?: string | null;
}

/**
 * Build the Pelit-tab dashboard summary from the saved games.
 *
 * Vuosi record: current club season only, PLAYED games, friendlies EXCLUDED
 * (same rule the competitive stats use) - so the Home number matches the stats
 * modal's Overall-for-this-club-season number exactly. Hidden until season dates
 * are configured, so we never imply a wrong year.
 *
 * Recent strip: the last N played games by date (newest first), friendlies
 * included (recent history is fine to show in full).
 */
export function buildHomeSummary(
  games: SavedGamesCollection | null,
  opts: HomeSummaryOptions,
): HomeSummary {
  const recentLimit = opts.recentLimit ?? 6;

  // Exclude the scratch/unsaved workspace, like every other SavedGamesCollection
  // reader (getLatestGameId, checkAppState, LoadGameModal). A phantom entry must
  // never count toward the Vuosi record or appear in the recent strip.
  const all: SavedGamesCollection = {};
  for (const [id, g] of Object.entries(games ?? {})) {
    if (id !== DEFAULT_GAME_ID) all[id] = g;
  }

  // --- Resume card (the current game) ---
  let resume: HomeResumeGame | null = null;
  const currentId = opts.currentGameId;
  if (currentId && currentId !== DEFAULT_GAME_ID && all[currentId]) {
    const c = all[currentId];
    resume = {
      id: currentId,
      opponent: c.opponentName || '',
      ourScore: c.homeOrAway === 'home' ? c.homeScore : c.awayScore,
      theirScore: c.homeOrAway === 'home' ? c.awayScore : c.homeScore,
      homeOrAway: c.homeOrAway,
      isPlayed: c.isPlayed !== false,
      currentPeriod: c.currentPeriod,
      timeElapsedSeconds: c.timeElapsedInSeconds,
    };
  }

  // --- Vuosi (current club season) record ---
  let vuosi: HomeVuosi | null = null;
  if (opts.hasConfiguredSeasonDates) {
    const label = getClubSeasonForDate(opts.today, opts.clubSeasonStartDate, opts.clubSeasonEndDate);
    const ids = filterGameIds(all, {
      playedOnly: true,
      clubSeasonFilter: label,
      clubSeasonStartDate: opts.clubSeasonStartDate,
      clubSeasonEndDate: opts.clubSeasonEndDate,
      activeTab: 'overall',
      includeFriendlies: false,
    });
    const seasonGames = ids.map((id) => all[id]).filter(Boolean) as AppState[];
    vuosi = { label, ...computeTeamRecord(seasonGames) };
  }

  // --- Recent strip ---
  const recent: HomeRecentGame[] = Object.entries(all)
    .filter(([, g]) => g && g.isPlayed !== false && !!g.gameDate)
    .sort((a, b) => (b[1].gameDate || '').localeCompare(a[1].gameDate || ''))
    .slice(0, recentLimit)
    .map(([id, g]) => {
      const ourScore = g.homeOrAway === 'home' ? g.homeScore : g.awayScore;
      const theirScore = g.homeOrAway === 'home' ? g.awayScore : g.homeScore;
      return {
        id,
        opponent: g.opponentName || '',
        ourScore,
        theirScore,
        result: resolveGameResult(g),
        date: g.gameDate || '',
        isFriendly: g.isFriendly === true,
      };
    });

  return { resume, vuosi, recent };
}
