/**
 * The Tidy button lives with the report text; the request lives two cards
 * below. This covers the join between them, which is the whole change.
 *
 * @critical - a button wired to nothing is exactly the failure the owner
 * reported once already ("what is this button, it does nothing").
 */
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '../../tests/utils/test-utils';
import GameStatsModal from './GameStatsModal';
import type { Player, SavedGamesCollection } from '@/types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string, options?: Record<string, unknown>) =>
      (fallback ?? _k).replace(/\{\{(\w+)\}\}/g, (_m, n) => String(options?.[n] ?? '')),
    i18n: { language: 'fi' },
  }),
}));

jest.mock('@/utils/seasons', () => ({ getSeasons: jest.fn().mockResolvedValue([]) }));
jest.mock('@/utils/tournaments', () => ({ getTournaments: jest.fn().mockResolvedValue([]) }));
jest.mock('@/utils/teams', () => ({ getTeams: jest.fn().mockResolvedValue([]) }));
jest.mock('@/utils/appSettings', () => ({ getAppSettings: jest.fn().mockResolvedValue({}) }));
jest.mock('@/contexts/ToastProvider', () => ({
  __esModule: true,
  ...jest.requireActual('@/contexts/ToastProvider'),
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock('@/hooks/useDataStore', () => ({
  useDataStore: () => ({
    userId: 'u1',
    isUserScoped: true,
    getStore: jest.fn().mockResolvedValue({
      getAllPlayerAdjustments: jest.fn().mockResolvedValue(new Map()),
    }),
  }),
}));

// A connected provider, so the estimate and the button are offered at all.
jest.mock('@/utils/aiProvider', () => ({
  ...jest.requireActual('@/utils/aiProvider'),
  useAiProviderState: () => ({ connected: true, pseudonymize: true, model: null }),
}));

const tidy = jest.fn();
jest.mock('./GameStatsModal/components/ReportDraftPanel', () => ({
  __esModule: true,
  default: ({ handleRef }: { handleRef?: React.RefObject<{ tidy: () => void } | null> }) => {
    if (handleRef) handleRef.current = { tidy };
    return <div id="report-draft-panel" data-testid="report-draft-panel" />;
  },
}));

const players: Player[] = [
  { id: 'p1', name: 'Emma Virtanen', jerseyNumber: '7', isGoalie: false, notes: '', receivedFairPlayCard: false },
];

const savedGames = {
  game1: { isPlayed: true, selectedPlayerIds: ['p1'], gameEvents: [], gameNotes: 'Oma raporttini.' },
} as unknown as SavedGamesCollection;

const renderModal = (over: Record<string, unknown> = {}) =>
  render(
    <GameStatsModal
      isOpen
      onClose={jest.fn()}
      teamName="Testi"
      opponentName="Vastus"
      gameDate="2026-09-05"
      homeScore={1}
      awayScore={0}
      homeOrAway="home"
      availablePlayers={players}
      gameEvents={[]}
      selectedPlayerIds={['p1']}
      savedGames={savedGames}
      currentGameId="game1"
      masterRoster={players}
      gameNotes="Oma raporttini."
      onApplyReportDraft={jest.fn(() => true)}
      onGameNotesChange={jest.fn()}
      {...over}
    />,
  );

describe('GameStatsModal - Tidy beside the report', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Element.prototype.scrollIntoView = jest.fn();
  });

  it('starts the tidy job that lives in the drafting card below', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('report-editor-tidy'));
    expect(tidy).toHaveBeenCalledTimes(1);
  });

  /**
   * The review, the price and the undo are all down in that card, so a coach
   * left staring at the button they pressed would think nothing happened.
   */
  it('takes the coach down to where the result will appear', () => {
    renderModal();
    fireEvent.click(screen.getByTestId('report-editor-tidy'));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  /**
   * @critical - the button lives in the editor and the machinery lives in a
   * card that is only mounted for a saved game. On an unsaved game the coach
   * could type a report, see a PRICED Tidy button, press it, and have nothing
   * happen at all: no panel, no handle, not even a card to scroll to. That is
   * the precise failure this whole file exists to prevent, and the first
   * version of it shipped with the bug because the harness always supplied a
   * resolvable game.
   */
  it('offers no Tidy on a game that has never been saved', () => {
    // currentGameId resolves to nothing, so ReportDraftPanel never mounts.
    renderModal({ currentGameId: 'unsaved_game' });
    expect(screen.queryByTestId('report-draft-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('report-editor-tidy')).not.toBeInTheDocument();
  });

  it('offers no Tidy when nothing can store the result', () => {
    // No apply handler means no panel either, whatever the game.
    renderModal({ onApplyReportDraft: undefined });
    expect(screen.queryByTestId('report-editor-tidy')).not.toBeInTheDocument();
  });

  it('offers no Tidy when the report is still empty', () => {
    renderModal({ gameNotes: '' });
    expect(screen.queryByTestId('report-editor-tidy')).not.toBeInTheDocument();
  });
});
