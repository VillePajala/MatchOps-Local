/**
 * The day report view: results, players, the coach's day text with the games'
 * own reports beside it, the AI draft (labs + own provider only), share/copy.
 */
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act, cleanup, waitFor, within } from '@testing-library/react';
import PlanDayReportModal from './PlanDayReportModal';
import type { AppState } from '@/types/game';
import type { Player } from '@/types';
import type { PlaytimePlan } from '@/utils/playtimePlanner/types';
import type { DayReportGameInput } from '@/utils/playtimePlanner/dayReport';
import { TestFixtures } from '../../tests/fixtures';

const interpolate = (template: string, options?: Record<string, unknown>): string =>
  options
    ? template.replace(/\{\{(\w+)\}\}/g, (_m, k) => (options[k] !== undefined ? String(options[k]) : `{{${k}}}`))
    : template;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValueOrOptions?: string | Record<string, unknown>, maybeOptions?: Record<string, unknown>) => {
      if (typeof defaultValueOrOptions === 'string') return interpolate(defaultValueOrOptions, maybeOptions);
      const dv = defaultValueOrOptions?.defaultValue;
      return typeof dv === 'string' ? interpolate(dv, defaultValueOrOptions) : _key;
    },
    i18n: { language: 'fi', changeLanguage: jest.fn() },
  }),
}));

const mockShowToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({ useToast: () => ({ showToast: mockShowToast }) }));

const mockAiState = { connected: false, pseudonymize: true };
jest.mock('@/utils/aiProvider', () => ({ useAiProviderState: () => mockAiState }));

const mockDraftDaySummary = jest.fn();
jest.mock('@/utils/aiDrafting', () => {
  const actual = jest.requireActual('@/utils/aiDrafting');
  return { ...actual, draftDaySummary: (...args: unknown[]) => mockDraftDaySummary(...args) };
});
jest.mock('@/utils/aiUsage', () => ({ recordAiUsage: jest.fn() }));

jest.mock('@/utils/logger', () => {
  const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(), log: jest.fn() };
  return { __esModule: true, default: mockLogger, createLogger: () => mockLogger };
});

const roster: Player[] = [
  { id: 'eeli', name: 'Eeli Esimerkki' } as Player,
  { id: 'onni', name: 'Onni Malli' } as Player,
];
const plan: PlaytimePlan = {
  id: 'plan',
  name: 'Joulufutis 12.12.',
  version: 1,
  createdAt: '',
  updatedAt: '',
  players: [{ id: 'eeli', name: 'Eeli Esimerkki' }, { id: 'onni', name: 'Onni Malli' }],
  games: [],
};

const game = (over: Partial<AppState>): AppState =>
  TestFixtures.games.completed({
    teamName: 'Kotkat P11',
    gameLocation: 'Hakalan halli',
    homeOrAway: 'home',
    availablePlayers: roster,
    playersOnField: [],
    selectedPlayerIds: ['eeli', 'onni'],
    gameEvents: [],
    shootoutKicks: undefined,
    ...over,
  });

const inputs: DayReportGameInput[] = [
  {
    planGameId: 'a',
    gameId: 'g1',
    game: game({
      opponentName: 'Kallion Kiri',
      homeScore: 2,
      awayScore: 1,
      playerPositions: { eeli: ['gk'], onni: ['st'] },
      gameEvents: [{ id: 'e', type: 'goal', time: 5, scorerId: 'onni', assisterId: 'eeli' }],
      gameNotes: 'Hyvä avaus, pallo kiersi.',
    }),
  },
  {
    planGameId: 'b',
    gameId: 'g2',
    game: game({
      opponentName: 'Harjun Haukat',
      homeScore: 1,
      awayScore: 1,
      selectedPlayerIds: ['eeli'],
      playerPositions: { eeli: ['lb'] },
      gameNotes: '',
    }),
  },
];

const renderModal = (over: Partial<React.ComponentProps<typeof PlanDayReportModal>> = {}) => {
  const props = {
    subject: plan,
    savedText: plan.dayReport,
    inputs,
    roster,
    onSave: jest.fn(),
    onClose: jest.fn(),
    ...over,
  };
  render(<PlanDayReportModal {...props} />);
  return props;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAiState.connected = false;
  mockAiState.pseudonymize = true;
});
afterEach(() => cleanup());

const openEditor = async () => {
  await act(async () => {
    fireEvent.click(screen.getByTestId('day-report-open-editor'));
  });
};

