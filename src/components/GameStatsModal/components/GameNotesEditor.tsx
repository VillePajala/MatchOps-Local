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
import { inputBaseStyle, primaryButtonStyle, secondaryButtonStyle } from '@/styles/modalStyles';

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
const ROW_BTN = `${secondaryButtonStyle} flex-1 min-w-0 px-3!`;
/** The text tools (Template, Tidy): one line each, never wrapped into a tall pill. */
const TOOL_BTN = `${secondaryButtonStyle} flex-1 min-w-0 px-3! whitespace-nowrap overflow-hidden text-ellipsis text-sm!`;

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
      className={TOOL_BTN}
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
    // From the read view the editor is not open yet: open it on the saved text.
    const base = isEditingNotes ? editGameNotes : gameNotes;
    if (!isEditingNotes) onStartEdit();
    onEditNotesChange(base.trim() ? `${base.trimEnd()}\n\n${template}` : template);
    requestAnimationFrame(() => notesTextareaRef.current?.focus());
  };

  return (
    <div className="s1-list p-4 font-ui">
      <h3 className="text-base font-semibold text-ink mb-4">
        {t('gameStatsModal.notesTitle', 'Match report')}
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
            className={`${inputBaseStyle} h-64 min-h-[10rem] resize-y text-[15px]! leading-relaxed`}
            placeholder={t('gameStatsModal.notesPlaceholder', 'Add notes here...') ?? undefined}
          />
          <p className="text-sm text-ink-3" data-testid="report-no-health-hint">
            {t('privacyHints.noHealthData', 'Do not record health information.')}
          </p>
          {/* Silent until it matters: a counter over a long report is noise,
              but running out of room without warning is a lost paragraph. */}
          {editGameNotes.length > VALIDATION_LIMITS.GAME_NOTES_MAX * 0.9 && (
            <p className="font-ui text-[13px] text-ink-2 tabular-nums" data-testid="report-editor-remaining">
              {t('gameStatsModal.notesRemaining', '{{remaining}} characters left', {
                // Older data can already sit past the cap, and "-50 characters
                // left" is not a thing. Zero is the honest floor.
                remaining: Math.max(0, VALIDATION_LIMITS.GAME_NOTES_MAX - editGameNotes.length),
              })}
            </p>
          )}
          {/* Two rows (owner, 2026-11-23): four buttons in one row squeezed the
              cost label onto three lines. Text tools on top, then Cancel / Save. */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleUseTemplate}
              className={TOOL_BTN}
            >
              {t('gameSettingsModal.useTemplate' as TranslationKey, 'Template')}
            </button>
            {/* Beside Template, because they are the same kind of thing: tools
                that reshape the text in this box. */}
            {tidyButton}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancelEdit}
              className={ROW_BTN}
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={onSaveNotes}
              className={`${primaryButtonStyle} flex-[2] min-w-0 px-3!`}
            >
              {t('common.save', 'Save')}
            </button>
          </div>
        </div>
      ) : (
        <div
          data-testid="report-editor-open"
          className="cursor-pointer whitespace-pre-wrap min-h-[6rem] p-3.5 rounded-[14px] bg-carbon text-[15px] leading-relaxed text-ink-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.10)] hover:text-ink transition-colors"
          onClick={onStartEdit}
        >
          {gameNotes || (
            <span className="italic text-ink-3">
              {t('gameStatsModal.noNotes', 'No notes added')}
            </span>
          )}
        </div>
      )}
      {/* Offered while reading too: the coach does not have to enter edit mode
          to ask for the text they are looking at to be organised. The template
          is offered for an empty report - hidden behind a tap on the text box,
          coaches never found it (review R7). */}
      {!isEditingNotes && (canTidy || !gameNotes.trim()) && (
        <div className="flex gap-2 mt-3">
          {!gameNotes.trim() && (
            <button type="button" onClick={handleUseTemplate} className={TOOL_BTN} data-testid="report-editor-template">
              {t('gameSettingsModal.useTemplate' as TranslationKey, 'Template')}
            </button>
          )}
          {tidyButton}
        </div>
      )}
    </div>
  );
}
