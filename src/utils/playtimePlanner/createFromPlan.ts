/**
 * Playing-Time Planner - create real games straight from a plan.
 *
 * Two entry points share this module: "Luo ottelu" on one planned game (the
 * new-game form, prefilled) and "Luo kaikki pelit" (one sheet for every
 * planned game not created yet). A PlanGame knows its format and line-up but
 * nothing about the fixture, so the coach supplies opponent / date / time /
 * venue per game and team / competition / game type once.
 *
 * Pure except `createGamesFromPlan`, whose storage is injected so the order of
 * operations, duplicate protection and failure reporting are unit-tested
 * without a DataStore.
 */

import type { GameType, Gender, Player, Season, Team, Tournament } from '@/types';
import { AGE_GROUPS, LEVELS } from '@/config/gameOptions';
import { CUSTOM_LEAGUE_ID } from '@/config/leagues';
import type { StartNewGameRequest } from '@/components/HomePage/utils/newGameHandlers';
import { VALIDATION_LIMITS } from '@/config/validationLimits';
import { activePlayers } from '@/utils/gamePlayerList';
import { buildPrefillFromPlan } from './prefill';
import type { PlanLinksCollection } from './planLinks';
import type { PlanGame, PlaytimePlan } from './types';

/**
 * Real game id per planned game, for games that STILL EXIST. A link whose game
 * was deleted (or never synced here) does not count - the planned game is then
 * free to be created again. When several games were created from one planned
 * game (possible through the new-game form's own plan picker), the newest wins.
 */
export function createdGameIdsForPlan(
  games: Record<string, unknown>,
  links: PlanLinksCollection,
  planId: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [gameId, link] of Object.entries(links)) {
    if (link.planId !== planId) continue;
    if (!games[gameId]) continue;
    const prev = out[link.planGameId];
    if (!prev || gameIdTime(gameId) >= gameIdTime(prev)) out[link.planGameId] = gameId;
  }
  return out;
}

/** The ms timestamp in a `game_<ms>_<rand>` id (0 when absent). */
const gameIdTime = (id: string): number => {
  const n = Number.parseInt(id.split('_')[1] ?? '', 10);
  return Number.isNaN(n) ? 0 : n;
};

/** The plan's games that have no existing real game yet, in plan order. */
export function notCreatedPlanGames(plan: PlaytimePlan, created: Record<string, string>): PlanGame[] {
  return plan.games.filter((g) => !created[g.id]);
}

/** "Peli 3" / "Game 3" / "Ottelu 3" - the planner's default labels, not a team name. */
const PLACEHOLDER_LABEL = /^(peli|game|ottelu|match)\s*\d*$/i;

/** True for the planner's default game labels ("Peli 3"), which name no opponent. */
export function isPlaceholderLabel(label: string): boolean {
  const trimmed = label.trim();
  return !trimmed || PLACEHOLDER_LABEL.test(trimmed);
}

/** A trailing "(koti)" / "(vieras)" / "(home)" / "(away)" - the side, not part of a name. */
const SIDE_SUFFIX = /\s*\((koti|vieras|home|away)\)\s*$/i;

export interface LabelOpponent {
  /** The opponent to start from, or '' when the label names none. */
  opponent: string;
  /** The side the label states, when it states one. */
  homeOrAway?: 'home' | 'away';
}

/**
 * What a planned game's label says about the fixture. Planners often label
 * games by opponent ("HJK", "PePo / Valkoinen (koti)"), so a named label
 * starts the opponent field - without its "(koti)"/"(vieras)" suffix, which
 * sets home/away instead. Nothing is prefilled from a default label ("Peli 2")
 * or from a label that is the coach's own team: a match against yourself
 * helps nobody.
 */
export function opponentFromLabel(label: string, ownTeamNames: readonly string[] = []): LabelOpponent {
  const trimmed = label.trim();
  const side = SIDE_SUFFIX.exec(trimmed)?.[1]?.toLowerCase();
  const homeOrAway = side === 'koti' || side === 'home' ? 'home' : side ? 'away' : undefined;
  const name = trimmed.replace(SIDE_SUFFIX, '').trim();
  const own = new Set(ownTeamNames.map((n) => n.trim().toLocaleLowerCase()).filter(Boolean));
  const opponent =
    isPlaceholderLabel(name) || own.has(name.toLocaleLowerCase())
      ? ''
      : name.slice(0, VALIDATION_LIMITS.TEAM_NAME_MAX);
  return homeOrAway ? { opponent, homeOrAway } : { opponent };
}

