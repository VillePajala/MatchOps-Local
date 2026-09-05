/**
 * Speak the match report (Kirjuri Phase 4, PR 10).
 *
 * @critical - this records a coach talking about children, transcribes it on
 * their own key and then writes it into their record. The tests that matter:
 * it only claims a recording it started itself, the audio is deleted once the
 * words are kept, and nothing is stored when the save is refused.
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import SpokenReportPanel from '../SpokenReportPanel';
import type { DictationControls } from '@/hooks/useDictationCapture';
import { deleteClip, getClipBlob } from '@/utils/audioClipStore';

const showToast = jest.fn();
const transcribe = jest.fn();
const aiState = { connected: true, pseudonymize: true };

jest.mock('@/contexts/ToastProvider', () => ({ useToast: () => ({ showToast }) }));
jest.mock('@/hooks/useDataStore', () => ({ useDataStore: () => ({ userId: 'u1' }) }));
jest.mock('@/utils/aiProvider', () => ({ useAiProviderState: () => aiState }));
jest.mock('@/utils/aiUsage', () => ({ recordAiUsage: jest.fn() }));
jest.mock('@/utils/audioClipStore', () => ({
  deleteClip: jest.fn().mockResolvedValue(undefined),
  getClipBlob: jest.fn().mockResolvedValue(new Blob(['audio'])),
}));
jest.mock('@/utils/transcription', () => {
  const actual = jest.requireActual('@/utils/transcription');
  return {
    ...actual,
    estimateTranscriptionUsd: () => 0.003,
    getTranscriptionEngine: () => (aiState.connected ? { id: 'byok-openai', transcribe } : null),
  };
});
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

const controls = (over: Partial<DictationControls> = {}): DictationControls => ({
  isSupported: true,
  available: true,
  permission: 'granted',
  isRecording: false,
  clipCount: 0,
  needsIntro: false,
  lastClip: null,
  acknowledgeIntro: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  ...over,
});

const clip = {
  id: 'clip-1',
  gameId: 'g1',
  time: 3000,
  period: 2,
  createdAt: '2026-09-05T18:00:00.000Z',
  durationMs: 42_000,
  mimeType: 'audio/webm',
  sizeBytes: 1024,
};

const renderPanel = (over: { dictation?: Partial<DictationControls>; onSaveSummary?: jest.Mock } = {}) => {
  const onSaveSummary = over.onSaveSummary ?? jest.fn(() => true);
  const onInsertIntoReport = jest.fn();
  const dictation = controls(over.dictation);
  const view = render(
    <SpokenReportPanel
      dictation={dictation}
      vocabulary={['Emma', 'Matti']}
      stamp={{ time: 3000, period: 2 }}
      onSaveSummary={onSaveSummary as unknown as SpokenReportPanelSave}
      onInsertIntoReport={onInsertIntoReport}
    />,
  );
  return { ...view, dictation, onSaveSummary, onInsertIntoReport };
};

type SpokenReportPanelSave = React.ComponentProps<typeof SpokenReportPanel>['onSaveSummary'];

/** Record, then hand back the stored clip the way the hook does. */
const recordAndFinish = async (view: ReturnType<typeof renderPanel>) => {
  fireEvent.click(screen.getByTestId('spoken-report-toggle'));
  expect(view.dictation.start).toHaveBeenCalled();
  await act(async () => {
    view.rerender(
      <SpokenReportPanel
        dictation={{ ...view.dictation, lastClip: clip }}
        vocabulary={['Emma', 'Matti']}
        stamp={{ time: 3000, period: 2 }}
        onSaveSummary={view.onSaveSummary as unknown as SpokenReportPanelSave}
        onInsertIntoReport={view.onInsertIntoReport}
      />,
    );
  });
  await waitFor(() => expect(screen.getByTestId('spoken-report-result')).toBeInTheDocument());
};

beforeEach(() => {
  jest.clearAllMocks();
  aiState.connected = true;
  transcribe.mockResolvedValue('Tasainen ottelu, hyvä prässi toisella puoliajalla.');
  (getClipBlob as jest.Mock).mockResolvedValue(new Blob(['audio']));
  (deleteClip as jest.Mock).mockResolvedValue(undefined);
});

