'use client';

/**
 * Kirjuri Phase 2 spike: does hands-free recording work on this phone?
 *
 * THROWAWAY. Delete this route before the feature branch reaches master; it is
 * a diagnostic, not a feature. See kirjuri-ai-plan.md "Phase 2 - Hands-free".
 *
 * Phase 2 rests on two things nobody can verify from a desk:
 *
 * 1. Does an earbud button reach the page? The trick is to hold an audio track
 *    so the system treats the app as a media player and routes the button to
 *    us as a Media Session action. Inside a Play Store trusted web activity
 *    that may simply not happen. Different buds also speak differently: a
 *    single-button media bud usually sends play/pause over AVRCP, while a
 *    headset built for calls may send call control instead, which never
 *    surfaces as a media action. This screen logs whatever arrives, from either
 *    route, with timestamps, so the two can be told apart.
 *
 * 2. Does the microphone survive a pocketed phone? If the system suspends the
 *    stream, hands-free recording is dead however well the button works. This
 *    screen samples the live input level every second and logs mute, unmute,
 *    ended and visibility changes, so the log can be read after the phone comes
 *    back out of the pocket.
 *
 * Everything stays on the device: no recording is stored, nothing is uploaded.
 */

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * Whether this is running as an installed app or a browser tab - and read in a
 * way that survives prerendering, since the server has no `window` and this
 * route is statically generated like every other page here.
 */