/** The opponent part of `opponentFromLabel`. */
export function defaultOpponentFromLabel(label: string, ownTeamNames: readonly string[] = []): string {
  return opponentFromLabel(label, ownTeamNames).opponent;
}

/** Choices made once for every game in the batch. */
export interface PlanBatchShared {
  teamId: string | null;
  /** The home side's name (the team's name, or typed when no team is chosen). */
  teamName: string;
  seasonId: string | null;
  tournamentId: string | null;
  tournamentSeriesId: string | null;
  tournamentLevel: string;
  ageGroup: string;
  gameType: GameType;
  gender?: Gender;
  leagueId: string;
  customLeagueName: string;
}

/** One planned game's fixture details. */
export interface PlanBatchRow {
  planGameId: string;
  opponentName: string;
  /** YYYY-MM-DD */
  gameDate: string;
  /** HH:MM, or '' when not known yet (tournament times often are not). */
  gameTime: string;
  /** What the coach calls the venue (the stored, displayed location). */
  gameLocation: string;
  /** The venue's map pin and street address, set only by picking (VenueInput). */
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
  homeOrAway: 'home' | 'away';
}

export type PlanBatchFieldError = 'required' | 'tooLong' | 'invalid';

export interface PlanBatchRowErrors {
  opponentName?: PlanBatchFieldError;
  gameDate?: PlanBatchFieldError;
  gameTime?: PlanBatchFieldError;
  /** The planned game itself has no usable length (validateGame needs one). */
  periodMinutes?: PlanBatchFieldError;
}

