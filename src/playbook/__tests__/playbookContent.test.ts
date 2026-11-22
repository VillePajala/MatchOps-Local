/**
 * The committed playbook content (content/playbook/*.json) is the source the
 * seed script loads into the database. Every concept in it must pass the
 * app's own validator, or the app would skip it.
 * @critical
 */
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { lintConcept, validateConcept } from '../validateConcept';

const DIR = path.join(process.cwd(), 'content', 'playbook');
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));

/**
 * Lint warnings a content file keeps ON PURPOSE: file -> exact warning text
 * (`<concept id> <warning>`) -> why it stays. Keep this narrow: one entry per
 * deliberate choice, never a pattern. The reasons are on record in the
 * content's review notes (content/playbook/*.review-notes.md).
 */
const ALLOWED_LINT_WARNINGS: Record<string, Record<string, string>> = {
  'pepo-8v8.json': {
    'vaihtoehdot steps[7].arrows: 5 arrows (more than 4 is hard to follow)':
      'Recap step "Sinä päätät": the PDF picture shows all five pass options from the ball holder at once (plus the two dribble zones). Kept deliberately in the review.',
  },
};

describe('committed playbook content', () => {
  it('has at least one playbook file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  describe.each(files)('%s', (file) => {
    const doc = JSON.parse(readFileSync(path.join(DIR, file), 'utf8')) as {
      playbook: { id: string; name: string };
      concepts: unknown[];
    };

    it('names its playbook with a valid id', () => {
      expect(doc.playbook.id).toMatch(/^[a-z0-9][a-z0-9_-]{0,63}$/);
      expect(doc.playbook.name.trim()).not.toBe('');
    });

    it('every concept passes validateConcept, ids unique', () => {
      const problems: string[] = [];
      const ids = new Set<string>();
      doc.concepts.forEach((c, i) => {
        const v = validateConcept(c);
        if (!v.ok) problems.push(...v.errors.map((e) => `concepts[${i}] ${e}`));
        else if (ids.has(v.concept.id)) problems.push(`concepts[${i}] duplicate id ${v.concept.id}`);
        else ids.add(v.concept.id);
      });
      expect(problems).toEqual([]);
      expect(ids.size).toBe(doc.concepts.length);
    });

    /**
     * Readability warnings (overlapping discs, too many arrows, a pass not from
     * the ball...) fail the build unless ALLOWED_LINT_WARNINGS lists that exact
     * warning with a reason. An allowance that no longer fires fails too, so the
     * list cannot go stale.
     */
    it('lintConcept: no warnings except the documented allowances', () => {
      const warnings: string[] = [];
      for (const c of doc.concepts) {
        const v = validateConcept(c);
        if (v.ok) warnings.push(...lintConcept(v.concept).map((w) => `${v.concept.id} ${w}`));
      }
      const allowed = ALLOWED_LINT_WARNINGS[file] ?? {};
      expect(warnings.filter((w) => !Object.hasOwn(allowed, w))).toEqual([]);
      expect(Object.keys(allowed).filter((w) => !warnings.includes(w))).toEqual([]);
    });
  });
});
