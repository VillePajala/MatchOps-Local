/**
 * Kirjuri dictation inbox (PR 3): the post-game place where a recorded clip
 * becomes a written note.
 *
 * Per clip: clock stamp, replay, a text field (typed in PR 3; transcription
 * fills it in PR 5), a player chip guessed from the text, accept / discard.
 * Accepting hands a `GameNoteInput` up (the orchestration adds the `note`
 * event) and deletes the audio; discarding deletes the audio. Raw audio never
 * outlives this decision.
 */

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlinePlay, HiOutlineStop } from 'react-icons/hi2';
import type { Player } from '@/types';
import type { GameNoteInput } from '@/types/game';
import { useDataStore } from '@/hooks/useDataStore';
import { useToast } from '@/contexts/ToastProvider';
import { DictationRules } from '@/components/AiConsentGate';
import { deleteClip, getClipBlob, listClips, type AudioClipMeta } from '@/utils/audioClipStore';
import { matchPlayerInText } from '@/utils/playerNameMatch';
import { useAiProviderState } from '@/utils/aiProvider';
import { TranscriptionError, estimateTranscriptionUsd, getTranscriptionEngine } from '@/utils/transcription';
import logger from '@/utils/logger';

interface DictationInboxProps {
  gameId: string;
  availablePlayers: Player[];
  onAccept?: (note: GameNoteInput) => void;
  /** Reports how many clips await review (the wrap-up card row). */
  onCountChange?: (count: number) => void;
}

interface Draft {
  text: string;
  /** 'auto' = follow the guess; '' = a note about the game; else a player id. */
  playerId: string;
}

