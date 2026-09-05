/**
 * Applying an approved AI draft to a game (Kirjuri PR 9a).
 *
 * @critical - this is the only path from generated text into the coach's own
 * record. Two properties are tested hardest: the coach's existing report is
 * never destroyed, and a sentence is never attached to a player the mapping
 * does not know.
 */
import { applyReportDraft, composeReportText } from '../applyReportDraft';
import type { ReportDraft } from '../aiDrafting';
import { VALIDATION_LIMITS } from '@/config/validationLimits';

const labelFor = (section: string) =>
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
    { ref: 'P1', text: 'Rohkea eteenpäin.' },
    { ref: 'P2', text: 'Hyvä puolustustyö.' },
  ],
  model: 'gpt-5-mini',
  packetFingerprint: 'v1-abcdef0123456789',
  ...over,
});

const base = {
  draft: draft(),
  approvedSections: ['overview', 'next'] as const,
  approvedPlayerNoteIndexes: [0, 1],
  existingReport: '',
  mode: 'append' as const,
  labelFor,
  refToPlayerId: { P1: 'p1', P2: 'p2' },
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
    expect(composeReportText(draft(), ['overview'], labelFor)).toBe('Yleiskuva:\nTasainen ottelu.');
    expect(composeReportText(draft(), [], labelFor)).toBe('');
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
    const result = applyReportDraft({ ...base, refToPlayerId: { P1: 'p1' } });

    expect(result.noteEvents.map((e) => e.entityId)).toEqual(['p1']);
    expect(result.droppedRefs).toEqual(['P2']);
  });

  it('caps note text at the same limit the datastore validates', () => {
    const long = draft({ playerNotes: [{ ref: 'P1', text: 'y'.repeat(VALIDATION_LIMITS.GAME_NOTE_EVENT_TEXT_MAX + 50) }] });
    const result = applyReportDraft({ ...base, draft: long, approvedPlayerNoteIndexes: [0] });

    expect(result.noteEvents[0].text).toHaveLength(VALIDATION_LIMITS.GAME_NOTE_EVENT_TEXT_MAX);
  });

  it('skips an empty note instead of creating a blank one', () => {
    const blank = draft({ playerNotes: [{ ref: 'P1', text: '   ' }] });
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
