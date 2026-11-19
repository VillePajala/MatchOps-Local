/**
 * What the New Game form starts with (Onboarding v3, decisions D6, D7 and D26).
 *
 * A coach who plays every week should not retype the same match every week. The
 * form opens on the team they coach, with all of that team's players ticked and
 * the settings of that team's previous game - VALUES ONLY: every field stays
 * editable, and nothing here is stored anywhere new.
 *
 * Pure functions so the rules can be tested without the 1,900-line modal:
 *
 * - {@link pickDefaultTeamId}: which team the form opens on.
 * - {@link previousGameOfTeam}: the game whose settings are carried.
 * - {@link inferPresetFromSnapPoints}: the formation a saved game was played in.
 *   Games do not store a formation id, only the snap points it produced.
 * - {@link resolveFormation}: the single precedence for the format shown.
 * - {@link buildNewGameDefaults}: everything above, combined.
 *
 * NOT CARRIED, deliberately: opponent, date, time, played, friendly, personnel
 * and pitch. Each of those differs from one match to the next, and a stale value
 * that looks filled in is worse than an empty field.
 *
 * @module newGameDefaults
 */
import type { AppState, Point, Season, Team, Tournament, GameType } from '@/types';
import {
  FORMATION_PRESETS,
  getDefaultPresetIdForSize,
  getPresetById,
  getRecommendedFieldSize,
  type FieldSize,
  type FormationPreset,
} from '@/config/formationPresets';
import { officialFieldSize } from '@/config/officialFieldSize';
import { isFieldPosition } from '@/utils/formations';
import { DEFAULT_GAME_ID } from '@/config/constants';
import { DEFAULT_PERIODS, suggestPeriodsForAgeGroup } from '@/config/formatsByAgeGroup';

/** The parts of a saved game the defaults read. Everything optional: old games lack most of it. */
export type DefaultsSourceGame = Partial<
  Pick<
    AppState,
    | 'teamId'
    | 'createdAt'
    | 'updatedAt'
    | 'numberOfPeriods'
    | 'periodDurationMinutes'
    | 'homeOrAway'
    | 'gameLocation'
    | 'locationLat'
    | 'locationLng'
    | 'locationAddress'
    | 'seasonId'
    | 'tournamentId'
    | 'tournamentSeriesId'
    | 'ageGroup'
    | 'gameType'
    | 'formationSnapPoints'
    | 'playersOnField'
  >
>;

export type GamesInput<G extends DefaultsSourceGame = DefaultsSourceGame> =
  | Record<string, G | null | undefined>
  | null
  | undefined;

/** Snap-point tolerance when recognising a preset (positions are stored as floats). */
const SNAP_TOLERANCE = 0.01;

/** Period length when nothing better is known (D7): 2 x 15, from the shared age-group table. */
export const FALLBACK_PERIODS: { numberOfPeriods: 1 | 2; periodMinutes: number } = {
  numberOfPeriods: DEFAULT_PERIODS.numberOfPeriods,
  periodMinutes: DEFAULT_PERIODS.periodMinutes,
};

/**
 * Newest first, by when the game was CREATED (falling back to its last update) -
 * the same order the form's "Repeat last game" has always used. Not by match
 * date: a fixture booked weeks ahead says nothing about which team the coach is
 * working with today. The scratch workspace is never a game.
 */
export function gamesNewestFirst<G extends DefaultsSourceGame>(games: GamesInput<G>): G[] {
  return Object.entries(games ?? {})
    .filter((entry): entry is [string, G] => entry[0] !== DEFAULT_GAME_ID && !!entry[1])
    .map(([, g]) => g)
    .sort((a, b) => (b.createdAt ?? b.updatedAt ?? '').localeCompare(a.createdAt ?? a.updatedAt ?? ''));
}

const activeTeams = (teams: readonly Team[]) => teams.filter((t) => !t.archived);

/**
 * Which team the form opens on.
 *
 * - The team of the most recent game, while that team still exists and is not archived.
 * - `null` when the most recent game had no team: about a third of coaches play
 *   without one, and guessing a team for them would tick the wrong players (D26).
 * - With no usable game, the only active team when there is exactly one; else `null`.
 */
