/**
 * Kirjuri recording controller.
 * @critical - press/release must produce one clock-stamped clip, keep the
 * session signal honest, and fail loudly (toast) on every device/permission path.
 */
import { renderHook, act } from '@testing-library/react';
import { useDictationCapture } from '../useDictationCapture';
import { saveClip, countClips } from '@/utils/audioClipStore';
import { isRecordingSessionActive, setRecordingSessionActive } from '@/utils/recordingSessionSignal';

jest.mock('@/utils/audioClipStore', () => ({
  AudioQuotaError: class AudioQuotaError extends Error {},
  saveClip: jest.fn().mockResolvedValue(undefined),
  countClips: jest.fn().mockResolvedValue(0),
  deleteClip: jest.fn().mockResolvedValue(undefined),
  rotateOldClips: jest.fn().mockResolvedValue(0),
}));

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

type DataHandler = ((event: { data: Blob }) => void) | null;

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported = () => true;
  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  ondataavailable: DataHandler = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? 'audio/webm';
    FakeRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['abc'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

const makeTrack = () => ({ stop: jest.fn(), addEventListener: jest.fn() });

describe('useDictationCapture', () => {
  const showToast = jest.fn();
  const t = (_key: string, fallback: string) => fallback;
  let tracks: ReturnType<typeof makeTrack>[];
  let getUserMedia: jest.Mock;

  const baseProps = {
    currentGameId: 'g1',
    userId: undefined,
    timeElapsedInSeconds: 1834,
    currentPeriod: 2,
    gameStatus: 'inProgress' as 'notStarted' | 'inProgress' | 'periodEnd' | 'gameEnd',
    showToast,
    t,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-04T10:00:00Z'));
    tracks = [makeTrack()];
    getUserMedia = jest.fn().mockResolvedValue({ getTracks: () => tracks });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
    FakeRecorder.instances = [];
    // jsdom's Blob has no arrayBuffer(); the hook converts before storing.
    Object.defineProperty(Blob.prototype, 'arrayBuffer', {
      configurable: true,
      value: () => Promise.resolve(new ArrayBuffer(3)),
    });
    localStorage.setItem('matchops_dictation_intro_seen', '1');
    setRecordingSessionActive(false);
  });

  afterEach(() => {
    setRecordingSessionActive(false);
    jest.useRealTimers();
  });

  it('reports unsupported devices with a toast and never asks for the mic', async () => {
    delete (globalThis as unknown as { MediaRecorder?: unknown }).MediaRecorder;
    const { result } = renderHook(() => useDictationCapture(baseProps));
    expect(result.current.isSupported).toBe(false);
    await act(async () => {
      result.current.start();
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/not supported/i), 'error');
  });

  it('press arms the mic, starts recording and raises the session signal', async () => {
    const { result } = renderHook(() => useDictationCapture(baseProps));
    await act(async () => {
      result.current.start();
    });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(result.current.permission).toBe('granted');
    expect(result.current.isRecording).toBe(true);
    expect(FakeRecorder.instances[0].state).toBe('recording');
    expect(isRecordingSessionActive()).toBe(true);
  });

  /** @critical - the clock stamp is taken at PRESS time, not at release. */
  it('release stores one clip stamped with the press-time clock and period, with an undo toast', async () => {
    const { result, rerender } = renderHook((props) => useDictationCapture(props), { initialProps: baseProps });
    await act(async () => {
      result.current.start();
    });
    rerender({ ...baseProps, timeElapsedInSeconds: 1840 }); // clock keeps running
    jest.setSystemTime(new Date('2026-09-04T10:00:02Z'));
    await act(async () => {
      result.current.stop();
    });
    expect(saveClip).toHaveBeenCalledTimes(1);
    const record = (saveClip as jest.Mock).mock.calls[0][0];
    expect(record).toMatchObject({ gameId: 'g1', time: 1834, period: 2, mimeType: expect.stringMatching(/^audio\/webm/) });
    expect(record.durationMs).toBeGreaterThanOrEqual(2000);
    expect(result.current.isRecording).toBe(false);
    expect(result.current.clipCount).toBe(1);
    expect(showToast).toHaveBeenCalledWith(
      'Note captured',
      'info',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }),
    );
  });

  it('discards an accidental tap (too short to be a note)', async () => {
    const { result } = renderHook(() => useDictationCapture(baseProps));
    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      result.current.stop();
    });
    expect(saveClip).not.toHaveBeenCalled();
    expect(result.current.clipCount).toBe(0);
  });

  it('a denied permission is remembered and explained', async () => {
    const denied = new Error('denied');
    denied.name = 'NotAllowedError';
    getUserMedia.mockRejectedValueOnce(denied);
    const { result } = renderHook(() => useDictationCapture(baseProps));
    await act(async () => {
      result.current.start();
    });
    expect(result.current.permission).toBe('denied');
    expect(result.current.isRecording).toBe(false);
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/denied/i), 'error');
    expect(isRecordingSessionActive()).toBe(false);
  });

  it('full time ends the session: tracks stopped, signal lowered', async () => {
    const { result, rerender } = renderHook((props) => useDictationCapture(props), { initialProps: baseProps });
    await act(async () => {
      result.current.start();
    });
    expect(isRecordingSessionActive()).toBe(true);
    rerender({ ...baseProps, gameStatus: 'gameEnd' as const });
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(isRecordingSessionActive()).toBe(false);
  });

  /** @critical - the OS mic indicator must go off soon after a note, not at full time. */
  it('releases the mic after an idle minute, and a new press re-arms it', async () => {
    const { result } = renderHook(() => useDictationCapture(baseProps));
    await act(async () => {
      result.current.start();
    });
    jest.setSystemTime(new Date('2026-09-04T10:00:02Z'));
    await act(async () => {
      result.current.stop();
    });
    expect(isRecordingSessionActive()).toBe(true); // still warm right after the note
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(isRecordingSessionActive()).toBe(false);

    await act(async () => {
      result.current.start();
    });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(isRecordingSessionActive()).toBe(true);
  });

  it('refuses to record without an open game', async () => {
    const { result } = renderHook(() => useDictationCapture({ ...baseProps, currentGameId: null }));
    await act(async () => {
      result.current.start();
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/open a game/i), 'info');
  });

  it('loads the clip count for the current game', async () => {
    (countClips as jest.Mock).mockResolvedValueOnce(3);
    const { result } = renderHook(() => useDictationCapture(baseProps));
    await act(async () => {});
    expect(countClips).toHaveBeenCalledWith('g1', undefined);
    expect(result.current.clipCount).toBe(3);
  });

  it('needs the intro until acknowledged; acknowledging arms the mic', async () => {
    localStorage.removeItem('matchops_dictation_intro_seen');
    const { result } = renderHook(() => useDictationCapture(baseProps));
    expect(result.current.needsIntro).toBe(true);
    await act(async () => {
      result.current.acknowledgeIntro();
    });
    expect(result.current.needsIntro).toBe(false);
    expect(localStorage.getItem('matchops_dictation_intro_seen')).toBe('1');
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});
