'use client';

/**
 * Write a note about a player, by hand.
 *
 * Until now the only way to create one was to dictate during the match and
 * accept the clip afterwards, or to let an AI draft one. So a coach who did
 * not record anything had no way at all to write down what they saw - and the
 * checklist row asking how many players had been written about pointed at
 * nothing they could do.
 *
 * The note is stamped to the end of the match, because a note written
 * afterwards has no moment on the clock and pretending otherwise would put a
 * made-up minute in the record.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Player } from '@/types';
import type { GameNoteInput } from '@/types/game';
import { VALIDATION_LIMITS } from '@/config/validationLimits';

interface GameNoteComposerProps {
  /** The squad, so a note can name who it is about. */
  players: Player[];
  /** Where on the clock a note written afterwards belongs (the match end). */
  stamp: { time: number; period: number };
  onAdd: (note: GameNoteInput) => boolean;
}

const GameNoteComposer: React.FC<GameNoteComposerProps> = ({ players, stamp, onAdd }) => {
  const { t } = useTranslation();
  const [entityId, setEntityId] = useState('');
  const [text, setText] = useState('');

  const save = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const ok = onAdd({ time: stamp.time, period: stamp.period, text: trimmed, entityId: entityId || undefined, source: 'manual' });
    if (ok) {
      setText('');
      setEntityId('');
    }
  };

  return (
    <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner" data-testid="note-composer">
      <h3 className="text-xl font-semibold text-slate-200 mb-3">{t('noteComposer.title', 'Write a note')}</h3>
      <label className="block text-xs font-medium text-slate-400 mb-1" htmlFor="note-composer-player">
        {t('noteComposer.playerLabel', 'About')}
      </label>
      <select
        id="note-composer-player"
        value={entityId}
        onChange={(e) => setEntityId(e.target.value)}
        className="w-full mb-3 bg-slate-700 border border-slate-600 rounded-md text-white px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="">{t('noteComposer.wholeMatch', 'The match')}</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, VALIDATION_LIMITS.GAME_NOTE_EVENT_TEXT_MAX))}
        rows={3}
        aria-label={t('noteComposer.title', 'Write a note')}
        placeholder={t('noteComposer.placeholder', 'What did you see? One observation is enough.')}
        className="w-full bg-slate-700 border border-slate-600 rounded-md text-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <button
        type="button"
        onClick={save}
        disabled={!text.trim()}
        data-testid="note-composer-save"
        className="mt-2 w-full px-4 py-2 rounded-md text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {t('noteComposer.save', 'Save the note')}
      </button>
    </div>
  );
};

export default GameNoteComposer;
