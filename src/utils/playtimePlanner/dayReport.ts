/**
 * "Turnauspäivän raportti" - one report over every game made from a plan.
 *
 * A plan is often one tournament day: three or four short games, played back
 * to back. Each game already has its own result, events and match report; this
 * gathers them into one view and one shareable text - the day's record, a row
 * per game, and per player the position in each game plus the day's goals and
 * assists. The coach's own day text (stored on the plan, `dayReport`) goes
 * under it.
 *
 * Pure: the caller supplies the games, the roster and `t`, so every rule here
 * is unit-testable.
 *
 * WHAT IS DELIBERATELY NOT HERE: playing time. The app does not measure the
 * minutes a player actually played (the plan's minutes are intent, not
 * record), so the report shows where each player played, never for how long.
 */

import type { AppState } from '@/types/game';
import type { Player } from '@/types';
import { resolveGameResult, type GameResult } from '@/utils/gameResult';
import { getShootoutTally } from '@/utils/shootout';
import { orderPositionIds, POSITION_ABBREV_FALLBACK } from '@/config/positions';
import { getPositionLabel, isSidelinePosition } from '@/utils/positionLabels';
import { hasPlayEvents } from './reapply';
import type { PlaytimePlan } from './types';

/**
 * What a game-by-game report is about: a plan (one tournament day) or a
 * competition (a tournament's games). `players` sets the row order (a plan's
 * own roster order); anyone outside it is sorted by name. A plan satisfies
 * this as it is.
 */
export interface DayReportSubject {
  name: string;
  players: ReadonlyArray<Pick<Player, 'id' | 'name' | 'nickname'>>;
}

/** key + fallback (+ interpolation) -> localized string (a slice of i18next's `t`). */
export type DayReportTranslate = (key: string, fallback: string, options?: Record<string, unknown>) => string;

/** Shown in a player's column for a game they were not part of. */
export const NOT_IN_GAME = '–';

/** One real game in the report, in report order (plan order, or date order for a competition). */
export interface DayReportGameInput {
  /** The planned game it was made from; the game id again for a competition's game. */
  planGameId: string;
  gameId: string;
  game: AppState;
}

export interface DayReportGameRow {
  planGameId: string;
  gameId: string;
  opponentName: string;
  /** False for a game not played yet: listed, but left out of every count. */
  played: boolean;
  /** Null when not played. */
  result: GameResult | null;
  ourScore: number;
  theirScore: number;
  /** Decided shootout tally (ours / theirs), only when the shootout settled it. */
  shootout?: { us: number; them: number };
  /** The game's own match report (the coach's `gameNotes`), trimmed. */
  gameNotes: string;
}

export interface DayReportPlayerRow {
  playerId: string;
  name: string;
  /**
   * One entry per PLAYED game, in game order: the position label(s) the app
   * shows for that game ("GK", "LB, ST"), or NOT_IN_GAME.
   */
  positions: string[];
  goals: number;
  assists: number;
}

export interface DayReport {
  /** The plan's (or the competition's) name. */
  planName: string;
  /** The team name when every played game was played under the same one. */
  teamName?: string;
  /** The venue when every played game was at the same one. */
  venue?: string;
  record: { wins: number; draws: number; losses: number };
  games: DayReportGameRow[];
  /**
   * The 1-based place of each played game in `games` - the numbers the
   * player columns are headed with (a game not yet played keeps its place
   * in the list, so game 2 stays "2" even when game 1 is unplayed).
   */
  playedGameNumbers: number[];
  players: DayReportPlayerRow[];
}

/**
 * Whether a game counts as played for the day report: it has started, it has
 * an event that is play (not just a dictated note), or a score was entered.
 * The last covers a coach who typed the result in afterwards without running
 * the clock - that game was played, and leaving it out would drop a result.
 */
export function isDayGamePlayed(game: AppState): boolean {
  return (
    (game.gameStatus ?? 'notStarted') !== 'notStarted' ||
    hasPlayEvents(game.gameEvents) ||
    (game.homeScore ?? 0) > 0 ||
    (game.awayScore ?? 0) > 0
  );
}

/**
 * Whether a game is OVER for the "day done" prompts (the finish screen and
 * Home): played (above) and not stopped mid-way - a game whose clock is
 * running or that is between periods is still being played.
 */
export function isDayGameFinished(game: AppState): boolean {
  const status = game.gameStatus ?? 'notStarted';
  return isDayGamePlayed(game) && status !== 'inProgress' && status !== 'periodEnd';
}

/**
 * The plan's real games in PLAN order, from the planned-game -> game id map
 * (createdGameIdsForPlan). Planned games with no game yet are skipped.
 */
export function orderDayGames(
  plan: PlaytimePlan,
  created: Record<string, string>,
  games: Record<string, AppState>,
): DayReportGameInput[] {
  const out: DayReportGameInput[] = [];
  for (const planGame of plan.games) {
    const gameId = created[planGame.id];
    const game = gameId ? games[gameId] : undefined;
    if (gameId && game) out.push({ planGameId: planGame.id, gameId, game });
  }
  return out;
}

