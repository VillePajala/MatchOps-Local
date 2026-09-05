/**
 * @critical - this card sends observations about ONE child from SEVERAL
 * matches in a single request, which is more than any other request carries.
 * These tests pin the three things that makes acceptable: the coach is told
 * the scope first, names still leave as codes, and nothing comes back that can
 * be written to the record.
 */
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import PlayerNotesSummaryCard from '../PlayerNotesSummaryCard';
import type { Player } from '@/types';

// Resolves _one/_other the way i18next does; the scope line is pluralised.
const EN: Record<string, string> = {
  'playerNotesSummary.scope_one':
    'Sends {{notes}} of your notes about this player, from {{count}} match, to your AI provider. Nothing is saved or changed.',
  'playerNotesSummary.scope_other':
    'Sends {{notes}} of your notes about this player, from {{count}} matches, to your AI provider. Nothing is saved or changed.',
  'playerNotesSummary.omitted_one': 'The oldest note is left out of this request.',
  'playerNotesSummary.omitted_other': 'The {{count}} oldest notes are left out of this request.',
};

const showToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({ useToast: () => ({ showToast }) }));

const aiState = { connected: true, pseudonymize: true };
jest.mock('@/utils/aiProvider', () => ({
  ...jest.requireActual('@/utils/aiProvider'),
  useAiProviderState: () => aiState,
}));

const groupPlayerNotes = jest.fn();
jest.mock('@/utils/aiDrafting', () => {
  const actual = jest.requireActual('@/utils/aiDrafting');
  return { ...actual, groupPlayerNotes: (...a: unknown[]) => groupPlayerNotes(...a) };
});

jest.mock('@/utils/aiUsage', () => ({ recordAiUsage: jest.fn() }));
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), info: jest.fn() },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, options?: Record<string, unknown>) => {
      const count = options?.count;
      const plural = typeof count === 'number' ? `${key}_${count === 1 ? 'one' : 'other'}` : key;
      const template = EN[plural] ?? fallback ?? key;
      return template.replace(/\{\{(\w+)\}\}/g, (_m, n) => String(options?.[n] ?? ''));
    },
  }),
}));

const emma = { id: 'p1', name: 'Emma Virtanen', nickname: 'Emma' } as Player;
const matti = { id: 'p2', name: 'Matti Korhonen', nickname: 'Matti' } as Player;
const roster = [emma, matti];

const notes = [
  { id: 'n3', gameId: 'g2', gameDate: '2026-09-01', text: 'Emma otti vastuuta.' },
  { id: 'n2', gameId: 'g1', gameDate: '2026-08-20', text: 'Hyvä syöttö Matille.' },
  { id: 'n1', gameId: 'g1', gameDate: '2026-08-20', text: 'Emma rohkeni yrittää.' },
];

const renderCard = (over: Record<string, unknown> = {}) =>
  render(
    <PlayerNotesSummaryCard player={emma} notes={notes} roster={roster} language="fi" {...over} />,
  );

