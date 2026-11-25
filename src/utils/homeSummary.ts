/**
 * Home dashboard summary - pure computation of the Pelit-tab dashboard data
 * (the current club-season "Vuosi" record + a recent-games strip) from the saved
 * games. Computed once upstream (page.tsx) and passed to StartScreen, which stays
 * presentational.
 *
 * "Season" here always means the CLUB SEASON (Vuosi), derived from today's date
 * and the coach's configured season window - never one of the coach's Kaudet.
 */
import type { SavedGamesCollection, AppState, Player, Season, Tournament } from '@/types';
import type { CompetitionCardItem } from '@/components/CompetitionCard';
import { planDeparture, DEFAULT_ARRIVAL_BUFFER_MINUTES, type TravelPlan, type Coordinates } from './travelPlan';
import { mapsDirectionsUrl } from '@/config/externalLinks';
import { DEFAULT_GAME_ID } from '@/config/constants';
import { filterGameIds } from '@/components/GameStatsModal/utils/gameFilters';
import { getClubSeasonForDate } from './clubSeason';
import { resolveGameResult, type GameResult } from './gameResult';
import { computeTeamRecord, type TeamRecord } from './teamRecord';
import { hasBeenPlayed } from './matchPlayedDefault';
import { daysBetween } from './todayIso';

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

/**
 * Whether a match has visibly begun (review R2, "started = played"): its clock
 * ran, something was recorded against it (`hasBeenPlayed` - the app's one
 * evidence rule), it has a score, or its status moved past "not started".
 *
 * A match that has NOT begun is still ahead of the coach whatever its
 * "played" flag says and whatever its date: a game created this morning with
 * the flag on, or last Saturday's game that never kicked off, is not a 0-0
 * result. Home shows it as the next game, never as "Viimeisin peli 0-0".
 */
export function hasMatchStarted(game: AppState, today: string): boolean {
  if (game.gameStatus && game.gameStatus !== 'notStarted') return true;
  if ((game.homeScore ?? 0) > 0 || (game.awayScore ?? 0) > 0) return true;
  return hasBeenPlayed(game, today);
}

/**
 * When the match was created, for ordering matches on the same day and time:
 * `createdAt`, else the timestamp in the id (`game_<ms>_...`), else 0.
 */
function creationOrder(id: string, game: AppState): number {
  const created = game.createdAt ? Date.parse(game.createdAt) : NaN;
  if (!Number.isNaN(created)) return created;
  const fromId = Number.parseInt(id.split('_')[1] ?? '', 10);
  return Number.isNaN(fromId) ? 0 : fromId;
}

/**
 * Nearest first by date, then by kick-off time (a match without a time after
 * the timed ones that day), then in the order the coach created them (R5).
 */
function compareFixtures(a: [string, AppState], b: [string, AppState]): number {
  const byDate = (a[1].gameDate || '').localeCompare(b[1].gameDate || '');
  if (byDate !== 0) return byDate;
  const ta = a[1].gameTime || '';
  const tb = b[1].gameTime || '';
  if (ta !== tb) {
    if (!ta) return 1;
    if (!tb) return -1;
    return ta.localeCompare(tb);
  }
  return creationOrder(a[0], a[1]) - creationOrder(b[0], b[1]);
}

/**
 * Played matches, newest first: by date, then by kick-off time (later first),
 * a match without a time after the timed ones that day, then the most recently
 * created first. Not simply `compareFixtures` reversed, which would put the
 * untimed match of a day first.
 */
function compareNewestFirst(a: [string, AppState], b: [string, AppState]): number {
  const byDate = (b[1].gameDate || '').localeCompare(a[1].gameDate || '');
  if (byDate !== 0) return byDate;
  const ta = a[1].gameTime || '';
  const tb = b[1].gameTime || '';
  if (ta !== tb) {
    if (!ta) return 1;
    if (!tb) return -1;
    return tb.localeCompare(ta);
  }
  return creationOrder(b[0], b[1]) - creationOrder(a[0], a[1]);
}

