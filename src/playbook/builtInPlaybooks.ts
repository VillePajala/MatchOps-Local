import logger from '@/utils/logger';
import matchops8v8 from '../../content/playbook/matchops-8v8.json';
import { validateConcept } from './validateConcept';
import type { Concept } from './types';

/**
 * Our own universal collections: general football, the same for every club,
 * so they ship WITH the app (in the lazily loaded playbook chunk) instead of
 * coming from the database like a club's collection. The content is authored
 * in content/playbook/ (the same file format as a club collection) and
 * checked by playbookContent.test.ts, which is strict: no validation errors
 * and no lint warnings.
 *
 * The first one is "MatchOps: 8v8 perusteet": 14 concepts for a first 8v8
 * season (U10-U11) in a neutral 2-3-2. See content/playbook/matchops-8v8.notes.md.
 */

export interface BuiltInPlaybook {
  id: string;
  name: string;
  concepts: Concept[];
}

/** Every concept goes through the same validator as a club's; an invalid one is skipped, never a crash. */
function load(doc: { playbook: { id: string; name: string }; concepts: unknown[] }): BuiltInPlaybook {
  const concepts: Concept[] = [];
  for (const raw of doc.concepts) {
    const v = validateConcept(raw);
    if (v.ok) concepts.push(v.concept);
    else logger.warn(`[Playbook] Skipping invalid built-in concept in ${doc.playbook.id}`, v.errors.slice(0, 5));
  }
  return { id: doc.playbook.id, name: doc.playbook.name, concepts };
}

export const MATCHOPS_8V8: BuiltInPlaybook = load(matchops8v8);
