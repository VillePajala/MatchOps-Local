/**
 * GameNotesEditor component - displays and edits the match report (game notes).
 * View mode (tap to edit) + edit mode with a resizable textarea, a "use
 * template" scaffold, and a full-width Template / Cancel / Save button row -
 * matching the report editor in Game Settings.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TranslationKey } from '@/i18n-types';

interface GameNotesEditorProps {
  gameNotes: string;
  isEditingNotes: boolean;
  editGameNotes: string;
  notesTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onStartEdit: () => void;
  onSaveNotes: () => void;
  onCancelEdit: () => void;
  onEditNotesChange: (notes: string) => void;
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
}: GameNotesEditorProps) {
  const { t } = useTranslation();

  const handleUseTemplate = () => {
    const template = t('gameSettingsModal.reportTemplate' as TranslationKey, '');
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
            ref={notesTextareaRef}
            value={editGameNotes}
            onChange={(e) => onEditNotesChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onCancelEdit(); }}
            className="w-full h-64 min-h-[10rem] resize-y p-3 bg-slate-700 border border-slate-600 rounded-md shadow-sm text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder={t('gameStatsModal.notesPlaceholder', 'Notes...') ?? undefined}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleUseTemplate}
              className={`${ROW_BTN} bg-slate-700 text-slate-300 hover:bg-slate-600`}
            >
              {t('gameSettingsModal.useTemplate' as TranslationKey, 'Template')}
            </button>
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
    </div>
  );
}