export const formatClock = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const DictationInbox: React.FC<DictationInboxProps> = ({ gameId, availablePlayers, onAccept, onCountChange }) => {
  const { t } = useTranslation();
  const { userId } = useDataStore();
  const { showToast } = useToast();
  const ai = useAiProviderState();
  const [clips, setClips] = useState<AudioClipMeta[] | null>(null);
  // Batch transcription progress (PR 5); null = idle.
  const [transcribing, setTranscribing] = useState<{ done: number; total: number } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  // One accept/discard in flight per clip: a double-tap must not create two notes.
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const busyRef = useRef<Set<string>>(new Set());
  const countRef = useRef(onCountChange);
  useEffect(() => {
    countRef.current = onCountChange;
  }, [onCountChange]);

  const applyClips = useCallback((next: AudioClipMeta[]) => {
    setClips(next);
    countRef.current?.(next.length);
  }, []);

  useEffect(() => {
    let cancelled = false;
    listClips(gameId, userId ?? undefined)
      .then((list) => {
        if (!cancelled) applyClips(list);
      })
      .catch((error) => {
        logger.warn('[dictation] inbox load failed', error);
        if (!cancelled) applyClips([]);
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, userId, applyClips]);

  // One object URL at a time; revoked on switch and unmount.
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const stopPlayback = useCallback(() => {
    setPlayingId(null);
    setAudioUrl(null);
  }, []);

  const play = useCallback(
    async (id: string) => {
      if (playingId === id) {
        stopPlayback();
        return;
      }
      const blob = await getClipBlob(id, userId ?? undefined);
      if (!blob) return;
      setAudioUrl(URL.createObjectURL(blob));
      setPlayingId(id);
    },
    [playingId, stopPlayback, userId],
  );

  const draftFor = useCallback((id: string): Draft => drafts[id] ?? { text: '', playerId: 'auto' }, [drafts]);

  const resolvePlayerId = useCallback(
    (draft: Draft): string => {
      if (draft.playerId !== 'auto') return draft.playerId;
      return matchPlayerInText(draft.text, availablePlayers)?.id ?? '';
    },
    [availablePlayers],
  );

  const claim = useCallback((id: string): boolean => {
    if (busyRef.current.has(id)) return false;
    busyRef.current.add(id);
    setBusyIds(new Set(busyRef.current));
    return true;
  }, []);
  const release = useCallback((id: string) => {
    busyRef.current.delete(id);
    setBusyIds(new Set(busyRef.current));
  }, []);

  const removeClip = useCallback(
    async (id: string) => {
      if (playingId === id) stopPlayback();
      try {
        await deleteClip(id, userId ?? undefined);
      } catch (error) {
        logger.warn('[dictation] clip delete failed', error);
      }
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      applyClips((clips ?? []).filter((c) => c.id !== id));
    },
    [applyClips, clips, playingId, stopPlayback, userId],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!claim(id)) return;
      try {
        await removeClip(id);
      } finally {
        release(id);
      }
    },
    [claim, release, removeClip],
  );

  const accept = useCallback(
    async (clip: AudioClipMeta) => {
      const draft = draftFor(clip.id);
      const text = draft.text.trim();
      if (!text) return;
      if (!claim(clip.id)) return;
      try {
        const playerId = resolvePlayerId(draft);
        onAccept?.({ time: clip.time, period: clip.period, text, entityId: playerId || undefined });
        await removeClip(clip.id);
      } finally {
        release(clip.id);
      }
    },
    [claim, draftFor, onAccept, release, removeClip, resolvePlayerId],
  );

  const sortedPlayers = useMemo(
    () => [...availablePlayers].sort((a, b) => a.name.localeCompare(b.name)),
    [availablePlayers],
  );

  // Clips whose text field is still empty - the batch works on these only.
  const untranscribed = useMemo(
    () => (clips ?? []).filter((c) => !(drafts[c.id]?.text ?? '').trim()),
    [clips, drafts],
  );
  // Original casing on purpose: the recognizer mirrors the prompt's spelling,
  // so "Emma" must be sent as "Emma" (review #750). Dedupe case-insensitively.
  const vocabulary = useMemo(() => {
    const seen = new Set<string>();
    const terms: string[] = [];
    for (const p of availablePlayers) {
      for (const term of [p.nickname?.trim(), p.name.trim().split(/\s+/)[0]]) {
        if (!term || term.length < 2) continue;
        const key = term.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        terms.push(term);
      }
    }
    return terms;
  }, [availablePlayers]);

  // The batch is abortable: closing the modal mid-batch must stop uploads to
  // the coach's own (paid) key, not just hide the progress (review #750).
  const batchAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      batchAbortRef.current?.abort();
    };
  }, []);

  const transcribeAll = useCallback(async () => {
    const engine = getTranscriptionEngine();
    if (!engine || transcribing || untranscribed.length === 0) return;
    const batch = untranscribed;
    const controller = new AbortController();
    batchAbortRef.current = controller;
    setTranscribing({ done: 0, total: batch.length });
    let done = 0;
    let rejected = 0;
    let stopped = false;
    try {
      for (const clip of batch) {
        if (controller.signal.aborted) return;
        try {
          const blob = await getClipBlob(clip.id, userId ?? undefined);
          if (!blob || controller.signal.aborted) continue;
          const text = await engine.transcribe(blob, { language: 'fi', vocabulary, signal: controller.signal });
          if (controller.signal.aborted) return;
          if (text) {
            setDrafts((prev) => ({ ...prev, [clip.id]: { ...(prev[clip.id] ?? { playerId: 'auto' }), text } }));
            done += 1;
          }
        } catch (error) {
          if (controller.signal.aborted) return;
          const kind = error instanceof TranscriptionError ? error.kind : 'network';
          if (kind === 'rejected') {
            rejected += 1; // this clip only; the rest may still work
            continue;
          }
          showToast(
            kind === 'unauthorized'
              ? t('dictation.transcribeUnauthorized', 'The provider rejected your key. Check it in Settings.')
              : kind === 'rateLimited'
                ? t('dictation.transcribeRateLimited', 'The provider is rate-limiting requests. Try again in a minute.')
                : t('dictation.transcribeNetwork', 'Could not reach the provider. Check your connection and try again.'),
            'error',
          );
          stopped = true;
          break;
        } finally {
          if (!controller.signal.aborted) {
            setTranscribing((prev) => (prev ? { ...prev, done: Math.min(prev.total, prev.done + 1) } : prev));
          }
        }
      }
      if (rejected > 0) {
        showToast(
          t('dictation.transcribeRejectedCount', '{{count}} clips could not be transcribed - type those instead.', { count: rejected }),
          'info',
        );
      }
      if (!stopped && done > 0) {
        showToast(
          t('dictation.transcribeDone', '{{count}} clips transcribed - check the text and the player, then save.', { count: done }),
          'success',
        );
      }
    } finally {
      if (batchAbortRef.current === controller) batchAbortRef.current = null;
      if (!controller.signal.aborted) setTranscribing(null);
    }
  }, [transcribing, untranscribed, userId, vocabulary, showToast, t]);

  if (!clips || clips.length === 0) return null;
  const pendingMs = untranscribed.reduce((sum, c) => sum + c.durationMs, 0);
  const costUsd = estimateTranscriptionUsd(pendingMs).toFixed(2);

  return (
    <div
      id="dictation-inbox"
      data-testid="dictation-inbox"
      className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner"
    >
      <h3 className="text-xl font-semibold text-slate-200 mb-1">
        {t('dictation.inboxTitle', 'Voice notes to review')}{' '}
        <span className="text-sm font-medium text-slate-400">({clips.length})</span>
      </h3>
      <p className="text-xs text-slate-400 mb-2">
        {t('dictation.inboxHint', 'Listen, write what you said, check the player, save.')}
      </p>
      {ai.connected ? (
        untranscribed.length > 0 && (
          <button
            type="button"
            onClick={() => void transcribeAll()}
            disabled={!!transcribing}
            data-testid="dictation-transcribe"
            className="w-full mb-3 rounded-md bg-indigo-600 hover:bg-indigo-500 border border-indigo-400/30 px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-indigo-500"
          >
            {transcribing
              ? t('dictation.transcribing', 'Transcribing {{done}}/{{total}}...', { done: transcribing.done, total: transcribing.total })
              : t('dictation.transcribe', 'Transcribe {{count}} clips (about ${{cost}})', { count: untranscribed.length, cost: costUsd })}
          </button>
        )
      ) : (
        <p className="text-xs text-slate-500 mb-3" data-testid="dictation-transcribe-hint">
          {t('dictation.transcribeHint', 'Connect your own AI provider in Settings to transcribe clips automatically.')}
        </p>
      )}
      <details className="mb-3 rounded-md bg-slate-800/60 border border-slate-700/60 px-3 py-2">
        <summary className="text-xs font-medium text-slate-300 cursor-pointer">{t('aiConsent.rulesTitle', 'Dictation rules')}</summary>
        <div className="mt-2">
          <DictationRules />
        </div>
      </details>
      {audioUrl && (
        <audio src={audioUrl} autoPlay controls className="w-full mb-3" onEnded={stopPlayback} data-testid="dictation-audio" />
      )}
      <ul className="space-y-3">
        {clips.map((clip) => {
          const draft = draftFor(clip.id);
          const guessedId = draft.playerId === 'auto' ? resolvePlayerId(draft) : draft.playerId;
          const busy = busyIds.has(clip.id) || !!transcribing;
          const canSave = draft.text.trim().length > 0 && !busy;
          return (
            <li key={clip.id} data-testid="dictation-clip" className="rounded-md bg-slate-800/60 border border-slate-700/60 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300 rounded-full bg-slate-700/60 px-2 py-0.5">
                  {t('dictation.periodClock', 'P{{period}} {{clock}}', { period: clip.period, clock: formatClock(clip.time) })}
                </span>
                <span className="text-xs text-slate-500">{Math.round(clip.durationMs / 1000)} s</span>
                <button
                  type="button"
                  onClick={() => void play(clip.id)}
                  aria-label={playingId === clip.id ? t('dictation.stop', 'Stop') : t('dictation.play', 'Play')}
                  className="ml-auto inline-flex items-center gap-1 rounded-md bg-slate-600 hover:bg-slate-500 border border-slate-400/30 px-3 py-1.5 text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                >
                  {playingId === clip.id ? <HiOutlineStop className="h-4 w-4" /> : <HiOutlinePlay className="h-4 w-4" />}
                  {playingId === clip.id ? t('dictation.stop', 'Stop') : t('dictation.play', 'Play')}
                </button>
              </div>
              <textarea
                value={draft.text}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [clip.id]: { ...draftFor(clip.id), text: e.target.value } }))}
                placeholder={t('dictation.textPlaceholder', 'What did you say?')}
                rows={2}
                aria-label={t('dictation.textPlaceholder', 'What did you say?')}
                data-testid="dictation-text"
                className="w-full rounded-md bg-slate-700 border border-slate-600 px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-indigo-500"
              />
              <div className="flex items-center gap-2">
                <label htmlFor={`dictation-player-${clip.id}`} className="text-xs text-slate-400 shrink-0">{t('dictation.playerLabel', 'About')}</label>
                <select
                  id={`dictation-player-${clip.id}`}
                  value={guessedId}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [clip.id]: { ...draftFor(clip.id), playerId: e.target.value } }))}
                  data-testid="dictation-player"
                  className="flex-1 min-w-0 rounded-md bg-slate-700 border border-slate-600 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">{t('dictation.gameNote', 'The game (no player)')}</option>
                  {sortedPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.nickname ? ` (${p.nickname})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void accept(clip)}
                  disabled={!canSave}
                  data-testid="dictation-accept"
                  className="flex-1 rounded-md bg-indigo-600 hover:bg-indigo-500 border border-indigo-400/30 px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-indigo-500"
                >
                  {t('dictation.accept', 'Save note')}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(clip.id)}
                  disabled={busy}
                  data-testid="dictation-discard"
                  className="rounded-md bg-slate-600 hover:bg-slate-500 border border-slate-400/30 px-4 py-2 text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-indigo-500"
                >
                  {t('dictation.discard', 'Discard')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default DictationInbox;
