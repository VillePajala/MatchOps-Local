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
    // Interpolates like the real one: a mock that ignores options would let an
    // assertion about a rendered number pass against a raw placeholder.
    t: (_key: string, fallback?: string, options?: Record<string, unknown>) =>
      (fallback ?? _key).replace(/\{\{(\w+)\}\}/g, (_m, name) => String(options?.[name] ?? '')),
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
  // Mirrors the real contract: true means the text is stored, and only then
  // may the recording be deleted. A mock returning undefined would let the
  // panel pass a test the app itself would fail.
  const onInsertIntoReport = jest.fn(() => true);
  const onShowNotes = jest.fn();
  const dictation = controls(over.dictation);
  const view = render(
    <SpokenReportPanel
      dictation={dictation}
      vocabulary={['Emma', 'Matti']}
      stamp={{ time: 3000, period: 2 }}
      language="fi"
      onSaveSummary={onSaveSummary as unknown as SpokenReportPanelSave}
      onInsertIntoReport={onInsertIntoReport}
      onShowNotes={onShowNotes}
    />,
  );
  return { ...view, dictation, onSaveSummary, onInsertIntoReport, onShowNotes };
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
      language="fi"
        onSaveSummary={view.onSaveSummary as unknown as SpokenReportPanelSave}
        onInsertIntoReport={view.onInsertIntoReport}
        onShowNotes={view.onShowNotes}
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

  /** @critical - writing out starts on stop, so the price must be visible first. */
  it('states the price before the coach records, and only when it applies', () => {
    const view = renderPanel();
    expect(screen.getByTestId('spoken-report-cost')).toHaveTextContent(/costs about \$0\.003 a minute/i);
    expect(screen.getByTestId('spoken-report-cost')).toHaveTextContent(/starts when you stop recording/i);

    // Unmount first: RTL queries reach the whole document, so a second render
    // would still find the first panel's node.
    view.unmount();
    aiState.connected = false;
    renderPanel();
    expect(screen.queryByTestId('spoken-report-cost')).not.toBeInTheDocument();
  });

  /** @critical - the owner's report: a recording that succeeded but appeared
   *  nowhere. Silence after a minute of speaking is the worst possible answer. */
  it('says where the recording went when there is nothing to write it out with', async () => {
    aiState.connected = false;
    const view = renderPanel();

    fireEvent.click(screen.getByTestId('spoken-report-toggle'));
    await act(async () => {
      view.rerender(
        <SpokenReportPanel
          dictation={{ ...view.dictation, lastClip: clip }}
          vocabulary={[]}
          stamp={{ time: 3000, period: 2 }}
      language="fi"
          onSaveSummary={view.onSaveSummary as unknown as SpokenReportPanelSave}
          onInsertIntoReport={view.onInsertIntoReport}
        onShowNotes={view.onShowNotes}
        />,
      );
    });

    expect(screen.getByTestId('spoken-report-stored-only')).toHaveTextContent(/waiting under Voice notes/i);
    expect(transcribe).not.toHaveBeenCalled();
    // The audio is kept: it is the only copy of what was said.
    expect(deleteClip).not.toHaveBeenCalled();
  });

  it('says the same when the transcription attempt fails', async () => {
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
      language="fi"
          onSaveSummary={view.onSaveSummary as unknown as SpokenReportPanelSave}
          onInsertIntoReport={view.onInsertIntoReport}
        onShowNotes={view.onShowNotes}
        />,
      );
    });

    expect(screen.getByTestId('spoken-report-stored-only')).toBeInTheDocument();
  });

  it('says what it is for differently when no provider is connected', () => {
    aiState.connected = false;
    renderPanel();

    expect(screen.getByText(/stays as a recording in your voice notes/i)).toBeInTheDocument();
  });
});

