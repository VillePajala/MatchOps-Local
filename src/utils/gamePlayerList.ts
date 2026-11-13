import type { Player } from '@/types';

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
 * - **Club players not yet in this game** are added, unselected. Selection lives in
 *   `selectedPlayerIds`, which this does not touch.
 * - **Players no longer in the club roster** stay. The list is the game's historical
 *   record; dropping them broke stats name resolution.
 */
export function mergeClubRosterIntoGamePlayers(gamePlayers: Player[], clubRoster: Player[]): Player[] {
  const perGameGoalie = new Map<string, boolean>();
  const inGame = new Set<string>();
  // The card is unique per game (awarding it clears the previous holder).
  const fairPlayHolder = gamePlayers.find((p) => p.receivedFairPlayCard)?.id;
  for (const p of gamePlayers) {
    inGame.add(p.id);
    if (p.isGoalie !== undefined) perGameGoalie.set(p.id, p.isGoalie);
  }

  const merged = clubRoster.map((clubPlayer) => {
    const receivedFairPlayCard = inGame.has(clubPlayer.id) ? clubPlayer.id === fairPlayHolder : false;
    return perGameGoalie.has(clubPlayer.id)
      ? { ...clubPlayer, isGoalie: perGameGoalie.get(clubPlayer.id), receivedFairPlayCard }
      : { ...clubPlayer, receivedFairPlayCard };
  });

  const clubIds = new Set(clubRoster.map((p) => p.id));
  const departed = gamePlayers.filter((p) => !clubIds.has(p.id));
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