export interface PlanBatchValidation {
  ok: boolean;
  teamName?: PlanBatchFieldError;
  rows: Record<string, PlanBatchRowErrors>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

const isRealDate = (iso: string): boolean => {
  if (!ISO_DATE.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/**
 * Check every row BEFORE anything is created, against the same required fields
 * the stores enforce (validateGame: teamName, opponentName, gameDate,
 * periodDurationMinutes) plus their length limits - so a batch never stops
 * half-way on a validation throw and leaves some games created.
 */
export function validatePlanBatch(
  plan: PlaytimePlan,
  shared: PlanBatchShared,
  rows: PlanBatchRow[],
): PlanBatchValidation {
  const result: PlanBatchValidation = { ok: true, rows: {} };
  const teamName = shared.teamName.trim();
  if (!teamName) result.teamName = 'required';
  else if (teamName.length > VALIDATION_LIMITS.TEAM_NAME_MAX) result.teamName = 'tooLong';

  const gamesById = new Map(plan.games.map((g) => [g.id, g]));
  for (const row of rows) {
    const errors: PlanBatchRowErrors = {};
    const opponent = row.opponentName.trim();
    if (!opponent) errors.opponentName = 'required';
    else if (opponent.length > VALIDATION_LIMITS.TEAM_NAME_MAX) errors.opponentName = 'tooLong';
    if (!row.gameDate) errors.gameDate = 'required';
    else if (!isRealDate(row.gameDate)) errors.gameDate = 'invalid';
    if (row.gameTime && !HH_MM.test(row.gameTime)) errors.gameTime = 'invalid';
    const planGame = gamesById.get(row.planGameId);
    if (!planGame || !(planGame.periodMinutes > 0) || !(planGame.numberOfPeriods > 0)) {
      errors.periodMinutes = 'invalid';
    }
    if (Object.keys(errors).length > 0) result.rows[row.planGameId] = errors;
  }
  if (result.teamName || Object.keys(result.rows).length > 0) result.ok = false;
  return result;
}

/**
 * The new-game request for one planned game: the plan's line-up + subs placed
 * exactly like the new-game form's "prefill from plan", the squad limited to
 * players still in the roster, and the game linked back to the plan.
 */
export function buildPlanGameRequest(
  plan: PlaytimePlan,
  planGame: PlanGame,
  shared: PlanBatchShared,
  row: PlanBatchRow,
  roster: Player[],
): StartNewGameRequest {
  // Same roster the new-game form offers: archived players are not pickable.
  const pickable = activePlayers(roster);
  const prefill = buildPrefillFromPlan(plan, planGame, pickable);
  return {
    initialSelectedPlayerIds: prefill.selectedPlayerIds,
    homeTeamName: shared.teamName.trim(),
    opponentName: row.opponentName.trim(),
    gameDate: row.gameDate,
    gameLocation: row.gameLocation.trim(),
    fieldNumber: '',
    // The venue's pin + street address, passed on exactly as the new-game form does.
    locationLat: row.locationLat,
    locationLng: row.locationLng,
    locationAddress: row.locationAddress,
    gameTime: row.gameTime,
    seasonId: shared.seasonId,
    tournamentId: shared.tournamentId,
    numPeriods: planGame.numberOfPeriods === 1 ? 1 : 2,
    periodDuration: planGame.periodMinutes,
    homeOrAway: row.homeOrAway,
    demandFactor: 1,
    ageGroup: shared.ageGroup,
    tournamentLevel: shared.tournamentLevel,
    tournamentSeriesId: shared.tournamentSeriesId,
    // Booked ahead: a fixture that has not happened yet is never "played"
    // (a played 0-0 would count as a draw in the season record).
    isPlayed: false,
    isFriendly: false,
    teamId: shared.teamId,
    availablePlayersForGame: pickable,
    selectedPersonnelIds: [],
    leagueId: shared.leagueId,
    customLeagueName: shared.customLeagueName,
    gameType: shared.gameType,
    gender: shared.gender,
    formationPresetId: planGame.formationId,
    prefill: {
      playersOnField: [...prefill.playersOnField, ...prefill.sidelinePlayers],
      plannedSubs: prefill.plannedSubs,
      formationSnapPoints: prefill.formationSnapPoints,
      sourcePlanId: plan.id,
      sourcePlanGameId: planGame.id,
    },
  };
}

export interface CreateGamesFromPlanDeps {
  getAllGames: () => Promise<Record<string, unknown>>;
  getAllPlanLinks: () => Promise<PlanLinksCollection>;
  /** Persist one game (+ its link). `createdAtMs` keeps the plan's order. Null = failed, nothing left behind. */
  createGame: (request: StartNewGameRequest, createdAtMs: number) => Promise<string | null>;
  now?: () => number;
}

export interface CreateGamesFromPlanResult {
  created: { planGameId: string; gameId: string }[];
  /** Planned games whose creation failed (the caller keeps their inputs). */
  failed: string[];
  /** Planned games that already had a game by the time the batch ran. */
  skipped: string[];
}

/**
 * Create a game for each row, in the plan's game order. Validates first and
 * throws on invalid input (callers validate and show errors before this).
 * Duplicates are re-checked against FRESH storage, not the sheet's snapshot: a
 * game created meanwhile (another device, the new-game form) is skipped, never
 * created twice. One failure does not stop the others.
 */
export async function createGamesFromPlan(
  deps: CreateGamesFromPlanDeps,
  plan: PlaytimePlan,
  shared: PlanBatchShared,
  rows: PlanBatchRow[],
  roster: Player[],
): Promise<CreateGamesFromPlanResult> {
  const validation = validatePlanBatch(plan, shared, rows);
  if (!validation.ok) throw new Error('createGamesFromPlan: invalid input');

  const [games, links] = await Promise.all([deps.getAllGames(), deps.getAllPlanLinks()]);
  const alreadyCreated = createdGameIdsForPlan(games, links, plan.id);
  const order = new Map(plan.games.map((g, i) => [g.id, i]));
  const ordered = [...rows].sort((a, b) => (order.get(a.planGameId) ?? 0) - (order.get(b.planGameId) ?? 0));

  const result: CreateGamesFromPlanResult = { created: [], failed: [], skipped: [] };
  const seen = new Set<string>();
  const base = (deps.now ?? Date.now)();
  let step = 0;
  for (const row of ordered) {
    const planGame = plan.games.find((g) => g.id === row.planGameId);
    if (!planGame) {
      result.failed.push(row.planGameId);
      continue;
    }
    if (alreadyCreated[row.planGameId] || seen.has(row.planGameId)) {
      result.skipped.push(row.planGameId);
      continue;
    }
    seen.add(row.planGameId);
    let gameId: string | null = null;
    try {
      gameId = await deps.createGame(buildPlanGameRequest(plan, planGame, shared, row, roster), base + step);
    } catch {
      gameId = null;
    }
    step += 1;
    if (gameId) result.created.push({ planGameId: row.planGameId, gameId });
    else result.failed.push(row.planGameId);
  }
  return result;
}

/**
 * Game id -> its plan and position in that plan, for Home's next-game order
 * (same-day games of one plan follow the plan's order). Links to a planned
 * game that no longer exists are left out.
 */
export function planGameOrder(
  links: PlanLinksCollection,
  plans: Record<string, PlaytimePlan>,
): Record<string, { planId: string; index: number }> {
  const out: Record<string, { planId: string; index: number }> = {};
  for (const [gameId, link] of Object.entries(links)) {
    const index = plans[link.planId]?.games.findIndex((g) => g.id === link.planGameId) ?? -1;
    if (index >= 0) out[gameId] = { planId: link.planId, index };
  }
  return out;
}

/** The batch sheet's competition choice: none, one league, or one tournament (+ series). */
export type PlanBatchCompetition =
  | { kind: 'none' }
  | { kind: 'season'; id: string }
  | { kind: 'tournament'; id: string; seriesId: string | null };

/** The competition a team is bound to, as the batch sheet's starting choice. */
export function teamDefaultCompetition(team: Team | undefined, tournaments: Tournament[]): PlanBatchCompetition {
  if (team?.boundSeasonId) return { kind: 'season', id: team.boundSeasonId };
  if (team?.boundTournamentId) {
    const series = validSeries(tournaments.find((tt) => tt.id === team.boundTournamentId));
    const bound = series.find((se) => se.id === team.boundTournamentSeriesId);
    return { kind: 'tournament', id: team.boundTournamentId, seriesId: bound?.id ?? series[0]?.id ?? null };
  }
  return { kind: 'none' };
}

/** A tournament's series the app can show (level from LEVELS), like the new-game form. */
export function validSeries(tournament: Tournament | undefined): { id: string; level: string }[] {
  return tournament?.series?.filter((se) => LEVELS.includes(se.level)) ?? [];
}

/** The game type a competition (else the team) implies; soccer when neither says. */
export function defaultGameType(
  competition: PlanBatchCompetition,
  team: Team | undefined,
  seasons: Season[],
  tournaments: Tournament[],
): GameType {
  const comp =
    competition.kind === 'season'
      ? seasons.find((se) => se.id === competition.id)
      : competition.kind === 'tournament'
        ? tournaments.find((tt) => tt.id === competition.id)
        : undefined;
  return comp?.gameType ?? team?.gameType ?? 'soccer';
}

/**
 * The batch's shared game fields from the sheet's choices - the same fields
 * the new-game form copies from a picked league / tournament (age group,
 * league, gender, series level). An age group the stores would reject is
 * dropped rather than failing every game.
 */
export function buildBatchShared(input: {
  team: Team | undefined;
  /** Typed home-side name, used when no team is chosen. */
  teamName: string;
  competition: PlanBatchCompetition;
  gameType: GameType;
  seasons: Season[];
  tournaments: Tournament[];
}): PlanBatchShared {
  const { team, competition, seasons, tournaments } = input;
  const season = competition.kind === 'season' ? seasons.find((se) => se.id === competition.id) : undefined;
  const tournament =
    competition.kind === 'tournament' ? tournaments.find((tt) => tt.id === competition.id) : undefined;
  const series =
    competition.kind === 'tournament' && competition.seriesId
      ? validSeries(tournament).find((se) => se.id === competition.seriesId)
      : undefined;
  const rawAge = season?.ageGroup || tournament?.ageGroup || team?.ageGroup || '';
  const leagueId = season?.leagueId ?? '';
  return {
    teamId: team?.id ?? null,
    teamName: team ? team.name : input.teamName,
    seasonId: season?.id ?? null,
    tournamentId: tournament?.id ?? null,
    tournamentSeriesId: series?.id ?? null,
    tournamentLevel: series?.level ?? '',
    ageGroup: AGE_GROUPS.includes(rawAge) ? rawAge : '',
    gameType: input.gameType,
    gender: season?.gender ?? tournament?.gender,
    leagueId,
    customLeagueName: leagueId === CUSTOM_LEAGUE_ID ? season?.customLeagueName ?? '' : '',
  };
}
