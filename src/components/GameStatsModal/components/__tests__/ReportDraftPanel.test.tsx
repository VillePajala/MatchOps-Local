/**
 * Kirjuri report-draft review screen (Phase 3, PR 9b).
 *
 * @critical - the only screen that turns generated text into the coach's own
 * record, and the only one that spends their money. The tests that matter are
 * the ones about consent: nothing is requested without a tap, nothing is stored
 * without a tick, and every warning appears BEFORE applying rather than after.
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import ReportDraftPanel from '../ReportDraftPanel';
import type { ReportDraft } from '@/utils/aiDrafting';
import type { AppState } from '@/types/game';
import type { Player } from '@/types';

const showToast = jest.fn();
const draftMatchReport = jest.fn();
const aiState = { connected: true, pseudonymize: true };

jest.mock('@/contexts/ToastProvider', () => ({ useToast: () => ({ showToast }) }));
jest.mock('@/utils/aiProvider', () => ({
  useAiProviderState: () => aiState,
  AI_PROVIDERS: { openai: { label: 'OpenAI', host: 'https://api.openai.com', keysUrl: '' } },
  getAiProviderKey: () => 'sk-test',
  getAiProviderState: () => aiState,
}));
jest.mock('@/utils/aiDrafting', () => {
  const actual = jest.requireActual('@/utils/aiDrafting');
  return { ...actual, draftMatchReport: (...args: unknown[]) => draftMatchReport(...args) };
});
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string, options?: Record<string, unknown>) =>
      (fallback ?? _key).replace(/\{\{(\w+)\}\}/g, (_m, name) => String(options?.[name] ?? '')),
  }),
}));

const players: Player[] = [
  { id: 'p1', name: 'Emma Virtanen', nickname: 'Emma' } as Player,
  { id: 'p2', name: 'Matti Korhonen', nickname: 'Matti' } as Player,
];

const game = (over: Partial<AppState> = {}): AppState =>
  ({
    teamName: 'FC Testi',
    opponentName: 'HJK',
    gameDate: '2026-09-05',
    homeScore: 2,
    awayScore: 1,
    homeOrAway: 'home',
    numberOfPeriods: 2,
    periodDurationMinutes: 25,
    gameNotes: '',
    selectedPlayerIds: ['p1', 'p2'],
    gameEvents: [],
    ...over,
  }) as unknown as AppState;

const draft: ReportDraft = {
  sections: [
    { section: 'overview', text: 'Tasainen ottelu.' },
    { section: 'next', text: 'Harjoitellaan syöttöä.' },
  ],
  playerNotes: [
    { ref: 'P1', text: 'Rohkea eteenpäin.' },
    { ref: 'P2', text: 'Hyvä puolustustyö.' },
  ],
  dataCaveat: 'Havaintoja vain kahdesta pelaajasta.',
  model: 'gpt-5-mini',
  packetFingerprint: 'v1-abcdef0123456789',
};

type ApplyFn = React.ComponentProps<typeof ReportDraftPanel>['onApply'];

const renderPanel = (
  props: Partial<Omit<React.ComponentProps<typeof ReportDraftPanel>, 'onApply'>> & { onApply?: jest.Mock } = {},
) => {
  const onApply: jest.Mock = props.onApply ?? jest.fn(() => true);
  const result = render(
    <ReportDraftPanel
      game={props.game ?? game()}
      players={props.players ?? players}
      stamp={props.stamp ?? { time: 3000, period: 2 }}
      onApply={onApply as unknown as ApplyFn}
    />,
  );
  return { ...result, onApply };
};

const produceDraft = async () => {
  await act(async () => {
    fireEvent.click(screen.getByTestId('report-draft-start'));
  });
  await waitFor(() => expect(screen.getByTestId('report-draft-review')).toBeInTheDocument());
};

beforeEach(() => {
  jest.clearAllMocks();
  aiState.connected = true;
  aiState.pseudonymize = true;
  draftMatchReport.mockResolvedValue(draft);
});

describe('ReportDraftPanel - before any request', () => {
  it('explains itself and offers nothing to press when no provider is connected', () => {
    aiState.connected = false;
    renderPanel();

    expect(screen.getByTestId('report-draft-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('report-draft-start')).not.toBeInTheDocument();
  });

  /** @critical - money is only ever spent on a deliberate tap. */
  it('shows the cost first and requests nothing until the coach presses Draft', () => {
    renderPanel();

    expect(screen.getByText(/Roughly \$0\.\d\d on your account/)).toBeInTheDocument();
    expect(draftMatchReport).not.toHaveBeenCalled();
  });

  it('reports a failure in the coach\'s terms and keeps the button available', async () => {
    const { DraftingError } = jest.requireActual('@/utils/aiDrafting');
    draftMatchReport.mockRejectedValueOnce(new DraftingError('rateLimited'));
    renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByTestId('report-draft-start'));
    });

    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/rate limiting/i), 'error');
    expect(screen.getByTestId('report-draft-start')).toBeInTheDocument();
  });
});

