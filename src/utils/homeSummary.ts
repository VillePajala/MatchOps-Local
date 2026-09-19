/**
 * Home dashboard summary - pure computation of the Pelit-tab dashboard data
 * (the current club-season "Vuosi" record + a recent-games strip) from the saved
 * games. Computed once upstream (page.tsx) and passed to StartScreen, which stays
 * presentational.
 *
 * "Season" here always means the CLUB SEASON (Vuosi), derived from today's date
 * and the coach's configured season window - never one of the coach's Kaudet.
 */
import type { SavedGamesCollection, AppState, Player } from '@/types';
import { planDeparture, DEFAULT_ARRIVAL_BUFFER_MINUTES, type TravelPlan, type Coordinates } from './travelPlan';
import { mapsDirectionsUrl } from '@/config/externalLinks';
import { DEFAULT_GAME_ID } from '@/config/constants';
import { filterGameIds } from '@/components/GameStatsModal/utils/gameFilters';
import { getClubSeasonForDate } from './clubSeason';
import { resolveGameResult, type GameResult } from './gameResult';
import { computeTeamRecord, type TeamRecord } from './teamRecord';

/**
 * Whole days from one ISO date to another, floored at zero.
 *
 * Built from the date parts rather than from timestamps: a match is "tomorrow"
 * because of the calendar, not because of 24 hours, and Finland changes clocks
 * twice a season. Parsed as UTC so the arithmetic cannot be nudged across a day
 * boundary by the device's own zone.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A date the fixture logic can compare and count with.
 *
 * Dates are compared as STRINGS here, which is exact for ISO and nonsense for
 * anything else: "not-a-date" sorts after "2026-09-17", so a corrupt value
 * would otherwise surface as a fixture happening today. Shape-checking first
 * keeps a bad row invisible rather than inventing a match from it.
 */
function isUsableDate(value: string | undefined): value is string {
  return !!value && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86400000));
}

export interface HomeRecentGame {
  id: string;
  opponent: string;
  ourScore: number;
  theirScore: number;
  result: GameResult;
  date: string;
  isFriendly: boolean;
}

/**
 * A match that has not been played yet, nearest first.
 *
 * WHY THIS EXISTS AT ALL. A coach creates the fixture days ahead, and until now
 * the app stored it and showed it NOWHERE: the recent strip filters unplayed
 * games out (correctly - it is history), and nothing else looked for them. The
 * data was already being entered and already being ignored.
 */
export interface HomeUpcomingGame {
  id: string;
  opponent: string;
  /** ISO date, so the caller can format it in the coach's language. */
  date: string;
  time?: string;
  venue?: string;
  fieldNumber?: string;
  /**
   * Turn-by-turn directions, or null when the venue was only typed.
   * Coordinates only - see mapsDirectionsUrl for why a name will not do.
   */
  mapsUrl: string | null;
  /** Whole days from today: 0 = today, 1 = tomorrow. Drives the countdown. */
  daysAway: number;
  /**
   * When to set off, when there is enough to work it out: a kick-off time, a
   * pinned venue, and a home ground to leave from. Null whenever any of those
   * is missing - a confidently wrong departure time is the one output nobody
   * wants. See `travelPlan`.
   */
  travel: TravelPlan | null;
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
  /**
   * Turn-by-turn directions to the venue, when the match is PINNED to one.
   *
   * Null for a location that was only typed. A car button that opens a search
   * for "Itainen alue" promises navigation and delivers a region, so the
   * button does not render at all rather than render dishonestly.
   */
  mapsUrl: string | null;
  currentPeriod?: number;
  timeElapsedSeconds?: number;
}

/** Entity counts for the Joukkue / Kilpailut tab headers. */
export interface HomeCounts {
  players: number;
  teams: number;
  personnel: number;
  seasons: number;
  tournaments: number;
}

export interface HomeTopScorer {
  name: string;
  goals: number;
}

