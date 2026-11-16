/**
 * Applying an approved AI draft to a game (Kirjuri PR 9a).
 *
 * @critical - this is the only path from generated text into the coach's own
 * record. Two properties are tested hardest: the coach's existing report is
 * never destroyed, and a sentence is never attached to a player the mapping
 * does not know.
 */
import { applyReportDraft, composeReportText } from '../applyReportDraft';
import type { ReportDraft, ReportSectionKey } from '../aiDrafting';
import { VALIDATION_LIMITS } from '@/config/validationLimits';

const labelFor = (section: ReportSectionKey): string =>
  ({
    overview: 'Yleiskuva',
    flow: 'Pelin kulku',
    worked: 'Mikä toimi hyvin',
    improve: 'Kehityskohteet',
    spirit: 'Joukkuehenki ja asenne',
    mentions: 'Erityismaininnat',
    next: 'Seuraava askel',
  })[section] ?? section;

const draft = (over: Partial<ReportDraft> = {}): ReportDraft => ({
  sections: [
    { section: 'overview', text: 'Tasainen ottelu.' },
    { section: 'next', text: 'Harjoitellaan syöttöä.' },
  ],
  playerNotes: [
    { ref: 'X1', text: 'Rohkea eteenpäin.' },
    { ref: 'X2', text: 'Hyvä puolustustyö.' },
  ],
  model: 'gpt-5-mini',
  packetFingerprint: 'v1-abcdef0123456789',
  ...over,
});

const base = {
  draft: draft(),
  approvedSections: ['overview', 'next'] as ReportSectionKey[],
  approvedPlayerNoteIndexes: [0, 1],
  existingReport: '',
  mode: 'append' as const,
  labelFor,
  refToPlayerId: { X1: 'p1', X2: 'p2' },
  nameForRef: (ref: string) => ({ X1: 'Emma', X2: 'Matti' }[ref] ?? 'Tuntematon pelaaja'),
  stamp: { time: 3000, period: 2 },
  idFactory: (i: number) => `n${i}`,
};

describe('applyReportDraft - the coach keeps their words', () => {
  /** @critical - appending must never lose what the coach already wrote. */
  it('appends below existing text, leaving it byte for byte intact', () => {
    const existing = 'Yleiskuva:\nOma muistiinpanoni, jota ei saa hukata.';
    const result = applyReportDraft({ ...base, existingReport: existing, approvedSections: ['overview'] });

    expect(result.report.startsWith(existing)).toBe(true);
    expect(result.report).toContain('Tasainen ottelu.');
    expect(result.replacedReport).toBeUndefined();
  });

  /** @critical - replace is destructive, so the old text comes back for undo. */
  it('hands the previous text back when the coach chose replace', () => {
    const existing = 'Vanha raporttini.';
    const result = applyReportDraft({ ...base, existingReport: existing, mode: 'replace' });

    expect(result.report).not.toContain('Vanha');
    expect(result.replacedReport).toBe(existing);
  });

  it('leaves the report untouched when no section was approved, even on replace', () => {
    const existing = 'Vain omat sanani.';
    for (const mode of ['append', 'replace'] as const) {
      const result = applyReportDraft({ ...base, existingReport: existing, approvedSections: [], mode });
      expect(result.report).toBe(existing);
      expect(result.replacedReport).toBeUndefined();
    }
  });

  it('reports truncation rather than silently exceeding the cap', () => {
    const long = 'x'.repeat(VALIDATION_LIMITS.GAME_NOTES_MAX - 10);
    const result = applyReportDraft({ ...base, existingReport: long });

    expect(result.reportTruncated).toBe(true);
    expect(result.report.length).toBeLessThanOrEqual(VALIDATION_LIMITS.GAME_NOTES_MAX);
    // The coach's own text is the part that survives - the draft is appended after it.
    expect(result.report.startsWith(long)).toBe(true);
  });

  it('does not flag truncation for an ordinary report', () => {
    expect(applyReportDraft(base).reportTruncated).toBe(false);
  });

  /** Provenance is a claim about the text, so it is only made when text went in. */
  it('records report provenance only when drafted text was applied', () => {
    expect(applyReportDraft(base).reportAiMeta).toEqual({
      model: 'gpt-5-mini',
      packet: 'v1-abcdef0123456789',
    });
    expect(applyReportDraft({ ...base, approvedSections: [] }).reportAiMeta).toBeUndefined();
    // Notes-only approval must not stamp the report the coach wrote alone.
    const notesOnly = applyReportDraft({ ...base, approvedSections: [], existingReport: 'Omat sanani.' });
    expect(notesOnly.reportAiMeta).toBeUndefined();
    expect(notesOnly.noteEvents).toHaveLength(2);
  });
});

