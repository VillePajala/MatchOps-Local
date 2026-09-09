/**
 * Our own index of the Laws of the Game.
 *
 * WHY AN INDEX AND NOT THE RULES THEMSELVES: IFAB (football) and FIFA (futsal)
 * reserve all rights. IFAB's terms grant only "a limited, revocable,
 * non-exclusive licence to access and use the IFAB Websites" and say their
 * content shall not be "reproduced, copied, distributed... republished" for any
 * other purpose. Palloliitto's books are translations, so they cannot grant
 * more than they hold either. Bundling the text would need written permission
 * (lawenquiries@theifab.com). Investigated 2026-09-10.
 *
 * So this carries only what is ours or factual: topic names written in a
 * coach's words, the official law numbers and titles used as citations, and the
 * page each law starts on. Tapping a result opens the official PDF at that page,
 * which sends the reader to the rights holder's own document rather than a copy.
 *
 * NEVER paste rule text into rulesIndex.json.
 *
 * @module rulesIndex
 * @category Config
 */

import raw from '@/config/rulesIndex.json';
import ruleLinks from '@/config/ruleLinks.json';

export type RulesSport = 'football' | 'futsal';

export interface LawRef {
  /** Law number, 1-17, the same numbering in both codes. */
  law: number;
  /** The law's official Finnish title, used as a citation. */
  title: string;
  /** The official English title of the same law. */
  titleEn: string;
  /** Page the law starts on in that sport's official PDF. */
  page: number;
}

export interface RulesTopic {
  id: string;
  fi: string;
  en: string;
  /** The law this belongs to, or null when it is not a law (see `page`). */
  law: number | null;
  /** Codes this applies to; absent means both. Time-out is futsal-only, sin
   *  bin football-only - verified against both books, not assumed. */
  sports?: RulesSport[];
  /** For material that is guidance rather than a law, the page it starts on. */
  page?: number;
}

export const RULES_SPORTS = raw.sports as Record<RulesSport, { linkId: string; laws: LawRef[] }>;
export const RULES_TOPICS = raw.topics as RulesTopic[];

/** The official PDF for a sport, from the same link config the CI check watches. */
export function rulebookUrl(sport: RulesSport): string | null {
  const id = RULES_SPORTS[sport]?.linkId;
  return ruleLinks.links.find((l) => l.id === id)?.url ?? null;
}

/**
 * A deep link to the page a law starts on.
 *
 * `#page=` is the PDF open-parameter every mainstream viewer honours. A viewer
 * that ignores it simply opens page 1, which is no worse than the plain link
 * this replaces - so this can never be a regression, only a shortcut.
 */
export function lawUrl(sport: RulesSport, law: number): string | null {
  const url = rulebookUrl(sport);
  const ref = RULES_SPORTS[sport]?.laws.find((l) => l.law === law);
  if (!url || !ref) return null;
  return `${url}#page=${ref.page}`;
}

export function findLaw(sport: RulesSport, law: number | null): LawRef | null {
  if (law === null) return null;
  return RULES_SPORTS[sport]?.laws.find((l) => l.law === law) ?? null;
}

/**
 * Search topics and law titles for a sport.
 *
 * Matches the coach's word (our topic names, either language) and the official
 * law titles, so "kentältäpoisto" finds Law 12 even though no law is called
 * that. An empty query returns every law, because the default state of a
 * reference screen should be the full list, not nothing.
 */
export interface RulesHit {
  /** Stable key: the law number, or the topic id for non-law guidance. */
  key: string;
  /** Null when the entry is guidance rather than a numbered law. */
  law: number | null;
  title: string;
  page: number;
  /** The topic that matched, when it was a topic rather than the law title. */
  via: string | null;
}

export function searchRules(sport: RulesSport, query: string, lang: 'fi' | 'en'): RulesHit[] {
  const laws = RULES_SPORTS[sport]?.laws ?? [];
  const titleOf = (l: LawRef) => (lang === 'en' ? l.titleEn : l.title);
  const q = query.trim().toLowerCase();
  const forThisSport = RULES_TOPICS.filter((t) => !t.sports || t.sports.includes(sport));

  const byLaw = new Map(laws.map((l) => [l.law, l]));
  const hits = new Map<string, RulesHit>();
  const addLaw = (law: number, via: string | null) => {
    const ref = byLaw.get(law);
    // First match wins: a topic hit names the coach's word, which is more
    // useful than the bare title, and topics are matched first.
    if (ref && !hits.has(String(law))) {
      hits.set(String(law), { key: String(law), law, title: titleOf(ref), page: ref.page, via });
    }
  };
  const addGuidance = (t: RulesTopic) => {
    if (t.page && !hits.has(t.id)) {
      hits.set(t.id, { key: t.id, law: null, title: t[lang], page: t.page, via: null });
    }
  };

  if (!q) {
    laws.forEach((l) => addLaw(l.law, null));
    forThisSport.filter((t) => t.law === null).forEach(addGuidance);
  } else {
    // Both languages are searched whatever the UI language: a Finnish coach
    // may well type "offside", and refusing them the answer helps nobody.
    const matches = forThisSport.filter(
      (t) => t.fi.toLowerCase().includes(q) || t.en.toLowerCase().includes(q),
    );
    matches.forEach((t) => (t.law === null ? addGuidance(t) : addLaw(t.law, t[lang])));
    laws
      .filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          l.titleEn.toLowerCase().includes(q) ||
          String(l.law) === q,
      )
      .forEach((l) => addLaw(l.law, null));
  }

  // Guidance sorts by page among the laws it sits between.
  return [...hits.values()].sort((a, b) => a.page - b.page);
}
