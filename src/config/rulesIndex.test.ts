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
  rulebookUrl,
  searchRules,
  withPage,
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

  it('every topic resolves in the codes it claims to apply to', () => {
    expect(RULES_TOPICS.length).toBeGreaterThan(15);
    for (const t of RULES_TOPICS) {
      expect(t.fi.trim()).not.toBe('');
      expect(t.en.trim()).not.toBe('');
      const sports = t.sports ?? (['football', 'futsal'] as const);
      for (const sport of sports) {
        if (t.law === null) {
          // Guidance rather than a law: it must carry its own page instead.
          expect(t.page).toBeGreaterThan(0);
        } else {
          expect(findLaw(sport, t.law)).not.toBeNull();
        }
      }
    }
  });

  /**
   * @critical - these three were WRONG in the first version and only a search
   * of each law's own pages found it. Time-out does not exist in football, sin
   * bin does not exist in futsal, and accumulated fouls are futsal Law 13, not
   * 12. Shipping a confident wrong law reference is the failure mode here.
   */
  it('scopes the topics that exist in only one code, at the verified law', () => {
    const byId = Object.fromEntries(RULES_TOPICS.map((t) => [t.id, t]));

    expect(byId.timeout.sports).toEqual(['futsal']);
    expect(byId.timeout.law).toBe(7);

    expect(byId.sinbin.sports).toEqual(['football']);
    expect(byId.sinbin.law).toBeNull();
    expect(byId.sinbin.page).toBe(10);

    expect(byId.accumulated.sports).toEqual(['futsal']);
    expect(byId.accumulated.law).toBe(13);

    // Dropped rather than guessed: its placement could not be verified.
    expect(byId.backpass).toBeUndefined();
  });

  it('gives every law an English title as well as the official Finnish one', () => {
    for (const sport of ['football', 'futsal'] as const) {
      for (const l of RULES_SPORTS[sport].laws) {
        expect(l.titleEn.trim().length).toBeGreaterThan(2);
        expect(l.titleEn).not.toBe(l.title);
      }
    }
    // The restarts that genuinely differ between the codes.
    expect(findLaw('football', 15)!.titleEn).toContain('Throw');
    expect(findLaw('futsal', 15)!.titleEn).toContain('Kick-in');
  });

  /**
   * @critical - the licence line. If this ever fails, someone has started
   * copying the rulebook into the repo and the app is redistributing content
   * IFAB and FIFA explicitly reserve.
   */
  it('contains no rule prose, only citations', () => {
    const data = JSON.parse(rawJson) as {
      topics: unknown[];
      sports: Record<string, { laws: { title: string; titleEn: string }[] }>;
    };
    // Law titles are short citations; a sentence of rule text would not be.
    for (const sport of Object.values(data.sports)) {
      sport.laws.forEach((l) => {
        expect(l.title.length).toBeLessThan(60);
        expect(l.titleEn.length).toBeLessThan(60);
      });
    }
    // No rulebook sentence fragments: rule prose is full of these verbs.
    const prose = /\b(tulee olla|on tuomittava|erotuomarin on|shall be awarded|must be awarded)\b/i;
    expect(prose.test(rawJson)).toBe(false);
  });
});

describe('deep links', () => {
  /**
   * @critical - the page mapping is what sends a coach to the right law. It is
   * asserted on the data itself, since the in-app viewer consumes the page
   * number rather than a pre-built URL.
   */
  it('maps a law to the right page in each book', () => {
    expect(findLaw('football', 12)!.page).toBe(65);
    expect(findLaw('futsal', 12)!.page).toBe(41);
    expect(findLaw('football', 99)).toBeNull();
  });

  it('uses the sport\u2019s own book, not one for both', () => {
    expect(rulebookUrl('football')).not.toBe(rulebookUrl('futsal'));
    expect(rulebookUrl('futsal')).toContain('futsal');
  });

  /**
   * @edge-case - the browser fallback must never produce a bare fragment,
   * which navigates the app to itself instead of the rulebook.
   */
  it('builds the browser fallback safely or not at all', () => {
    expect(withPage(rulebookUrl('football'), 65)).toContain('jalkapallosaannot-2026.pdf#page=65');
    expect(withPage(null, 65)).toBeNull();
    expect(withPage(rulebookUrl('football'), 0)).toBeNull();
    expect(withPage(rulebookUrl('football'), -1)).toBeNull();
    expect(withPage(rulebookUrl('football'), 1.5)).toBeNull();
    expect(withPage(rulebookUrl('football'), 65)!.startsWith('#')).toBe(false);
  });
});

describe('search', () => {
  it('shows every law when nothing is typed', () => {
    // 17 laws plus the football-only sin bin guidance.
    expect(searchRules('football', '', 'fi')).toHaveLength(18);
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
    expect(hits.some((h) => h.via)).toBe(true);
  });

  /**
   * @critical - a football coach must not be offered a futsal-only rule, and
   * the reverse. This is the bug the verification pass caught.
   */
  it('never offers a topic from the other code', () => {
    expect(searchRules('football', 'aikalisä', 'fi')).toEqual([]);
    expect(searchRules('football', 'kumulatiivis', 'fi')).toEqual([]);
    expect(searchRules('futsal', 'sin bin', 'en')).toEqual([]);

    expect(searchRules('futsal', 'aikalisä', 'fi').map((h) => h.law)).toEqual([7]);
    expect(searchRules('futsal', 'kumulatiivis', 'fi').map((h) => h.law)).toEqual([13]);
  });

  it('offers sin bin as guidance with its own page, not as a law', () => {
    const hits = searchRules('football', 'sin bin', 'en');
    expect(hits).toHaveLength(1);
    expect(hits[0].law).toBeNull();
    expect(hits[0].page).toBe(10);
  });

  it('shows English law titles when the UI is English', () => {
    const hits = searchRules('football', 'offside', 'en');
    expect(hits[0].title).toBe('Offside');
    expect(searchRules('football', 'paitsio', 'fi')[0].title).toBe('Paitsio');
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

  it('keys laws and topics apart, so an id can never collide with a number', () => {
    const hits = searchRules('football', '', 'fi');
    expect(hits.every((h) => /^(law:\d+|topic:[a-z_]+)$/.test(h.key))).toBe(true);
  });

  it('lists each law once even when several topics point at it', () => {
    const hits = searchRules('football', 'e', 'fi');
    expect(new Set(hits.map((h) => h.key)).size).toBe(hits.length);
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
