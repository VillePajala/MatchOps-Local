/**
 * The committed playbook content (content/playbook/*.json): a club's
 * collection is the source the seed script loads into the database; our own
 * universal collections (BUILT_IN_FILES) ship with the app
 * (builtInPlaybooks.ts). Every concept in it must pass the app's own
 * validator, or the app would skip it.
 * @critical
 */
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { lintConcept, validateConcept } from '../validateConcept';
import { lintConceptMotion } from '../lintMotion';
import { MATCHOPS_8V8 } from '../builtInPlaybooks';
import { BUILT_IN_PLAYBOOK } from '../usePlaybooks';
import type { Concept } from '../types';

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

/**
 * Our own universal collections ship with the app and are shown to kids, so
 * they are held to the authoring rules with NO allowances: no lint warning of
 * any kind, nothing runs or is passed through a player, short kid-level
 * texts, a full 8v8 on every board and a "Pohdittavaksi" question.
 * @critical
 */
const BUILT_IN_FILES = ['matchops-8v8.json'];
const AGE_BAND = /^U\d+(–U\d+)?$/;
const KNOWN_PHASES = ['Perusteet', 'Hyökkääminen', 'Puolustaminen', 'Tilanteenvaihto +', 'Tilanteenvaihto −', 'Erikoistilanteet'];
const sentences = (text: string) => text.split(/[.!?]+(?:\s|$)/).filter((part) => part.trim() !== '').length;

describe.each(BUILT_IN_FILES)('built-in collection %s', (file) => {
  const doc = JSON.parse(readFileSync(path.join(DIR, file), 'utf8')) as {
    playbook: { id: string; name: string };
    concepts: unknown[];
  };
  const concepts = doc.concepts.flatMap((c) => {
    const v = validateConcept(c);
    return v.ok ? [v.concept] : [];
  });

  it('is the collection the app ships, whole', () => {
    expect(file).toBe(`${MATCHOPS_8V8.id}.json`);
    expect(MATCHOPS_8V8.name).toBe(doc.playbook.name);
    expect(MATCHOPS_8V8.concepts.map((c) => c.id)).toEqual((doc.concepts as Concept[]).map((c) => c.id));
    expect(BUILT_IN_PLAYBOOK.concepts).toBe(MATCHOPS_8V8.concepts);
    expect(concepts.length).toBeGreaterThanOrEqual(12);
    expect(concepts.length).toBeLessThanOrEqual(16);
  });

  it('has no lint warnings at all (no allowances)', () => {
    expect(ALLOWED_LINT_WARNINGS[file]).toBeUndefined();
    expect(concepts.flatMap((c) => lintConcept(c).map((w) => `${c.id} ${w}`))).toEqual([]);
  });

  it('nobody runs through a player, no ground pass or arrow goes through one', () => {
    expect(concepts.flatMap((c) => lintConceptMotion(c).map((w) => `${c.id} ${w}`))).toEqual([]);
  });

  it('every concept is a full 8v8 with a keeper each, a known phase, an age band and a question', () => {
    const problems: string[] = [];
    for (const c of concepts) {
      const count = (side: 'us' | 'opp', keeper: boolean) =>
        c.players.filter((p) => p.side === side && (p.role === 'gk') === keeper).length;
      if (c.format !== '8v8') problems.push(`${c.id}: format ${c.format}`);
      if (count('us', false) !== 7 || count('us', true) !== 1) problems.push(`${c.id}: our team is not 7 + a keeper`);
      if (count('opp', false) !== 7 || count('opp', true) !== 1) problems.push(`${c.id}: their team is not 7 + a keeper`);
      if (!KNOWN_PHASES.includes(c.phase)) problems.push(`${c.id}: unknown phase "${c.phase}"`);
      if (!(c.tags ?? []).some((tag) => AGE_BAND.test(tag))) problems.push(`${c.id}: no age band tag`);
      if ((c.tags ?? []).length < 3) problems.push(`${c.id}: needs an age band, a principle and a catalogue id tag`);
      if (!c.question?.trim().endsWith('?')) problems.push(`${c.id}: no question`);
    }
    expect(problems).toEqual([]);
  });

  it('steps are short enough for a 10-year-old: 3-6 steps, title <= 6 words, text <= 2 short sentences', () => {
    const problems: string[] = [];
    for (const c of concepts) {
      if (c.steps.length < 3 || c.steps.length > 6) problems.push(`${c.id}: ${c.steps.length} steps`);
      c.steps.forEach((step, i) => {
        const at = `${c.id} steps[${i}]`;
        if (step.title.trim().split(/\s+/).length > 6) problems.push(`${at}: title "${step.title}" is over 6 words`);
        if (step.text.trim() === '') problems.push(`${at}: no text`);
        if (sentences(step.text) > 2) problems.push(`${at}: more than 2 sentences`);
        if (step.text.length > 125) problems.push(`${at}: text is ${step.text.length} characters (max 125)`);
      });
    }
    expect(problems).toEqual([]);
  });

  it('the ball is always somewhere, and a step after a cut says where', () => {
    const problems: string[] = [];
    for (const c of concepts) {
      if (c.steps[0].ball === undefined) problems.push(`${c.id}: the first step has no ball`);
      c.steps.forEach((step, i) => {
        if (step.cut && step.ball === undefined) problems.push(`${c.id} steps[${i}]: a cut step must place the ball`);
      });
    }
    expect(problems).toEqual([]);
  });
});