describe('SpokenReportPanel - recording', () => {
  it('offers nothing on a device or game that cannot record', () => {
    const { container } = renderPanel({ dictation: { isSupported: false } });
    expect(container).toBeEmptyDOMElement();

    const scratch = renderPanel({ dictation: { available: false } });
    expect(scratch.container).toBeEmptyDOMElement();
  });

  it('explains the denied microphone instead of offering a dead button', () => {
    renderPanel({ dictation: { permission: 'denied' } });

    expect(screen.getByTestId('spoken-report-denied')).toBeInTheDocument();
    expect(screen.queryByTestId('spoken-report-toggle')).not.toBeInTheDocument();
  });

  it('is a tap to start and a tap to stop, not a press and hold', () => {
    const view = renderPanel({ dictation: { isRecording: true } });

    fireEvent.click(screen.getByTestId('spoken-report-toggle'));
    expect(view.dictation.stop).toHaveBeenCalledTimes(1);
    expect(view.dictation.start).not.toHaveBeenCalled();
  });

  /** @critical - the in-match mic writes to the same store; its clips are not ours. */
  it('ignores a clip it did not start itself', async () => {
    renderPanel({ dictation: { lastClip: clip } });

    await act(async () => {});

    expect(transcribe).not.toHaveBeenCalled();
    expect(screen.queryByTestId('spoken-report-result')).not.toBeInTheDocument();
  });

  it('says what it is for differently when no provider is connected', () => {
    aiState.connected = false;
    renderPanel();

    expect(screen.getByText(/stays as a recording in your voice notes/i)).toBeInTheDocument();
  });
});

describe('SpokenReportPanel - the transcript', () => {
  it('transcribes its own clip with the roster as vocabulary and shows editable text', async () => {
    const view = renderPanel();
    await recordAndFinish(view);

    expect(transcribe).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ language: 'fi', vocabulary: ['Emma', 'Matti'] }));
    expect((screen.getByTestId('spoken-report-text') as HTMLTextAreaElement).value).toBe(
      'Tasainen ottelu, hyvä prässi toisella puoliajalla.',
    );
  });

  /** @critical - kept as the coach's own account, and the audio then goes. */
  it('saves an edited transcript as a debrief note and deletes the recording', async () => {
    const view = renderPanel();
    await recordAndFinish(view);

    fireEvent.change(screen.getByTestId('spoken-report-text'), { target: { value: 'Korjattu teksti.' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('spoken-report-save'));
    });

    expect(view.onSaveSummary).toHaveBeenCalledWith({
      time: 3000,
      period: 2,
      text: 'Korjattu teksti.',
      tag: 'debrief',
    });
    expect(deleteClip).toHaveBeenCalledWith('clip-1', 'u1');
    expect(screen.queryByTestId('spoken-report-result')).not.toBeInTheDocument();
  });

  /** @critical - a refused save must not destroy the only copy of the words. */
  it('keeps the text and the recording when the save is refused', async () => {
    const view = renderPanel({ onSaveSummary: jest.fn(() => false) });
    await recordAndFinish(view);

    await act(async () => {
      fireEvent.click(screen.getByTestId('spoken-report-save'));
    });

    expect(deleteClip).not.toHaveBeenCalled();
    expect(screen.getByTestId('spoken-report-result')).toBeInTheDocument();
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/could not save/i), 'error');
  });

  it('can put the words straight into the report instead', async () => {
    const view = renderPanel();
    await recordAndFinish(view);

    await act(async () => {
      fireEvent.click(screen.getByTestId('spoken-report-insert'));
    });

    expect(view.onInsertIntoReport).toHaveBeenCalledWith('Tasainen ottelu, hyvä prässi toisella puoliajalla.');
    expect(view.onSaveSummary).not.toHaveBeenCalled();
    expect(deleteClip).toHaveBeenCalledWith('clip-1', 'u1');
  });

  it('throws the recording away when asked, storing nothing', async () => {
    const view = renderPanel();
    await recordAndFinish(view);

    await act(async () => {
      fireEvent.click(screen.getByTestId('spoken-report-discard'));
    });

    expect(view.onSaveSummary).not.toHaveBeenCalled();
    expect(view.onInsertIntoReport).not.toHaveBeenCalled();
    expect(deleteClip).toHaveBeenCalledWith('clip-1', 'u1');
  });

  it('leaves the recording in the voice notes when transcription fails', async () => {
    const { TranscriptionError } = jest.requireActual('@/utils/transcription');
    transcribe.mockRejectedValueOnce(new TranscriptionError('network'));
    const view = renderPanel();

    fireEvent.click(screen.getByTestId('spoken-report-toggle'));
    await act(async () => {
      view.rerender(
        <SpokenReportPanel
          dictation={{ ...view.dictation, lastClip: clip }}
          vocabulary={[]}
          stamp={{ time: 3000, period: 2 }}
          onSaveSummary={view.onSaveSummary as unknown as SpokenReportPanelSave}
          onInsertIntoReport={view.onInsertIntoReport}
        />,
      );
    });

    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/voice notes/i), 'error');
    expect(deleteClip).not.toHaveBeenCalled();
  });
});
