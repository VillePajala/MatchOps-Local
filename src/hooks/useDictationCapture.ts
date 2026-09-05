/**
 * Kirjuri recording controller (PR 2).
 *
 * Lives at orchestration level, NOT inside TimerOverlay: the overlay is an
 * opt-in surface, and the hands-free trigger (PR 4, earbud taps via Media
 * Session) must reach the recorder whether or not the overlay is open.
 *
 * Capture now, understand later: a press produces one clip stamped with the
 * match clock + period at press time and stores it in the device-local audio
 * DB. No transcription, no game event yet - the inbox (PR 3) turns clips into
 * `note` events. While a session is armed (mic stream held) the
 * recordingSessionSignal keeps the screen awake and suppresses the
 * long-background force-reload.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import logger from '@/utils/logger';
import { setRecordingSessionActive } from '@/utils/recordingSessionSignal';
import { DEFAULT_GAME_ID } from '@/config/constants';
import {
  AudioQuotaError,
  countClips,
  deleteClip,
  rotateOldClips,
  saveClip,
} from '@/utils/audioClipStore';

export type DictationPermission = 'unknown' | 'granted' | 'denied';

export interface DictationControls {
  isSupported: boolean;
  /** False on the scratch (unsaved) game: autosave is off there, so a note would vanish. */
  available: boolean;
  permission: DictationPermission;
  isRecording: boolean;
  /** Clips stored for the current game (shown as a badge until the inbox lands). */
  clipCount: number;
  /** First press ever: explain, then ask for the mic (the app's first runtime permission). */
  needsIntro: boolean;
  acknowledgeIntro: () => void;
  start: () => void;
  stop: () => void;
}

interface UseDictationCaptureProps {
  currentGameId: string | null;
  userId?: string;
  timeElapsedInSeconds: number;
  currentPeriod: number;
  gameStatus: 'notStarted' | 'inProgress' | 'periodEnd' | 'gameEnd';
  showToast: (
    message: string,
    type?: 'success' | 'error' | 'info',
    options?: { action?: { label: string; onClick: () => void }; durationMs?: number },
  ) => void;
  t: (key: string, fallback: string) => string;
}

/** A tap shorter than this is an accident, not a note. */
const MIN_CLIP_MS = 400;
/** A stuck press must not record the whole half. */
const MAX_CLIP_MS = 60_000;
/**
 * Keep the mic warm this long after a clip so successive notes start
 * instantly, then release it: the OS "microphone in use" indicator must not
 * glow for the rest of the match after one two-second note (review #746),
 * and the resume safety net comes back while nothing is being recorded.
 */
const IDLE_RELEASE_MS = 60_000;
const INTRO_SEEN_KEY = 'matchops_dictation_intro_seen';

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export function isDictationSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  );
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

