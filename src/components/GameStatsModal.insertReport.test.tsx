/**
 * The wiring between the spoken-report panel and the match report.
 *
 * @critical - this closure is where two data-loss bugs lived: the text went to
 * component state only (while the recording, its only other copy, was deleted
 * regardless), and the concatenation was unclamped, so an over-long report made
 * every later autosave for that match throw inside a handler that hides its own
 * errors. The panel itself is mocked here on purpose: what needs covering is
 * which setter this closure calls and what it returns, not the panel's UI.
 */
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '../../tests/utils/test-utils';
import GameStatsModal from './GameStatsModal';
import { VALIDATION_LIMITS } from '@/config/validationLimits';
import type { Player, SavedGamesCollection } from '@/types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string) => fallback ?? _k,
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

/** Stands in for the panel: one button that hands text to the closure. */
let lastInsertResult: boolean | undefined;
jest.mock('./GameStatsModal/components/SpokenReportPanel', () => ({
  __esModule: true,
  default: ({ onInsertIntoReport }: { onInsertIntoReport: (t: string) => boolean }) => (
    <button
      type="button"
      data-testid="fake-insert"
      onClick={() => { lastInsertResult = onInsertIntoReport(insertText); }}
    >
      insert
    </button>
  ),
}));

let insertText = 'Puhuttu yhteenveto.';

const players: Player[] = [
  { id: 'p1', name: 'Emma Virtanen', jerseyNumber: '7', isGoalie: false, notes: '', receivedFairPlayCard: false },
];

const savedGames = {
  game1: { isPlayed: true, selectedPlayerIds: ['p1'], gameEvents: [], gameNotes: '' },
} as unknown as SavedGamesCollection;

const dictation = {
  isSupported: true,
  available: true,
  permission: 'granted',
  isRecording: false,
  clipCount: 0,
  needsIntro: false,
  lastClip: null,
  start: jest.fn(),
  stop: jest.fn(),
  requestPermission: jest.fn(),
  dismissIntro: jest.fn(),
} as never;

const renderModal = (over: Record<string, unknown> = {}) => {
  const onGameNotesChange = jest.fn();
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
      dictation={dictation}
      onAddGameNote={jest.fn(() => true)}
      onGameNotesChange={onGameNotesChange}
      {...over}
    />,
  );
  return { onGameNotesChange };
};

describe('GameStatsModal - putting a spoken report into the match report', () => {
  beforeEach(() => {
    lastInsertResult = undefined;
    insertText = 'Puhuttu yhteenveto.';
  });

  it('stores the text rather than only showing it, and says it stored it', () => {
    const { onGameNotesChange } = renderModal({ gameNotes: 'Aiempi teksti.' });

    fireEvent.click(screen.getByTestId('fake-insert'));

    // Persisted, not parked in component state: the recording is deleted on
    // true, so state alone would be one Cancel away from losing the words.
    expect(onGameNotesChange).toHaveBeenCalledWith('Aiempi teksti.\n\nPuhuttu yhteenveto.');
    expect(lastInsertResult).toBe(true);
  });

  it('starts the report with the spoken text when there is nothing to append to', () => {
    const { onGameNotesChange } = renderModal({ gameNotes: '' });
    fireEvent.click(screen.getByTestId('fake-insert'));
    expect(onGameNotesChange).toHaveBeenCalledWith('Puhuttu yhteenveto.');
  });

  /**
   * @critical - the bug itself. With the editor open the text used to go to
   * setEditGameNotes and nowhere else, while the recording was deleted anyway,
   * so a Cancel left neither the words nor the audio. It must reach the stored
   * report whether or not the editor happens to be open.
   */
  it('stores the text even while the report editor is open', () => {
    const { onGameNotesChange } = renderModal({ gameNotes: 'Aiempi teksti.' });

    // Open the editor, which is where the words used to stop.
    fireEvent.click(screen.getByTestId('report-editor-open'));
    fireEvent.click(screen.getByTestId('fake-insert'));

    expect(onGameNotesChange).toHaveBeenCalledWith('Aiempi teksti.\n\nPuhuttu yhteenveto.');
    expect(lastInsertResult).toBe(true);
    // ...and the open editor shows the same text, so saving cannot undo it.
    expect(screen.getByTestId('report-editor-text')).toHaveValue('Aiempi teksti.\n\nPuhuttu yhteenveto.');
  });

  /**
   * Past the cap validateGame throws inside an autosave that suppresses its own
   * errors, and from then on nothing about this match persists - goals and
   * positions included - with nothing on screen.
   */
  it('refuses rather than writing a report the game can never save', () => {
    insertText = 'x'.repeat(500);
    const { onGameNotesChange } = renderModal({
      gameNotes: 'y'.repeat(VALIDATION_LIMITS.GAME_NOTES_MAX - 100),
    });

    fireEvent.click(screen.getByTestId('fake-insert'));

    expect(onGameNotesChange).not.toHaveBeenCalled();
    // False keeps the recording, which is the only remaining copy of the words.
    expect(lastInsertResult).toBe(false);
  });
});
