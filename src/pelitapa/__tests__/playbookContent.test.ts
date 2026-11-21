/**
 * The committed playbook content (content/pelitapa/*.json) is the source the
 * seed script loads into the database. Every concept in it must pass the
 * app's own validator, or the app would skip it.
 * @critical
 */
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { validateConcept } from '../validateConcept';

const DIR = path.join(process.cwd(), 'content', 'pelitapa');
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'));

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
  });
});
