/**
 * Opponent names: normalisation, variant grouping and canonical spelling.
 *
 * WHY THIS IS NOT FUZZY MATCHING. The obvious tool for "IPS" vs "Ips" is an
 * edit distance, and it is the wrong tool. Finnish clubs name teams club +
 * colour - "IPS/Punainen", "IPS/Sininen" - so two genuinely different teams
 * differ by one word out of two. Every similarity score rates those as near
 * identical and would offer to merge two real squads, which is a worse bug
 * than the typo it fixes.
 *
 * So: normalise, then require an EXACT match. Not similar - identical after
 * normalising. Zero false positives by construction, no threshold to tune,
 * and every grouping is explainable to a coach in one line.
 *
 *   IPS / Ips / ips                        -> "ips"           one team
 *   IPS/Sininen / IPS Sininen / IPS - Sininen -> "ips sininen" one team
 *   IPS/Punainen                           -> "ips punainen"  NEVER merged
 *
 * What it deliberately does not catch: real typos ("IPS Punaienn"), and
 * "IPS" vs "IPS Punainen", which is genuinely ambiguous - shorthand, or the
 * club versus one of its teams. Not this module's call.
 *
 * Diacritics are NOT stripped. Folding a->ä would merge genuinely different
 * Finnish words, and coaches type on Finnish keyboards.
 *
 * These are STRING LABELS, never entities (owner, 2026-09-11: "that is what
 * they are, just string labels"). Give an opponent an id and someone will
 * join stats on it, silently merging the harraste IPS Punainen with the
 * kilpa one - two different squads behind one stable club name.
 *
 * @module opponentNames
 * @category Utils
 */

/** Separators coaches use interchangeably between a club and its team suffix. */
const SEPARATORS = /[/\-‐-―]+/g;

/**
 * The comparison key for an opponent name. Never shown to a coach and never
 * stored - it exists only to decide whether two spellings are the same name.
 */
export function normalizeOpponentName(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .replace(SEPARATORS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('fi');
}

/** True when two spellings denote the same name (see the module note). */
export function isSameOpponent(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeOpponentName(a);
  return na !== '' && na === normalizeOpponentName(b);
}

/**
 * The spelling already in use for this name, if any.
 *
 * Powers entry-time prevention, which is the cheaper half of the feature:
 * stopping "Ips" from being added when "IPS" is already in the pool beats
 * cleaning it up afterwards. Returns the POOL's spelling so the caller can
 * offer it, or null when the name is genuinely new.
 */
export function findExistingSpelling(candidate: string, pool: readonly string[]): string | null {
  const key = normalizeOpponentName(candidate);
  if (!key) return null;
  return pool.find((name) => normalizeOpponentName(name) === key) ?? null;
}

/**
 * Add a name to a list unless some spelling of it is already there.
 *
 * Returns the list unchanged when the name is a duplicate, so callers can
 * compare by reference to tell whether anything happened.
 */
export function addOpponentToList(list: readonly string[], name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return list as string[];
  if (findExistingSpelling(trimmed, list)) return list as string[];
  return [...list, trimmed];
}

/** One group of spellings that all denote the same name. */
export interface OpponentVariantGroup {
  /** The normalised key the variants share. Not for display. */
  key: string;
  /** The distinct spellings found, most-used first. */
  variants: string[];
  /** How many times each spelling occurs, keyed by the spelling itself. */
  counts: Record<string, number>;
  /** Total occurrences across every spelling in the group. */
  total: number;
  /**
   * The spelling to offer as the canonical one: the most used, ties broken by
   * first appearance so the result is stable rather than arbitrary.
   *
   * A SUGGESTION, never a verdict. The app cannot know which spelling is
   * official and must not pretend to - no casing rule survives contact with
   * Finnish club names, where PePo and KuPS are correctly mixed case while
   * IPS and HJK are not. Consistency is what the app actually needs;
   * correctness is the coach's call.
   */
  suggested: string;
}

/**
 * Group spellings that denote the same name, keeping only the groups that
 * actually have something to resolve.
 *
 * Input is every occurrence, not a deduplicated list: the repetition is what
 * produces the counts that rank the suggestion.
 */
export function groupOpponentVariants(occurrences: readonly string[]): OpponentVariantGroup[] {
  const groups = new Map<string, { counts: Map<string, number>; order: string[] }>();

  for (const raw of occurrences) {
    const spelling = (raw ?? '').trim();
    const key = normalizeOpponentName(spelling);
    if (!key) continue;

    let group = groups.get(key);
    if (!group) {
      group = { counts: new Map(), order: [] };
      groups.set(key, group);
    }
    if (!group.counts.has(spelling)) group.order.push(spelling);
    group.counts.set(spelling, (group.counts.get(spelling) ?? 0) + 1);
  }

  const result: OpponentVariantGroup[] = [];
  for (const [key, group] of groups) {
    // A single spelling is not a conflict, however often it appears.
    if (group.counts.size < 2) continue;

    const variants = [...group.order].sort((a, b) => {
      const diff = (group.counts.get(b) ?? 0) - (group.counts.get(a) ?? 0);
      // Stable tie-break on first appearance, so the suggestion does not move
      // between runs over the same data.
      return diff !== 0 ? diff : group.order.indexOf(a) - group.order.indexOf(b);
    });

    result.push({
      key,
      variants,
      counts: Object.fromEntries(group.counts),
      total: [...group.counts.values()].reduce((sum, n) => sum + n, 0),
      suggested: variants[0],
    });
  }

  // Biggest mess first: the group touching the most games is worth the
  // coach's attention before one that touches two.
  return result.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}
