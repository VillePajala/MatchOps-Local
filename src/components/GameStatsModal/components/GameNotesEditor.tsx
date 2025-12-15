/**
 * GameNotesEditor component - displays and edits game notes
 * Supports view mode and edit mode with save/cancel actions
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { FaEdit, FaSave, FaTimes } from 'react-icons/fa';

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

  return (
    <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-slate-200">
          {t('gameStatsModal.notesTitle', 'Game Notes')}
        </h3>
        <div className="flex items-center gap-2">
          {isEditingNotes ? (
            <>
              <button
                onClick={onSaveNotes}
                className="p-1.5 text-green-400 hover:text-green-300 rounded bg-slate-700 hover:bg-slate-600"
                title={t('common.saveChanges', 'Save Changes')}
                aria-label={t('common.saveChanges', 'Save Changes')}
              >
                <FaSave />
              </button>
              <button
                onClick={onCancelEdit}
                className="p-1.5 text-red-400 hover:text-red-300 rounded bg-slate-700 hover:bg-slate-600"
                title={t('common.cancel', 'Cancel')}
                aria-label={t('common.cancel', 'Cancel')}
              >
                <FaTimes />
              </button>
            </>
          ) : (
            <button
              onClick={onStartEdit}
              className="p-1.5 text-slate-400 hover:text-indigo-400 rounded bg-slate-700 hover:bg-slate-600"
              title={t('common.edit', 'Edit')}
              aria-label={t('common.edit', 'Edit')}
            >
              <FaEdit />
            </button>
          )}
        </div>
      </div>
      {isEditingNotes ? (
        <textarea
          ref={notesTextareaRef}
          value={editGameNotes}
          onChange={(e) => onEditNotesChange(e.target.value)}
          className="w-full h-24 p-2 bg-slate-700 border border-slate-500 rounded-md shadow-sm text-sm text-slate-100 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          placeholder={t('gameStatsModal.notesPlaceholder', 'Notes...') ?? undefined}
        />
      ) : (
        <div className="min-h-[6rem] p-2 text-sm text-slate-300 whitespace-pre-wrap">
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
