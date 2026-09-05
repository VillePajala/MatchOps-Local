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
  /** Approved notes whose ref no longer maps to a player; nothing was created. */
  droppedRefs: string[];
}

const SEPARATOR = '\n\n';

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
): string {
  return orderedSections(draft, approvedSections)
    .map(({ section, text }) => `${labelFor(section)}:\n${text.trim()}`)
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
  stamp,
  idFactory = defaultIdFactory,
}: ApplyReportDraftOptions): ApplyReportDraftResult {
  const drafted = composeReportText(draft, approvedSections, labelFor);
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

  const meta: AiMeta = { model: draft.model, packet: draft.packetFingerprint };
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
    const text = note.text.trim().slice(0, VALIDATION_LIMITS.GAME_NOTE_EVENT_TEXT_MAX);
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
    droppedRefs,
  };
}
