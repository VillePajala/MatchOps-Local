/**
 * GameNotesEditor component - displays and edits the match report (game notes).
 * View mode (tap to edit) + edit mode with a resizable textarea, a "use
 * template" scaffold, and a full-width Template / Cancel / Save button row -
 * matching the report editor in Game Settings.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TranslationKey } from '@/i18n-types';
import { reportSectionHeadings } from '@/utils/reportSections';
import { VALIDATION_LIMITS } from '@/config/validationLimits';

interface GameNotesEditorProps {
  gameNotes: string;
  isEditingNotes: boolean;
  editGameNotes: string;
  notesTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onStartEdit: () => void;
  onSaveNotes: () => void;
  onCancelEdit: () => void;
  onEditNotesChange: (notes: string) => void;
  /**
   * Tidy the text in THIS field with AI. Lives here rather than in the AI card
   * below because it acts on this text: a coach who has just typed a report
   * should not have to scroll past two cards to find the button that organises
   * it, under a heading that says "draft".
   */
  onTidy?: () => void;
  /** Rough cost of that request, so a billed button says its own price. */
  tidyEstimateUsd?: number;
}

// One-line, full-width buttons in the app's segmented-control style.
const ROW_BTN = 'flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800';

export function GameNotesEditor({
  gameNotes,
  isEditingNotes,
  editGameNotes,
  notesTextareaRef,
  onStartEdit,
  onSaveNotes,
  onCancelEdit,
  onEditNotesChange,
  onTidy,
  tidyEstimateUsd = 0,
}: GameNotesEditorProps) {
  const { t } = useTranslation();

  // Nothing written yet is nothing to tidy, and the other button writes one.
  const canTidy = Boolean(onTidy) && (isEditingNotes ? editGameNotes : gameNotes).trim().length > 0;
  const tidyButton = canTidy ? (
    <button
      type="button"
      onClick={onTidy}
      className={`${ROW_BTN} bg-slate-700 text-slate-300 hover:bg-slate-600`}
      data-testid="report-editor-tidy"
    >
      {tidyEstimateUsd > 0
        ? t('reportDraft.tidyWithCost', 'Tidy this up (~${{usd}})', { usd: tidyEstimateUsd.toFixed(2) })
        : t('reportDraft.tidy', 'Tidy up what I wrote')}
    </button>
  ) : null;

  const handleUseTemplate = () => {
    // Composed from the same seven heading keys the AI draft uses, so the blank
    // template and a drafted report can never drift apart.
    const template = `${reportSectionHeadings(t).map(({ label }) => `${label}:`).join('\n\n')}\n`;
    onEditNotesChange(editGameNotes.trim() ? `${editGameNotes.trimEnd()}\n\n${template}` : template);
    requestAnimationFrame(() => notesTextareaRef.current?.focus());
  };

  return (
    <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
      <h3 className="text-xl font-semibold text-slate-200 mb-4">
        {t('gameStatsModal.notesTitle', 'Game Notes')}
      </h3>
      {isEditingNotes ? (
        <div className="space-y-3">
          <textarea
            data-testid="report-editor-text"
            ref={notesTextareaRef}
            value={editGameNotes}
            onChange={(e) => onEditNotesChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onCancelEdit(); }}
            // Past this length saving the game throws, inside an autosave that
            // hides its own errors - after which nothing about the match
            // persists and nothing on screen says so. Stop at the cap instead.
            maxLength={VALIDATION_LIMITS.GAME_NOTES_MAX}
            className="w-full h-64 min-h-[10rem] resize-y p-3 bg-slate-700 border border-slate-600 rounded-md shadow-sm text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder={t('gameStatsModal.notesPlaceholder', 'Notes...') ?? undefined}
          />
          {/* Silent until it matters: a counter over a long report is noise,
              but running out of room without warning is a lost paragraph. */}
          {editGameNotes.length > VALIDATION_LIMITS.GAME_NOTES_MAX * 0.9 && (
            <p className="text-xs text-amber-300 tabular-nums" data-testid="report-editor-remaining">
              {t('gameStatsModal.notesRemaining', '{{remaining}} characters left', {
                // Older data can already sit past the cap, and "-50 characters
                // left" is not a thing. Zero is the honest floor.
                remaining: Math.max(0, VALIDATION_LIMITS.GAME_NOTES_MAX - editGameNotes.length),
              })}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleUseTemplate}
              className={`${ROW_BTN} bg-slate-700 text-slate-300 hover:bg-slate-600`}
            >
              {t('gameSettingsModal.useTemplate' as TranslationKey, 'Template')}
            </button>
            {/* Beside Template, because they are the same kind of thing: tools
                that reshape the text in this box. */}
            {tidyButton}
            <button
              type="button"
              onClick={onCancelEdit}
              className={`${ROW_BTN} bg-slate-700 text-slate-300 hover:bg-slate-600`}
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={onSaveNotes}
              className={`${ROW_BTN} bg-indigo-600 text-white hover:bg-indigo-500`}
            >
              {t('common.save', 'Save')}
            </button>
          </div>
        </div>
      ) : (
        <div
          data-testid="report-editor-open"
          className="cursor-pointer whitespace-pre-wrap min-h-[6rem] p-3 rounded-md border border-slate-700/50 bg-slate-700/50 text-sm text-slate-300 hover:text-yellow-400 transition-colors"
          onClick={onStartEdit}
        >
          {gameNotes || (
            <span className="italic text-slate-400">
              {t('gameStatsModal.noNotes', 'No notes.')}
            </span>
          )}
        </div>
      )}
      {/* Offered while reading too: the coach does not have to enter edit mode
          to ask for the text they are looking at to be organised. */}
      {!isEditingNotes && canTidy && <div className="flex gap-2 mt-3">{tidyButton}</div>}
    </div>
  );
}
