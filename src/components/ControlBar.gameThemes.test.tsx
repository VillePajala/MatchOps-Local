/**
 * Playbook "Match themes" in the match menu: the current game's themes played
 * in order, or the picker first when none is picked. Flagged accounts only.
 * @integration
 */

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { isInitialized: true, language: 'en', on: jest.fn(), off: jest.fn(), changeLanguage: jest.fn(() => Promise.resolve()) },
}));

import React from 'react';
import { render, fireEvent, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ControlBar from './ControlBar';
import type { Concept } from '@/playbook/types';
import type { GameTheme } from '@/playbook/gameThemeTypes';
import type { Playbook } from '@/playbook/usePlaybooks';
import type { PresentationSequence } from '@/playbook/PlaybookPresentation';
import type { LibrarySelection } from '@/playbook/PlaybookLibrary';

let mockPlaybookOn = true;
jest.mock('@/contexts/AccountFeaturesProvider', () => ({
  useFeatureEnabled: (feature: string) =>
    feature === jest.requireActual<typeof import('@/playbook/feature')>('@/playbook/feature').PLAYBOOK_FEATURE && mockPlaybookOn,
}));

let mockThemes: GameTheme[] = [];
const mockSave = jest.fn(async (_themes: GameTheme[]) => true);
jest.mock('@/playbook/useGameThemes', () => ({
  useGameThemes: () => ({ themes: mockThemes, isLoading: false, save: mockSave }),
}));

/** SYNTHETIC concepts. */
const concept = (id: string): Concept => ({
  id,
  title: `Title ${id}`,
  phase: 'Hyökkääminen',
  format: '8v8',
  version: 1,
  players: [{ id: 'p', side: 'us', start: [30, 60] }],
  steps: [{ title: 'First', text: 'Plain text', ball: 'p' }],
});
const mockPlaybooks: Playbook[] = [{ id: 'club', name: 'Club', builtIn: false, concepts: [concept('a'), concept('b'), concept('c')] }];
jest.mock('@/playbook/usePlaybooks', () => ({
  usePlaybooks: () => ({ playbooks: mockPlaybooks, status: 'ready', refresh: jest.fn() }),
}));

// The presentation and the picker are tested on their own; here: what opens, with what.
jest.mock('@/playbook/PlaybookPresentation', () => ({
  __esModule: true,
  default: ({ concept: c, sequence, initialFocus }: { concept: Concept; sequence?: PresentationSequence; initialFocus?: boolean }) => (
    <div data-testid="presentation">
      <span data-testid="presenting">{c.id}</span>
      {sequence && <span data-testid="sequence">{`${sequence.index + 1}/${sequence.total}`}</span>}
      {sequence && <button onClick={() => sequence.onNext({ focus: false })}>next-theme</button>}
      {/* Undefined = the presentation reads the remembered focus mode itself. */}
      <span data-testid="initial-focus">{String(initialFocus)}</span>
    </div>
  ),
}));
jest.mock('@/playbook/PlaybookLibrary', () => ({
  __esModule: true,
  default: ({ selection }: { selection?: LibrarySelection }) => (
    <div data-testid="picker">
      <button onClick={() => selection?.onDone([{ playbookId: 'club', conceptId: 'c' }, { playbookId: 'club', conceptId: 'a' }])}>
        pick-done
      </button>
    </div>
  ),
}));

const noop = () => {};
const renderBar = (extra: Partial<React.ComponentProps<typeof ControlBar>> = {}) =>
  render(
    <ControlBar
      timeElapsedInSeconds={0}
      isTimerRunning={false}
      onToggleLargeTimerOverlay={noop}
      onUndo={noop}
      onRedo={noop}
      canUndo={false}
      canRedo={false}
      onTacticalUndo={noop}
      onTacticalRedo={noop}
      canTacticalUndo={false}
      canTacticalRedo={false}
      onResetField={noop}
      onClearDrawings={noop}
      onAddOpponent={noop}
      isTacticsBoardView={false}
      onToggleTacticsBoard={noop}
      onAddHomeDisc={noop}
      onAddOpponentDisc={noop}
      onPlaceAllPlayers={noop}
      selectedPlayerCount={0}
      isDrawingEnabled={false}
      onToggleDrawingMode={noop}
      onToggleGameStatsModal={noop}
      onQuickSave={noop}
      onOpenGameSettingsModal={noop}
      isGameLoaded={true}
      themesGameId="game_1"
      {...extra}
    />,
  );

const openMenu = () => fireEvent.click(screen.getByLabelText(/^Menu$/i));

beforeEach(() => {
  mockPlaybookOn = true;
  mockThemes = [];
  mockSave.mockClear();
});

describe('ControlBar - Match themes (Playbook)', () => {
  it('shows no item to an account without the playbook flag', async () => {
    mockPlaybookOn = false;
    mockThemes = [{ playbookId: 'club', conceptId: 'a' }];
    renderBar();
    openMenu();
    // Settle the menu (a lazily loaded row would have appeared by now).
    await act(async () => {});
    expect(screen.queryByTestId('menu-game-themes')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Match details' })).toBeInTheDocument();
  });

  it('shows no item while no saved game is loaded', async () => {
    renderBar({ themesGameId: undefined });
    openMenu();
    await act(async () => {});
    expect(screen.queryByTestId('menu-game-themes')).not.toBeInTheDocument();
  });

  it('badges the number of picked themes; no badge when none is picked', async () => {
    mockThemes = [
      { playbookId: 'club', conceptId: 'b' },
      { playbookId: 'club', conceptId: 'a' },
    ];
    const { unmount } = renderBar();
    openMenu();
    expect(await screen.findByTestId('menu-game-themes')).toHaveTextContent('Match themes');
    expect(screen.getByTestId('menu-game-themes-count')).toHaveTextContent('2');
    unmount();

    mockThemes = [];
    renderBar();
    openMenu();
    expect(await screen.findByTestId('menu-game-themes')).toBeInTheDocument();
    expect(screen.queryByTestId('menu-game-themes-count')).not.toBeInTheDocument();
  });

  it('with themes picked: plays them in pick order, in the remembered focus mode', async () => {
    mockThemes = [
      { playbookId: 'club', conceptId: 'b' },
      { playbookId: 'club', conceptId: 'a' },
    ];
    renderBar();
    openMenu();
    fireEvent.click(await screen.findByTestId('menu-game-themes'));

    // The menu closes first; the presentation opens over the match.
    expect(await screen.findByTestId('presenting')).toHaveTextContent('b');
    expect(screen.getByTestId('sequence')).toHaveTextContent('1/2');
    expect(screen.getByTestId('initial-focus')).toHaveTextContent('undefined');
    expect(screen.queryByTestId('picker')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('next-theme'));
    expect(screen.getByTestId('presenting')).toHaveTextContent('a');
    expect(screen.getByTestId('sequence')).toHaveTextContent('2/2');
  });

  it('with none picked: opens the picker for this game, saves the pick and plays it', async () => {
    renderBar();
    openMenu();
    fireEvent.click(await screen.findByTestId('menu-game-themes'));

    fireEvent.click(await screen.findByText('pick-done'));
    expect(mockSave).toHaveBeenCalledWith([
      { playbookId: 'club', conceptId: 'c' },
      { playbookId: 'club', conceptId: 'a' },
    ]);
    await waitFor(() => expect(screen.getByTestId('presenting')).toHaveTextContent('c'));
    expect(screen.getByTestId('sequence')).toHaveTextContent('1/2');
    expect(screen.queryByTestId('picker')).not.toBeInTheDocument();
  });

  /** @edge-case picked themes the account can no longer read: pick again, like the next-match card */
  it('opens the picker when none of the picked themes can be shown any more', async () => {
    mockThemes = [{ playbookId: 'other-club', conceptId: 'gone' }];
    renderBar();
    openMenu();
    fireEvent.click(await screen.findByTestId('menu-game-themes'));
    expect(await screen.findByTestId('picker')).toBeInTheDocument();
    expect(screen.queryByTestId('presentation')).not.toBeInTheDocument();
  });
});
