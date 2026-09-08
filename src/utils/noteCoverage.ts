/**
 * Who has been written about, and who has not (Kirjuri).
 *
 * The app collects observations rather than ratings, which creates a quiet
 * failure the coach cannot see: the three players they think about most get
 * written about every week, and the quiet ones accumulate nothing. Nobody
 * decided that. It is just what happens when there is no denominator.
 *
 * So this counts, and only counts. It never reads what a note SAYS, never
 * scores a player, and never orders anyone by how they are doing - the whole
 * point is that it cannot, because the input is a number of notes and nothing
 * else. A player near the top of this list is a player the coach has not
 * written about yet, which is a fact about the record, not about the child.
 *
 * The denominator matters as much as the count: no notes across eight matches
 * is a gap, no notes across one is a substitute who played once. Both are
 * reported, so the coach reads the difference rather than a bare zero.
 *
 * Pure: no storage, no network, no React, no i18n.
 */

import type { AppState, GameEvent } from '@/types/game';
import type { Player } from '@/types';

export interface CoveragePlayer {
  id: string;
  name: string;
  /** Notes written about this player across the scoped matches. */
  notes: number;
  /** Scoped matches this player was selected for - the denominator. */
  matches: number;
}

export interface NoteCoverage {
  /** Played matches in scope. */
  matches: number;
  /** Squad members who appear in at least one scoped match. */
  players: number;
  playersWithNotes: number;
  /** Every note in scope, including notes about the match rather than a player. */
  totalNotes: number;
  /**
   * Players with nothing written about them, the ones present for most matches
   * first. Never ordered by anything a note says.
   */
  unwritten: CoveragePlayer[];
  /** Everyone in scope, same ordering rule, for the full read. */
  all: CoveragePlayer[];
}

const EMPTY: NoteCoverage = {
  matches: 0,
  players: 0,
  playersWithNotes: 0,
  totalNotes: 0,
  unwritten: [],
  all: [],
};

/** A game whose notes and squad we can count. Structural, so tests stay small. */
export type CoverageGame = Pick<AppState, 'selectedPlayerIds' | 'gameEvents' | 'isPlayed'>;

const isNote = (e: GameEvent): boolean => e.type === 'note';

export function computeNoteCoverage(games: CoverageGame[], players: Player[]): NoteCoverage {
  // Planned matches have not happened yet, so they are not a missed chance to
  // write anything - counting them would invent a gap.
  const played = games.filter((g) => g.isPlayed !== false);
  if (played.length === 0 || players.length === 0) return EMPTY;

  const byId = new Map(players.map((p) => [p.id, p]));
  const notes = new Map<string, number>();
  const matches = new Map<string, number>();
  let totalNotes = 0;

  played.forEach((game) => {
    (game.selectedPlayerIds ?? []).forEach((id) => {
      // Only the roster we were given: a player deleted since is not someone
      // the coach can go and write about now.
      if (byId.has(id)) matches.set(id, (matches.get(id) ?? 0) + 1);
    });
    (game.gameEvents ?? []).filter(isNote).forEach((event) => {
      totalNotes += 1;
      const subject = event.entityId;
      // A note about the match belongs to no player; it still counts as work
      // the coach did, which is why it is in totalNotes and nowhere else.
      if (!subject || !byId.has(subject)) return;
      notes.set(subject, (notes.get(subject) ?? 0) + 1);
    });
  });

  const all: CoveragePlayer[] = [...matches.entries()]
    .map(([id, played]) => ({
      id,
      name: byId.get(id)?.nickname?.trim() || byId.get(id)?.name || '',
      notes: notes.get(id) ?? 0,
      matches: played,
    }))
    // Fewest notes first, then most matches: the widest gap at the top. Name
    // last so the order is stable rather than dependent on roster order.
    .sort((a, b) => a.notes - b.notes || b.matches - a.matches || a.name.localeCompare(b.name));

  return {
    matches: played.length,
    players: all.length,
    playersWithNotes: all.filter((p) => p.notes > 0).length,
    totalNotes,
    unwritten: all.filter((p) => p.notes === 0),
    all,
  };
}
