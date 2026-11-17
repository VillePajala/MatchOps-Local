/**
 * The app's one list search (review 7.L6; owner 2026-11-17: ignore accents).
 *
 * Every search box used its own `toLowerCase().includes()`: case-insensitive,
 * one substring for the whole query, accents exact, and each matching different
 * fields. Here:
 * - case- and accent-insensitive ("aino" finds "Äino", "maki" finds "Mäki");
 * - every typed word must match somewhere ("aino 7" finds Aino Virta, #7), in
 *   any order - partial words are fine ("vir" finds "Virta");
 * - the fields are the caller's: players are matched by name, nickname and
 *   shirt number (playerSearchFields).
 */

/** Lowercase, accents removed, runs of whitespace collapsed. */
export function foldForSearch(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every word of the query appears in at least one of the fields. An empty query matches all. */
export function matchesSearch(
  query: string,
  fields: ReadonlyArray<string | number | null | undefined>,
): boolean {
  const words = foldForSearch(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fields.map(foldForSearch).join(' ');
  return words.every((word) => haystack.includes(word));
}

/** What a player is found by: name, nickname and shirt number. */
export function playerSearchFields(player: {
  name: string;
  nickname?: string;
  jerseyNumber?: string | number;
}): Array<string | number | undefined> {
  return [player.name, player.nickname, player.jerseyNumber];
}
