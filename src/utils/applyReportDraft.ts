/**
 * Turning an approved AI draft into game data (Kirjuri PR 9a).
 *
 * Pure: takes the draft, what the coach ticked, and the game's current state,
 * and returns the new report text plus the note events to add. It writes
 * nothing itself - the caller dispatches, so the existing autosave path and
 * validation stay the only way data reaches storage.
 *
 * THE RULE THAT SHAPES THIS FILE: the coach's own words are never destroyed.
 * A drafted report is appended below whatever they already wrote unless they
 * explicitly ask to replace it, and `replace` still hands the previous text
 * back to the caller so a UI can offer an undo. Everything the AI produced is
 * stamped with `source: 'ai'` and the model plus packet fingerprint that made
 * it, so a later, better model's work can be told from today's.
 */

import type { DraftPlayerNote, ReportDraft, ReportSectionKey } from '@/utils/aiDrafting';
import type { AiMeta, GameEvent } from '@/types/game';
import { UNKNOWN_PLAYER_REF } from '@/utils/gamePacket';
import { VALIDATION_LIMITS } from '@/config/validationLimits';

export type ApplyMode = 'append' | 'replace';

export interface ApplyReportDraftOptions {
  draft: ReportDraft;
  /** Sections the coach ticked. Order is ignored; template order is used. */
  approvedSections: ReportSectionKey[];
  /** Indices into `draft.playerNotes` the coach ticked. */
  approvedPlayerNoteIndexes: number[];
  /** The report text as it stands right now. */
  existingReport: string;
  mode: ApplyMode;
  /** Localized heading for a section key. */
  labelFor: (section: ReportSectionKey) => string;
  /** Packet ref -> player id, from `buildGamePacket`. */
  refToPlayerId: Record<string, string>;
  /**
   * The name to show for a packet ref. Drafted prose arrives full of codes;
   * this is what turns it back into the coach's own players.
   */
  nameForRef: (ref: string) => string;
  /** Clock stamp for the note events: where the match ended. */
  stamp: { time: number; period: number };
  /** Injected for deterministic ids in tests. */
  idFactory?: (index: number) => string;
}

export interface ApplyReportDraftResult {
  /** The report text to save, already within the validation cap. */
  report: string;
  /** New note events to dispatch, in draft order. */
  noteEvents: GameEvent[];
  /** True when the cap cut the composed report. */
  reportTruncated: boolean;
  /** Set on `replace` so the caller can offer to undo. */
  replacedReport?: string;
  /**
   * Provenance to store alongside the report, set only when drafted text was
   * actually applied. On `append` the report is then part coach, part model,
   * and this records which model contributed - not that it wrote all of it.
   */
  reportAiMeta?: AiMeta;
  /** Approved notes whose ref no longer maps to a player; nothing was created. */
  droppedRefs: string[];
}

const SEPARATOR = '\n\n';

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

/**
 * Put the players' names back into drafted prose.
 *
 * The packet sends codes so the provider never learns who these children are.
 * That protection is about the provider, not about the coach: once the words
 * are back on the device, a report reading "P1 pelasi rohkeasti" in the coach's
 * own document is simply broken. Player notes were always mapped back through
 * `entityId`; section text was not, and went in with the codes intact.
 *
 * Longest ref first, so "P1" cannot eat the front of "P10", and boundaries on
 * both sides so a code is only replaced when it stands as its own word.
 *
 * Finnish inflects a code with a colon - "P2:lle", "P1:n" - because that is how
 * abbreviations take endings. A NAME takes the ending directly, so the colon has
 * to go with the code: "P2:lle" becomes "Keijolle", not "Keijo:lle".
 */