const STANDALONE_QUERY = '(display-mode: standalone)';
const subscribeToDisplayMode = (onChange: () => void) => {
  const media = window.matchMedia(STANDALONE_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};
const useStandalone = (): boolean =>
  useSyncExternalStore(
    subscribeToDisplayMode,
    () => window.matchMedia(STANDALONE_QUERY).matches,
    () => false,
  );

type LogLine = { at: string; text: string };

const stamp = (): string => new Date().toISOString().slice(11, 23);

/**
 * A looping WAV built in the browser, so the page can hold a media track
 * without shipping an audio file.
 *
 * `amplitude` matters: a truly silent track is sometimes treated as inaudible
 * and never gets a media session, so the spike offers a barely-audible tone as
 * the fallback to try when silence produces no button events.
 */
function makeLoopWavUrl(amplitude: number): string {
  const sampleRate = 8000;
  const seconds = 1;
  const samples = sampleRate * seconds;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const value = amplitude === 0 ? 0 : Math.round(Math.sin((i / sampleRate) * 2 * Math.PI * 220) * amplitude * 32767);
    view.setInt16(44 + i * 2, value, true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

/** Every action the spec defines, so we can see which ones this device sends. */
const MEDIA_ACTIONS = [
  'play',
  'pause',
  'stop',
  'nexttrack',
  'previoustrack',
  'seekbackward',
  'seekforward',
  'seekto',
  'hangup',
  'togglemicrophone',
  'togglecamera',
] as const;

const CARD = 'bg-slate-900/70 p-4 rounded-lg border border-slate-700 space-y-3';
const BTN =
  'w-full px-4 py-3 rounded-md text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50';
const BTN2 =
  'w-full px-4 py-3 rounded-md text-sm font-semibold text-slate-200 bg-slate-700 hover:bg-slate-600 disabled:opacity-50';

const HandsFreeSpike: React.FC = () => {
  const [log, setLog] = useState<LogLine[]>([]);
  const [holding, setHolding] = useState(false);
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [quiet, setQuiet] = useState(false);
  const standalone = useStandalone();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);

  const say = useCallback((text: string) => {
    setLog((prev) => [{ at: stamp(), text }, ...prev].slice(0, 400));
  }, []);

  // --- 1. the button -------------------------------------------------------

  const holdMediaTrack = useCallback(
    async (withTone: boolean) => {
      try {
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const url = makeLoopWavUrl(withTone ? 0.02 : 0);
        urlRef.current = url;
        const audio = audioRef.current ?? new Audio();
        audioRef.current = audio;
        audio.src = url;
        audio.loop = true;
        audio.volume = withTone ? 0.05 : 1;
        await audio.play();
        setHolding(true);
        say(`holding a ${withTone ? 'barely audible tone' : 'silent'} loop`);

        if ('mediaSession' in navigator) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: 'Kirjuri hands-free spike',
            artist: 'MatchOps',
          });
          navigator.mediaSession.playbackState = 'playing';
          let registered = 0;
          for (const action of MEDIA_ACTIONS) {
            try {
              navigator.mediaSession.setActionHandler(action as MediaSessionAction, () => {
                say(`MEDIA SESSION: ${action}`);
              });
              registered += 1;
            } catch {
              // Unsupported action on this browser; that itself is a finding.
              say(`media session refused to register: ${action}`);
            }
          }
          say(`media session live, ${registered} of ${MEDIA_ACTIONS.length} actions registered`);
        } else {
          say('NO media session support on this browser');
        }
      } catch (error) {
        say(`could not hold a track: ${error instanceof Error ? error.name : 'unknown'}`);
      }
    },
    [say],
  );

  const dropMediaTrack = useCallback(() => {
    audioRef.current?.pause();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
      for (const action of MEDIA_ACTIONS) {
        try {
          navigator.mediaSession.setActionHandler(action as MediaSessionAction, null);
        } catch {
          /* already unsupported */
        }
      }
    }
    setHolding(false);
    say('released the track');
  }, [say]);

  // Some devices deliver media keys as key events instead of session actions.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (/^(Media|Audio)/.test(event.key) || event.key === 'Pause') {
        say(`KEY EVENT: ${event.key}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [say]);

  // --- 2. the microphone ---------------------------------------------------

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setListening(true);
      say('microphone open');

      for (const track of stream.getAudioTracks()) {
        say(`track: ${track.label || 'unnamed'} (${track.readyState})`);
        track.onmute = () => say('TRACK MUTED by the system');
        track.onunmute = () => say('track unmuted');
        track.onended = () => say('TRACK ENDED by the system');
      }

      const context = new AudioContext();
      contextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      // One line a second: enough to read afterwards, few enough to scroll.
      timerRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += (v - 128) ** 2;
        const rms = Math.round(Math.sqrt(sum / data.length) * 10);
        setLevel(rms);
        const track = streamRef.current?.getAudioTracks()[0];
        say(`level ${String(rms).padStart(3, ' ')} | track ${track?.readyState ?? 'gone'}${track?.muted ? ' MUTED' : ''} | page ${document.visibilityState} | context ${context.state}`);
      }, 1000);

      // Screen-on is the realistic case, so hold the wake lock like the app does.
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
        if (nav.wakeLock) {
          wakeRef.current = await nav.wakeLock.request('screen');
          say('screen wake lock held');
        }
      } catch {
        say('wake lock refused');
      }
    } catch (error) {
      say(`microphone refused: ${error instanceof Error ? error.name : 'unknown'}`);
    }
  }, [say]);

  const stopListening = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
    void wakeRef.current?.release();
    wakeRef.current = null;
    setListening(false);
    setLevel(0);
    say('microphone closed');
  }, [say]);

  useEffect(() => {
    const onVisible = () => say(`page became ${document.visibilityState}`);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [say]);

  // --- 3. what the buds present as ----------------------------------------

  /**
   * Getting the log OUT of the app.
   *
   * In an installed app there is no console and no developer tools, so a log
   * that can only be read on screen is a log that cannot be reported. Copy
   * first, share as the fallback, and a file download if neither is allowed.
   */
  const exportLog = useCallback(async () => {
    const header = [
      `Kirjuri hands-free spike ${new Date().toISOString()}`,
      `display-mode: ${standalone ? 'standalone (installed)' : 'browser tab'}`,
      `userAgent: ${navigator.userAgent}`,
      '',
    ].join('\n');
    const body = header + log.map((l) => `${l.at}  ${l.text}`).reverse().join('\n');
    try {
      await navigator.clipboard.writeText(body);
      say('log copied - paste it wherever you need it');
      return;
    } catch {
      /* no clipboard permission in this context */
    }
    try {
      const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string }) => Promise<void> };
      if (nav.share) {
        await nav.share({ title: 'Kirjuri spike log', text: body });
        return;
      }
    } catch {
      /* the share sheet was dismissed */
    }
    // Last resort: hand it over as a file.
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `kirjuri-spike-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    say('log saved as a file');
  }, [log, say, standalone]);

  const listDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      say(`${devices.length} devices:`);
      for (const d of devices) {
        say(`  ${d.kind}: ${d.label || '(label hidden until permission)'}`);
      }
    } catch (error) {
      say(`could not list devices: ${error instanceof Error ? error.name : 'unknown'}`);
    }
  }, [say]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void contextRef.current?.close();
      void wakeRef.current?.release();
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 space-y-4 font-display">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-yellow-400">Kirjuri hands-free spike</h1>
        <p className="text-xs text-slate-400">
          Throwaway diagnostic. Nothing is recorded, stored or uploaded. Two questions: does an earbud
          button reach this page, and does the microphone survive your pocket.
        </p>
      </header>

      <section className={CARD}>
        <h2 className="text-sm font-semibold text-slate-200">1. The earbud button</h2>
        <p className="text-xs text-slate-400">
          Hold a track, then press the button on your buds. Single click, double click, and the call
          button if it has one. Anything that arrives appears in the log. If nothing arrives with the
          silent loop, try the audible one: some systems ignore a silent player.
        </p>
        {holding ? (
          <button type="button" onClick={dropMediaTrack} className={BTN2} data-testid="spike-drop">
            Release the track
          </button>
        ) : (
          <>
            <button type="button" onClick={() => void holdMediaTrack(quiet)} className={BTN} data-testid="spike-hold">
              Hold a {quiet ? 'barely audible' : 'silent'} track
            </button>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} className="h-4 w-4" />
              use a barely audible tone instead of silence
            </label>
          </>
        )}
      </section>

      <section className={CARD}>
        <h2 className="text-sm font-semibold text-slate-200">2. The microphone in your pocket</h2>
        <p className="text-xs text-slate-400">
          Open the microphone, put the phone in your pocket with the screen on, wait a minute or two,
          then read the log. Level should keep moving. A muted or ended track means hands-free recording
          cannot work this way.
        </p>
        <div className="h-2 rounded bg-slate-700 overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, level * 4)}%` }} />
        </div>
        {listening ? (
          <button type="button" onClick={stopListening} className={BTN2} data-testid="spike-mic-stop">
            Close the microphone
          </button>
        ) : (
          <button type="button" onClick={() => void startListening()} className={BTN} data-testid="spike-mic-start">
            Open the microphone
          </button>
        )}
      </section>

      <section className={CARD}>
        <h2 className="text-sm font-semibold text-slate-200">3. What your buds present as</h2>
        <p className="text-xs text-slate-400">
          Media buds and call headsets appear differently here, which is the likeliest reason one pair
          works and another does not.
        </p>
        <button type="button" onClick={() => void listDevices()} className={BTN2} data-testid="spike-devices">
          List audio devices
        </button>
      </section>

      <section className={CARD}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Log</h2>
          <button type="button" onClick={() => setLog([])} className="text-xs text-slate-400 underline">
            clear
          </button>
        </div>
        <p className="text-xs text-slate-400">
          {standalone
            ? 'Running as an installed app, which is the case that matters.'
            : 'Running in a browser tab. Install this preview to the home screen and run it from there: a browser tab is more permissive than an installed app, so a pass here can still fail there.'}
        </p>
        <button
          type="button"
          onClick={() => void exportLog()}
          disabled={log.length === 0}
          className={BTN2}
          data-testid="spike-export"
        >
          Copy the log (there is no console in an installed app)
        </button>
        <pre className="text-[11px] leading-relaxed whitespace-pre-wrap text-slate-300 max-h-96 overflow-y-auto" data-testid="spike-log">
          {log.length === 0 ? 'nothing yet' : log.map((l) => `${l.at}  ${l.text}`).join('\n')}
        </pre>
      </section>
    </main>
  );
};

export default HandsFreeSpike;
