/**
 * The data sent - only when the coach asks - to the coach's own AI provider to
 * draft the day report's text ("Luonnostele yhteenveto tekoälyllä").
 *
 * Same privacy rules as the single-match draft (gamePacket.ts): with
 * pseudonymization on (the default), every player is a code (X1, X2 ...) and
 * every name inside the games' own report texts is rewritten to a code by
 * `redactPlayerNames`, across the whole roster plus every player the games
 * recorded. The code -> name mapping never leaves the device; the caller puts
 * the names back into the returned text locally.
 *
 * Pure: no storage, no network.
 */

import type { AppState } from '@/types/game';
import type { Player } from '@/types';
import { playerRef, playersForRedaction, playerRedactionHandles, redactPlayerNames } from '@/utils/gamePacket';
import type { DayReport, DayReportGameInput } from './dayReport';

export const DAY_PACKET_SCHEMA_VERSION = 1 as const;

export interface DayPacketGame {
  /** 1-based place of the game in the day. */
  number: number;
  opponentName: string;
  result: 'win' | 'draw' | 'loss';
  score: { us: number; them: number };
  /** Decided shootout tally, only when it settled a level game. */
  penalties?: { us: number; them: number };
  /** Our goals in order: scorer / assister refs (absent = not recorded). */
  goals: Array<{ scorer?: string; assist?: string }>;
  /** The coach's own match report for this game, redacted. Absent = none written. */
  coachReport?: string;
}

export interface DayPacket {
  schemaVersion: typeof DAY_PACKET_SCHEMA_VERSION;
  language: string;
  pseudonymized: boolean;
  teamName?: string;
  /** What the games are: one day (a plan), a tournament or a league. Absent = a day. */
  scope?: 'day' | 'tournament' | 'season';
  dayName: string;
  ageGroup?: string;
  gameType?: AppState['gameType'];
  /** Played games only, in the order they were played. */
  games: DayPacketGame[];
}

export interface DayPacketResult {
  packet: DayPacket;
  /** Every ref that may appear in the answer, and the name to put back. */
  refToName: Record<string, string>;
}

const RESULT: Record<'W' | 'D' | 'L', DayPacketGame['result']> = { W: 'win', D: 'draw', L: 'loss' };

/**
 * Build the day packet from the report (results, order) and the games
 * themselves (goals, reports). Unplayed games are not sent.
 */
export function buildDayPacket({
  report,
  inputs,
  roster,
  pseudonymize,
  language,
  scope,
}: {
  report: DayReport;
  inputs: DayReportGameInput[];
  roster: Player[];
  pseudonymize: boolean;
  language: string;
  scope?: DayPacket['scope'];
}): DayPacketResult {
  const byGameId = new Map(inputs.map((i) => [i.gameId, i.game]));
  const playedGames = report.games.filter((g) => g.played && g.result && byGameId.has(g.gameId));
  const games = playedGames.map((g) => byGameId.get(g.gameId) as AppState);

  // Everyone whose name could appear: the roster plus every player the games
  // recorded (a player who has left the roster still appears in older text).
  const people = playersForRedaction(roster, ...games.map((g) => g.availablePlayers));
  const refFor = new Map<string, string>();
  const refToName: Record<string, string> = {};
  let n = 0;
  for (const p of people) {
    if (pseudonymize && playerRedactionHandles(p).length === 0) continue;
    n += 1;
    const display = p.nickname?.trim() || p.name;
    let ref = pseudonymize ? playerRef(n) : display;
    // Real-name mode can collide (two Emmas); keep refs unique either way.
    if (refToName[ref] !== undefined) ref = `${ref} (${n})`;
    refFor.set(p.id, ref);
    refToName[ref] = display;
  }
  const refOf = (playerId: string): string | undefined => refFor.get(playerId);

  const packetGames: DayPacketGame[] = playedGames.map((row) => {
    const game = byGameId.get(row.gameId) as AppState;
    const goals = (game.gameEvents ?? [])
      .filter((e) => e.type === 'goal')
      .map((e) => {
        const scorer = e.scorerId ? refOf(e.scorerId) : undefined;
        const assist = e.assisterId ? refOf(e.assisterId) : undefined;
        return { ...(scorer ? { scorer } : {}), ...(assist ? { assist } : {}) };
      });
    const notes = row.gameNotes;
    return {
      number: report.games.indexOf(row) + 1,
      opponentName: row.opponentName,
      result: RESULT[row.result as 'W' | 'D' | 'L'],
      score: { us: row.ourScore, them: row.theirScore },
      ...(row.shootout ? { penalties: { ...row.shootout } } : {}),
      goals,
      ...(notes ? { coachReport: pseudonymize ? redactPlayerNames(notes, people, refOf) : notes } : {}),
    };
  });

  const first = games[0];
  const packet: DayPacket = {
    schemaVersion: DAY_PACKET_SCHEMA_VERSION,
    language,
    pseudonymized: pseudonymize,
    dayName: report.planName,
    games: packetGames,
  };
  if (scope && scope !== 'day') packet.scope = scope;
  if (report.teamName) packet.teamName = report.teamName;
  if (first?.ageGroup) packet.ageGroup = first.ageGroup;
  if (first?.gameType) packet.gameType = first.gameType;

  return { packet, refToName };
}
