/**
 * Kirjuri transcription engines (PR 5).
 *
 * One interface, pluggable engines. v1 ships `byok-openai`: the clip's bytes go
 * from this device straight to the coach's own OpenAI account, on the coach's
 * key, only when the coach presses Transcribe. `language: fi` plus the game
 * roster's nicknames as a vocabulary prompt keep Finnish names intact.
 *
 * Why no on-device engine yet: the Web Speech API (also Chrome's on-device
 * mode) transcribes live microphone input only - it cannot read a recorded
 * clip. A device-local engine over stored clips needs a WASM model
 * (Whisper-class), and the models small enough for a phone are unusable for
 * Finnish today. The interface leaves the slot open; see kirjuri-ai-plan.md.
 *
 * The key never appears in a URL, a log, or a thrown error.
 */

import { AI_PROVIDERS, getAiProviderKey, getAiProviderState } from '@/utils/aiProvider';
import logger from '@/utils/logger';

export type TranscriptionEngineId = 'byok-openai';

export interface TranscriptionOptions {
  /** BCP-47-ish, e.g. 'fi'. */
  language: string;
  /** Roster nicknames / first names to bias recognition toward. */
  vocabulary: string[];
  signal?: AbortSignal;
}

export interface TranscriptionEngine {
  id: TranscriptionEngineId;
  transcribe(clip: Blob, options: TranscriptionOptions): Promise<string>;
}

export type TranscriptionFailure = 'unauthorized' | 'rateLimited' | 'network' | 'rejected';

export class TranscriptionError extends Error {
  constructor(public readonly kind: TranscriptionFailure, message: string = kind) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

/** OpenAI's cheapest speech-to-text model with prompt support (2026). */
export const OPENAI_TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';
/** Rough list price, USD per minute of audio - for the cost hint only. */
export const OPENAI_TRANSCRIBE_USD_PER_MINUTE = 0.003;
const REQUEST_TIMEOUT_MS = 60_000;
/** Whisper-style prompts are capped; keep the vocabulary hint short. */
const MAX_VOCABULARY_TERMS = 40;

/**
 * The names worth sending as a recognizer hint for one match.
 *
 * Scoped to the players in THIS match on purpose. The hint is text about
 * children that leaves the device, so it is defensible only for the people the
 * recording is plausibly about - the same names already spoken in the audio.
 * Sending the whole club roster shipped the first names of children who were
 * not in the match, not in the squad, and never mentioned.
 *
 * Original casing is deliberate: the recognizer mirrors the prompt's spelling,
 * so "Emma" must be sent as "Emma". Dedupe is case-insensitive.
 */
export function dictationVocabularyFor(players: Array<{ name: string; nickname?: string }>): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const player of players) {
    for (const term of [player.nickname?.trim(), player.name.trim().split(/\s+/)[0]]) {
      if (!term || term.length < 2) continue;
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      terms.push(term);
    }
  }
  return terms;
}

export function buildVocabularyPrompt(vocabulary: string[]): string {
  const terms = [...new Set(vocabulary.map((v) => v.trim()).filter(Boolean))].slice(0, MAX_VOCABULARY_TERMS);
  return terms.length ? `Pelaajat: ${terms.join(', ')}.` : '';
}

/** Cost hint for a batch, rounded up to a cent. */
export function estimateTranscriptionUsd(totalDurationMs: number): number {
  const minutes = totalDurationMs / 60_000;
  return Math.ceil(minutes * OPENAI_TRANSCRIBE_USD_PER_MINUTE * 100) / 100;
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  return 'webm';
}

function withTimeout(signal?: AbortSignal): AbortSignal | undefined {
  const timeout = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined;
  if (signal && timeout && typeof AbortSignal.any === 'function') return AbortSignal.any([signal, timeout]);
  return signal ?? timeout;
}

const byokOpenAi: TranscriptionEngine = {
  id: 'byok-openai',
  async transcribe(clip, options) {
    const key = getAiProviderKey();
    if (!key) throw new TranscriptionError('unauthorized', 'No provider key on this device');

    const form = new FormData();
    form.append('file', new File([clip], `clip.${extensionFor(clip.type)}`, { type: clip.type || 'audio/webm' }));
    form.append('model', OPENAI_TRANSCRIBE_MODEL);
    form.append('language', options.language);
    form.append('response_format', 'json');
    const prompt = buildVocabularyPrompt(options.vocabulary);
    if (prompt) form.append('prompt', prompt);

    let response: Response;
    try {
      response = await fetch(`${AI_PROVIDERS.openai.host}/v1/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: withTimeout(options.signal),
      });
    } catch (error) {
      // Never include the request (it carries the key) in what we log.
      logger.warn('[transcription] request failed', { name: error instanceof Error ? error.name : 'unknown' });
      throw new TranscriptionError('network');
    }

    if (response.status === 401 || response.status === 403) throw new TranscriptionError('unauthorized');
    if (response.status === 429) throw new TranscriptionError('rateLimited');
    if (!response.ok) {
      logger.warn('[transcription] provider returned an error status', { status: response.status });
      throw new TranscriptionError(response.status >= 500 ? 'network' : 'rejected');
    }

    const body = (await response.json()) as { text?: unknown };
    if (typeof body.text !== 'string') throw new TranscriptionError('rejected', 'Malformed transcription response');
    return body.text.trim();
  },
};

/**
 * The engine to use right now, or null when nothing is connected (the inbox
 * then offers replay + typing only).
 */
export function getTranscriptionEngine(): TranscriptionEngine | null {
  return getAiProviderState().connected ? byokOpenAi : null;
}
