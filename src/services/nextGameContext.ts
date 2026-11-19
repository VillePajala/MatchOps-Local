/**
 * What basic Home's "Uusi ottelu" knows before the coach answers "Milloin
 * seuraava peli?" (review R1): the team, its players, the format and the game
 * length - everything `createNextGamePair` needs except the date and opponent.
 *
 * The setup wizard has these in hand; Home has to read them back from the
 * account. Pure: the caller reads the data, this decides. Every value comes
 * from something the coach already set, nearest first:
 *
 *   team      the only team; with several, the one of the latest game
 *   players   the active roster (one team or none); a team's own roster when
 *             there are several teams
 *   length    the team's latest game, else its latest plan, else the age
 *             group's table value (2 x 15 when unknown)
 *   format    the team's latest plan, else the wizard's answer, else the age
 *             group's suggestion, else what the squad size fills
 *   sport/age the team, else its latest game, else the wizard's answer
 */

import type { AppState, GameType, Player, SavedGamesCollection, Team, TeamPlayer } from '@/types';
import type { NextGamePairInput } from '@/services/nextGamePair';
import { FIELD_SIZES, getPresetById, getRecommendedFieldSize, type FieldSize } from '@/config/formationPresets';
import { suggestFormatForAgeGroup, suggestPeriodsForAgeGroup } from '@/config/formatsByAgeGroup';
import { DEFAULT_GAME_ID } from '@/config/constants';
import type { PlaytimePlan } from '@/utils/playtimePlanner/types';

export type NextGameContext = Omit<NextGamePairInput, 'gameDate' | 'opponentName'>;

export interface NextGameContextSources {
  /** Active (non-archived) teams. */
  teams: Team[];
  /** The master roster (archived players are left out here). */
  roster: Player[];
  /** Team rosters by team id (only read when there are several teams). */
  teamRosters?: Record<string, TeamPlayer[]>;
  games: SavedGamesCollection;
  plans: PlaytimePlan[];
  /** The wizard's format answer, when this device has it. */
  storedFormat?: FieldSize | null;
  /** The wizard's age-group answer, when this device has it. */
  storedAgeGroup?: string | null;
  /** Our side's name when the account has no team (validateGame needs one). */
  fallbackTeamName: string;
}

const isFieldSize = (v: unknown): v is FieldSize => (FIELD_SIZES as unknown[]).includes(v);

/** Newest first: by date, then by creation (createdAt, else the id's timestamp). */
function newestFirst(a: [string, AppState], b: [string, AppState]): number {
  const byDate = (b[1].gameDate || '').localeCompare(a[1].gameDate || '');
  if (byDate !== 0) return byDate;
  const created = (id: string, g: AppState) => {
    const at = g.createdAt ? Date.parse(g.createdAt) : NaN;
    if (!Number.isNaN(at)) return at;
    const fromId = Number.parseInt(id.split('_')[1] ?? '', 10);
    return Number.isNaN(fromId) ? 0 : fromId;
  };
  return created(b[0], b[1]) - created(a[0], a[1]);
}

/** Null when there is nobody to plan for (the caller asks for players first). */
export function resolveNextGameContext(src: NextGameContextSources): NextGameContext | null {
  const games = Object.entries(src.games).filter(([id, g]) => id !== DEFAULT_GAME_ID && !!g).sort(newestFirst);
  const activeTeams = src.teams.filter((t) => !t.archived);

  let team: Team | undefined;
  if (activeTeams.length === 1) {
    team = activeTeams[0];
  } else if (activeTeams.length > 1) {
    const latestTeamId = games.find(([, g]) => activeTeams.some((t) => t.id === g.teamId))?.[1].teamId;
    team = activeTeams.find((t) => t.id === latestTeamId) ?? activeTeams[0];
  }

  const active = src.roster.filter((p) => !p.archived);
  let players = active;
  if (team && activeTeams.length > 1) {
    const ids = new Set((src.teamRosters?.[team.id] ?? []).map((p) => p.id));
    const own = active.filter((p) => ids.has(p.id));
    if (own.length > 0) players = own;
  }
  if (players.length === 0) return null;

  const teamGames = games.filter(([, g]) => (team ? g.teamId === team.id : true));
  const lastGame = teamGames[0]?.[1];
  const lastPlan = [...src.plans]
    .filter((p) => !p.archived && (team ? p.teamId === team.id : true) && p.games.length > 0)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0];
  const lastPlanGame = lastPlan?.games[lastPlan.games.length - 1];

  const gameType: GameType = team?.gameType ?? lastGame?.gameType ?? 'soccer';
  const ageGroup = team?.ageGroup || lastGame?.ageGroup || src.storedAgeGroup || '';

  let numberOfPeriods: 1 | 2;
  let periodMinutes: number;
  if (lastGame && (lastGame.numberOfPeriods === 1 || lastGame.numberOfPeriods === 2) && lastGame.periodDurationMinutes > 0) {
    numberOfPeriods = lastGame.numberOfPeriods;
    periodMinutes = lastGame.periodDurationMinutes;
  } else if (lastPlanGame && (lastPlanGame.numberOfPeriods === 1 || lastPlanGame.numberOfPeriods === 2) && lastPlanGame.periodMinutes > 0) {
    numberOfPeriods = lastPlanGame.numberOfPeriods;
    periodMinutes = lastPlanGame.periodMinutes;
  } else {
    const suggested = suggestPeriodsForAgeGroup(ageGroup, gameType);
    numberOfPeriods = suggested.numberOfPeriods;
    periodMinutes = suggested.periodMinutes;
  }

  const planSize = lastPlanGame ? getPresetById(lastPlanGame.formationId)?.fieldSize : undefined;
  const fieldSize: FieldSize = isFieldSize(planSize)
    ? planSize
    : isFieldSize(src.storedFormat)
      ? src.storedFormat
      : suggestFormatForAgeGroup(ageGroup, gameType)?.fieldSize ?? getRecommendedFieldSize(players.length);

  const teamName = team?.name || lastGame?.teamName || src.fallbackTeamName;
  return {
    team: { id: team?.id ?? '', name: teamName },
    players,
    fieldSize,
    gameType,
    ageGroup,
    numberOfPeriods,
    periodMinutes,
  };
}