function readIntroSeen(): boolean {
  try {
    // eslint-disable-next-line no-restricted-globals -- one-time UI flag, not app data (same pattern as the tour/wizard flags)
    return localStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

function writeIntroSeen(): void {
  try {
    // eslint-disable-next-line no-restricted-globals -- one-time UI flag, not app data
    localStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    // Not persistable - the in-session state still moves on.
  }
}

export function useDictationCapture({
  currentGameId,
  userId,
  timeElapsedInSeconds,
  currentPeriod,
  gameStatus,
  showToast,
  t,
}: UseDictationCaptureProps): DictationControls {
  const [isSupported] = useState(isDictationSupported);
  const [permission, setPermission] = useState<DictationPermission>('unknown');
  const [isRecording, setIsRecording] = useState(false);
  // Keyed by game so a game switch shows 0 without a synchronous reset.
  const [counts, setCounts] = useState<{ gameId: string | null; count: number }>({ gameId: null, count: 0 });
  const clipCount = counts.gameId === currentGameId ? counts.count : 0;
  const [needsIntro, setNeedsIntro] = useState(() => !readIntroSeen());
  const available = !!currentGameId && currentGameId !== DEFAULT_GAME_ID;

  // Latest values without re-creating the press handlers every clock tick.
  const elapsedRef = useRef(timeElapsedInSeconds);
  const periodRef = useRef(currentPeriod);
  const gameIdRef = useRef(currentGameId);
  const toastRef = useRef(showToast);
  const tRef = useRef(t);
  useEffect(() => {
    elapsedRef.current = timeElapsedInSeconds;
  }, [timeElapsedInSeconds]);
  useEffect(() => {
    periodRef.current = currentPeriod;
  }, [currentPeriod]);
  useEffect(() => {
    gameIdRef.current = currentGameId;
  }, [currentGameId]);
  useEffect(() => {
    toastRef.current = showToast;
    tRef.current = t;
  }, [showToast, t]);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stampRef = useRef<{ gameId: string; time: number; period: number; startedAt: number } | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleReleaseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRecordingRef = useRef(false);

  const disarm = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        // Already stopping.
      }
    }
    recorderRef.current = null;
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    if (idleReleaseRef.current) {
      clearTimeout(idleReleaseRef.current);
      idleReleaseRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    isRecordingRef.current = false;
    // React state follows via recorder.onstop (an external callback), so this
    // is safe to call from effects and cleanup.
    setRecordingSessionActive(false);
  }, []);

  // Every armed state expires - whether it came from a press or from the
  // intro acknowledgement alone (review #746 follow-up).
  const scheduleIdleRelease = useCallback(() => {
    if (idleReleaseRef.current) clearTimeout(idleReleaseRef.current);
    idleReleaseRef.current = setTimeout(() => {
      idleReleaseRef.current = null;
      if (!isRecordingRef.current) disarm();
    }, IDLE_RELEASE_MS);
  }, [disarm]);

  const arm = useCallback(async (): Promise<MediaStream | null> => {
    if (!isSupported) {
      toastRef.current(tRef.current('dictation.unsupported', 'Voice notes are not supported on this device.'), 'error');
      return null;
    }
    if (streamRef.current) return streamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // The OS can revoke the mic (call comes in, another app grabs it).
      stream.getTracks().forEach((track) => {
        track.addEventListener('ended', disarm, { once: true });
      });
      setPermission('granted');
      setRecordingSessionActive(true);
      scheduleIdleRelease();
      rotateOldClips(Date.now(), userId).catch((error) => {
        logger.warn('[dictation] clip rotation failed (non-fatal)', error);
      });
      return stream;
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
        setPermission('denied');
        toastRef.current(
          tRef.current(
            'dictation.permissionDenied',
            "Microphone access was denied. Allow it in your phone's app settings to dictate notes.",
          ),
          'error',
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        toastRef.current(tRef.current('dictation.noMicrophone', 'No microphone found.'), 'error');
      } else {
        logger.warn('[dictation] getUserMedia failed', error);
        toastRef.current(tRef.current('dictation.startFailed', 'Could not start recording.'), 'error');
      }
      return null;
    }
  }, [isSupported, userId, disarm, scheduleIdleRelease]);

  const finalizeClip = useCallback(
    async (mimeType: string) => {
      const stamp = stampRef.current;
      const chunks = chunksRef.current;
      chunksRef.current = [];
      stampRef.current = null;
      if (!stamp) return;
      const durationMs = Date.now() - stamp.startedAt;
      const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
      if (durationMs < MIN_CLIP_MS || blob.size === 0) return; // accidental tap

      const id = `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      try {
        const data = await blob.arrayBuffer();
        await saveClip(
          {
            id,
            gameId: stamp.gameId,
            time: Math.round(stamp.time * 100) / 100,
            period: stamp.period,
            createdAt: new Date().toISOString(),
            durationMs,
            mimeType: blob.type,
            sizeBytes: blob.size,
            data,
          },
          userId,
        );
        const bump = (delta: number) =>
          setCounts((prev) => ({
            gameId: stamp.gameId,
            count: Math.max(0, (prev.gameId === stamp.gameId ? prev.count : 0) + delta),
          }));
        bump(1);
        toastRef.current(tRef.current('dictation.captured', 'Note captured'), 'info', {
          action: {
            label: tRef.current('controlBar.undo', 'Undo'),
            onClick: () => {
              deleteClip(id, userId)
                .then(() => bump(-1))
                .catch((error) => logger.warn('[dictation] undo delete failed', error));
            },
          },
          durationMs: 5000,
        });
      } catch (error) {
        if (error instanceof AudioQuotaError) {
          toastRef.current(tRef.current('dictation.storageFull', 'Not enough storage for voice notes.'), 'error');
        } else {
          // Never pass the blob/stream objects along - keep Sentry extras small.
          logger.error('[dictation] clip save failed', error instanceof Error ? error : new Error(String(error)));
          toastRef.current(tRef.current('dictation.saveFailed', 'Could not save the note.'), 'error');
        }
      }
    },
    [userId],
  );

  const stop = useCallback(() => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop(); // onstop finalizes the clip
      } catch (error) {
        logger.warn('[dictation] recorder.stop failed', error);
      }
    }
    scheduleIdleRelease();
  }, [scheduleIdleRelease]);

  const start = useCallback(() => {
    if (isRecordingRef.current) return;
    const gameId = gameIdRef.current;
    if (!gameId || gameId === DEFAULT_GAME_ID) {
      // The scratch game is never autosaved - a clip keyed to it would be orphaned.
      toastRef.current(tRef.current('dictation.noGame', 'Open a game before dictating.'), 'info');
      return;
    }
    if (idleReleaseRef.current) {
      clearTimeout(idleReleaseRef.current);
      idleReleaseRef.current = null;
    }
    isRecordingRef.current = true; // claim before the async arm so a fast release cannot double-start
    void arm().then((stream) => {
      if (!stream || !isRecordingRef.current) {
        isRecordingRef.current = false;
        return;
      }
      try {
        const mimeType = pickMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        chunksRef.current = [];
        stampRef.current = { gameId, time: elapsedRef.current, period: periodRef.current, startedAt: Date.now() };
        recorder.ondataavailable = (event: BlobEvent) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorder.onstop = () => {
          setIsRecording(false);
          void finalizeClip(recorder.mimeType);
        };
        recorder.onerror = () => {
          logger.warn('[dictation] recorder error');
          toastRef.current(tRef.current('dictation.startFailed', 'Could not start recording.'), 'error');
          stop();
        };
        recorder.start();
        recorderRef.current = recorder;
        setIsRecording(true);
        autoStopRef.current = setTimeout(stop, MAX_CLIP_MS);
      } catch (error) {
        isRecordingRef.current = false;
        logger.warn('[dictation] MediaRecorder start failed', error);
        toastRef.current(tRef.current('dictation.startFailed', 'Could not start recording.'), 'error');
      }
    });
  }, [arm, finalizeClip, stop]);

  const acknowledgeIntro = useCallback(() => {
    writeIntroSeen();
    setNeedsIntro(false);
    void arm();
  }, [arm]);

  // Badge count follows the game (state is set only from the async result).
  useEffect(() => {
    if (!currentGameId || currentGameId === DEFAULT_GAME_ID) return;
    let cancelled = false;
    const gameId = currentGameId;
    countClips(gameId, userId)
      .then((count) => {
        if (!cancelled) setCounts({ gameId, count });
      })
      .catch(() => {
        if (!cancelled) setCounts({ gameId, count: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [currentGameId, userId]);

  // The session ends with the match, with a game switch, and with unmount.
  useEffect(() => {
    if (gameStatus === 'gameEnd') disarm();
  }, [gameStatus, disarm]);
  useEffect(() => {
    return () => disarm();
  }, [currentGameId, disarm]);

  return { isSupported, available, permission, isRecording, clipCount, needsIntro, acknowledgeIntro, start, stop };
}
