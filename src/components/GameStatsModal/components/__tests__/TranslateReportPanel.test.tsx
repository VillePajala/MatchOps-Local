/**
 * @critical - this panel is the safest of the AI additions precisely because it
 * cannot write anything. These tests pin that: it is handed no setter, offers
 * no apply, and names still leave as codes.
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import TranslateReportPanel from '../TranslateReportPanel';
import type { Player } from '@/types';
import type { AppState } from '@/types/game';

const showToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({ useToast: () => ({ showToast }) }));

const aiState = { connected: true, pseudonymize: true, model: null as string | null };
jest.mock('@/utils/aiProvider', () => ({
  ...jest.requireActual('@/utils/aiProvider'),
  useAiProviderState: () => aiState,
}));

const translateReport = jest.fn();
jest.mock('@/utils/aiDrafting', () => {
  const actual = jest.requireActual('@/utils/aiDrafting');
  return { ...actual, translateReport: (...args: unknown[]) => translateReport(...args) };
});

jest.mock('@/utils/aiUsage', () => ({ recordAiUsage: jest.fn() }));
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

const players: Player[] = [
  { id: 'p1', name: 'Emma Virtanen', nickname: 'Emma' } as Player,
  { id: 'p2', name: 'Matti Korhonen', nickname: 'Matti' } as Player,
];

const game = (over: Partial<AppState> = {}): AppState =>
  ({
    teamName: 'Testi',
    opponentName: 'Vastus',
    gameDate: '2026-09-05',
    homeScore: 1,
    awayScore: 0,
    homeOrAway: 'home',
    numPeriods: 2,
    periodDurationMinutes: 30,
    selectedPlayerIds: ['p1', 'p2'],
    gameEvents: [],
    ...over,
  }) as unknown as AppState;

const renderPanel = (over: Record<string, unknown> = {}) =>
  render(
    <TranslateReportPanel
      report="Emma pelasi hienosti."
      game={game()}
      players={players}
      {...over}
    />,
  );

describe('TranslateReportPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    aiState.connected = true;
    aiState.pseudonymize = true;
    translateReport.mockResolvedValue({
      text: 'P1 played beautifully.',
      language: 'en',
      model: 'gpt-5-mini',
      estimatedUsd: 0.001,
    });
  });

  it('offers nothing when there is no report yet', () => {
    const { container } = renderPanel({ report: '   ' });
    expect(container).toBeEmptyDOMElement();
  });

  it('offers nothing when no provider is connected', () => {
    aiState.connected = false;
    const { container } = renderPanel();
    expect(container).toBeEmptyDOMElement();
  });

  /** @critical - the consent gate promises codes on every request. */
  it('sends codes, never the children names', async () => {
    renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByTestId('translate-start'));
    });
    await waitFor(() => expect(translateReport).toHaveBeenCalled());

    const sent = translateReport.mock.calls[0][0] as { text: string };
    expect(sent.text).toBe('P1 pelasi hienosti.');
    expect(sent.text).not.toContain('Emma');
  });

  it('shows the coach the names again, resolved on this device', async () => {
    renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByTestId('translate-start'));
    });
    await waitFor(() => expect(screen.getByTestId('translate-output')).toBeInTheDocument());
    expect(screen.getByTestId('translate-output')).toHaveTextContent('Emma played beautifully.');
  });

  it('sends the real names when the coach turned pseudonymization off', async () => {
    aiState.pseudonymize = false;
    renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByTestId('translate-start'));
    });
    await waitFor(() => expect(translateReport).toHaveBeenCalled());
    expect((translateReport.mock.calls[0][0] as { text: string }).text).toBe('Emma pelasi hienosti.');
  });

  it('translates into the language the coach picked', async () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('translate-language'), { target: { value: 'sv' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('translate-start'));
    });
    await waitFor(() => expect(translateReport).toHaveBeenCalled());
    expect((translateReport.mock.calls[0][0] as { language: string }).language).toBe('sv');
  });

  it('says something is happening while it waits', async () => {
    let settle: (v: unknown) => void = () => {};
    translateReport.mockReturnValueOnce(new Promise((resolve) => { settle = resolve; }));
    renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByTestId('translate-start'));
    });
    expect(screen.getByTestId('translate-working')).toBeInTheDocument();
    await act(async () => {
      settle({ text: 'ok', language: 'en', model: 'm', estimatedUsd: 0 });
    });
    expect(screen.queryByTestId('translate-working')).not.toBeInTheDocument();
  });

  it('explains a failure instead of showing an empty box', async () => {
    const { DraftingError } = jest.requireActual('@/utils/aiDrafting');
    translateReport.mockRejectedValueOnce(new DraftingError('rateLimited'));
    renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByTestId('translate-start'));
    });
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error'));
    expect(screen.queryByTestId('translate-output')).not.toBeInTheDocument();
  });

  /**
   * Copy is half of what this feature is for, and the test environment stubs no
   * clipboard - so without an explicit mock a naive test would silently take
   * the failure branch and pass anyway.
   */
  it('copies the translation, and says so', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByTestId('translate-start'));
    });
    await waitFor(() => expect(screen.getByTestId('translate-output')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId('translate-copy'));
    });

    // The resolved names, not the codes that went out.
    expect(writeText).toHaveBeenCalledWith('Emma played beautifully.');
    expect(showToast).toHaveBeenCalledWith('Copied.', 'success');
  });

  it('tells the coach to select the text when the clipboard refuses', async () => {
    const writeText = jest.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByTestId('translate-start'));
    });
    await waitFor(() => expect(screen.getByTestId('translate-output')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId('translate-copy'));
    });

    expect(showToast).toHaveBeenCalledWith('Could not copy. Select the text instead.', 'error');
    // The text stays on screen, which is the fallback the message promises.
    expect(screen.getByTestId('translate-output')).toBeInTheDocument();
  });

  it('lets the coach abandon a translation that is taking too long', async () => {
    let rejectIt: (e: unknown) => void = () => {};
    translateReport.mockReturnValueOnce(new Promise((_r, reject) => { rejectIt = reject; }));
    renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByTestId('translate-start'));
    });
    expect(screen.getByTestId('translate-working')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('translate-cancel'));
    });
    expect(screen.queryByTestId('translate-working')).not.toBeInTheDocument();

    // The abandoned request must not shout at the coach when it lands.
    await act(async () => {
      rejectIt(new Error('aborted'));
    });
    expect(showToast).not.toHaveBeenCalled();
  });

  /**
   * @critical - the whole safety argument for this feature is that it has no
   * way to touch the report. If an apply path ever appears here, this fails.
   */
  it('offers no way to save the translation over the report', async () => {
    renderPanel();
    await act(async () => {
      fireEvent.click(screen.getByTestId('translate-start'));
    });
    await waitFor(() => expect(screen.getByTestId('translate-output')).toBeInTheDocument());

    const card = screen.getByTestId('translate-report');
    for (const testId of ['translate-apply', 'translate-save', 'translate-replace']) {
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
    }
    // The output is text, not an editable field the coach could mistake for one.
    expect(card.querySelector('textarea')).toBeNull();
    expect(card.querySelector('input')).toBeNull();
    // Copy is the only thing offered alongside it.
    expect(screen.getByTestId('translate-copy')).toBeInTheDocument();
  });
});