describe('PlanDayReportModal', () => {
  /** @critical the day at a glance */
  it('shows the record, a row per game and the players table', () => {
    renderModal();
    expect(screen.getByTestId('day-report-name')).toHaveTextContent('Joulufutis 12.12.');
    expect(screen.getByTestId('day-report-subtitle')).toHaveTextContent('Kotkat P11 · Hakalan halli · 2 games · 1W 1D 0L');
    expect(screen.getByTestId('day-report-game-1')).toHaveTextContent('Kallion Kiri');
    expect(screen.getByTestId('day-report-game-1')).toHaveTextContent('2–1');
    expect(screen.getByTestId('day-report-game-2')).toHaveTextContent('1–1');
    const rows = within(screen.getByTestId('day-report-players')).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('EeliGKLB0+1');
    expect(rows[2]).toHaveTextContent('OnniST–1+0');
  });

  /** @critical the coach writes the day text with each game's own report in view */
  it('shows the games\' own reports read-only while writing, and saves the text only on Save', async () => {
    const props = renderModal();
    expect(screen.queryByTestId('day-report-game-reports')).not.toBeInTheDocument();
    await openEditor();
    const reports = screen.getByTestId('day-report-game-reports');
    expect(within(reports).getByTestId('day-report-game-report-1')).toHaveTextContent('Hyvä avaus, pallo kiersi.');
    expect(within(reports).getByTestId('day-report-game-report-2')).toHaveTextContent(
      'No match report written for this game.',
    );
    // Read only: no field in the games' reports.
    expect(within(reports).queryByRole('textbox')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('day-report-template'));
    });
    const text = screen.getByTestId('day-report-text') as HTMLTextAreaElement;
    // The day-report headings: the match template without "how the game unfolded".
    expect(text.value).toBe(
      'Overview:\n\nWhat went well:\n\nWhat to improve:\n\nTeam spirit and attitude:\n\nSpecial mentions:\n\nNext step:\n',
    );
    expect(props.onSave).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.change(text, { target: { value: 'Hyvä päivä.' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('day-report-save'));
    });
    expect(props.onSave).toHaveBeenCalledWith('Hyvä päivä.');
  });

  it('asks before closing with unsaved text', async () => {
    const props = renderModal();
    await openEditor();
    await act(async () => {
      fireEvent.change(screen.getByTestId('day-report-text'), { target: { value: 'Kesken' } });
    });
    // The editor focuses its field on open; let that land first.
    const field = screen.getByTestId('day-report-text');
    await waitFor(() => expect(document.activeElement).toBe(field));
    // A focused field is dismissed by the first Escape; the next one asks.
    await act(async () => {
      (screen.getByTestId('day-report-text') as HTMLTextAreaElement).focus();
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.getByText('Discard changes?')).toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    });
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  describe('AI draft', () => {
    it('is hidden without labs + a connected provider', async () => {
      renderModal();
      await openEditor();
      expect(screen.queryByTestId('day-report-ai-draft')).not.toBeInTheDocument();
    });

    /** @critical a draft lands in the editor and is never saved without the coach */
    it('is shown with both, inserts the draft with names put back, and does not save', async () => {
      mockAiState.connected = true;
      mockDraftDaySummary.mockResolvedValue({
        sections: [{ section: 'overview', text: 'X2 teki maalin, X1 syötti.' }],
        model: 'm',
      });
      const props = renderModal();
      await openEditor();
      expect(screen.getByTestId('day-report-ai')).toHaveTextContent('Player names are replaced with codes');
      await act(async () => {
        fireEvent.click(screen.getByTestId('day-report-ai-draft'));
      });
      await waitFor(() =>
        expect((screen.getByTestId('day-report-text') as HTMLTextAreaElement).value).toBe(
          'Overview:\nOnni Malli teki maalin, Eeli Esimerkki syötti.',
        ),
      );
      // The request carried codes, not names.
      const sent = JSON.stringify(mockDraftDaySummary.mock.calls[0][0].packet);
      expect(sent).not.toMatch(/Eeli|Onni/);
      expect(props.onSave).not.toHaveBeenCalled();
    });
  });

  describe('share', () => {
    it('shares and copies the day text', async () => {
      const writeText = jest.fn(async () => undefined);
      const share = jest.fn(async () => undefined);
      Object.assign(navigator, { clipboard: { writeText }, share });
      renderModal({ savedText: 'Hyvä päivä.' });
      await act(async () => {
        fireEvent.click(screen.getByTestId('day-report-share'));
      });
      const box = screen.getByRole('textbox', { name: 'Share day report' }) as HTMLTextAreaElement;
      expect(box.value).toBe(
        [
          '⚽ Kotkat P11 · Joulufutis 12.12. (Hakalan halli)',
          '1W 1D 0L',
          '',
          '✅ Kallion Kiri 2–1',
          '➖ Harjun Haukat 1–1',
          '',
          'Players (position in game 1/2 · goals+assists):',
          'Eeli: GK / LB · 0+1',
          'Onni: ST / – · 1+0',
          '',
          'Hyvä päivä.',
        ].join('\n'),
      );
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
      });
      expect(writeText).toHaveBeenCalledWith(box.value);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Share' }));
      });
      expect(share).toHaveBeenCalledWith({ text: box.value });
    });
  });

  /** Competition reports: the text is saved on the league / tournament (migration 068). */
  describe('league report (Sarjaraportti)', () => {
    const seasonInputs: DayReportGameInput[] = inputs.map((i, n) => ({
      ...i,
      game: { ...i.game, gameDate: `2026-09-2${n}` },
    }));

    /** @critical the league text is saved only on Save, and shared in the day-report style */
    it('shows totals, saves the text only on Save and shares it', async () => {
      const writeText = jest.fn(async () => undefined);
      Object.assign(navigator, { clipboard: { writeText }, share: undefined });
      // A host that keeps what was saved, as SeasonTournamentManagementModal does.
      const onSave = jest.fn();
      const Host = () => {
        const [saved, setSaved] = React.useState<string | undefined>(undefined);
        return (
          <PlanDayReportModal
            kind="season"
            subject={{ name: 'Harrastesarja', players: [] }}
            savedText={saved}
            inputs={seasonInputs}
            roster={roster}
            onSave={(text) => {
              onSave(text);
              setSaved(text || undefined);
            }}
            onClose={jest.fn()}
          />
        );
      };
      render(<Host />);
      const props = { onSave };
      expect(screen.getByText('League report')).toBeInTheDocument();
      expect(screen.getByTestId('series-report-players')).toHaveTextContent('GK ×1');
      expect(screen.getByTestId('day-report-open-editor')).toHaveTextContent('Nothing written yet. Press here to write the report.');
      await openEditor();
      // No "not saved" notice any more: the text is kept.
      expect(screen.queryByTestId('day-report-not-saved')).not.toBeInTheDocument();
      await act(async () => {
        fireEvent.change(screen.getByTestId('day-report-text'), { target: { value: 'Hyvä syksy.' } });
      });
      expect(props.onSave).not.toHaveBeenCalled();
      await act(async () => {
        fireEvent.click(screen.getByTestId('day-report-save'));
      });
      expect(props.onSave).toHaveBeenCalledWith('Hyvä syksy.');
      expect(mockShowToast).toHaveBeenCalledWith('Report saved.', 'success');
      await act(async () => {
        fireEvent.click(screen.getByTestId('day-report-share'));
      });
      const box = screen.getByRole('textbox', { name: 'Share league report' }) as HTMLTextAreaElement;
      expect(box.value).toBe(
        [
          '⚽ Kotkat P11 · Harrastesarja',
          '1W 1D 0L · goals 3–2',
          '',
          '✅ 20.9. Kallion Kiri 2–1',
          '➖ 21.9. Harjun Haukat 1–1',
          '',
          'Players (games · goals+assists · positions):',
          'Eeli: 2 · 0+1 · GK ×1, LB ×1',
          'Onni: 1 · 1+0 · ST ×1',
          '',
          'Hyvä syksy.',
        ].join('\n'),
      );
    });

    it('shows the saved text when reopened, and clearing it saves an empty text', async () => {
      const props = renderModal({ kind: 'tournament', subject: { name: 'Joulucup', players: [] }, savedText: 'Kolme voittoa.' });
      expect(screen.getByTestId('day-report-open-editor')).toHaveTextContent('Kolme voittoa.');
      await openEditor();
      expect((screen.getByTestId('day-report-text') as HTMLTextAreaElement).value).toBe('Kolme voittoa.');
      await act(async () => {
        fireEvent.change(screen.getByTestId('day-report-text'), { target: { value: '  ' } });
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId('day-report-save'));
      });
      expect(props.onSave).toHaveBeenCalledWith('');
    });

    it('asks before closing with unsaved changes, and not when nothing changed', async () => {
      const props = renderModal({ kind: 'tournament', subject: { name: 'Joulucup', players: [] }, savedText: undefined });
      expect(screen.getByText('Tournament report')).toBeInTheDocument();
      // Nothing written: closes straight away.
      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });
      expect(props.onClose).toHaveBeenCalledTimes(1);

      await openEditor();
      await act(async () => {
        fireEvent.change(screen.getByTestId('day-report-text'), { target: { value: 'Kesken' } });
      });
      await act(async () => {
        (document.activeElement as HTMLElement | null)?.blur();
        fireEvent.keyDown(document, { key: 'Escape' });
      });
      expect(screen.getByText('The report text you wrote has not been saved.')).toBeInTheDocument();
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.onSave).not.toHaveBeenCalled();
    });
  });
});

