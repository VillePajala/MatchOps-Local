/**
 * @critical - before this, the only way to create a note about a player was to
 * dictate during the match or let an AI draft one, so the checklist row asking
 * how many players had been written about was not completable by hand at all.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GameNoteComposer from '../GameNoteComposer';
import type { Player } from '@/types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback ?? _k }),
}));
jest.mock('@/hooks/useDataStore', () => ({ useDataStore: () => ({ userId: 'u1' }) }));
const showToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({ useToast: () => ({ showToast }) }));
jest.mock('@/utils/aiUsage', () => ({ recordAiUsage: jest.fn() }));
jest.mock('@/utils/logger', () => ({ __esModule: true, default: { warn: jest.fn(), error: jest.fn(), log: jest.fn() } }));
const deleteClip = jest.fn().mockResolvedValue(undefined);
const setClipTranscript = jest.fn().mockResolvedValue(undefined);
jest.mock('@/utils/audioClipStore', () => ({
  deleteClip: (...a: unknown[]) => deleteClip(...a),
  getClipBlob: jest.fn().mockResolvedValue(new Blob(['x'])),
  setClipTranscript: (...a: unknown[]) => setClipTranscript(...a),
}));
const transcribeFn = jest.fn();
const getTranscriptionEngine = jest.fn();
jest.mock('@/utils/transcription', () => ({
  ...jest.requireActual('@/utils/transcription'),
  getTranscriptionEngine: () => getTranscriptionEngine(),
  estimateTranscriptionUsd: () => 0.01,
}));

const players: Player[] = [
  { id: 'p1', name: 'Liam Smith' } as Player,
  { id: 'p2', name: 'Emma Jones' } as Player,
];
const stamp = { time: 3000, period: 2 };

describe('GameNoteComposer', () => {
  it('writes a note about the chosen player, stamped to the end of the match', () => {
    const onAdd = jest.fn(() => true);
    render(<GameNoteComposer players={players} stamp={stamp} onAdd={onAdd} />);
    fireEvent.change(screen.getByLabelText('About'), { target: { value: 'p2' } });
    fireEvent.change(screen.getByLabelText('Write a note'), { target: { value: '  Won the ball back late on.  ' } });
    fireEvent.click(screen.getByTestId('note-composer-save'));
    expect(onAdd).toHaveBeenCalledWith({
      time: 3000, period: 2, text: 'Won the ball back late on.', entityId: 'p2', source: 'manual',
    });
  });

  it('writes a note about the match when no player is chosen', () => {
    const onAdd = jest.fn(() => true);
    render(<GameNoteComposer players={players} stamp={stamp} onAdd={onAdd} />);
    fireEvent.change(screen.getByLabelText('Write a note'), { target: { value: 'Sloppy first half.' } });
    fireEvent.click(screen.getByTestId('note-composer-save'));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ entityId: undefined }));
  });

  it('cannot save nothing, and clears only when the note was taken', () => {
    const onAdd = jest.fn(() => false);
    render(<GameNoteComposer players={players} stamp={stamp} onAdd={onAdd} />);
    expect(screen.getByTestId('note-composer-save')).toBeDisabled();
    const box = screen.getByLabelText('Write a note');
    fireEvent.change(box, { target: { value: 'Kept it.' } });
    fireEvent.click(screen.getByTestId('note-composer-save'));
    // Refused by the host (no saved game): the coach's words stay on screen.
    expect((box as HTMLTextAreaElement).value).toBe('Kept it.');
  });
});

describe('speaking instead of typing', () => {
  const controls = (over: Record<string, unknown> = {}) => ({
    isSupported: true, available: true, permission: 'granted', isRecording: false, clipCount: 0,
    needsIntro: false, lastClip: null, acknowledgeIntro: jest.fn(), start: jest.fn(), stop: jest.fn(), ...over,
  }) as never;

  it('records into the voice notes rather than a second transcription path', () => {
    const d = controls();
    const { rerender } = render(<GameNoteComposer players={players} stamp={stamp} onAdd={jest.fn(() => true)} dictation={d} />);
    fireEvent.click(screen.getByTestId('note-composer-record'));
    expect((d as unknown as { start: jest.Mock }).start).toHaveBeenCalled();
    rerender(<GameNoteComposer players={players} stamp={stamp} onAdd={jest.fn(() => true)} dictation={controls({ isRecording: true, start: (d as unknown as { start: jest.Mock }).start, stop: (d as unknown as { stop: jest.Mock }).stop })} />);
    fireEvent.click(screen.getByTestId('note-composer-record'));
    expect((d as unknown as { stop: jest.Mock }).stop).toHaveBeenCalled();
  });

  it('says nothing about recording when the device cannot', () => {
    render(<GameNoteComposer players={players} stamp={stamp} onAdd={jest.fn(() => true)} dictation={controls({ available: false })} />);
    expect(screen.queryByTestId('note-composer-record')).not.toBeInTheDocument();
    // Typing still works, which is the whole point of the card.
    expect(screen.getByTestId('note-composer-save')).toBeInTheDocument();
  });

  it('explains a refused microphone instead of offering a dead button', () => {
    render(<GameNoteComposer players={players} stamp={stamp} onAdd={jest.fn(() => true)} dictation={controls({ permission: 'denied' })} />);
    expect(screen.queryByTestId('note-composer-record')).not.toBeInTheDocument();
    expect(screen.getByText(/Microphone access was denied/)).toBeInTheDocument();
  });
});

describe('writing out the recording with the coach\'s own provider', () => {
  const clip = { id: 'c1', durationMs: 4000 };
  const controls = (over: Record<string, unknown> = {}) => ({
    isSupported: true, available: true, permission: 'granted', isRecording: false, clipCount: 0,
    needsIntro: false, lastClip: null, acknowledgeIntro: jest.fn(), start: jest.fn(), stop: jest.fn(), ...over,
  }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
    getTranscriptionEngine.mockReturnValue({ transcribe: transcribeFn });
    transcribeFn.mockResolvedValue('Won the ball back late on.');
  });

  /** @critical - the words the coach spoke must land in the box, once. */
  it('writes the recording out into the note, keeps the transcript on the clip, and drops the audio once saved', async () => {
    const onAdd = jest.fn(() => true);
    const start = jest.fn();
    const view = render(<GameNoteComposer players={players} stamp={stamp} onAdd={onAdd} dictation={controls({ start })} />);
    fireEvent.click(screen.getByTestId('note-composer-record'));
    expect(start).toHaveBeenCalled();
    // The recorder reports its clip after stopping.
    view.rerender(<GameNoteComposer players={players} stamp={stamp} onAdd={onAdd} dictation={controls({ lastClip: clip })} />);
    await waitFor(() => expect((screen.getByLabelText('Write a note') as HTMLTextAreaElement).value).toBe('Won the ball back late on.'));
    expect(setClipTranscript).toHaveBeenCalledWith('c1', 'Won the ball back late on.', 'u1');

    fireEvent.click(screen.getByTestId('note-composer-save'));
    await waitFor(() => expect(deleteClip).toHaveBeenCalledWith('c1', 'u1'));
    // Spoken and written out is dictation, not something typed from memory.
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ source: 'dictation' }));
  });

  it('leaves the clip in the voice notes when no provider is connected', async () => {
    getTranscriptionEngine.mockReturnValue(null);
    const view = render(<GameNoteComposer players={players} stamp={stamp} onAdd={jest.fn(() => true)} dictation={controls()} />);
    fireEvent.click(screen.getByTestId('note-composer-record'));
    view.rerender(<GameNoteComposer players={players} stamp={stamp} onAdd={jest.fn(() => true)} dictation={controls({ lastClip: clip })} />);
    await screen.findByTestId('note-composer-recorded');
    expect((screen.getByLabelText('Write a note') as HTMLTextAreaElement).value).toBe('');
  });

  it('says where the recording went when the provider refuses', async () => {
    transcribeFn.mockRejectedValue(new Error('nope'));
    const view = render(<GameNoteComposer players={players} stamp={stamp} onAdd={jest.fn(() => true)} dictation={controls()} />);
    fireEvent.click(screen.getByTestId('note-composer-record'));
    view.rerender(<GameNoteComposer players={players} stamp={stamp} onAdd={jest.fn(() => true)} dictation={controls({ lastClip: clip })} />);
    await screen.findByTestId('note-composer-recorded');
    expect(showToast).toHaveBeenCalled();
  });
});