const firstName = (fullName: string): string => fullName.trim().split(/\s+/)[0] ?? fullName;

/** Nickname, else first name - the name the recap and the pitch use. */
const shortName = (p: Pick<Player, 'name' | 'nickname'>): string =>
  p.nickname?.trim() || firstName(p.name);

const ourGoals = (game: AppState): number => (game.homeOrAway === 'away' ? game.awayScore : game.homeScore);
const theirGoals = (game: AppState): number => (game.homeOrAway === 'away' ? game.homeScore : game.awayScore);

const commonValue = (values: Array<string | undefined>): string | undefined => {
  const trimmed = values.map((v) => v?.trim() ?? '');
  if (trimmed.length === 0 || !trimmed[0]) return undefined;
  return trimmed.every((v) => v === trimmed[0]) ? trimmed[0] : undefined;
};

/**
 * Position label(s) per player for one game, using the SAME source and labels
 * as the match recap (gameRecap.ts):
 *
 * 1. The positions the coach recorded after the game ("Toteutuneet
 *    pelipaikat", `playerPositions`), shown with their abbreviations.
 * 2. When the game has none recorded, the starting position on the pitch,
 *    labelled exactly as the pitch labels it (GK, LB, CDM, ST ...).
 *
 * A squad member with no position from that source sat on the bench at the
 * start (or was not recorded): shown as SUB, the pitch's own label for the
 * sideline. Players outside the squad get no entry.
 */
export function positionsForGame(game: AppState, t: DayReportTranslate): Map<string, string> {
  const out = new Map<string, string>();
  const recorded = Object.entries(game.playerPositions ?? {}).filter(([, ids]) => (ids ?? []).length > 0);

  if (recorded.length > 0) {
    for (const [playerId, ids] of recorded) {
      const labels = orderPositionIds(ids).map((id) =>
        t(`playingPositions.${id}.abbrev`, POSITION_ABBREV_FALLBACK[id] ?? id.toUpperCase()),
      );
      out.set(playerId, labels.join(', '));
    }
  } else {
    const squad = game.selectedPlayerIds?.length ? new Set(game.selectedPlayerIds) : null;
    for (const p of game.playersOnField ?? []) {
      if (squad && !squad.has(p.id)) continue;
      if (typeof p.relX !== 'number' || typeof p.relY !== 'number' || isSidelinePosition(p.relX)) continue;
      const { label } = getPositionLabel(p.relX, p.relY);
      out.set(p.id, t(`positions.${label}`, label));
    }
  }

  const sub = t('positions.SUB', 'SUB');
  for (const id of game.selectedPlayerIds ?? []) {
    if (!out.has(id)) out.set(id, sub);
  }
  return out;
}

/**
 * Build the day report. `inputs` must already be in report order
 * (orderDayGames / orderCompetitionGames); `roster` resolves names for players
 * a game no longer carries.
 */
export function buildDayReport(
  plan: DayReportSubject,
  inputs: DayReportGameInput[],
  roster: Player[],
  t: DayReportTranslate,
): DayReport {
  const games: DayReportGameRow[] = inputs.map(({ planGameId, gameId, game }) => {
    const played = isDayGamePlayed(game);
    const result = played ? resolveGameResult(game) : null;
    const us = ourGoals(game);
    const them = theirGoals(game);
    let shootout: DayReportGameRow['shootout'];
    if (played && us === them && result !== 'D') {
      const tally = getShootoutTally(game.shootoutKicks);
      shootout =
        game.homeOrAway === 'away' ? { us: tally.away, them: tally.home } : { us: tally.home, them: tally.away };
    }
    return {
      planGameId,
      gameId,
      opponentName: game.opponentName?.trim() || '',
      played,
      result,
      ourScore: us,
      theirScore: them,
      ...(shootout ? { shootout } : {}),
      gameNotes: (game.gameNotes ?? '').trim(),
    };
  });

  const playedInputs = inputs.filter((_, i) => games[i].played);
  const playedGameNumbers = games.flatMap((g, i) => (g.played ? [i + 1] : []));
  const record = { wins: 0, draws: 0, losses: 0 };
  for (const g of games) {
    if (g.result === 'W') record.wins += 1;
    else if (g.result === 'D') record.draws += 1;
    else if (g.result === 'L') record.losses += 1;
  }

  // Per played game: positions, and the goals/assists of our own goals.
  const perGame = playedInputs.map(({ game }) => positionsForGame(game, t));
  const goals = new Map<string, number>();
  const assists = new Map<string, number>();
  const bump = (map: Map<string, number>, id: string | undefined) => {
    if (id) map.set(id, (map.get(id) ?? 0) + 1);
  };
  for (const { game } of playedInputs) {
    for (const e of game.gameEvents ?? []) {
      if (e.type !== 'goal') continue;
      bump(goals, e.scorerId);
      bump(assists, e.assisterId);
    }
  }

  // Everyone who was part of any played game, plus anyone credited with a goal
  // or an assist (a scorer missing from the squad list is still a scorer).
  const ids = new Set<string>();
  perGame.forEach((m) => m.forEach((_, id) => ids.add(id)));
  goals.forEach((_, id) => ids.add(id));
  assists.forEach((_, id) => ids.add(id));

  // Names: the game's own player record first (nickname as on the pitch), then
  // the plan, then the roster.
  const known = new Map<string, Pick<Player, 'name' | 'nickname'>>();
  for (const p of roster) known.set(p.id, p);
  for (const p of plan.players) if (!known.has(p.id)) known.set(p.id, p);
  for (const { game } of playedInputs) for (const p of game.availablePlayers ?? []) known.set(p.id, p);

  const planOrder = new Map(plan.players.map((p, i) => [p.id, i]));
  const players: DayReportPlayerRow[] = [...ids]
    .map((playerId) => {
      const person = known.get(playerId);
      return {
        playerId,
        name: person ? shortName(person) || person.name : t('recap.unknownPlayer', 'Unknown'),
        positions: perGame.map((m) => m.get(playerId) ?? NOT_IN_GAME),
        goals: goals.get(playerId) ?? 0,
        assists: assists.get(playerId) ?? 0,
      };
    })
    // The plan's own roster order (the order the coach built it in), then
    // anyone outside the plan by name.
    .sort((a, b) => {
      const ia = planOrder.get(a.playerId);
      const ib = planOrder.get(b.playerId);
      if (ia !== undefined && ib !== undefined) return ia - ib;
      if (ia !== undefined) return -1;
      if (ib !== undefined) return 1;
      return a.name.localeCompare(b.name);
    });

  return {
    planName: plan.name.trim(),
    teamName: commonValue(playedInputs.map(({ game }) => game.teamName)),
    venue: commonValue(playedInputs.map(({ game }) => game.gameLocation)),
    record,
    games,
    playedGameNumbers,
    players,
  };
}