export interface HomeRecentGame {
  id: string;
  opponent: string;
  ourScore: number;
  theirScore: number;
  result: GameResult;
  date: string;
  isFriendly: boolean;
  /**
   * The town, and only the town.
   *
   * These cards are 108px wide and the opponent already truncates in them, so
   * a venue NAME here would be three characters and an ellipsis. A town is
   * short by nature and answers the question the card actually raises at a
   * glance - was that the away one - which the full name does not do better.
   */
  venueTown?: string;
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
  /**
   * The town the venue is in, taken from the pinned address.
   *
   * Worth its own line on an away fixture: the venue's name says which pitch,
   * the town says how far away the afternoon is - and a coach reading the card
   * on Thursday is asking the second question, not the first.
   */
  venueTown?: string;
  /** The written street address, for the travel row. */
  venueAddress?: string;
  fieldNumber?: string;
  /**
   * Turn-by-turn directions, or null when the venue was only typed.
   * Coordinates only - see mapsDirectionsUrl for why a name will not do.
   */
  mapsUrl: string | null;
  /** Whole days from today: 0 = today, 1 = tomorrow. Drives the countdown. */
  daysAway: number;
  /**
   * Whole days since its date, for a match that never kicked off and whose day
   * has passed (basic Home's "Siirrä päivää / Poista" card, R2). Absent otherwise.
   */
  daysOverdue?: number;
  /** Our side's name on this match ('' when none) - the basic Home card's title. */
  teamName?: string;
  /** How many players are in this match's squad (selected), for "N pelaajaa". */
  squadCount?: number;
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
   * When and where, the same facts the next-match card carries.
   *
   * The Jatka card sits in the same slot and showed only an opponent and a
   * score, so the two read as different kinds of thing when they are both
   * just "the match this screen is about".
   */
  date?: string;
  time?: string;
  venue?: string;
  venueTown?: string;
  /** The written street address, for the travel row of a match still to be played. */
  venueAddress?: string;
  fieldNumber?: string;
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
  /** The clock has started and the match has not reached full time. */
  inProgress?: boolean;
  /** The match has begun (see `hasMatchStarted`) - false for one still ahead. */
  started?: boolean;
}

/** Entity counts for the Joukkue / Kilpailut tab headers. */
export interface HomeCounts {
  players: number;
  teams: number;
  personnel: number;
  seasons: number;
  tournaments: number;
}

/**
 * One team's line on the Tilastot tab's "Joukkueet" card: its record over the
 * same club-season games as the hero, and its latest results.
 */
export interface HomeTeamRecord extends TeamRecord {
  /** The team's id, or '' for games that name no team ('legacy'). */
  teamId: string;
  /** Our side's name on the team's latest game - for a team no longer in the list. */
  fallbackName: string;
  /** The last five results, newest first. */
  form: GameResult[];
}

/**
 * One active league or tournament: the same facts the manager's card shows
 * (see CompetitionCard), with its matches and goals.
 */
export interface HomeCompetition extends CompetitionCardItem {
  id: string;
  games: number;
  goals: number;
}