export function pickDefaultTeamId(teams: readonly Team[], games: GamesInput): string | null {
  const active = activeTeams(teams);
  const latest = gamesNewestFirst(games)[0];
  if (latest) {
    const teamId = latest.teamId ?? '';
    if (!teamId) return null;
    if (active.some((t) => t.id === teamId)) return teamId;
    // The last game's team was archived or deleted: fall through.
  }
  return active.length === 1 ? active[0].id : null;
}

/** The newest game of a team; `null` team = the newest game played without one. */
export function previousGameOfTeam<G extends DefaultsSourceGame>(games: GamesInput<G>, teamId: string | null): G | null {
  const wanted = teamId ?? '';
  return gamesNewestFirst(games).find((g) => (g.teamId ?? '') === wanted) ?? null;
}

const near = (a: Point, b: { relX: number; relY: number }) =>
  Math.abs(a.relX - b.relX) <= SNAP_TOLERANCE && Math.abs(a.relY - b.relY) <= SNAP_TOLERANCE;

/** How many of `positions` find a distinct point within tolerance. */
function matchedCount(positions: ReadonlyArray<{ relX: number; relY: number }>, points: readonly Point[]): number {
  const used = new Set<number>();
  let matched = 0;
  for (const pos of positions) {
    const index = points.findIndex((p, i) => !used.has(i) && near(p, pos));
    if (index >= 0) {
      used.add(index);
      matched += 1;
    }
  }
  return matched;
}

/**
 * The formation preset a saved game was set up in, read off its snap points.
 *
 * - FULL match: the game's field points are exactly a preset's positions. Two
 *   presets never share every position, so at most one matches.
 * - PREFIX match: a squad smaller than the preset fills only its first slots, so
 *   every field point belongs to the preset but some slots are empty. Accepted
 *   only when exactly one preset fits; anything else is a guess.
 * - Empty or unrecognised points: `null`.
 *
 * Sub slots and the keeper spot are not field positions (`isFieldPosition`), so
 * a game's stored points compare like for like with a preset's.
 */
export function inferPresetFromSnapPoints(points: readonly Point[] | null | undefined): FormationPreset | null {
  const fieldPoints = (points ?? []).filter(isFieldPosition);
  if (fieldPoints.length === 0) return null;

  const full = FORMATION_PRESETS.find(
    (p) => p.positions.length === fieldPoints.length && matchedCount(p.positions, fieldPoints) === fieldPoints.length,
  );
  if (full) return full;

  const prefix = FORMATION_PRESETS.filter(
    (p) =>
      fieldPoints.length < p.positions.length &&
      matchedCount(p.positions.slice(0, fieldPoints.length), fieldPoints) === fieldPoints.length,
  );
  return prefix.length === 1 ? prefix[0] : null;
}

/** Field size from how many players stood ON the pitch (sideline subs excluded). */
function fieldSizeFromOnPitch(game: DefaultsSourceGame | null): FieldSize | null {
  const onPitch = (game?.playersOnField ?? []).filter(
    (p) => typeof p.relX === 'number' && typeof p.relY === 'number' && p.relX > 0.05 && p.relX < 0.95,
  ).length;
  return onPitch >= 3 ? getRecommendedFieldSize(onPitch) : null;
}

const FIELD_SIZE_SET: ReadonlySet<string> = new Set(['3v3', '4v4', '5v5', '8v8', '11v11']);
const asFieldSize = (value: string | null | undefined): FieldSize | null =>
  value && FIELD_SIZE_SET.has(value) ? (value as FieldSize) : null;

export type FormationSource =
  | 'explicit'
  | 'planPrefill'
  | 'previousPreset'
  | 'previousOnPitch'
  | 'storedFormat'
  | 'official'
  | 'playerCount';

export interface ResolvedFormation {
  /** The preset to show and create with. */
  presetId: string;
  fieldSize: FieldSize;
  source: FormationSource;
}