describe('applyReportDraft - section text', () => {
  it('writes approved sections under localized headings in template order', () => {
    const result = applyReportDraft({ ...base, approvedSections: ['next', 'overview'] });

    expect(result.report).toBe('Yleiskuva:\nTasainen ottelu.\n\nSeuraava askel:\nHarjoitellaan syöttöä.');
  });

  it('omits a section the coach did not tick', () => {
    const result = applyReportDraft({ ...base, approvedSections: ['next'] });

    expect(result.report).toBe('Seuraava askel:\nHarjoitellaan syöttöä.');
    expect(result.report).not.toContain('Tasainen');
  });

  it('composeReportText is usable on its own for a preview', () => {
    const refs = ['X1', 'X2'];
    const nameForRef = (ref: string) => ({ X1: 'Emma', X2: 'Matti' }[ref] ?? ref);
    expect(composeReportText(draft(), ['overview'], labelFor, refs, nameForRef)).toBe(
      'Yleiskuva:\nTasainen ottelu.',
    );
    expect(composeReportText(draft(), [], labelFor, refs, nameForRef)).toBe('');
  });
});

describe('applyReportDraft - codes become names again', () => {
  /**
   * @critical - the packet sends codes so the provider never learns who these
   * children are. That protects them from the PROVIDER, not from the coach: a
   * report reading "X1 pelasi rohkeasti" in the coach's own document is broken.
   */
  it('puts names back into the drafted prose and into note text', () => {
    const withRefs = draft({
      sections: [{ section: 'mentions', text: 'X1 teki paljon työtä ilman palloa, ja X2 tuki hyvin.' }],
      playerNotes: [{ ref: 'X1', text: 'Rohkea. Yhteistyö X2:n kanssa toimi.' }],
    });
    const result = applyReportDraft({
      ...base,
      draft: withRefs,
      approvedSections: ['mentions'],
      approvedPlayerNoteIndexes: [0],
    });

    expect(result.report).toBe('Erityismaininnat:\nEmma teki paljon työtä ilman palloa, ja Matti tuki hyvin.');
    expect(result.noteEvents[0].text).toBe('Rohkea. Yhteistyö Matin kanssa toimi.');
    expect(result.report).not.toMatch(/\bP[0-9?]/);
  });

  /**
   * @critical - a real draft came back with "Keijo:lle merkittiin upea torjunta"
   * and "Esko:n kautta syntyi maali". Finnish inflects a CODE with a colon;
   * a name takes the ending directly, so the colon goes with the code.
   */
  it('drops the colon Finnish uses for codes, so a name inflects properly', () => {
    const inflected = draft({
      sections: [{ section: 'mentions', text: 'X2:lle upea torjunta, ja X1:n kautta syntyi maali. X2 oli vahva.' }],
    });
    const result = applyReportDraft({
      ...base,
      draft: inflected,
      approvedSections: ['mentions'],
      approvedPlayerNoteIndexes: [],
      nameForRef: (ref) => ({ X1: 'Esko', X2: 'Keijo' }[ref] ?? ref),
    });

    expect(result.report).toBe('Erityismaininnat:\nKeijolle upea torjunta, ja Eskon kautta syntyi maali. Keijo oli vahva.');
    // The heading keeps its own colon; the prose must carry none.
    expect(result.report.split('\n')[1]).not.toContain(':');
  });

  /** Finnish weakens a doubled k/p/t before a consonant ending: Matti -> Matin. */
  it('inflects a name properly instead of gluing the ending on', () => {
    const forms = draft({
      sections: [{ section: 'overview', text: 'X1:n syöttö, X2:lle kiitos, X3:a kehuttiin, X4:n veto.' }],
    });
    const result = applyReportDraft({
      ...base,
      draft: forms,
      approvedSections: ['overview'],
      approvedPlayerNoteIndexes: [],
      refToPlayerId: { X1: 'p1', X2: 'p2', X3: 'p3', X4: 'p4' },
      nameForRef: (ref) => ({ X1: 'Matti', X2: 'Pekka', X3: 'Matti', X4: 'Keijo' }[ref] ?? ref),
    });

    // Weak grade before a consonant ending; strong grade kept before a vowel.
    expect(result.report).toBe('Yleiskuva:\nMatin syöttö, Pekalle kiitos, Mattia kehuttiin, Keijon veto.');
  });

  /** "X1" must not eat the front of "X10" in a squad of a dozen or more. */
  it('does not let a short ref swallow a longer one', () => {
    const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`X${i + 1}`, `p${i + 1}`]));
    const withRefs = draft({ sections: [{ section: 'overview', text: 'X1 ja X10 ja X12 pelasivat.' }] });
    const result = applyReportDraft({
      ...base,
      draft: withRefs,
      approvedSections: ['overview'],
      approvedPlayerNoteIndexes: [],
      refToPlayerId: many,
      nameForRef: (ref) => ({ X1: 'Emma', X10: 'Leo', X12: 'Sofia' }[ref] ?? ref),
    });

    expect(result.report).toBe('Yleiskuva:\nEmma ja Leo ja Sofia pelasivat.');
  });

  /**
   * Review 6.1: Finnish teams are named by age group ("PEPO P11"). With a squad of 12
   * the team name must survive - P-codes used to resolve it into a child's name
   * ("PEPO Eetu voitti HJK Onnin").
   * @critical
   */
  it('keeps age-group team names like "PEPO P11" intact in a 12-player squad', () => {
    const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`X${i + 1}`, `p${i + 1}`]));
    const withRefs = draft({ sections: [{ section: 'overview', text: 'PEPO P11 voitti HJK P12:n 3-1. X11 teki kaksi.' }] });
    const result = applyReportDraft({
      ...base,
      draft: withRefs,
      approvedSections: ['overview'],
      approvedPlayerNoteIndexes: [],
      refToPlayerId: many,
      nameForRef: (ref) => ({ X11: 'Eetu', X12: 'Onni' }[ref] ?? ref),
    });
    expect(result.report).toBe('Yleiskuva:\nPEPO P11 voitti HJK P12:n 3-1. Eetu teki kaksi.');
  });

  it('leaves the unidentified marker readable rather than as a code', () => {
    const withRefs = draft({ sections: [{ section: 'overview', text: 'X? sai hyvän paikan.' }] });
    const result = applyReportDraft({
      ...base,
      draft: withRefs,
      approvedSections: ['overview'],
      approvedPlayerNoteIndexes: [],
      nameForRef: (ref) => (ref === 'X?' ? 'yksi pelaajista' : 'Emma'),
    });

    expect(result.report).toBe('Yleiskuva:\nyksi pelaajista sai hyvän paikan.');
  });

  it('leaves ordinary text with no refs untouched', () => {
    const result = applyReportDraft({ ...base, approvedSections: ['overview'], approvedPlayerNoteIndexes: [] });
    expect(result.report).toBe('Yleiskuva:\nTasainen ottelu.');
  });
});

