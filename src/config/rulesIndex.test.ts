/**
 * @critical - two different ways this can hurt someone.
 *
 * A wrong page number sends a coach to the wrong law mid-argument, which is
 * worse than no shortcut at all. And this file exists ONLY because the rule
 * text is not ours to ship: IFAB and FIFA reserve all rights, so a test guards
 * that nobody ever pastes rule prose into the index.
 */
import fs from 'fs';
import path from 'path';
import {
  RULES_SPORTS,
  RULES_TOPICS,
  findLaw,
  lawUrl,
  rulebookUrl,
  searchRules,
} from './rulesIndex';

const rawJson = fs.readFileSync(path.join(process.cwd(), 'src/config/rulesIndex.json'), 'utf8');

describe('rules index shape', () => {
  it.each(['football', 'futsal'] as const)('%s has all 17 laws, numbered 1-17 with ascending pages', (sport) => {
    const laws = RULES_SPORTS[sport].laws;
    expect(laws.map((l) => l.law)).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
    for (let i = 1; i < laws.length; i++) {
      // A later law cannot start earlier in the book; catches a bad transcription.
      expect(laws[i].page).toBeGreaterThan(laws[i - 1].page);
    }
    laws.forEach((l) => {
      expect(l.title.length).toBeGreaterThan(2);
      expect(l.page).toBeGreaterThan(0);
    });
  });

  it('every topic points at a law that exists in both codes', () => {
    expect(RULES_TOPICS.length).toBeGreaterThan(15);
    for (const t of RULES_TOPICS) {
      expect(findLaw('football', t.law)).not.toBeNull();
      expect(findLaw('futsal', t.law)).not.toBeNull();
      expect(t.fi.trim()).not.toBe('');
      expect(t.en.trim()).not.toBe('');
    }
  });

  /**
   * @critical - the licence line. If this ever fails, someone has started
   * copying the rulebook into the repo and the app is redistributing content
   * IFAB and FIFA explicitly reserve.
   */
  it('contains no rule prose, only citations', () => {
    const data = JSON.parse(rawJson) as { topics: unknown[]; sports: Record<string, { laws: { title: string }[] }> };
    // Law titles are short citations; a sentence of rule text would not be.
    for (const sport of Object.values(data.sports)) {
      sport.laws.forEach((l) => expect(l.title.length).toBeLessThan(60));
    }
    // No rulebook sentence fragments: rule prose is full of these verbs.
    const prose = /\b(tulee olla|on tuomittava|erotuomarin on|shall be awarded|must be awarded)\b/i;
    expect(prose.test(rawJson)).toBe(false);
  });
});

describe('deep links', () => {
  it('points at the same PDF the links config carries, at the law page', () => {
    const url = lawUrl('football', 12);
    expect(url).toContain('jalkapallosaannot-2026.pdf');
    expect(url).toContain('#page=65');
    expect(lawUrl('futsal', 12)).toContain('#page=41');
  });

  it('uses the sport’s own book, not one for both', () => {
    expect(rulebookUrl('football')).not.toBe(rulebookUrl('futsal'));
    expect(rulebookUrl('futsal')).toContain('futsal');
  });

  it('returns null for a law that does not exist rather than a broken link', () => {
    expect(lawUrl('football', 99)).toBeNull();
    expect(findLaw('futsal', 0)).toBeNull();
  });
});

describe('search', () => {
  it('shows every law when nothing is typed', () => {
    expect(searchRules('football', '', 'fi')).toHaveLength(17);
    expect(searchRules('futsal', '   ', 'en')).toHaveLength(17);
  });

  /**
   * @critical - the whole point. "kentältäpoisto" is not the title of any law,
   * so a title-only search would answer nothing for the single most likely
   * question a coach has on the touchline.
   */
  it('finds a law by the coach’s word, not just the official title', () => {
    const hits = searchRules('football', 'kentältäpoisto', 'fi');
    expect(hits.map((h) => h.law)).toContain(12);
    expect(hits[0].via).toBeTruthy();
  });

  it('finds the same thing in English', () => {
    expect(searchRules('football', 'sending off', 'en').map((h) => h.law)).toContain(12);
    expect(searchRules('football', 'offside', 'en').map((h) => h.law)).toEqual([11]);
  });

  it('matches official titles too', () => {
    expect(searchRules('futsal', 'paitsio', 'fi').map((h) => h.law)).toContain(11);
  });

  it('finds a law by its number', () => {
    expect(searchRules('football', '14', 'fi').map((h) => h.law)).toEqual([14]);
  });

  it('lists each law once even when several topics point at it', () => {
    const hits = searchRules('football', 'e', 'fi');
    expect(new Set(hits.map((h) => h.law)).size).toBe(hits.length);
  });

  it('returns nothing for a word in neither the topics nor the titles', () => {
    expect(searchRules('football', 'zzzznotarule', 'fi')).toEqual([]);
  });

  /**
   * The two codes name the same restarts differently: football has a throw-in
   * and a goal kick, futsal a kick-in and a goal clearance. The index must show
   * each sport its own title.
   */
  it('shows each sport its own wording for the restarts that differ', () => {
    const f = findLaw('football', 15)!.title.toLowerCase();
    const s = findLaw('futsal', 15)!.title.toLowerCase();
    expect(f).not.toBe(s);
    expect(f).toContain('heitto');
    expect(s).toContain('potku');
  });
});