/** "1V 1T 1H" - the app's own result letters, wins / draws / losses. */
export function formatDayRecord(record: DayReport['record'], t: DayReportTranslate): string {
  return [
    `${record.wins}${t('export.winShort', 'W')}`,
    `${record.draws}${t('export.tieShort', 'D')}`,
    `${record.losses}${t('export.lossShort', 'L')}`,
  ].join(' ');
}

/** "2–1", plus the shootout when it decided a level game: "1–1 (rp. 4–3)". */
export function formatDayScore(row: DayReportGameRow, t: DayReportTranslate): string {
  const score = `${row.ourScore}–${row.theirScore}`;
  return row.shootout
    ? `${score} (${t('planDayReport.penaltiesShort', 'pens')} ${row.shootout.us}–${row.shootout.them})`
    : score;
}

const RESULT_EMOJI: Record<GameResult, string> = { W: '✅', D: '➖', L: '❌' };

/**
 * The text the coach shares, e.g.
 *
 *   ⚽ Kotkat P11 · Joulufutis 12.12. (Hakalan halli)
 *   1V 1T 1H
 *
 *   ✅ Kallion Kiri 2–1
 *   ➖ Harjun Haukat 1–1
 *   ❌ Rantakylän FC 0–2
 *
 *   Pelaajat (pelipaikka 1./2./3. pelissä · maalit+syötöt):
 *   Eeli: GK / GK / LB · 1+0
 *
 *   <the coach's own day text>
 *
 * Blocks with nothing in them are left out.
 */
export function buildDayReportShareText(report: DayReport, coachText: string, t: DayReportTranslate): string {
  const blocks: string[] = [];

  const title = [report.teamName, report.planName].filter(Boolean).join(' · ');
  const header = `⚽ ${title}${report.venue ? ` (${report.venue})` : ''}`;
  blocks.push(report.playedGameNumbers.length > 0 ? `${header}\n${formatDayRecord(report.record, t)}` : header);

  if (report.games.length > 0) {
    blocks.push(
      report.games
        .map((g) => {
          const opponent = g.opponentName || t('planDayReport.unknownOpponent', 'Opponent');
          return g.played && g.result
            ? `${RESULT_EMOJI[g.result]} ${opponent} ${formatDayScore(g, t)}`
            : `⏳ ${opponent} (${t('planDayReport.notPlayedYet', 'not played yet')})`;
        })
        .join('\n'),
    );
  }

  if (report.players.length > 0) {
    const numbers = report.playedGameNumbers
      .map((n) => t('planDayReport.gameOrdinal', '{{n}}', { n }))
      .join('/');
    const heading = t('planDayReport.sharePlayersHeading', 'Players (position in game {{games}} · goals+assists):', {
      games: numbers,
    });
    blocks.push(
      [
        heading,
        ...report.players.map((p) => `${p.name}: ${p.positions.join(' / ')} · ${p.goals}+${p.assists}`),
      ].join('\n'),
    );
  }

  const text = coachText.trim();
  if (text) blocks.push(text);

  return blocks.join('\n\n');
}
