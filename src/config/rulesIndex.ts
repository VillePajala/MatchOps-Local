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
  /** The law's official title, used as a citation. */
  title: string;
  /** Page the law starts on in that sport's official PDF. */
  page: number;
}

export interface RulesTopic {
  id: string;
  fi: string;
  en: string;
  law: number;
}

export const RULES_SPORTS = raw.sports as Record<RulesSport, { linkId: string; laws: LawRef[] }>;
export const RULES_TOPICS: RulesTopic[] = raw.topics;

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

export function findLaw(sport: RulesSport, law: number): LawRef | null {
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
  law: number;
  title: string;
  page: number;
  /** The topic that matched, when it was a topic rather than the law title. */
  via: string | null;
}

export function searchRules(sport: RulesSport, query: string, lang: 'fi' | 'en'): RulesHit[] {
  const laws = RULES_SPORTS[sport]?.laws ?? [];
  const q = query.trim().toLowerCase();
  if (!q) return laws.map((l) => ({ law: l.law, title: l.title, page: l.page, via: null }));

  const hits = new Map<number, RulesHit>();
  const add = (law: number, via: string | null) => {
    const ref = laws.find((l) => l.law === law);
    if (!ref) return;
    // First match wins: a topic hit is more informative than the bare title,
    // and topics are checked first.
    if (!hits.has(law)) hits.set(law, { law, title: ref.title, page: ref.page, via });
  };

  RULES_TOPICS.filter((t) => t[lang].toLowerCase().includes(q) || t.fi.toLowerCase().includes(q) || t.en.toLowerCase().includes(q))
    .forEach((t) => add(t.law, t[lang]));
  laws.filter((l) => l.title.toLowerCase().includes(q) || String(l.law) === q).forEach((l) => add(l.law, null));

  return [...hits.values()].sort((a, b) => a.law - b.law);
}
