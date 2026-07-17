/**
 * Two-level restructure 3.1 - the match menu is MATCH-scope only. Every
 * club/app entry lives on Home (reachability table: each item has exactly
 * one home, two-level-app-structure.md §2). The menu holds: Save, Match
 * details, Assess Players, Game report, Match stats + the "Team stats →"
 * link, the Taso link (game-day workflow tool), and "Home" - the one way
 * back to club scope (mirrored by hardware back + the top-bar house icon).
 * @critical navigation reachability - a lost menu item is a lost feature
 */

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { isInitialized: true, language: 'en', changeLanguage: jest.fn(() => Promise.resolve()) },
}));
jest.mock('@/utils/storage', () => {
  const actual = jest.requireActual('@/utils/storage');
  return {
    ...actual,
    getStorageJSON: jest.fn(async (_key: string, opts?: { defaultValue?: unknown }) => opts?.defaultValue ?? null),
  };
});

import React from 'react';
import { render, fireEvent, screen, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ControlBar from './ControlBar';

const noop = () => {};
const onOpenTeamStats = jest.fn();
const onGoToStartScreen = jest.fn();
const onOpenPlanner = jest.fn();
const onOpenTraining = jest.fn();
const onOpenRules = jest.fn();

const renderBar = () =>
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
      onOpenPlayerAssessmentModal={noop}
      onOpenTeamStats={onOpenTeamStats}
      onOpenPlanner={onOpenPlanner}
      onOpenTraining={onOpenTraining}
      onOpenRules={onOpenRules}
      onGoToStartScreen={onGoToStartScreen}
    />,
  );

/** The section DIV that a group header belongs to (header + its items). */
const section = (heading: string): HTMLElement => {
  const h = screen.getByRole('heading', { name: heading });
  return h.parentElement as HTMLElement;
};

describe('ControlBar menu - match scope only (restructure 3.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    renderBar();
    fireEvent.click(screen.getByLabelText(/Settings/i)); // open the hamburger
  });

  it('holds exactly the match-scope items plus Taso and Home', () => {
    const match = within(section('This match'));
    for (const item of ['Quick Save', 'Match details', 'Record Performance', 'Game report', /Team stats/]) {
      expect(match.getByRole('button', { name: item })).toBeInTheDocument();
    }
    // Taso is the one external link that stays: game-day workflow tool.
    expect(screen.getByRole('link', { name: 'Taso' })).toBeInTheDocument();
    // The one way back to club scope.
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
  });

  it('the game-day re-additions render and route (W10/R6) - the rest stayed gone', () => {
    // Restored on proven friction: planner + the two reference materials.
    expect(screen.getByRole('button', { name: /Match planner/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Warmup Plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rules' })).toBeInTheDocument();
    for (const gone of [
      'Load Game...',
      'Start New Game',
      'Match stats',
      'All Players',
      'Teams',
      'Personnel Manager',
      'Competitions',
      'Backup & Restore',
      'App Settings',
      'Sign Out',
      'Start Screen',
    ]) {
      expect(screen.queryByRole('button', { name: gone })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('heading', { name: 'Team & app' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument();
    // The other external links moved to Home's gear bucket.
    expect(screen.queryByRole('link', { name: 'User Guide' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'match-ops.com' })).not.toBeInTheDocument();
  });

  it('"Team stats →" routes to the host club-stats surface (L.4 link)', async () => {
    // The menu defers handlers until its close animation settles.
    fireEvent.click(within(section('This match')).getByRole('button', { name: /Team stats/ }));
    await waitFor(() => expect(onOpenTeamStats).toHaveBeenCalledTimes(1));
  });

  it('"Home" exits to club scope', async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    await waitFor(() => expect(onGoToStartScreen).toHaveBeenCalledTimes(1));
  });
});

describe('ControlBar - the bar-level Home button (3.1 follow-up)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    renderBar();
  });

  it('is a first-class bar button that exits to Home WITHOUT opening the menu', () => {
    // Rendered directly on the bar - one always-visible tap out. (The
    // GameInfoBar-row icon looked bolted-on; owner feedback 2026-07-17.)
    fireEvent.click(screen.getByRole('button', { name: 'Back to Home' }));
    expect(onGoToStartScreen).toHaveBeenCalledTimes(1);
  });
});

describe('ControlBar - bar-level Home button without a handler', () => {
  it('renders no bar Home button when onGoToStartScreen is absent', () => {
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
        onOpenPlayerAssessmentModal={noop}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Back to Home' })).not.toBeInTheDocument();
  });
});