describe('SpokenReportPanel - recording a second time', () => {
  /**
   * @critical - the owner's report: record, it transcribes; record again and the
   * OLD text stays. Cause: stop() clears the recording flag immediately while
   * the new clip is written later, so the panel saw "not recording" with
   * lastClip still pointing at the previous clip - re-transcribing old audio
   * (old text back, billed twice) and never transcribing the new recording.
   */
  it('does not re-transcribe the previous clip in the gap before the new one is written', async () => {
    const view = renderPanel();
    await recordAndFinish(view);
    expect(transcribe).toHaveBeenCalledTimes(1);

    // Start again. The recorder is mid-flight; lastClip is still clip A.
    fireEvent.click(screen.getByTestId('spoken-report-toggle'));
    await act(async () => {
      view.rerender(
        <SpokenReportPanel
          dictation={{ ...view.dictation, lastClip: clip, isRecording: true }}
          vocabulary={[]}
          stamp={{ time: 3000, period: 2 }}
      language="fi"
          onSaveSummary={view.onSaveSummary as unknown as SpokenReportPanelSave}
          onInsertIntoReport={view.onInsertIntoReport}
        onShowNotes={view.onShowNotes}
        />,
      );
    });

    // stop() clears the flag straight away; clip B is not written yet.
    await act(async () => {
      view.rerender(
        <SpokenReportPanel
          dictation={{ ...view.dictation, lastClip: clip, isRecording: false }}
          vocabulary={[]}
          stamp={{ time: 3000, period: 2 }}
      language="fi"
          onSaveSummary={view.onSaveSummary as unknown as SpokenReportPanelSave}
          onInsertIntoReport={view.onInsertIntoReport}
        onShowNotes={view.onShowNotes}
        />,
      );
    });

    // The old clip must not be paid for a second time, and its text stays gone.
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('spoken-report-result')).not.toBeInTheDocument();

    // Now the new clip lands and IS transcribed.
    transcribe.mockResolvedValueOnce('Toinen yritys, parempi.');
    const second = { ...clip, id: 'clip-2' };
    await act(async () => {
      view.rerender(
        <SpokenReportPanel
          dictation={{ ...view.dictation, lastClip: second, isRecording: false }}
          vocabulary={[]}
          stamp={{ time: 3000, period: 2 }}
      language="fi"
          onSaveSummary={view.onSaveSummary as unknown as SpokenReportPanelSave}
          onInsertIntoReport={view.onInsertIntoReport}
        onShowNotes={view.onShowNotes}
        />,
      );
    });

    await waitFor(() => expect(screen.getByTestId('spoken-report-result')).toBeInTheDocument());
    expect(transcribe).toHaveBeenCalledTimes(2);
    expect((screen.getByTestId('spoken-report-text') as HTMLTextAreaElement).value).toBe('Toinen yritys, parempi.');
    // And the second clip is the one that gets kept or thrown away.
    await act(async () => {
      fireEvent.click(screen.getByTestId('spoken-report-discard'));
    });
    expect(deleteClip).toHaveBeenLastCalledWith('clip-2', 'u1');
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

  /** @critical - the owner recorded the report, chose the first option, and saw
   *  nothing: the primary action in the REPORT step did not touch the report. */
  it('offers the report as the primary action, and says where a note went', async () => {
    const view = renderPanel();
    await recordAndFinish(view);

    // Both buttons exist; the report one is the primary.
    const insert = screen.getByTestId('spoken-report-insert');
    const save = screen.getByTestId('spoken-report-save');
    expect(insert).toHaveTextContent(/match report/i);
    expect(insert.className).toContain('bg-indigo-600');
    expect(save).toHaveTextContent(/note for the AI/i);
    expect(save.className).toContain('bg-slate-700');

    await act(async () => {
      fireEvent.click(save);
    });

    // Not a toast the coach can miss: a line saying it is NOT report text.
    const where = screen.getByTestId('spoken-report-saved-note');
    expect(where).toHaveTextContent(/not as report text/i);
    expect(where).toHaveTextContent(/under Notes/i);
    fireEvent.click(screen.getByTestId('spoken-report-show-notes'));
    expect(view.onShowNotes).toHaveBeenCalledTimes(1);
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

  /**
   * @critical - the recording is the only copy of the coach's words. It used to
   * be deleted whether or not the report could take the text, so a refused
   * insert left neither.
   */
  it('keeps the recording when the report could not take the text', async () => {
    const view = renderPanel();
    view.onInsertIntoReport.mockReturnValueOnce(false);
    await recordAndFinish(view);

    await act(async () => {
      fireEvent.click(screen.getByTestId('spoken-report-insert'));
    });

    expect(deleteClip).not.toHaveBeenCalled();
    // And the words are still on screen to try again with.
    expect(screen.getByTestId('spoken-report-text')).toHaveTextContent('Tasainen ottelu');
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
      language="fi"
          onSaveSummary={view.onSaveSummary as unknown as SpokenReportPanelSave}
          onInsertIntoReport={view.onInsertIntoReport}
        onShowNotes={view.onShowNotes}
        />,
      );
    });

    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/voice notes/i), 'error');
    expect(deleteClip).not.toHaveBeenCalled();
  });
});