export interface HomeSummary {
  /** The resumable game (current game id) as a card - null when none. */
  resume: HomeResumeGame | null;
  /**
   * The most recent match played, in the same shape as `resume`, for the top
   * card to fall back to.
   *
   * SEPARATE FROM `resume` on purpose. `resume` means "the match you have
   * open", and the recent-strip accent is keyed to that - blurring the two
   * would have the accent point at a match the coach never opened. This is
   * only ever the card's last resort, when there is no fixture and no current
   * game: deleting both used to leave the top of Home blank, and a card that
   * opens your latest match beats a prompt that opens nothing.
   */
  lastPlayed: HomeResumeGame | null;
  /**
   * Club-season record - null when season dates are not configured. It is the
   * current season's, or the previous season's (with its own label) while the
   * current one has no game yet.
   */
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
  /**
   * The hero's games split per team, most games first (Tilastot's "Joukkueet"
   * card). Empty when no season config or nothing played.
   */
  teamRecords?: HomeTeamRecord[];
  /** The same games split home / away - the card's view when only one team played. */
  homeAway?: { home: TeamRecord; away: TeamRecord } | null;
  /**
   * The active (not archived) leagues and tournaments, newest first - where
   * the Kilpailut rows' featured league / tournament comes from. Absent until
   * the entity data has loaded.
   */
  competitions?: {
    seasons: HomeCompetition[];
    tournaments: HomeCompetition[];
    /** The league Kilpailut names under its "Sarjat" row - see `featuredCompetition`. */
    featuredSeason: HomeCompetition | null;
    /** The tournament Kilpailut names under its "Turnaukset" row. */
    featuredTournament: HomeCompetition | null;
  };
  /** Every played game in scope (not capped like `recent`) - the basic Home's "Pelatut pelit · N". */
  playedCount?: number;
  /** Every game in scope, played or not - the basic Home's "Kaikki ottelut" row (R5). */
  gameCount?: number;
  /**
   * The nearest match whose day has passed without it kicking off (only with
   * `startedDecidesPlayed`): it stays on the basic card with "Siirrä päivää" and
   * "Poista" instead of turning into a 0-0 result (R2). Null when none.
   */
  overdue?: HomeUpcomingGame | null;
  /**
   * A match that has kicked off and not reached full time - the current game
   * when it is one, else the latest such match. It always wins the basic card
   * ("Jatka ottelua", R5). Null when none.
   */
  unfinished?: HomeResumeGame | null;
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
  /** Master roster - for the players count. */
  roster?: Player[];
  /**
   * Which team the dashboard is about: a team id, 'legacy' for games naming no
   * team, or 'all'.
   *
   * A coach with one team per competition was shown every team's games added
   * together - a goal difference summing squads that never played each other,
   * that no squad ever had. The record has to say
   * whose it is.
   */
  teamFilter?: string;
  /**
   * Basic layout (R2): whether a match was played is read off the match itself
   * (`hasMatchStarted`), never off its "played" flag. Every basic-layout
   * account was created under the new rules, so a past match with nothing
   * recorded really is one that never kicked off. The full layout keeps
   * trusting the flag for past matches: accounts there have history entered
   * by hand, where a 0-0 with nothing recorded may be a real result.
   */
  startedDecidesPlayed?: boolean;
  teamsCount?: number;
  personnelCount?: number;
  seasonsCount?: number;
  tournamentsCount?: number;
  /** Leagues and tournaments, for the Kilpailut tab's rows (archived ones are skipped). */
  seasons?: Season[];
  tournaments?: Tournament[];
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
      date: c.gameDate || undefined,
      time: c.gameTime || undefined,
      venue: c.gameLocation || undefined,
      venueTown: townFromAddress(c.locationAddress, c.gameLocation),
      venueAddress: c.locationAddress || undefined,
      fieldNumber: c.fieldNumber || undefined,
      mapsUrl: mapsDirectionsUrl(c.locationLat, c.locationLng, c.locationAddress),
      currentPeriod: c.currentPeriod,
      timeElapsedSeconds: c.timeElapsedInSeconds,
      inProgress: c.gameStatus === 'inProgress' || c.gameStatus === 'periodEnd',
      started: hasMatchStarted(c, opts.today),
    };
  }

  // --- Vuosi (current club season) record + per-team records ---
  let vuosi: HomeVuosi | null = null;
  let teamRecords: HomeTeamRecord[] = [];
  let homeAway: HomeSummary['homeAway'] = null;
  if (opts.hasConfiguredSeasonDates) {
    const gamesOfSeason = (seasonLabel: string): AppState[] =>
      filterGameIds(all, {
        playedOnly: true,
        teamFilter: opts.teamFilter ?? 'all',
        clubSeasonFilter: seasonLabel,
        clubSeasonStartDate: opts.clubSeasonStartDate,
        clubSeasonEndDate: opts.clubSeasonEndDate,
        activeTab: 'overall',
        includeFriendlies: false,
      })
        .map((id) => all[id])
        .filter(Boolean) as AppState[];

    let label = getClubSeasonForDate(opts.today, opts.clubSeasonStartDate, opts.clubSeasonEndDate);
    let seasonGames = gamesOfSeason(label);
    // A season that has not seen a game yet (the new one opens in the autumn,
    // the first fixture is weeks away) would read "0-0-0" and hide the record
    // the coach actually wants to see. Show the previous season - under its OWN
    // label - until the current one has a game; then it switches back by itself.
    if (seasonGames.length === 0) {
      const previousLabel = getClubSeasonForDate(
        oneYearBefore(opts.today),
        opts.clubSeasonStartDate,
        opts.clubSeasonEndDate,
      );
      if (previousLabel !== label && previousLabel !== 'off-season') {
        const previousGames = gamesOfSeason(previousLabel);
        if (previousGames.length > 0) {
          label = previousLabel;
          seasonGames = previousGames;
        }
      }
    }
    vuosi = { label, ...computeTeamRecord(seasonGames) };

    // Per team, over the SAME games as the record above (same season, team
    // scope, played-only, no friendlies), so the rows add up to the hero.
    const byTeam = new Map<string, AppState[]>();
    for (const g of seasonGames) {
      const key = g.teamId ?? '';
      const list = byTeam.get(key);
      if (list) list.push(g);
      else byTeam.set(key, [g]);
    }
    teamRecords = Array.from(byTeam, ([teamId, teamGames]) => {
      const newestFirst = teamGames
        .map((g): [string, AppState] => ['', g])
        .sort(compareNewestFirst)
        .map(([, g]) => g);
      return {
        teamId,
        fallbackName: newestFirst[0]?.teamName || '',
        form: newestFirst.slice(0, 5).map((g) => resolveGameResult(g)),
        ...computeTeamRecord(teamGames),
      };
    }).sort((a, b) => b.gamesPlayed - a.gamesPlayed || a.fallbackName.localeCompare(b.fallbackName));
    if (seasonGames.length > 0) {
      homeAway = {
        // Split the way computeTeamRecord reads the score: 'home' or not.
        home: computeTeamRecord(seasonGames.filter((g) => g.homeOrAway === 'home')),
        away: computeTeamRecord(seasonGames.filter((g) => g.homeOrAway !== 'home')),
      };
    }
  }

  // --- Recent strip ---
  const scoped = opts.teamFilter && opts.teamFilter !== 'all' ? opts.teamFilter : null;
  const inScope = (g: AppState): boolean => {
    if (!scoped) return true;
    return scoped === 'legacy' ? !(g.teamId ?? '') : g.teamId === scoped;
  };
  const strict = opts.startedDecidesPlayed === true;
  /**
   * Still ahead of the coach (R2): not begun, and either the basic layout (the
   * match decides) or dated today or later (a match created today with the
   * "played" flag on is not a result yet). Past matches in the full layout keep
   * trusting the flag - see `startedDecidesPlayed`.
   */
  const isAhead = (g: AppState): boolean => {
    if (!isUsableDate(g.gameDate) || hasMatchStarted(g, opts.today)) return false;
    return strict || g.gameDate >= opts.today || g.isPlayed === false;
  };
  const playedInScope = Object.entries(all)
    // Scoped too: showing another team's matches under this team's record is
    // the same confusion one line down.
    .filter(([, g]) => {
      if (!g || !g.gameDate || !inScope(g)) return false;
      if (strict) return hasMatchStarted(g, opts.today);
      return g.isPlayed !== false && !isAhead(g);
    });
  const playedCount = playedInScope.length;
  const recent: HomeRecentGame[] = playedInScope
    .sort(compareNewestFirst)
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
        venueTown: townFromAddress(g.locationAddress, g.gameLocation),
        isFriendly: g.isFriendly === true,
      };
    });

  const counts: HomeCounts = {
    // Active players only: archived ones (players who left) are not part of today's squad.
    players: opts.roster?.filter((p) => !p.archived).length ?? 0,
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

  const toFixture = ([id, g]: [string, AppState]): HomeUpcomingGame => ({
    id,
    opponent: g.opponentName || '',
    date: g.gameDate || '',
    time: g.gameTime || undefined,
    venue: g.gameLocation || undefined,
    venueTown: townFromAddress(g.locationAddress, g.gameLocation),
    venueAddress: g.locationAddress || undefined,
    fieldNumber: g.fieldNumber || undefined,
    mapsUrl: mapsDirectionsUrl(g.locationLat, g.locationLng, g.locationAddress),
    daysAway: daysBetween(opts.today, g.gameDate || ''),
    teamName: g.teamName || '',
    squadCount: g.selectedPlayerIds?.length ?? 0,
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
  });

  const upcomingAll: HomeUpcomingGame[] = Object.entries(all)
    .filter(([, g]) => {
      if (!g || !isUsableDate(g.gameDate) || g.gameDate < opts.today || !inScope(g)) return false;
      // A flagged-unplayed fixture keeps its place (as before); an unflagged
      // one joins it while it has not begun (R2).
      return g.isPlayed === false ? !strict || !hasMatchStarted(g, opts.today) : isAhead(g);
    })
    .sort(compareFixtures)
    .slice(0, recentLimit)
    .map(toFixture);

  const upcoming = upcomingAll[0] ?? null;

  // Basic layout only (R2): a match whose day passed without it kicking off -
  // the latest such, so the one the coach most likely still means to play.
  const overdueEntry = strict
    ? Object.entries(all)
        .filter(([, g]) => !!g && isUsableDate(g.gameDate) && g.gameDate < opts.today && inScope(g) && isAhead(g))
        .sort((a, b) => compareFixtures(b, a))[0]
    : undefined;
  const overdue: HomeUpcomingGame | null = overdueEntry
    ? { ...toFixture(overdueEntry), daysOverdue: daysBetween(overdueEntry[1].gameDate || '', opts.today) }
    : null;

  // A match under way, wherever it is (R5): the current game first.
  const isUnderWay = (g: AppState | undefined): boolean =>
    !!g && (g.gameStatus === 'inProgress' || g.gameStatus === 'periodEnd');
  let unfinished: HomeResumeGame | null = resume?.inProgress ? resume : null;
  if (!unfinished) {
    const latest = Object.entries(all)
      .filter(([, g]) => isUnderWay(g) && inScope(g))
      .sort((a, b) => compareFixtures(b, a))[0];
    if (latest) {
      const [id, g] = latest;
      unfinished = {
        id,
        opponent: g.opponentName || '',
        ourScore: g.homeOrAway === 'home' ? g.homeScore : g.awayScore,
        theirScore: g.homeOrAway === 'home' ? g.awayScore : g.homeScore,
        homeOrAway: g.homeOrAway,
        isPlayed: g.isPlayed !== false,
        date: g.gameDate || undefined,
        time: g.gameTime || undefined,
        venue: g.gameLocation || undefined,
        venueTown: townFromAddress(g.locationAddress, g.gameLocation),
        venueAddress: g.locationAddress || undefined,
        fieldNumber: g.fieldNumber || undefined,
        mapsUrl: mapsDirectionsUrl(g.locationLat, g.locationLng, g.locationAddress),
        currentPeriod: g.currentPeriod,
        timeElapsedSeconds: g.timeElapsedInSeconds,
        inProgress: true,
        started: true,
      };
    }
  }
  const gameCount = Object.values(all).filter((g) => !!g && inScope(g)).length;
  // The strip shows what comes AFTER the card, not including it. Repeating the
  // carded fixture directly beneath itself is the same duplication the accent
  // rule exists to avoid - and with only one fixture booked it means no strip
  // and no toggle at all, because there is nothing further ahead to show.
  const upcomingList = upcomingAll.slice(1);

  /**
   * The latest match played, for the top card when there is nothing else.
   *
   * Built from the same scoped, played set the recent strip uses, so it is the
   * card at the front of that strip - the coach's most recent match, not the
   * most recently CREATED one, which for a club booking fixtures ahead are
   * different games entirely.
   */
  const lastPlayedId = recent[0]?.id;
  const lastPlayedGame = lastPlayedId ? all[lastPlayedId] : undefined;
  const lastPlayed: HomeResumeGame | null = lastPlayedGame
    ? {
        id: lastPlayedId as string,
        opponent: lastPlayedGame.opponentName || '',
        ourScore: lastPlayedGame.homeOrAway === 'home' ? lastPlayedGame.homeScore : lastPlayedGame.awayScore,
        theirScore: lastPlayedGame.homeOrAway === 'home' ? lastPlayedGame.awayScore : lastPlayedGame.homeScore,
        homeOrAway: lastPlayedGame.homeOrAway,
        isPlayed: lastPlayedGame.isPlayed !== false,
        date: lastPlayedGame.gameDate || undefined,
        time: lastPlayedGame.gameTime || undefined,
        venue: lastPlayedGame.gameLocation || undefined,
        venueTown: townFromAddress(lastPlayedGame.locationAddress, lastPlayedGame.gameLocation),
        fieldNumber: lastPlayedGame.fieldNumber || undefined,
        // NO DIRECTIONS. The resume card offers them because the match is
        // still ahead of you; this one has already been played, and a button
        // routing a coach to a ground they came home from hours ago is noise
        // sitting where a useful control goes.
        mapsUrl: null,
        currentPeriod: lastPlayedGame.currentPeriod,
        timeElapsedSeconds: lastPlayedGame.timeElapsedInSeconds,
        started: hasMatchStarted(lastPlayedGame, opts.today),
      }
    : null;

  return {
    resume,
    lastPlayed,
    vuosi,
    recent,
    upcoming,
    upcomingList,
    counts,
    countsReady,
    teamRecords,
    homeAway,
    competitions: opts.seasons || opts.tournaments
      ? (() => {
          const seasons = activeCompetitions(opts.seasons ?? [], all, 'seasonId');
          const tournaments = activeCompetitions(opts.tournaments ?? [], all, 'tournamentId');
          return {
            seasons,
            tournaments,
            featuredSeason: featuredCompetition(seasons, 'season', opts.today),
            featuredTournament: featuredCompetition(tournaments, 'tournament', opts.today),
          };
        })()
      : undefined,
    playedCount,
    gameCount,
    overdue,
    unfinished,
  };
}