export interface HomeSummary {
  /** The resumable game (current game id) as a card - null when none. */
  resume: HomeResumeGame | null;
  /** Current club-season record - null when season dates are not configured. */
  vuosi: HomeVuosi | null;
  /** Most recent played games, newest first. */
  recent: HomeRecentGame[];
  /** The next unplayed fixture, nearest first - null when none is booked. */
  upcoming: HomeUpcomingGame | null;
  /** The fixtures after it, for the Tulevat strip. Empty when none. */
  upcomingList: HomeUpcomingGame[];
  /** Entity counts (0 when the source collection wasn't provided). */
  counts: HomeCounts;
  /** True once the entity data has been supplied (the enriched build), so the
      UI can tell "0 because empty" from "0 because not loaded yet". */
  countsReady: boolean;
  /** Top scorer of the current club season - null when none / no season config. */
  topScorer: HomeTopScorer | null;
}

export interface HomeSummaryOptions {
  /** Today, ISO YYYY-MM-DD - injected so the computation stays pure/testable. */
  today: string;
  /** Minutes to be at the ground before kick-off. Warm-up, lineup, changing. */
  arrivalBufferMinutes?: number;
  /**
   * Where the team sets off from, as the coach set it. Undefined means no
   * departure time - which is correct: without a starting point there is
   * nothing to measure from, and a guess would be invisible and uncorrectable.
   */
  startingPoint?: Coordinates | null;
  clubSeasonStartDate?: string;
  clubSeasonEndDate?: string;
  /** The Vuosi bar only shows once the coach has configured season dates. */
  hasConfiguredSeasonDates?: boolean;
  /** How many recent games to surface (default 6). */
  recentLimit?: number;
  /** The persisted current game id - drives the resume card. */
  currentGameId?: string | null;
  /** Master roster - for the players count AND top-scorer name resolution. */
  roster?: Player[];
  /**
   * Which team the dashboard is about: a team id, 'legacy' for games naming no
   * team, or 'all'.
   *
   * A coach with one team per competition was shown every team's games added
   * together - a goal difference summing squads that never played each other,
   * and a top scorer who beat teammates he never had. The record has to say
   * whose it is.
   */
  teamFilter?: string;
  teamsCount?: number;
  personnelCount?: number;
  seasonsCount?: number;
  tournamentsCount?: number;
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
      mapsUrl: mapsDirectionsUrl(c.locationLat, c.locationLng),
      currentPeriod: c.currentPeriod,
      timeElapsedSeconds: c.timeElapsedInSeconds,
    };
  }

  // --- Vuosi (current club season) record + top scorer ---
  let vuosi: HomeVuosi | null = null;
  let topScorer: HomeTopScorer | null = null;
  if (opts.hasConfiguredSeasonDates) {
    const label = getClubSeasonForDate(opts.today, opts.clubSeasonStartDate, opts.clubSeasonEndDate);
    const ids = filterGameIds(all, {
      playedOnly: true,
      teamFilter: opts.teamFilter ?? 'all',
      clubSeasonFilter: label,
      clubSeasonStartDate: opts.clubSeasonStartDate,
      clubSeasonEndDate: opts.clubSeasonEndDate,
      activeTab: 'overall',
      includeFriendlies: false,
    });
    const seasonGames = ids.map((id) => all[id]).filter(Boolean) as AppState[];
    vuosi = { label, ...computeTeamRecord(seasonGames) };

    // Top scorer over the same season set: tally goal events by scorer, but ONLY
    // for scorers that resolve to a current roster player - so the tile can never
    // show a blank name for a since-removed player (matches useGameStats, which
    // also excludes unmatched scorer ids). Ties break by first-seen (stable).
    if (opts.roster && opts.roster.length > 0) {
      const nameById = new Map(opts.roster.map((p) => [p.id, p.nickname || p.name || '']));
      const goalsById = new Map<string, number>();
      for (const g of seasonGames) {
        for (const ev of g.gameEvents ?? []) {
          if (ev.type === 'goal' && ev.scorerId && nameById.has(ev.scorerId)) {
            goalsById.set(ev.scorerId, (goalsById.get(ev.scorerId) ?? 0) + 1);
          }
        }
      }
      let bestId: string | null = null;
      let bestGoals = 0;
      for (const [id, n] of goalsById) {
        if (n > bestGoals) { bestGoals = n; bestId = id; }
      }
      if (bestId && bestGoals > 0) {
        const name = nameById.get(bestId) || '';
        if (name) topScorer = { name, goals: bestGoals };
      }
    }
  }

  // --- Recent strip ---
  const scoped = opts.teamFilter && opts.teamFilter !== 'all' ? opts.teamFilter : null;
  const recent: HomeRecentGame[] = Object.entries(all)
    // Scoped too: showing another team's matches under this team's record is
    // the same confusion one line down.
    .filter(([, g]) => {
      if (!g || g.isPlayed === false || !g.gameDate) return false;
      if (!scoped) return true;
      return scoped === 'legacy' ? !(g.teamId ?? '') : g.teamId === scoped;
    })
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

  const counts: HomeCounts = {
    players: opts.roster?.length ?? 0,
    teams: opts.teamsCount ?? 0,
    personnel: opts.personnelCount ?? 0,
    seasons: opts.seasonsCount ?? 0,
    tournaments: opts.tournamentsCount ?? 0,
  };

  // The enrichment pass always supplies roster + all counts together, so the
  // presence of `roster` marks the counts as loaded (vs the fast Pelit build).
  const countsReady = opts.roster !== undefined;

  // --- Upcoming fixtures ---
  //
  // The mirror image of the recent strip: unplayed, dated today or later,
  // nearest first. Scoped the same way, for the same reason - another team's
  // fixture under this team's heading is the same confusion.
  //
  // `>= opts.today` deliberately includes TODAY. A match this afternoon is the
  // most upcoming thing there is, and dropping it at midnight would blank the
  // card on the one morning it matters most.
  /**
   * Drive times the coach has measured, keyed by where they drove TO.
   *
   * Looked up by position rather than carried on each new match: confirming a
   * drive once then applies to every fixture at that venue, past and future,
   * and cannot fall out of step with itself. A venue is the same venue when the
   * coordinates match - which is the whole reason coordinates were worth a
   * migration over a name.
   */
  const measuredDrives = new Map<string, number>();
  for (const g of Object.values(all)) {
    if (!g || typeof g.travelMinutes !== 'number') continue;
    if (typeof g.locationLat !== 'number' || typeof g.locationLng !== 'number') continue;
    measuredDrives.set(`${g.locationLat},${g.locationLng}`, g.travelMinutes);
  }

  const upcomingAll: HomeUpcomingGame[] = Object.entries(all)
    .filter(([, g]) => {
      if (!g || g.isPlayed !== false || !isUsableDate(g.gameDate)) return false;
      if (g.gameDate < opts.today) return false;
      if (!scoped) return true;
      return scoped === 'legacy' ? !(g.teamId ?? '') : g.teamId === scoped;
    })
    .sort((a, b) => (a[1].gameDate || '').localeCompare(b[1].gameDate || ''))
    .slice(0, recentLimit)
    .map(([id, g]) => ({
      id,
      opponent: g.opponentName || '',
      date: g.gameDate || '',
      time: g.gameTime || undefined,
      venue: g.gameLocation || undefined,
      fieldNumber: g.fieldNumber || undefined,
      mapsUrl: mapsDirectionsUrl(g.locationLat, g.locationLng),
      daysAway: daysBetween(opts.today, g.gameDate || ''),
      travel: planDeparture({
        kickoff: g.gameTime,
        from: opts.startingPoint ?? null,
        to:
          typeof g.locationLat === 'number' && typeof g.locationLng === 'number'
            ? { latitude: g.locationLat, longitude: g.locationLng }
            : null,
        // This match's own figure wins over the club default: a cup tie asking
        // for an hour must not drag every other fixture with it.
        arrivalBufferMinutes:
          g.arrivalBufferMinutes ?? opts.arrivalBufferMinutes ?? DEFAULT_ARRIVAL_BUFFER_MINUTES,
        confirmedTravelMinutes:
          g.travelMinutes ?? measuredDrives.get(`${g.locationLat},${g.locationLng}`) ?? null,
      }),
    }));

  const upcoming = upcomingAll[0] ?? null;
  // The strip shows what comes AFTER the card, not including it. Repeating the
  // carded fixture directly beneath itself is the same duplication the accent
  // rule exists to avoid - and with only one fixture booked it means no strip
  // and no toggle at all, because there is nothing further ahead to show.
  const upcomingList = upcomingAll.slice(1);

  return { resume, vuosi, recent, upcoming, upcomingList, counts, countsReady, topScorer };
}
