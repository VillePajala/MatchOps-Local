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
 *
 * Speaking is offered beside typing. With the coach's own AI provider
 * connected the recording is written out here, into the same box, so one card
 * does the whole job. Without a provider the clip lands in the voice notes
 * above exactly as an in-match note does, so recording never depends on a key
 * and a coach who just spoke is never left wondering where it went.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Player } from '@/types';
import type { DictationControls } from '@/hooks/useDictationCapture';
import type { GameNoteInput } from '@/types/game';
import { VALIDATION_LIMITS } from '@/config/validationLimits';
import { deleteClip, getClipBlob, setClipTranscript } from '@/utils/audioClipStore';
import { useDataStore } from '@/hooks/useDataStore';
import { recordAiUsage } from '@/utils/aiUsage';
import { estimateTranscriptionUsd, getTranscriptionEngine, TranscriptionError } from '@/utils/transcription';
import { useToast } from '@/contexts/ToastProvider';
import WorkingIndicator from '@/components/WorkingIndicator';
import logger from '@/utils/logger';

interface GameNoteComposerProps {
  /** The squad, so a note can name who it is about. */
  players: Player[];
  /** Where on the clock a note written afterwards belongs (the match end). */
  stamp: { time: number; period: number };
  onAdd: (note: GameNoteInput) => boolean;
  /** Absent when the device cannot record; the text box always works. */
  dictation?: DictationControls;
  /** Player names, so speech is written out with them spelled right. */
  vocabulary?: string[];
  /** The coach's language, so speech is written as what they actually spoke. */
  language?: string;
}

