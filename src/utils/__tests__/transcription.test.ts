/**
 * Kirjuri transcription engine (BYOK OpenAI).
 * @critical - audio goes only to the coach's own provider with the key in the
 * Authorization header, the roster is passed as a vocabulary hint, and every
 * failure has a typed kind the inbox can explain.
 */
import {
  TranscriptionError,
  buildVocabularyPrompt,
  estimateTranscriptionUsd,
  getTranscriptionEngine,
} from '../transcription';
import { acceptAiConsent, resetAiProviderStateForTests, setAiProviderKey } from '@/utils/aiProvider';

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

const fetchMock = jest.fn();

beforeEach(() => {
  localStorage.clear();
  resetAiProviderStateForTests();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

const connect = () => {
  acceptAiConsent();
  setAiProviderKey('sk-proj-abcdefghijklmnop');
};

describe('getTranscriptionEngine', () => {
  it('is null until consent + key exist', () => {
    expect(getTranscriptionEngine()).toBeNull();
    connect();
    expect(getTranscriptionEngine()?.id).toBe('byok-openai');
  });
});

describe('byok-openai engine', () => {
  it('posts the clip as multipart with model, language and the roster prompt; key only in the header', async () => {
    connect();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ text: '  Emman syöttö  ' }) });
    const clip = new Blob(['abc'], { type: 'audio/webm;codecs=opus' });

    const text = await getTranscriptionEngine()!.transcribe(clip, { language: 'fi', vocabulary: ['Emma', 'Matti', 'Emma'] });

    expect(text).toBe('Emman syöttö');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(url).not.toContain('sk-');
    expect(init.headers.Authorization).toBe('Bearer sk-proj-abcdefghijklmnop');
    const form = init.body as FormData;
    expect(form.get('model')).toBe('gpt-4o-mini-transcribe');
    expect(form.get('language')).toBe('fi');
    expect(form.get('prompt')).toBe('Pelaajat: Emma, Matti.');
    const file = form.get('file') as File;
    expect(file.name).toBe('clip.webm');
  });

  it('maps provider failures to typed errors', async () => {
    connect();
    const engine = getTranscriptionEngine()!;
    const clip = new Blob(['abc'], { type: 'audio/webm' });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(engine.transcribe(clip, { language: 'fi', vocabulary: [] })).rejects.toMatchObject({ kind: 'unauthorized' });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    await expect(engine.transcribe(clip, { language: 'fi', vocabulary: [] })).rejects.toMatchObject({ kind: 'rateLimited' });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400 });
    await expect(engine.transcribe(clip, { language: 'fi', vocabulary: [] })).rejects.toMatchObject({ kind: 'rejected' });
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(engine.transcribe(clip, { language: 'fi', vocabulary: [] })).rejects.toBeInstanceOf(TranscriptionError);
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ nope: 1 }) });
    await expect(engine.transcribe(clip, { language: 'fi', vocabulary: [] })).rejects.toMatchObject({ kind: 'rejected' });
  });

  it('refuses without a key even if consent exists', async () => {
    acceptAiConsent();
    // Engine resolved while connected, then the key vanishes (disconnect in another tab).
    setAiProviderKey('sk-abcdefghijklmnop');
    const engine = getTranscriptionEngine()!;
    localStorage.removeItem('matchops_ai_key');
    await expect(engine.transcribe(new Blob(['x']), { language: 'fi', vocabulary: [] })).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('builds a short, de-duplicated vocabulary prompt', () => {
    expect(buildVocabularyPrompt([])).toBe('');
    expect(buildVocabularyPrompt([' Emma ', 'Emma', 'Sofi'])).toBe('Pelaajat: Emma, Sofi.');
    expect(buildVocabularyPrompt(Array.from({ length: 60 }, (_, i) => `P${i}`)).split(', ')).toHaveLength(40);
  });

  it('estimates cost rounded up to a cent', () => {
    expect(estimateTranscriptionUsd(0)).toBe(0);
    expect(estimateTranscriptionUsd(30_000)).toBe(0.01); // half a minute
    expect(estimateTranscriptionUsd(10 * 60_000)).toBe(0.03);
  });
});