export function resolveRefsInText(
  text: string,
  refs: string[],
  nameForRef: (ref: string) => string,
): string {
  if (refs.length === 0) return text;
  const alternatives = [...refs]
    .sort((a, b) => b.length - a.length)
    .map((ref) => ref.replace(REGEX_SPECIAL, '\\$&'))
    .join('|');
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(${alternatives})(?::(\\p{L}+))?(?![\\p{L}\\p{N}])`,
    'gu',
  );
  return text.replace(pattern, (match, ref: string, ending: string | undefined) => {
    const name = nameForRef(ref);
    if (!name) return match;
    // "P2:lle" -> "Keijolle": the colon belonged to the code, not to the name.
    return ending ? `${name}${ending}` : name;
  });
}

const defaultIdFactory = (index: number): string =>
  `note-ai-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;

/** Sections in template order, so a ticked set always reads the same way. */
function orderedSections(draft: ReportDraft, approved: ReportSectionKey[]): ReportDraft['sections'] {
  const wanted = new Set(approved);
  return draft.sections.filter((s) => wanted.has(s.section));
}

export function composeReportText(
  draft: ReportDraft,
  approvedSections: ReportSectionKey[],
  labelFor: (section: ReportSectionKey) => string,
  refs: string[],
  nameForRef: (ref: string) => string,
): string {
  return orderedSections(draft, approvedSections)
    .map(({ section, text }) => `${labelFor(section)}:\n${resolveRefsInText(text.trim(), refs, nameForRef)}`)
    .join(SEPARATOR);
}

/**
 * Build the report text and note events for the items the coach approved.
 *
 * Nothing is created for a ref that is not in `refToPlayerId`: the drafting
 * layer already drops refs the packet never had, and this is the second gate
 * before a sentence gets attached to a real child.
 */
export function applyReportDraft({
  draft,
  approvedSections,
  approvedPlayerNoteIndexes,
  existingReport,
  mode,
  labelFor,
  refToPlayerId,
  nameForRef,
  stamp,
  idFactory = defaultIdFactory,
}: ApplyReportDraftOptions): ApplyReportDraftResult {
  const meta: AiMeta = { model: draft.model, packet: draft.packetFingerprint };
  // Every ref the packet used, plus the one that means "we could not tell".
  const refs = [...Object.keys(refToPlayerId), UNKNOWN_PLAYER_REF];
  const drafted = composeReportText(draft, approvedSections, labelFor, refs, nameForRef);
  const existing = existingReport.trim();

  let composed: string;
  let replacedReport: string | undefined;
  if (!drafted) {
    // Nothing approved for the report: leave the coach's text exactly as it is,
    // whatever the mode says.
    composed = existing;
  } else if (mode === 'replace') {
    composed = drafted;
    // Handed back so the caller can offer an undo; only meaningful if there was
    // something to lose.
    if (existing) replacedReport = existing;
  } else {
    composed = existing ? `${existing}${SEPARATOR}${drafted}` : drafted;
  }

  const cap = VALIDATION_LIMITS.GAME_NOTES_MAX;
  const reportTruncated = composed.length > cap;
  const report = reportTruncated ? composed.slice(0, cap).trimEnd() : composed;

  const noteEvents: GameEvent[] = [];
  const droppedRefs: string[] = [];
  const wanted = new Set(approvedPlayerNoteIndexes);

  draft.playerNotes.forEach((note: DraftPlayerNote, index) => {
    if (!wanted.has(index)) return;
    const entityId = refToPlayerId[note.ref];
    if (!entityId) {
      droppedRefs.push(note.ref);
      return;
    }
    const text = resolveRefsInText(note.text.trim(), refs, nameForRef).slice(
      0,
      VALIDATION_LIMITS.GAME_NOTE_EVENT_TEXT_MAX,
    );
    if (!text) return;
    noteEvents.push({
      id: idFactory(index),
      type: 'note',
      time: Math.round(stamp.time * 100) / 100,
      period: stamp.period,
      entityId,
      text,
      source: 'ai',
      aiMeta: meta,
    });
  });

  return {
    report,
    noteEvents,
    reportTruncated,
    ...(replacedReport ? { replacedReport } : {}),
    // Only claim provenance when something drafted actually went in.
    ...(drafted ? { reportAiMeta: meta } : {}),
    droppedRefs,
  };
}
