'use client';

/**
 * Speak the match report (Kirjuri Phase 4, PR 10).
 *
 * The coach's own account of the match, said out loud where they actually are
 * after the whistle, instead of holding the mic in the timer view and finding
 * the clip in an inbox later.
 *
 * Tap to start, tap to stop - not press-and-hold. A minute of holding a button
 * is a different thing from a two-second note, and the same recorder that
 * serves the in-match mic serves this, so two recordings can never overlap.
 *
 * What happens to the words:
 * - transcribed immediately on the coach's own key, so they see the text here
 *   rather than in the notes inbox;
 * - editable, because a transcript of speech is never quite right;
 * - saved as one note tagged `debrief`, which is what tells a later AI draft
 *   "this is the coach's own account", not one observation among many;
 * - or inserted straight into the report text, for a coach who wants no AI at
 *   all beyond the transcription.
 *
 * The audio is deleted once the words are kept, exactly like the inbox does it.
 * Without a provider connected the recording still happens and still lands in
 * the notes inbox - the panel says so rather than pretending it did nothing.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineMicrophone, HiOutlineStop } from 'react-icons/hi2';
import type { DictationControls } from '@/hooks/useDictationCapture';
import type { GameNoteInput } from '@/types/game';
import { deleteClip, getClipBlob } from '@/utils/audioClipStore';
import { useDataStore } from '@/hooks/useDataStore';
import { useAiProviderState } from '@/utils/aiProvider';
import { recordAiUsage } from '@/utils/aiUsage';
import {
  OPENAI_TRANSCRIBE_USD_PER_MINUTE,
  TranscriptionError,
  estimateTranscriptionUsd,
  getTranscriptionEngine,
} from '@/utils/transcription';
import { VALIDATION_LIMITS } from '@/config/validationLimits';
import { useToast } from '@/contexts/ToastProvider';
import logger from '@/utils/logger';

export interface SpokenReportPanelProps {
  dictation: DictationControls;
  /** First names / nicknames, to keep Finnish names intact in the transcript. */
  vocabulary: string[];
  /** Stores the transcript as a note. Returns false when nothing was stored. */
  onSaveSummary: (note: GameNoteInput) => boolean;
  /** Adds the transcript to the report text the coach is writing. */
  onInsertIntoReport: (text: string) => void;
  /** Clock stamp for the note: where the match ended. */
  stamp: { time: number; period: number };
}

const CARD = 'bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner';
const PRIMARY =
  'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-indigo-500 transition-colors';
const RECORDING =
  'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-red-400 transition-colors';
const SECONDARY =
  'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-semibold text-slate-200 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-slate-500 transition-colors';