/**
 * The not-archived leagues or tournaments as Home cards, ordered as the
 * manager lists them (newest start date first, undated last, then by name).
 * Matches and goals are counted the way the manager's card counts them: every
 * game linked to it, and the goal events recorded in those games.
 */
function activeCompetitions(
  list: Array<Season | Tournament>,
  games: SavedGamesCollection,
  key: 'seasonId' | 'tournamentId',
): HomeCompetition[] {
  return list
    .filter((c) => !c.archived)
    .sort((a, b) => {
      if (a.startDate && b.startDate) {
        const byDate = b.startDate.localeCompare(a.startDate);
        if (byDate !== 0) return byDate;
      } else if (a.startDate) {
        return -1;
      } else if (b.startDate) {
        return 1;
      }
      return a.name.localeCompare(b.name, 'fi', { sensitivity: 'base' });
    })
    .map((c) => {
      const linked = Object.values(games).filter((g) => !!g && (g[key] ?? '') === c.id);
      return {
        id: c.id,
        name: c.name,
        clubSeason: c.clubSeason,
        gameType: c.gameType,
        gender: c.gender,
        startDate: c.startDate,
        endDate: c.endDate,
        series: 'series' in c ? c.series : undefined,
        games: linked.length,
        goals: linked.reduce((sum, g) => sum + (g.gameEvents?.filter((e) => e.type === 'goal').length ?? 0), 0),
      };
    });
}