describe('PlayerNotesSummaryCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    aiState.connected = true;
    aiState.pseudonymize = true;
    groupPlayerNotes.mockResolvedValue({
      text: 'P1 otti vastuuta ja rohkeni yrittää.',
      model: 'gpt-5-mini',
      estimatedUsd: 0.002,
      noteCount: 3,
    });
  });

  /** @critical - a coach must choose this, not discover it afterwards. */
  it('says how many notes and how many matches will be sent, before sending', () => {
    renderCard();
    expect(screen.getByTestId('player-notes-summary-scope')).toHaveTextContent(
      'Sends 3 of your notes about this player, from 2 matches',
    );
    expect(groupPlayerNotes).not.toHaveBeenCalled();
  });

  it('offers nothing when there is barely anything to group', () => {
    const { container } = renderCard({ notes: notes.slice(0, 1) });
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * @critical - with no roster there are no handles, so redaction returns every
   * name untouched while the card still says codes are sent. Refusing is the
   * only honest option.
   */
  it('offers nothing at all when it could not redact the names', () => {
    const { container } = renderCard({ roster: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it('still offers itself when the coach has turned pseudonymization off', () => {
    aiState.pseudonymize = false;
    renderCard({ roster: [] });
    expect(screen.getByTestId('player-notes-summary')).toBeInTheDocument();
  });

  it('counts two matches on the same day as two', () => {
    renderCard({
      notes: [
        { id: 'a', gameId: 'g1', gameDate: '2026-08-20', text: 'Yksi.' },
        { id: 'b', gameId: 'g2', gameDate: '2026-08-20', text: 'Kaksi.' },
      ],
    });
    expect(screen.getByTestId('player-notes-summary-scope')).toHaveTextContent('from 2 matches');
  });

  /**
   * @critical - the disclosure is the safeguard. Counting notes but not their
   * length meant a coach could read an accurate-looking scope, press the
   * button, and only then be told the request was too big.
   */
  it('leaves out what will not fit, and says so before sending', () => {
    const long = Array.from({ length: 12 }, (_, i) => ({
      id: `L${i}`,
      gameId: `g${i}`,
      gameDate: `2026-08-${String(i + 1).padStart(2, '0')}`,
      text: 'x'.repeat(1_000),
    }));
    renderCard({ notes: long });

    // 8000 chars of budget, ~1004 a note: seven fit.
    expect(screen.getByTestId('player-notes-summary-scope')).toHaveTextContent('Sends 7 of your notes');
    expect(screen.getByTestId('player-notes-summary-omitted')).toHaveTextContent('5 oldest notes');
  });

  it('offers nothing when no provider is connected', () => {
    aiState.connected = false;
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  /** @critical - every child named in a note, not only the subject. */
  it('sends codes for this player and for anyone else named in a note', async () => {
    renderCard();
    await act(async () => {
      fireEvent.click(screen.getByTestId('player-notes-summary-start'));
    });
    await waitFor(() => expect(groupPlayerNotes).toHaveBeenCalled());

    const sent = (groupPlayerNotes.mock.calls[0][0] as { notes: string[] }).notes;
    expect(sent.join(' ')).not.toMatch(/Emma|Matti/);
    expect(sent.join(' ')).toMatch(/P1/);
    expect(sent.join(' ')).toMatch(/P2/);
  });

  /** An account of a development read backwards says the opposite. */
  it('sends the notes oldest first', async () => {
    renderCard();
    await act(async () => {
      fireEvent.click(screen.getByTestId('player-notes-summary-start'));
    });
    await waitFor(() => expect(groupPlayerNotes).toHaveBeenCalled());
    const sent = (groupPlayerNotes.mock.calls[0][0] as { notes: string[] }).notes;
    expect(sent[0]).toMatch(/rohkeni/);
    expect(sent[sent.length - 1]).toMatch(/vastuuta/);
  });

  it('shows the coach the names again, resolved on this device', async () => {
    renderCard();
    await act(async () => {
      fireEvent.click(screen.getByTestId('player-notes-summary-start'));
    });
    await waitFor(() => expect(screen.getByTestId('player-notes-summary-output')).toBeInTheDocument());
    expect(screen.getByTestId('player-notes-summary-output')).toHaveTextContent(
      'Emma otti vastuuta ja rohkeni yrittää.',
    );
  });

  it('explains a failure instead of showing an empty box', async () => {
    const { DraftingError } = jest.requireActual('@/utils/aiDrafting');
    groupPlayerNotes.mockRejectedValueOnce(new DraftingError('rateLimited'));
    renderCard();
    await act(async () => {
      fireEvent.click(screen.getByTestId('player-notes-summary-start'));
    });
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error'));
    expect(screen.queryByTestId('player-notes-summary-output')).not.toBeInTheDocument();
  });

  /**
   * @critical - the same guarantee the translation panel makes. If an apply
   * path ever appears here, this fails.
   */
  it('offers no way to write the summary into the record', async () => {
    renderCard();
    await act(async () => {
      fireEvent.click(screen.getByTestId('player-notes-summary-start'));
    });
    await waitFor(() => expect(screen.getByTestId('player-notes-summary-output')).toBeInTheDocument());

    const card = screen.getByTestId('player-notes-summary');
    for (const id of ['player-notes-summary-apply', 'player-notes-summary-save']) {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    }
    expect(card.querySelector('textarea')).toBeNull();
    expect(card.querySelector('input')).toBeNull();
    expect(screen.getByTestId('player-notes-summary-copy')).toBeInTheDocument();
  });
});