describe('applyReportDraft - player notes', () => {
  it('creates note events stamped with source and provenance', () => {
    const result = applyReportDraft(base);

    expect(result.noteEvents).toEqual([
      {
        id: 'n0',
        type: 'note',
        time: 3000,
        period: 2,
        entityId: 'p1',
        text: 'Rohkea eteenpäin.',
        source: 'ai',
        aiMeta: { model: 'gpt-5-mini', packet: 'v1-abcdef0123456789' },
      },
      {
        id: 'n1',
        type: 'note',
        time: 3000,
        period: 2,
        entityId: 'p2',
        text: 'Hyvä puolustustyö.',
        source: 'ai',
        aiMeta: { model: 'gpt-5-mini', packet: 'v1-abcdef0123456789' },
      },
    ]);
  });

  it('creates nothing for a note the coach did not tick', () => {
    const result = applyReportDraft({ ...base, approvedPlayerNoteIndexes: [1] });

    expect(result.noteEvents.map((e) => e.entityId)).toEqual(['p2']);
  });

  /** @critical - a ref with no player must never be guessed onto someone. */
  it('drops an approved note whose ref has no player and says which', () => {
    const result = applyReportDraft({ ...base, refToPlayerId: { X1: 'p1' } });

    expect(result.noteEvents.map((e) => e.entityId)).toEqual(['p1']);
    expect(result.droppedRefs).toEqual(['X2']);
  });

  it('caps note text at the same limit the datastore validates', () => {
    const long = draft({ playerNotes: [{ ref: 'X1', text: 'y'.repeat(VALIDATION_LIMITS.GAME_NOTE_EVENT_TEXT_MAX + 50) }] });
    const result = applyReportDraft({ ...base, draft: long, approvedPlayerNoteIndexes: [0] });

    expect(result.noteEvents[0].text).toHaveLength(VALIDATION_LIMITS.GAME_NOTE_EVENT_TEXT_MAX);
  });

  it('skips an empty note instead of creating a blank one', () => {
    const blank = draft({ playerNotes: [{ ref: 'X1', text: '   ' }] });
    const result = applyReportDraft({ ...base, draft: blank, approvedPlayerNoteIndexes: [0] });

    expect(result.noteEvents).toEqual([]);
    expect(result.droppedRefs).toEqual([]);
  });

  it('maps real-name refs too, for a coach who turned pseudonymization off', () => {
    const named = draft({ playerNotes: [{ ref: 'Emma', text: 'Hyvä peli.' }] });
    const result = applyReportDraft({
      ...base,
      draft: named,
      approvedPlayerNoteIndexes: [0],
      refToPlayerId: { Emma: 'p1' },
    });

    expect(result.noteEvents[0].entityId).toBe('p1');
  });
});