describe('ReportDraftPanel - reviewing a draft', () => {
  it('starts with everything ticked and shows the model\'s own caveat', async () => {
    renderPanel();
    await produceDraft();

    expect((screen.getByTestId('report-draft-section-overview') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('report-draft-note-0') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId('report-draft-caveat')).toHaveTextContent('Havaintoja vain kahdesta');
  });

  /** @critical - only what the coach ticked may be stored. */
  it('saves only the ticked items', async () => {
    const { onApply } = renderPanel();
    await produceDraft();

    fireEvent.click(screen.getByTestId('report-draft-section-next'));
    fireEvent.click(screen.getByTestId('report-draft-note-1'));
    fireEvent.click(screen.getByTestId('report-draft-apply'));

    expect(onApply).toHaveBeenCalledTimes(1);
    const payload = onApply.mock.calls[0][0];
    expect(payload.gameNotes).toContain('Tasainen ottelu.');
    expect(payload.gameNotes).not.toContain('Harjoitellaan');
    expect(payload.noteEvents).toHaveLength(1);
    expect(payload.noteEvents[0].entityId).toBe('p1');
    expect(payload.noteEvents[0].source).toBe('ai');
    expect(payload.aiMeta).toEqual({ model: 'gpt-5-mini', packet: 'v1-abcdef0123456789' });
  });

  it('cannot apply when the coach unticked everything', async () => {
    renderPanel();
    await produceDraft();

    fireEvent.click(screen.getByTestId('report-draft-section-overview'));
    fireEvent.click(screen.getByTestId('report-draft-section-next'));
    fireEvent.click(screen.getByTestId('report-draft-note-0'));
    fireEvent.click(screen.getByTestId('report-draft-note-1'));

    expect(screen.getByTestId('report-draft-apply')).toBeDisabled();
  });

  it('discards the draft without storing anything', async () => {
    const { onApply } = renderPanel();
    await produceDraft();

    fireEvent.click(screen.getByTestId('report-draft-discard'));

    expect(onApply).not.toHaveBeenCalled();
    expect(screen.queryByTestId('report-draft-review')).not.toBeInTheDocument();
    expect(screen.getByTestId('report-draft-start')).toBeInTheDocument();
  });
});

describe('ReportDraftPanel - protecting text the coach already wrote', () => {
  /** @critical - append is the default, and it must not touch existing text. */
  it('defaults to keeping the existing report and appending below it', async () => {
    const existing = 'Omat sanani, joita ei saa hukata.';
    const { onApply } = renderPanel({ game: game({ gameNotes: existing }) });
    await produceDraft();

    expect((screen.getByTestId('report-draft-mode-append') as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByTestId('report-draft-replace-warning')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('report-draft-apply'));
    expect(onApply.mock.calls[0][0].gameNotes.startsWith(existing)).toBe(true);
  });

  /** @critical - replace is destructive, so it warns first and undoes after. */
  it('warns before replacing and offers undo afterwards', async () => {
    const existing = 'Vanha raporttini.';
    const { onApply } = renderPanel({ game: game({ gameNotes: existing }) });
    await produceDraft();

    fireEvent.click(screen.getByTestId('report-draft-mode-replace'));
    expect(screen.getByTestId('report-draft-replace-warning')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('report-draft-apply'));
    expect(onApply.mock.calls[0][0].gameNotes).not.toContain('Vanha');

    fireEvent.click(screen.getByTestId('report-draft-undo'));
    expect(onApply).toHaveBeenLastCalledWith({ gameNotes: existing, aiMeta: undefined, noteEvents: [] });
  });

  it('keeps the draft on screen when storing failed', async () => {
    const onApply = jest.fn(() => false);
    renderPanel({ onApply });
    await produceDraft();

    fireEvent.click(screen.getByTestId('report-draft-apply'));

    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/could not save/i), 'error');
    expect(screen.getByTestId('report-draft-review')).toBeInTheDocument();
  });

  /** @critical - the panel must append to the text as it is now, not as it
   *  was last saved, or a just-typed line would be overwritten. */
  it('appends to the report text it was handed, including an unsaved edit', () => {
    const justTyped = 'Rivi jonka kirjoitin juuri nyt.';
    const { onApply } = renderPanel({ game: game({ gameNotes: justTyped }) });
    return (async () => {
      await produceDraft();
      fireEvent.click(screen.getByTestId('report-draft-apply'));
      expect(onApply.mock.calls[0][0].gameNotes).toContain(justTyped);
    })();
  });

  /** @critical - a warning after the text was cut is no warning at all. */
  it('warns that the report would be cut before the coach applies it', async () => {
    renderPanel({ game: game({ gameNotes: 'x'.repeat(3995) }) });
    await produceDraft();

    expect(screen.getByTestId('report-draft-truncation-warning')).toBeInTheDocument();
  });
});
