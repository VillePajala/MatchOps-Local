/**
 * Kirjuri notes on a game (PR 3): the accepted `note` events, in clock order,
 * beside the goal list. Deletion asks first - a note is the coach's own
 * words and cannot be re-recorded.
 */

'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineTrash } from 'react-icons/hi2';
import type { GameEvent, Player } from '@/types';
import ConfirmationModal from '@/components/ConfirmationModal';
import { formatClock } from './DictationInbox';

interface GameNotesListProps {
  notes: GameEvent[];
  availablePlayers: Player[];
  onDeleteNote?: (id: string) => void;
}

const GameNotesList: React.FC<GameNotesListProps> = ({ notes, availablePlayers, onDeleteNote }) => {
  const { t } = useTranslation();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const nameOf = useMemo(() => {
    const map = new Map(availablePlayers.map((p) => [p.id, p.nickname || p.name]));
    return (id?: string) => (id ? map.get(id) ?? null : null);
  }, [availablePlayers]);

  if (notes.length === 0) return null;

  const sourceLabel = (source?: GameEvent['source']) =>
    source === 'ai'
      ? t('dictation.sourceAi', 'AI')
      : source === 'manual'
        ? t('dictation.sourceManual', 'typed')
        : t('dictation.sourceDictation', 'voice');

  return (
    <div data-testid="game-notes" className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
      <h3 className="text-xl font-semibold text-slate-200 mb-3">{t('dictation.notesTitle', 'Notes')}</h3>
      <ul className="space-y-2">
        {notes.map((note) => {
          const who = nameOf(note.entityId);
          return (
            <li key={note.id} data-testid="game-note" className="flex items-start gap-2 rounded-md bg-slate-800/60 border border-slate-700/60 px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span className="font-semibold text-slate-300">
                    {t('dictation.periodClock', 'P{{period}} {{clock}}', { period: note.period ?? '', clock: formatClock(note.time) })}
                  </span>
                  {who && <span className="text-indigo-300 font-medium">{who}</span>}
                  <span className="rounded-full bg-slate-700/60 px-2 py-0.5">{sourceLabel(note.source)}</span>
                </div>
                <p className="text-sm text-slate-100 mt-1 whitespace-pre-wrap break-words">{note.text}</p>
              </div>
              {onDeleteNote && (
                <button
                  type="button"
                  onClick={() => setPendingDelete(note.id)}
                  aria-label={t('common.delete', 'Delete')}
                  className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-red-300 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <HiOutlineTrash className="h-4 w-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <ConfirmationModal
        isOpen={pendingDelete !== null}
        title={t('dictation.deleteNoteTitle', 'Delete note?')}
        message={t('dictation.deleteNoteBody', 'This removes the note from the game.')}
        confirmLabel={t('common.delete', 'Delete')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
        onConfirm={() => {
          if (pendingDelete) onDeleteNote?.(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};

export default GameNotesList;