/**
 * The one league or tournament Kilpailut names in its row's subtitle.
 *
 * League: the one running today (started, not ended), else the latest one that
 * has started, else the first listed. Tournament: the one on today, else the
 * NEXT one ahead (nearest start date), else the most recent one, else the
 * first listed - a coach looks at tournaments for what is coming up.
 *
 * `items` must be in `activeCompetitions` order (newest start date first,
 * undated last). Null only when there is none.
 */
export function featuredCompetition(
  items: HomeCompetition[],
  kind: 'season' | 'tournament',
  today: string,
): HomeCompetition | null {
  const day = (iso?: string) => (iso ? iso.slice(0, 10) : '');
  const started = (c: HomeCompetition) => !!c.startDate && day(c.startDate) <= today;
  // A tournament without an end date is a one-day event.
  const running = (c: HomeCompetition) =>
    started(c) && (c.endDate ? day(c.endDate) >= today : kind === 'season' || day(c.startDate) === today);
  const current = items.find(running);
  if (current) return current;
  if (kind === 'tournament') {
    // Newest first, so the LAST future one is the nearest.
    const ahead = items.filter((c) => !!c.startDate && day(c.startDate) > today);
    if (ahead.length > 0) return ahead[ahead.length - 1];
  }
  return items.find(started) ?? items[0] ?? null;
}

/** The same calendar day a year earlier (29 February clamps to the 28th). */
function oneYearBefore(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${String(y - 1).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(Math.min(d, 28)).padStart(2, '0')}`;
}

/**
 * The town out of a pinned address, when it adds something.
 *
 * Addresses come back as "street, town" or "street, town, region", so the town
 * is the second part. Returns nothing when the venue's own name already carries
 * it - "Savonlinna Areena, Savonlinna" says it twice and helps nobody - and
 * nothing at all for a venue that was typed rather than pinned, since then
 * there is no address to read it from.
 */
function townFromAddress(address?: string, venueName?: string): string | undefined {
  const parts = address?.split(',').map((p) => p.trim()).filter(Boolean);
  const town = parts && parts.length > 1 ? parts[1] : undefined;
  if (!town) return undefined;
  return venueName?.toLowerCase().includes(town.toLowerCase()) ? undefined : town;
}