const SpokenReportPanel: React.FC<SpokenReportPanelProps> = ({
  dictation,
  vocabulary,
  onSaveSummary,
  onInsertIntoReport,
  stamp,
}) => {
  const { t } = useTranslation();
  const { userId } = useDataStore();
  const ai = useAiProviderState();
  const { showToast } = useToast();

  const [clipId, setClipId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [busy, setBusy] = useState(false);
  // Only claim a clip this panel's own button produced; the in-match mic writes
  // to the same store and its notes belong in the inbox, not here.
  const miningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const transcribe = useCallback(
    async (id: string, durationMs: number) => {
      const engine = getTranscriptionEngine();
      if (!engine) return;
      setTranscribing(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const blob = await getClipBlob(id, userId ?? undefined);
        if (!blob || controller.signal.aborted) return;
        const spoken = await engine.transcribe(blob, {
          language: 'fi',
          vocabulary,
          signal: controller.signal,
        });
        // Billed whether or not words came back.
        recordAiUsage('transcription', estimateTranscriptionUsd(durationMs));
        if (controller.signal.aborted) return;
        setText(spoken.slice(0, VALIDATION_LIMITS.GAME_NOTE_EVENT_TEXT_MAX));
      } catch (error) {
        if (controller.signal.aborted) return;
        const kind = error instanceof TranscriptionError ? error.kind : 'network';
        logger.warn('[spokenReport] transcription failed', { kind });
        showToast(
          kind === 'unauthorized'
            ? t('spokenReport.errorUnauthorized', 'Your AI provider rejected the key. Check it in Settings.')
            : t('spokenReport.errorTranscribe', 'Could not transcribe that. The recording is in your voice notes.'),
          'error',
        );
      } finally {
        abortRef.current = null;
        setTranscribing(false);
      }
    },
    [showToast, t, userId, vocabulary],
  );

  // The recorder reports the clip it stored; pick it up if this panel asked for it.
  useEffect(() => {
    const clip = dictation.lastClip;
    if (!clip || !miningRef.current || dictation.isRecording) return;
    miningRef.current = false;
    setClipId(clip.id);
    void transcribe(clip.id, clip.durationMs);
  }, [dictation.lastClip, dictation.isRecording, transcribe]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const toggle = useCallback(() => {
    if (dictation.isRecording) {
      dictation.stop();
      return;
    }
    setText('');
    setClipId(null);
    miningRef.current = true;
    dictation.start();
  }, [dictation]);

  /** The words are kept elsewhere now, so the audio has done its job. */
  const dropClip = useCallback(async () => {
    if (!clipId) return;
    try {
      await deleteClip(clipId, userId ?? undefined);
    } catch (error) {
      logger.warn('[spokenReport] could not delete the recording', error);
    }
    setClipId(null);
  }, [clipId, userId]);

  const saveAsSummary = useCallback(async () => {
    const trimmed = text.trim().slice(0, VALIDATION_LIMITS.GAME_NOTE_EVENT_TEXT_MAX);
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const stored = onSaveSummary({
        time: stamp.time,
        period: stamp.period,
        text: trimmed,
        tag: 'debrief',
      });
      if (!stored) {
        showToast(t('spokenReport.saveFailed', 'Could not save that.'), 'error');
        return;
      }
      await dropClip();
      setText('');
      showToast(t('spokenReport.saved', 'Saved as your spoken summary.'), 'success');
    } finally {
      setBusy(false);
    }
  }, [busy, dropClip, onSaveSummary, showToast, stamp, t, text]);

  const insert = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      onInsertIntoReport(trimmed);
      await dropClip();
      setText('');
      showToast(t('spokenReport.inserted', 'Added to the match report.'), 'success');
    } finally {
      setBusy(false);
    }
  }, [busy, dropClip, onInsertIntoReport, showToast, t, text]);

  const discard = useCallback(async () => {
    await dropClip();
    setText('');
  }, [dropClip]);

  if (!dictation.isSupported || !dictation.available) return null;

  return (
    <div className={CARD} data-testid="spoken-report-panel">
      <h4 className="text-sm font-semibold text-slate-200 mb-1">
        {t('spokenReport.title', 'Say the report out loud')}
      </h4>
      <p className="text-xs text-slate-400 mb-3">
        {ai.connected
          ? t(
              'spokenReport.intro',
              'Record your account of the match and it is written out here. Keep it as your spoken summary and the AI draft treats it as your own words.',
            )
          : t(
              'spokenReport.introNoProvider',
              'Record your account of the match. Without an AI provider connected it stays as a recording in your voice notes, ready to write out later.',
            )}
      </p>
      {ai.connected && (
        // Writing out starts as soon as the recording stops, so the price is
        // stated before the coach records - not after they have been billed.
        <p className="text-xs text-slate-400 mb-3" data-testid="spoken-report-cost">
          {t('spokenReport.costHint', 'Writing it out costs about ${{usd}} a minute on your provider account, and starts when you stop recording.', {
            usd: OPENAI_TRANSCRIBE_USD_PER_MINUTE.toFixed(3),
          })}
        </p>
      )}

      {dictation.permission === 'denied' ? (
        <p className="text-xs text-amber-300" data-testid="spoken-report-denied">
          {t('dictation.permissionDenied', "Microphone access was denied. Allow it in your phone's app settings to dictate notes.")}
        </p>
      ) : (
        <button
          type="button"
          onClick={toggle}
          className={dictation.isRecording ? RECORDING : PRIMARY}
          data-testid="spoken-report-toggle"
        >
          {dictation.isRecording ? (
            <>
              <HiOutlineStop className="text-base" />
              {t('spokenReport.stop', 'Stop recording')}
            </>
          ) : (
            <>
              <HiOutlineMicrophone className="text-base" />
              {t('spokenReport.start', 'Record the report')}
            </>
          )}
        </button>
      )}

      {transcribing && (
        <p className="mt-3 text-xs text-slate-400" data-testid="spoken-report-transcribing">
          {t('spokenReport.transcribing', 'Writing out what you said...')}
        </p>
      )}

      {text && !transcribing && (
        <div className="mt-3 space-y-2" data-testid="spoken-report-result">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={VALIDATION_LIMITS.GAME_NOTE_EVENT_TEXT_MAX}
            aria-label={t('spokenReport.textLabel', 'What you said')}
            data-testid="spoken-report-text"
            className="w-full rounded-md bg-slate-700 border border-slate-600 px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-indigo-500"
          />
          <p className="text-xs text-slate-400">
            {t('spokenReport.editHint', 'Fix anything the transcription got wrong before you keep it.')}
          </p>
          <button
            type="button"
            onClick={() => void saveAsSummary()}
            disabled={busy}
            className={PRIMARY}
            data-testid="spoken-report-save"
          >
            {t('spokenReport.save', 'Keep as my spoken summary')}
          </button>
          <button
            type="button"
            onClick={() => void insert()}
            disabled={busy}
            className={SECONDARY}
            data-testid="spoken-report-insert"
          >
            {t('spokenReport.insert', 'Add it to the report text')}
          </button>
          <button
            type="button"
            onClick={() => void discard()}
            disabled={busy}
            className={SECONDARY}
            data-testid="spoken-report-discard"
          >
            {t('spokenReport.discard', 'Throw this recording away')}
          </button>
        </div>
      )}
    </div>
  );
};

export default SpokenReportPanel;