const GameNoteComposer: React.FC<GameNoteComposerProps> = ({ players, stamp, onAdd, dictation, vocabulary = [], language = 'fi' }) => {
  const { t } = useTranslation();
  const { userId } = useDataStore();
  const { showToast } = useToast();
  const [entityId, setEntityId] = useState('');
  const [text, setText] = useState('');
  const [recorded, setRecorded] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clipId, setClipId] = useState<string | null>(null);
  /**
   * Whether the recording in progress is this card's.
   *
   * One recorder serves the whole page, so without this the spoken-report
   * card's recording would also turn this button red and invite the coach to
   * stop something they did not start here.
   */
  const [startedHere, setStartedHere] = useState(false);
  const canRecord = !!dictation?.isSupported && !!dictation?.available;

  /**
   * Which clip this card asked for. stop() clears the recording flag at once
   * but the clip is written later, so without claiming an id the effect would
   * pick up the PREVIOUS recording - transcribing old audio and billing for it
   * again while the new one was never written out. Same guard as the spoken
   * report panel, and the same reason.
   */
  const claimedIdRef = useRef<string | null>(null);
  const miningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const transcribe = useCallback(async (id: string, durationMs: number) => {
    const engine = getTranscriptionEngine();
    if (!engine) {
      // No provider connected: the clip is safely in the voice notes, and the
      // hint below says so. Recording must never depend on a key.
      //
      // Let go of the clip: nothing here turned it into words, so it belongs to
      // the inbox now. Holding on would make the next thing the coach TYPES
      // count as dictation and delete a recording they were just told was safe.
      setClipId(null);
      setRecorded(true);
      return;
    }
    setTranscribing(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const blob = await getClipBlob(id, userId ?? undefined);
      if (!blob || controller.signal.aborted) return;
      const spoken = await engine.transcribe(blob, { language, vocabulary, signal: controller.signal });
      // Billed whether or not words came back.
      recordAiUsage('transcription', estimateTranscriptionUsd(durationMs));
      if (controller.signal.aborted) return;
      const capped = spoken.slice(0, VALIDATION_LIMITS.GAME_NOTE_EVENT_TEXT_MAX);
      // Cap the WHOLE box, not just the new take: two takes back to back could
      // otherwise show more on screen than the save would keep, silently.
      setText((prev) =>
        (prev.trim() ? `${prev.trim()}\n${capped}` : capped).slice(0, VALIDATION_LIMITS.GAME_NOTE_EVENT_TEXT_MAX),
      );
      setRecorded(false);
      // Keep the words with the recording, as the inbox does: without this a
      // transcript the coach already paid for is thrown away if they re-record
      // or leave, and the clip sits in the inbox looking untranscribed.
      try {
        await setClipTranscript(id, capped, userId ?? undefined);
      } catch (error) {
        logger.warn('[noteComposer] could not store the transcript on the clip', {
          name: error instanceof Error ? error.name : 'unknown',
        });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const kind = error instanceof TranscriptionError ? error.kind : 'network';
      logger.warn('[noteComposer] transcription failed', { kind });
      // Same as the no-engine case: the words never got out of the clip, so
      // this card does not own it and must not delete it on the next save.
      setClipId(null);
      setRecorded(true);
      showToast(
        kind === 'unauthorized'
          ? t('spokenReport.errorUnauthorized', 'Your AI provider rejected the key. Check it in Settings.')
          : t('spokenReport.errorTranscribe', 'Could not transcribe that. The recording is in your voice notes.'),
        'error',
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (!controller.signal.aborted) setTranscribing(false);
    }
  }, [language, showToast, t, userId, vocabulary]);

  // The recorder reports the clip it stored; pick it up only if this card asked.
  useEffect(() => {
    const clip = dictation?.lastClip;
    if (!clip || !miningRef.current || dictation?.isRecording) return;
    if (clip.id === claimedIdRef.current) return;
    miningRef.current = false;
    claimedIdRef.current = clip.id;
    setStartedHere(false);
    setClipId(clip.id);
    void transcribe(clip.id, clip.durationMs);
  }, [dictation?.lastClip, dictation?.isRecording, transcribe]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const save = async () => {
    const trimmed = text.trim();
    // Deleting the clip is awaited, and the button stays alive meanwhile: a
    // second tap in that window used to save the same note twice.
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await commit(trimmed);
    } finally {
      setBusy(false);
    }
  };

  const commit = async (trimmed: string) => {
    const ok = onAdd({
      time: stamp.time,
      period: stamp.period,
      text: trimmed,
      entityId: entityId || undefined,
      // Spoken and written out here is dictation; typed from memory is not.
      source: clipId ? 'dictation' : 'manual',
    });
    if (!ok) return;
    // The words are kept elsewhere now, so the audio has done its job - and
    // leaving it would show the same note twice, here and in the inbox.
    if (clipId) {
      try {
        await deleteClip(clipId, userId ?? undefined);
      } catch (error) {
        logger.warn('[noteComposer] could not delete the recording', error);
      }
      setClipId(null);
    }
    setText('');
    setEntityId('');
    setRecorded(false);
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
      {canRecord && dictation && (
        <div className="mt-2">
          {dictation.permission === 'denied' ? (
            <p className="text-xs text-amber-300">
              {t('dictation.permissionDenied', "Microphone access was denied. Allow it in your phone's app settings to dictate notes.")}
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  if (dictation.isRecording) {
                    dictation.stop();
                  } else {
                    setRecorded(false);
                    setStartedHere(true);
                    // Anything already stored is old news; only a clip written
                    // after this point belongs to the recording starting now.
                    claimedIdRef.current = dictation.lastClip?.id ?? null;
                    miningRef.current = true;
                    dictation.start();
                  }
                }}
                // Someone else's recording (the spoken report is on this same
                // page): say so by going quiet rather than offering to stop it.
                disabled={transcribing || busy || (dictation.isRecording && !startedHere)}
                data-testid="note-composer-record"
                className={`w-full px-4 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  dictation.isRecording && startedHere
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-100'
                }`}
              >
                {dictation.isRecording && startedHere
                  ? t('noteComposer.recordStop', 'Stop recording')
                  : t('noteComposer.record', 'Say it instead')}
              </button>
              {transcribing && (
                <WorkingIndicator
                  className="mt-2"
                  label={t('noteComposer.transcribing', 'Writing out what you said.')}
                  data-testid="note-composer-transcribing"
                />
              )}
              {recorded && !dictation.isRecording && !transcribing && (
                <p className="text-xs text-slate-400 mt-1" data-testid="note-composer-recorded">
                  {t('noteComposer.recordedHint', 'Waiting in the voice notes above, where you write it out and choose the player.')}
                </p>
              )}
            </>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => void save()}
        disabled={!text.trim() || transcribing || busy}
        data-testid="note-composer-save"
        className="mt-2 w-full px-4 py-2 rounded-md text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {t('noteComposer.save', 'Save the note')}
      </button>
    </div>
  );
};

export default GameNoteComposer;
