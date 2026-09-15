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

/**
 * One spelling per name, chosen the way the sweep tool chooses its suggestion:
 * MOST USED, ties broken by first appearance.
 *
 * WHY THIS EXISTS. Both halves of the feature answer "which spelling is the
 * real one", and they must not answer it differently. The sweep tool ranks by
 * use. Entry-time adoption used to take whatever `find` hit first in a pool
 * assembled from saved games in database order - so a spelling typed once
 * could outrank one typed six times, and the field would pull a coach back
 * onto a variant the sweep tool was simultaneously offering to replace.
 *
 * Ranking the pool fixes that at the source rather than at each call site:
 * `findExistingSpelling` still returns the first match, but the first match is
 * now the most-used one. A one-off typo is outvoted as soon as the name is
 * typed correctly more often than not.
 *
 * Input is every occurrence, not a deduplicated list - the repetition is what
 * produces the ranking. Names with a single spelling pass through unchanged.
 */
export function preferredSpellings(occurrences: readonly string[]): string[] {
  const byName = new Map<string, { counts: Map<string, number>; firstSeen: string[] }>();

  for (const raw of occurrences) {
    const spelling = (raw ?? '').trim();
    const key = normalizeOpponentName(spelling);
    if (!key) continue;
    let entry = byName.get(key);
    if (!entry) {
      entry = { counts: new Map(), firstSeen: [] };
      byName.set(key, entry);
    }
    if (!entry.counts.has(spelling)) entry.firstSeen.push(spelling);
    entry.counts.set(spelling, (entry.counts.get(spelling) ?? 0) + 1);
  }

  // Map order is the order names were first seen, so the returned list keeps a
  // stable, explainable sequence rather than jumping about as counts change.
  return [...byName.values()].map(({ counts, firstSeen }) =>
    firstSeen.reduce((best, spelling) =>
      (counts.get(spelling) ?? 0) > (counts.get(best) ?? 0) ? spelling : best,
    ),
  );
}

/** One opponent, however it is spelled, with how much it is used. */
export interface OpponentUsage {
  /** The normalised key. Not for display; identifies the name for a rename. */
  key: string;
  /** The spelling to show: the most used, ties broken by first appearance. */
  spelling: string;
  /** Total occurrences across every spelling of this name. */
  count: number;
  /** How many distinct spellings exist. More than one means a conflict. */
  variants: number;
}

/**
 * Every opponent this coach has, one row each, most used first.
 *
 * WHY THIS IS SEPARATE FROM groupOpponentVariants. That function answers "what
 * is inconsistent" and deliberately drops any name written only one way. But a
 * name can be consistently WRONG - captured badly on its first use and then
 * repeated - and such a name is invisible to a conflict list by definition.
 * Without this, the app could tidy up disagreements and still offer no way to
 * correct a name every record agrees on.
 *
 * Input is every occurrence, so `count` is usage rather than distinct rows.
 */
export function listOpponents(occurrences: readonly string[]): OpponentUsage[] {
  const byName = new Map<string, { counts: Map<string, number>; firstSeen: string[] }>();

  for (const raw of occurrences) {
    const spelling = (raw ?? '').trim();
    const key = normalizeOpponentName(spelling);
    if (!key) continue;
    let entry = byName.get(key);
    if (!entry) {
      entry = { counts: new Map(), firstSeen: [] };
      byName.set(key, entry);
    }
    if (!entry.counts.has(spelling)) entry.firstSeen.push(spelling);
    entry.counts.set(spelling, (entry.counts.get(spelling) ?? 0) + 1);
  }

  return [...byName.entries()]
    .map(([key, { counts, firstSeen }]) => ({
      key,
      spelling: firstSeen.reduce((best, s) =>
        (counts.get(s) ?? 0) > (counts.get(best) ?? 0) ? s : best,
      ),
      count: [...counts.values()].reduce((sum, n) => sum + n, 0),
      variants: counts.size,
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
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
