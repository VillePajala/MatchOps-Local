/**
 * Kirjuri dictation inbox.
 * @critical - a clip becomes a note only through an explicit accept, and the
 * audio is deleted on accept AND on discard.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import DictationInbox from '../DictationInbox';
import { deleteClip, getClipBlob, listClips } from '@/utils/audioClipStore';
import type { Player } from '@/types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string, options?: Record<string, unknown>) =>
      (fallback ?? _key).replace(/\{\{(\w+)\}\}/g, (_m, name) => String(options?.[name] ?? '')),
  }),
}));

jest.mock('@/hooks/useDataStore', () => ({ useDataStore: () => ({ userId: 'u1' }) }));

const showToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({ useToast: () => ({ showToast }) }));

const aiState = { connected: false };
jest.mock('@/utils/aiProvider', () => ({ useAiProviderState: () => aiState }));

const transcribe = jest.fn();
jest.mock('@/utils/transcription', () => ({
  ...jest.requireActual('@/utils/transcription'),
  getTranscriptionEngine: () => (aiState.connected ? { id: 'byok-openai', transcribe } : null),
}));

jest.mock('@/utils/audioClipStore', () => ({
  listClips: jest.fn(),
  getClipBlob: jest.fn(),
  deleteClip: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

const players: Player[] = [
  { id: 'p-emma', name: 'Emma Virtanen', nickname: 'Emma' },
  { id: 'p-matti', name: 'Matti Meikäläinen' },
];

const clips = [
  { id: 'c1', gameId: 'g1', time: 1834, period: 2, createdAt: '2026-09-04T10:00:00Z', durationMs: 2400, mimeType: 'audio/webm', sizeBytes: 10 },
  { id: 'c2', gameId: 'g1', time: 120, period: 1, createdAt: '2026-09-04T09:00:00Z', durationMs: 1200, mimeType: 'audio/webm', sizeBytes: 10 },
];

describe('DictationInbox', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    aiState.connected = false;
    (listClips as jest.Mock).mockResolvedValue(clips);
    (getClipBlob as jest.Mock).mockResolvedValue(new Blob(['x'], { type: 'audio/webm' }));
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:mock') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
  });

  it('lists the clips with their clock stamps and reports the count', async () => {
    const onCountChange = jest.fn();
    render(<DictationInbox gameId="g1" availablePlayers={players} onCountChange={onCountChange} />);
    expect(await screen.findAllByTestId('dictation-clip')).toHaveLength(2);
    expect(screen.getByText('P2 30:34')).toBeInTheDocument();
    expect(screen.getByText('P1 02:00')).toBeInTheDocument();
    expect(listClips).toHaveBeenCalledWith('g1', 'u1');
    expect(onCountChange).toHaveBeenLastCalledWith(2);
  });

  it('renders nothing when there is nothing to review', async () => {
    (listClips as jest.Mock).mockResolvedValueOnce([]);
    const onCountChange = jest.fn();
    const { container } = render(<DictationInbox gameId="g1" availablePlayers={players} onCountChange={onCountChange} />);
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(0));
    expect(container).toBeEmptyDOMElement();
  });

  it('guesses the player from the typed text (Finnish inflection included)', async () => {
    render(<DictationInbox gameId="g1" availablePlayers={players} />);
    const [text] = await screen.findAllByTestId('dictation-text');
    fireEvent.change(text, { target: { value: 'Emman syöttö paineen alla' } });
    const [select] = screen.getAllByTestId('dictation-player') as HTMLSelectElement[];
    expect(select.value).toBe('p-emma');
  });

  /** @critical - accept hands the stamped note up and deletes the audio. */
  it('accept passes time, period, text and the chosen player up, then deletes the clip', async () => {
    const onAccept = jest.fn();
    const onCountChange = jest.fn();
    render(<DictationInbox gameId="g1" availablePlayers={players} onAccept={onAccept} onCountChange={onCountChange} />);
    const [text] = await screen.findAllByTestId('dictation-text');
    const [accept] = screen.getAllByTestId('dictation-accept');
    expect(accept).toBeDisabled();
    fireEvent.change(text, { target: { value: '  Emman syöttö  ' } });
    await act(async () => {
      fireEvent.click(accept);
    });
    expect(onAccept).toHaveBeenCalledWith({ time: 1834, period: 2, text: 'Emman syöttö', entityId: 'p-emma' });
    expect(deleteClip).toHaveBeenCalledWith('c1', 'u1');
    await waitFor(() => expect(screen.getAllByTestId('dictation-clip')).toHaveLength(1));
    expect(onCountChange).toHaveBeenLastCalledWith(1);
  });

  /** @critical - a double-tap on Save must not create two notes. */
  it('ignores a second tap while the first accept is in flight', async () => {
    let resolveDelete: () => void = () => {};
    (deleteClip as jest.Mock).mockImplementationOnce(() => new Promise<void>((resolve) => { resolveDelete = resolve; }));
    const onAccept = jest.fn();
    render(<DictationInbox gameId="g1" availablePlayers={players} onAccept={onAccept} />);
    const [text] = await screen.findAllByTestId('dictation-text');
    fireEvent.change(text, { target: { value: 'Emman syöttö' } });
    const [accept] = screen.getAllByTestId('dictation-accept');
    await act(async () => {
      fireEvent.click(accept);
      fireEvent.click(accept);
    });
    expect(onAccept).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveDelete();
    });
  });

  it('a manually chosen "the game" overrides the guess', async () => {
    const onAccept = jest.fn();
    render(<DictationInbox gameId="g1" availablePlayers={players} onAccept={onAccept} />);
    const [text] = await screen.findAllByTestId('dictation-text');
    fireEvent.change(text, { target: { value: 'Emma ja koko puolustus nukkui' } });
    const [select] = screen.getAllByTestId('dictation-player');
    fireEvent.change(select, { target: { value: '' } });
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('dictation-accept')[0]);
    });
    expect(onAccept).toHaveBeenCalledWith(expect.objectContaining({ entityId: undefined }));
  });

  it('discard deletes the audio without creating a note', async () => {
    const onAccept = jest.fn();
    render(<DictationInbox gameId="g1" availablePlayers={players} onAccept={onAccept} />);
    const [discard] = await screen.findAllByTestId('dictation-discard');
    await act(async () => {
      fireEvent.click(discard);
    });
    expect(deleteClip).toHaveBeenCalledWith('c1', 'u1');
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('play loads the blob into an audio element; stop removes it', async () => {
    render(<DictationInbox gameId="g1" availablePlayers={players} />);
    const [play] = await screen.findAllByRole('button', { name: 'Play' });
    await act(async () => {
      fireEvent.click(play);
    });
    expect(getClipBlob).toHaveBeenCalledWith('c1', 'u1');
    expect(screen.getByTestId('dictation-audio')).toHaveAttribute('src', 'blob:mock');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    });
    expect(screen.queryByTestId('dictation-audio')).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  describe('transcription (PR 5)', () => {
    it('offers only a hint while no provider is connected', async () => {
      render(<DictationInbox gameId="g1" availablePlayers={players} />);
      await screen.findAllByTestId('dictation-clip');
      expect(screen.getByTestId('dictation-transcribe-hint')).toBeInTheDocument();
      expect(screen.queryByTestId('dictation-transcribe')).not.toBeInTheDocument();
    });

    /** @critical - the batch fills only empty fields, passes the roster, and the chip follows the text. */
    it('transcribes the empty clips with the roster as vocabulary and the player chip follows', async () => {
      aiState.connected = true;
      transcribe.mockResolvedValueOnce('Emman syöttö').mockResolvedValueOnce('puolustus nukkui');
      render(<DictationInbox gameId="g1" availablePlayers={players} />);
      const button = await screen.findByTestId('dictation-transcribe');
      expect(button).toHaveTextContent('Transcribe 2 clips');
      await act(async () => {
        fireEvent.click(button);
      });
      expect(transcribe).toHaveBeenCalledTimes(2);
      expect(transcribe.mock.calls[0][1]).toEqual({ language: 'fi', vocabulary: ['emma', 'matti'] });
      const texts = screen.getAllByTestId('dictation-text') as HTMLTextAreaElement[];
      expect(texts[0].value).toBe('Emman syöttö');
      expect(texts[1].value).toBe('puolustus nukkui');
      const selects = screen.getAllByTestId('dictation-player') as HTMLSelectElement[];
      expect(selects[0].value).toBe('p-emma');
      expect(selects[1].value).toBe('');
      expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/2 clips transcribed/), 'success');
      expect(screen.queryByTestId('dictation-transcribe')).not.toBeInTheDocument(); // nothing left to transcribe
    });

    it('does not overwrite text the coach already typed', async () => {
      aiState.connected = true;
      transcribe.mockResolvedValue('from provider');
      render(<DictationInbox gameId="g1" availablePlayers={players} />);
      const [first] = await screen.findAllByTestId('dictation-text');
      fireEvent.change(first, { target: { value: 'typed by hand' } });
      const button = screen.getByTestId('dictation-transcribe');
      expect(button).toHaveTextContent('Transcribe 1 clips');
      await act(async () => {
        fireEvent.click(button);
      });
      expect(transcribe).toHaveBeenCalledTimes(1);
      expect((screen.getAllByTestId('dictation-text')[0] as HTMLTextAreaElement).value).toBe('typed by hand');
    });

    it('a rejected key stops the batch with a Settings hint', async () => {
      aiState.connected = true;
      const { TranscriptionError } = jest.requireActual('@/utils/transcription');
      transcribe.mockRejectedValue(new TranscriptionError('unauthorized'));
      render(<DictationInbox gameId="g1" availablePlayers={players} />);
      const button = await screen.findByTestId('dictation-transcribe');
      await act(async () => {
        fireEvent.click(button);
      });
      expect(transcribe).toHaveBeenCalledTimes(1); // stopped after the first failure
      expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/rejected your key/), 'error');
    });
  });
});