export interface ResolveFormationInput {
  /** The coach picked one in the form. */
  explicitPresetId?: string | null;
  /** Snap points of an active plan prefill; the plan's shape beats any default. */
  planSnapPoints?: readonly Point[] | null;
  /** The team's previous game (see {@link previousGameOfTeam}). */
  previousGame?: DefaultsSourceGame | null;
  /** The setup wizard's Pelimuoto answer. */
  storedFormat?: string | null;
  ageGroup?: string;
  sport?: GameType;
  /** The game's own date (ISO), so a fixture next season gets next season's format. */
  gameDate?: string;
  playerCount: number;
  /** The coach has changed the player selection by hand. */
  playersTouched: boolean;
}

/**
 * The format the form shows, in ONE precedence:
 * explicit pick -> plan prefill -> preset inferred from the team's previous game ->
 * on-pitch count of that game -> the wizard's stored format -> the official
 * format for the age group -> the player count.
 *
 * The player count is used ONLY after the coach has edited the selection. A
 * defaulted selection is the whole team: 14 pre-ticked players would read as
 * 11v11 and auto-place an 8v8 team on a full pitch. Untouched and with nothing
 * else to go on, the answer is `null` - the form says "Automatic".
 */
export function resolveFormation(input: ResolveFormationInput): ResolvedFormation | null {
  const fromPreset = (preset: FormationPreset | null | undefined, source: FormationSource): ResolvedFormation | null =>
    preset ? { presetId: preset.id, fieldSize: preset.fieldSize, source } : null;
  const fromSize = (size: FieldSize | null, source: FormationSource): ResolvedFormation | null =>
    size ? { presetId: getDefaultPresetIdForSize(size), fieldSize: size, source } : null;

  return (
    fromPreset(input.explicitPresetId ? getPresetById(input.explicitPresetId) : null, 'explicit') ??
    (input.planSnapPoints && input.planSnapPoints.length > 0
      ? fromPreset(inferPresetFromSnapPoints(input.planSnapPoints), 'planPrefill')
      : null) ??
    fromPreset(inferPresetFromSnapPoints(input.previousGame?.formationSnapPoints), 'previousPreset') ??
    fromSize(fieldSizeFromOnPitch(input.previousGame ?? null), 'previousOnPitch') ??
    fromSize(asFieldSize(input.storedFormat), 'storedFormat') ??
    fromSize(asFieldSize(officialFieldSize(input.ageGroup, input.sport, input.gameDate)?.fieldSize), 'official') ??
    (input.playersTouched && input.playerCount > 0
      ? fromSize(getRecommendedFieldSize(input.playerCount), 'playerCount')
      : null)
  );
}

/**
 * Period count and length for an age group when there is no previous game (D7):
 * the shared age-group table (`config/formatsByAgeGroup`, the same one the setup
 * wizard reads) where it knows the age group, else 2 x 15.
 */
export function periodsForAgeGroup(
  ageGroup: string | undefined,
  sport: GameType | undefined,
): { numberOfPeriods: 1 | 2; periodMinutes: number } {
  const { numberOfPeriods, periodMinutes } = suggestPeriodsForAgeGroup(ageGroup, sport);
  return { numberOfPeriods, periodMinutes };
}

export interface VenueDefault {
  name: string;
  latitude?: number;
  longitude?: number;
  address?: string;
}

/**
 * The venue of the team's newest game played on the SAME side (D26): a home
 * game's ground says nothing about where an away game is played.
 */
export function venueFor(
  games: GamesInput,
  teamId: string | null,
  homeOrAway: 'home' | 'away',
): VenueDefault | null {
  const wanted = teamId ?? '';
  const game = gamesNewestFirst(games).find(
    (g) => (g.teamId ?? '') === wanted && (g.homeOrAway ?? 'home') === homeOrAway,
  );
  const name = game?.gameLocation?.trim();
  if (!game || !name) return null;
  return {
    name,
    latitude: game.locationLat,
    longitude: game.locationLng,
    address: game.locationAddress,
  };
}

export interface NewGameDefaults {
  teamId: string | null;
  /** The game the settings below came from, or null. */
  previousGame: DefaultsSourceGame | null;
  /**
   * Periods to set, or null to keep what the competition applied. Null only when
   * there is no previous game and the competition names its own length.
   */
  periods: { numberOfPeriods: 1 | 2; periodMinutes: number } | null;
  homeOrAway: 'home' | 'away' | null;
  venue: VenueDefault | null;
  /** A competition to select, validated against the loaded, non-archived lists. */
  competition:
    | { kind: 'season'; id: string }
    | { kind: 'tournament'; id: string; seriesId: string | null }
    | null;
  /** Set only from the previous game; otherwise the competition / wizard answer stands. */
  ageGroup: string | null;
  gameType: GameType | null;
}

