import type { AppState, Player } from '@/types';

/** Players not archived: the ones offered when picking players for new games, teams
 *  and plans. Archived players (arkistoidut) stay in history: old games, stats, exports. */
export function activePlayers<T extends { archived?: boolean }>(players: T[]): T[] {
  return players.some((p) => p.archived) ? players.filter((p) => !p.archived) : players;
}

/**
 * A game's own player list (`availablePlayers`), brought up to date with the club roster.
 *
 * Every game keeps its own copy of the players, made when the game is created. Without
 * this, a player added to the club roster afterwards never reaches an existing game: the
 * saved copy wins on load, and Match details offers no way to pick her. That is how a
 * coach ended up typing the name again and creating a duplicate player.
 *
 * - **Club players** come from the club roster, so name, number and so on are current.
 *   Per-game state is kept: the game's own goalie flag and its fair-play holder. The
 *   roster's fair-play flag is never taken; the card is per game.
 * - **Club players not yet in this game** are added, unselected, unless archived.
 *   Selection lives in `selectedPlayerIds`, which this does not touch.
 * - **Players no longer in the club roster** stay when the game references them (it is
 *   the game's historical record; dropping them broke stats name resolution). With
 *   `keepDepartedIds`, unreferenced ones are dropped.
 */
export function mergeClubRosterIntoGamePlayers(
  gamePlayers: Player[],
  clubRoster: Player[],
  /**
   * When given (a game being opened), a player who has left the club roster is kept
   * only if this game references her (playerIdsReferencedByGame). One who was never
   * picked and has nothing recorded is dropped: she only made the list confusing, for
   * example a deleted duplicate with the same name as the real player.
   */
  keepDepartedIds?: ReadonlySet<string>,
): Player[] {
  const perGameGoalie = new Map<string, boolean>();
  const inGame = new Set<string>();
  // The card is unique per game (awarding it clears the previous holder).
  const fairPlayHolder = gamePlayers.find((p) => p.receivedFairPlayCard)?.id;
  for (const p of gamePlayers) {
    inGame.add(p.id);
    if (p.isGoalie !== undefined) perGameGoalie.set(p.id, p.isGoalie);
  }

  // An archived club player is offered to no new game; one already in this game stays.
  const merged = clubRoster.filter((clubPlayer) => inGame.has(clubPlayer.id) || !clubPlayer.archived).map((clubPlayer) => {
    const receivedFairPlayCard = inGame.has(clubPlayer.id) ? clubPlayer.id === fairPlayHolder : false;
    return perGameGoalie.has(clubPlayer.id)
      ? { ...clubPlayer, isGoalie: perGameGoalie.get(clubPlayer.id), receivedFairPlayCard }
      : { ...clubPlayer, receivedFairPlayCard };
  });

  const clubIds = new Set(clubRoster.map((p) => p.id));
  // With no club roster (not loaded yet) nothing counts as departed - never drop then.
  const departed = gamePlayers.filter(
    (p) => !clubIds.has(p.id) && (!keepDepartedIds || clubRoster.length === 0 || keepDepartedIds.has(p.id)),
  );
  return departed.length > 0 ? [...merged, ...departed] : merged;
}

/**
 * Which club players belong to a team, for pre-selecting a game's or a plan's players.
 *
 * Matched by id: a team roster entry carries the club player's id, so renaming a player
 * no longer drops her from her team's selection (name matching did). Older team rosters
 * can hold ids that never matched the club roster (for example teams copied with
 * "Duplicate team" before it kept the ids); those entries fall back to the name, and
 * only when exactly one club player has that name, so two players sharing a name are
 * never both ticked by one entry.
 */
export function teamMemberIds(
  teamRoster: ReadonlyArray<{ id: string; name: string }>,
  clubPlayers: ReadonlyArray<{ id: string; name: string }>,
): string[] {
  const norm = (name: string) => name.trim().toLowerCase();
  const clubIds = new Set(clubPlayers.map((p) => p.id));
  const idsByName = new Map<string, string[]>();
  for (const p of clubPlayers) {
    const key = norm(p.name);
    idsByName.set(key, [...(idsByName.get(key) ?? []), p.id]);
  }
  const result = new Set<string>();
  for (const member of teamRoster) {
    if (clubIds.has(member.id)) {
      result.add(member.id);
      continue;
    }
    const byName = idsByName.get(norm(member.name));
    if (byName && byName.length === 1) result.add(byName[0]);
  }
  return clubPlayers.filter((p) => result.has(p.id)).map((p) => p.id);
}

/**
 * Every player id this game refers to: picked, on the field, in an event (scorer,
 * assister, carded/noted player), a shootout kick, an assessment, a position, the
 * captain, the fair-play card holder. A player outside this set has no part in the game's record.
 */
export function playerIdsReferencedByGame(game: Partial<AppState>): Set<string> {
  const ids = new Set<string>(game.selectedPlayerIds ?? []);
  for (const p of game.playersOnField ?? []) ids.add(p.id);
  for (const e of game.gameEvents ?? []) {
    if (e.scorerId) ids.add(e.scorerId);
    if (e.assisterId) ids.add(e.assisterId);
    if (e.entityId) ids.add(e.entityId);
  }
  for (const k of game.shootoutKicks ?? []) if (k.scorerId) ids.add(k.scorerId);
  for (const id of Object.keys(game.assessments ?? {})) ids.add(id);
  for (const id of Object.keys(game.playerPositions ?? {})) ids.add(id);
  if (game.captainId) ids.add(game.captainId);
  // The fair-play award lives only on the holder's entry in the game's own list.
  for (const p of game.availablePlayers ?? []) if (p.receivedFairPlayCard) ids.add(p.id);
  return ids;
}

/** Last name for sorting (last word of the full name), like the club roster list. */
const lastName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || fullName;
};

/** Players in the club roster's default order: by last name, then full name. */
export function sortPlayersByLastName<T extends { name: string }>(players: T[]): T[] {
  return [...players].sort(
    (a, b) =>
      lastName(a.name).localeCompare(lastName(b.name), undefined, { sensitivity: 'base' }) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}
