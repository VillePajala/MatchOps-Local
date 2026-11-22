import type { Concept, ConceptFormat } from './types';

/**
 * Pure helpers for the Playbook library view: the known phases of play in
 * their display order, and filtering / grouping / search over concepts.
 */

/** The phases of play, in library order. A concept's phase is free text; these are the ones we know. */
export const PHASES = [
  { key: 'basics', name: 'Perusteet' },
  { key: 'attacking', name: 'Hyökkääminen' },
  { key: 'defending', name: 'Puolustaminen' },
  { key: 'transitionPlus', name: 'Tilanteenvaihto +' },
  { key: 'transitionMinus', name: 'Tilanteenvaihto −' },
  { key: 'setPieces', name: 'Erikoistilanteet' },
] as const;

export type KnownPhaseKey = (typeof PHASES)[number]['key'];

export const FORMATS: readonly ConceptFormat[] = ['5v5', '8v8', '11v11'];

/** Case-, accent- and dash-insensitive form for matching ("Tilanteenvaihto -" = "Tilanteenvaihto −"). */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[−–—]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** The known phase a concept's phase text names, if any. */
export function knownPhase(phase: string): KnownPhaseKey | undefined {
  const n = normalizeText(phase);
  return PHASES.find((p) => normalizeText(p.name) === n)?.key;
}

/** Sort rank of a phase: known phases in their order, unknown ones after them. */
function phaseRank(phase: string): number {
  const key = knownPhase(phase);
  const i = key ? PHASES.findIndex((p) => p.key === key) : -1;
  return i >= 0 ? i : PHASES.length;
}

/** The formats present in these concepts, in 5v5 / 8v8 / 11v11 order. */
export function formatsIn(concepts: readonly Concept[]): ConceptFormat[] {
  const present = new Set(concepts.map((c) => c.format));
  return FORMATS.filter((f) => present.has(f));
}

/**
 * The phases present (as written in the concepts, one entry per phase),
 * known phases first in library order, then the rest alphabetically.
 */
export function phasesIn(concepts: readonly Concept[]): string[] {
  const byKey = new Map<string, string>();
  for (const c of concepts) {
    const k = knownPhase(c.phase) ?? normalizeText(c.phase);
    if (!byKey.has(k)) byKey.set(k, c.phase);
  }
  return [...byKey.values()].sort((a, b) => phaseRank(a) - phaseRank(b) || a.localeCompare(b, 'fi'));
}

/** Same phase, however the dash or case is written. */
export function samePhase(a: string, b: string): boolean {
  const ka = knownPhase(a);
  return ka ? ka === knownPhase(b) : normalizeText(a) === normalizeText(b);
}

/** Does the search text occur in the concept's title, step titles and texts, question or tags? */
export function matchesQuery(concept: Concept, query: string): boolean {
  const words = normalizeText(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeText(
    [
      concept.title,
      concept.question ?? '',
      ...(concept.tags ?? []),
      ...concept.steps.flatMap((s) => [s.title, s.text]),
    ].join(' \n '),
  );
  return words.every((w) => haystack.includes(w));
}

export interface LibraryFilter {
  format?: ConceptFormat | null;
  /** A phase as written in a concept; null / undefined = all phases. */
  phase?: string | null;
  query?: string;
}

/** The concepts that pass the filter, in their original order. */
export function filterConcepts(concepts: readonly Concept[], filter: LibraryFilter): Concept[] {
  return concepts.filter(
    (c) =>
      (!filter.format || c.format === filter.format) &&
      (!filter.phase || samePhase(c.phase, filter.phase)) &&
      matchesQuery(c, filter.query ?? ''),
  );
}

/** Concepts grouped by phase (library order), each group in the concepts' own order. */
export function groupByPhase(concepts: readonly Concept[]): Array<{ phase: string; concepts: Concept[] }> {
  return phasesIn(concepts).map((phase) => ({
    phase,
    concepts: concepts.filter((c) => samePhase(c.phase, phase)),
  }));
}