export interface BuildNewGameDefaultsInput {
  teams: readonly Team[];
  games: GamesInput;
  seasons: readonly Season[];
  tournaments: readonly Tournament[];
  /** The age group the form already holds (wizard answer), for the period table. */
  fallbackAgeGroup?: string;
}

/** The previous game's competition, only if it is still there and not archived. */
function carriedCompetition(
  game: DefaultsSourceGame | null,
  seasons: readonly Season[],
  tournaments: readonly Tournament[],
): NewGameDefaults['competition'] {
  if (!game) return null;
  const seasonId = game.seasonId ?? '';
  if (seasonId && seasons.some((s) => s.id === seasonId && !s.archived)) {
    return { kind: 'season', id: seasonId };
  }
  const tournamentId = game.tournamentId ?? '';
  const tournament = tournamentId ? tournaments.find((t) => t.id === tournamentId && !t.archived) : undefined;
  if (tournament) {
    const seriesId = game.tournamentSeriesId ?? '';
    const seriesStillThere = !!seriesId && (tournament.series ?? []).some((s) => s.id === seriesId);
    return { kind: 'tournament', id: tournament.id, seriesId: seriesStillThere ? seriesId : null };
  }
  return null;
}

/** The competition the team is bound to, if it is still available. */
function boundCompetition(
  team: Team | undefined,
  seasons: readonly Season[],
  tournaments: readonly Tournament[],
): Season | Tournament | null {
  if (!team) return null;
  if (team.boundSeasonId) return seasons.find((s) => s.id === team.boundSeasonId && !s.archived) ?? null;
  if (team.boundTournamentId) return tournaments.find((t) => t.id === team.boundTournamentId && !t.archived) ?? null;
  return null;
}

/**
 * Everything the form starts with, from the data already loaded.
 *
 * Periods: the previous game's; with none, the competition's own length when it
 * names one, else the age-group table ({@link periodsForAgeGroup}).
 */
export function buildNewGameDefaults(input: BuildNewGameDefaultsInput): NewGameDefaults {
  const teamId = pickDefaultTeamId(input.teams, input.games);
  const previousGame = previousGameOfTeam(input.games, teamId);
  const competition = carriedCompetition(previousGame, input.seasons, input.tournaments);

  let periods: NewGameDefaults['periods'];
  if (previousGame && typeof previousGame.periodDurationMinutes === 'number' && previousGame.periodDurationMinutes > 0) {
    periods = {
      numberOfPeriods: previousGame.numberOfPeriods === 1 ? 1 : 2,
      periodMinutes: previousGame.periodDurationMinutes,
    };
  } else {
    const team = input.teams.find((t) => t.id === teamId);
    const competitionEntity =
      competition?.kind === 'season'
        ? input.seasons.find((s) => s.id === competition.id)
        : competition?.kind === 'tournament'
          ? input.tournaments.find((t) => t.id === competition.id)
          : boundCompetition(team, input.seasons, input.tournaments);
    if (competitionEntity?.periodDuration) {
      periods = null; // The competition's own length, applied with it, stands.
    } else {
      const ageGroup =
        previousGame?.ageGroup || competitionEntity?.ageGroup || team?.ageGroup || input.fallbackAgeGroup;
      const sport = previousGame?.gameType ?? competitionEntity?.gameType ?? team?.gameType;
      periods = periodsForAgeGroup(ageGroup, sport);
    }
  }

  const homeOrAway = previousGame ? (previousGame.homeOrAway === 'away' ? 'away' : 'home') : null;

  return {
    teamId,
    previousGame,
    periods,
    homeOrAway,
    venue: homeOrAway ? venueFor(input.games, teamId, homeOrAway) : null,
    competition,
    ageGroup: previousGame?.ageGroup || null,
    gameType: previousGame?.gameType ?? null,
  };
}
