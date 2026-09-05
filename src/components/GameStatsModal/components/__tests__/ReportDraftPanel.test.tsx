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
jest.mock('@/utils/aiUsage', () => ({ recordAiUsage: jest.fn() }));
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
      gameId={props.gameId ?? 'g1'}
      players={props.players ?? players}
      stamp={props.stamp ?? { time: 3000, period: 2 }}
      language="fi"
      existingReport={props.existingReport ?? (props.game ?? game()).gameNotes ?? ''}
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

  /** The owner could not find the button; it is gone on purpose when no key is
   *  connected, so the card has to offer the way to fix that. */
  it('offers a route to settings when there is no provider to draft with', () => {
    aiState.connected = false;
    const onOpenSettings = jest.fn();
    render(
      <ReportDraftPanel
        game={game()}
        gameId="g1"
        players={players}
        stamp={{ time: 3000, period: 2 }}
        language="fi"
        existingReport=""
        onApply={jest.fn(() => true) as unknown as React.ComponentProps<typeof ReportDraftPanel>['onApply']}
        onOpenSettings={onOpenSettings}
      />,
    );

    fireEvent.click(screen.getByTestId('report-draft-open-settings'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
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

  /** @critical - a failure the provider already billed must reach the counter,
   *  or the running total under-reports what the coach actually spent. */
  it('counts a failed draft the provider had already charged for', async () => {
    const { DraftingError } = jest.requireActual('@/utils/aiDrafting');
    const { recordAiUsage } = jest.requireMock('@/utils/aiUsage') as { recordAiUsage: jest.Mock };
    draftMatchReport.mockRejectedValueOnce(new DraftingError('noOutput', 'spent its budget', 0.0083));
    renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByTestId('report-draft-start'));
    });

    expect(recordAiUsage).toHaveBeenCalledWith('drafting', 0.0083);
  });

  it('counts nothing for a failure that never reached the provider', async () => {
    const { DraftingError } = jest.requireActual('@/utils/aiDrafting');
    const { recordAiUsage } = jest.requireMock('@/utils/aiUsage') as { recordAiUsage: jest.Mock };
    draftMatchReport.mockRejectedValueOnce(new DraftingError('unauthorized'));
    renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByTestId('report-draft-start'));
    });

    expect(recordAiUsage).not.toHaveBeenCalled();
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

  /**
   * @critical - the owner's screenshot: the review list read "tekijana P5 ja
   * syottajana P3". The codes are resolved for display, and the fixtures used
   * to contain none, so a revert to bare {text} would have passed everything.
   */
  it('shows names in the review list, not the codes the provider saw', async () => {
    draftMatchReport.mockResolvedValueOnce({
      ...draft,
      sections: [{ section: 'overview', text: 'Tasoituksen teki P1, syottajana P2.' }],
      playerNotes: [{ ref: 'P1', text: 'P1 pelasi rohkeasti P2:n rinnalla.' }],
    });
    renderPanel();
    await produceDraft();

    const review = screen.getByTestId('report-draft-review');
    expect(review).toHaveTextContent('Tasoituksen teki Emma, syottajana Matti.');
    expect(review).toHaveTextContent('Emma pelasi rohkeasti Matin rinnalla.');
    expect(review.textContent).not.toMatch(/\bP[0-9?]\b/);
  });

  /** @critical - the owner: a wait with nothing moving reads as a dead button. */
  it('shows that something is happening while the provider is thinking', async () => {
    let settle: (d: unknown) => void = () => {};
    draftMatchReport.mockReturnValueOnce(new Promise((resolve) => { settle = resolve; }));
    renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByTestId('report-draft-start'));
    });

    const working = screen.getByTestId('report-draft-working');
    expect(working).toHaveTextContent(/takes a few seconds/i);
    // Announced, not just drawn.
    expect(working).toHaveAttribute('role', 'status');
    expect(screen.getByTestId('report-draft-cancel')).toBeInTheDocument();

    await act(async () => {
      settle(draft);
    });
    expect(screen.queryByTestId('report-draft-working')).not.toBeInTheDocument();
  });

  /**
   * @critical - every hand-off this panel offers (open the squad, open
   * assessments, open settings) closes the modal the panel lives in. The undo
   * for a Replace lived only in component state, so leaving the screen made the
   * overwrite permanent - and game notes have no version history.
   */
  it('still offers the undo after the panel has been closed and reopened', async () => {
    const onApply = jest.fn(() => true);
    const view = renderPanel({ game: game({ gameNotes: 'Omani.' }), existingReport: 'Omani.', onApply });
    await produceDraft();

    fireEvent.click(screen.getByTestId('report-draft-mode-replace'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('report-draft-apply'));
    });
    expect(screen.getByTestId('report-draft-undo')).toBeInTheDocument();

    // The coach taps a checklist row; the whole modal goes away.
    view.unmount();
    renderPanel({ game: game({ gameNotes: 'Luonnos.' }), existingReport: 'Luonnos.', onApply });

    await act(async () => {
      fireEvent.click(screen.getByTestId('report-draft-undo'));
    });
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ gameNotes: 'Omani.' }));
  });

  /**
   * @critical - the review caught this: discarding a draft used to clear the
   * undo for an ALREADY-APPLIED Replace. A coach who tried a second draft and
   * decided against it lost the safety net for the first one, silently, and
   * the overwritten report has no other copy.
   */
  it('keeps the undo for an applied replace when a later draft is discarded', async () => {
    const onApply = jest.fn(() => true);
    renderPanel({ game: game({ gameNotes: 'Omani.' }), existingReport: 'Omani.', onApply });
    await produceDraft();

    fireEvent.click(screen.getByTestId('report-draft-mode-replace'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('report-draft-apply'));
    });
    expect(screen.getByTestId('report-draft-undo')).toBeInTheDocument();

    // Second thoughts: draft again, then throw that draft away. The undo is
    // out of sight while a draft is under review, which is fine - what matters
    // is that it comes back rather than having been thrown away with the draft.
    await produceDraft();
    await act(async () => {
      fireEvent.click(screen.getByTestId('report-draft-discard'));
    });

    // The first Replace's original text is still recoverable.
    expect(screen.getByTestId('report-draft-undo')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId('report-draft-undo'));
    });
    expect(onApply).toHaveBeenLastCalledWith(expect.objectContaining({ gameNotes: 'Omani.' }));
  });

  it('offers no undo belonging to a different match', () => {
    renderPanel({ gameId: 'g-other' });
    expect(screen.queryByTestId('report-draft-undo')).not.toBeInTheDocument();
  });

  /** Tidying replaces by intent, so the coach is not left with both versions. */
  it('offers tidying only when there is something to tidy, and defaults it to replace', async () => {
    const empty = renderPanel();
    expect(screen.queryByTestId('report-draft-tidy')).not.toBeInTheDocument();
    empty.unmount();

    renderPanel({ game: game({ gameNotes: 'Omat muistiinpanoni.' }), existingReport: 'Omat muistiinpanoni.' });
    await act(async () => {
      fireEvent.click(screen.getByTestId('report-draft-tidy'));
    });
    await waitFor(() => expect(screen.getByTestId('report-draft-review')).toBeInTheDocument());

    expect(draftMatchReport).toHaveBeenCalledWith(expect.objectContaining({ mode: 'tidy' }));
    expect((screen.getByTestId('report-draft-mode-replace') as HTMLInputElement).checked).toBe(true);
    // Destructive by intent, so the warning and the undo still stand.
    expect(screen.getByTestId('report-draft-replace-warning')).toBeInTheDocument();
  });

  /**
   * @critical - the editor has no autosave, so the saved game and the text on
   * screen routinely differ. Drafting from the saved copy tidied a document the
   * coach was not looking at, then offered to replace what they had typed with
   * it. The packet must carry the on-screen text.
   */
  it('tidies the text on screen, not the last saved report', async () => {
    renderPanel({
      // Nothing saved yet: the coach has typed a first report and not pressed Save.
      game: game({ gameNotes: '' }),
      existingReport: 'Tanaan pelattiin hyvin, puolustus piti.',
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('report-draft-tidy'));
    });
    await waitFor(() => expect(screen.getByTestId('report-draft-review')).toBeInTheDocument());

    const sent = draftMatchReport.mock.calls.at(-1)?.[0] as { packet: { attested: { coachReport?: string } } };
    expect(sent.packet.attested.coachReport).toContain('puolustus piti');
  });

  it('sends the saved report when the panel has no newer text', async () => {
    renderPanel({ game: game({ gameNotes: 'Tallennettu raportti.' }) });

    await act(async () => {
      fireEvent.click(screen.getByTestId('report-draft-tidy'));
    });
    await waitFor(() => expect(screen.getByTestId('report-draft-review')).toBeInTheDocument());

    const sent = draftMatchReport.mock.calls.at(-1)?.[0] as { packet: { attested: { coachReport?: string } } };
    expect(sent.packet.attested.coachReport).toContain('Tallennettu raportti');
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

  /** The draft is written knowing the existing text, so it can restate it. Say
   *  that where the choice is made, not after the coach is reading it twice. */
  it('warns that keeping the text may duplicate it, and only when there is text', async () => {
    const view = renderPanel({ game: game({ gameNotes: 'Omat sanani.' }) });
    await produceDraft();

    expect(screen.getByTestId('report-draft-duplication-note')).toHaveTextContent(/same ground twice/i);

    // Replace is the way out, so the duplication note gives way to its warning.
    fireEvent.click(screen.getByTestId('report-draft-mode-replace'));
    expect(screen.queryByTestId('report-draft-duplication-note')).not.toBeInTheDocument();
    expect(screen.getByTestId('report-draft-replace-warning')).toBeInTheDocument();

    // Nothing to duplicate when the report is empty.
    view.unmount();
    const empty = renderPanel();
    await produceDraft();
    expect(empty.queryByTestId('report-draft-duplication-note')).not.toBeInTheDocument();
  });

  /**
   * @critical - the gap the branch review caught: a draft applied while the
   * report editor holds unsaved text must build on what is ON SCREEN. Reading
   * the saved value instead silently drops the coach's paragraph.
   */
  it('builds on the text the coach can see, not the last saved value', async () => {
    const typedButNotSaved = 'Rivi jonka kirjoitin enka viela tallentanut.';
    const { onApply } = renderPanel({
      game: game({ gameNotes: 'Vanha tallennettu teksti.' }),
      existingReport: typedButNotSaved,
    });
    await produceDraft();

    // The warning reflects the on-screen text too, not the saved one.
    expect(screen.getByTestId('report-draft-duplication-note')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('report-draft-apply'));

    const saved = onApply.mock.calls[0][0].gameNotes;
    expect(saved.startsWith(typedButNotSaved)).toBe(true);
    expect(saved).not.toContain('Vanha tallennettu teksti.');
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
