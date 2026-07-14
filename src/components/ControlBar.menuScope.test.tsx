/**
 * Two-level restructure PR 0.1 - the hamburger menu groups by SCOPE:
 * "This match" holds only items that touch the game on screen, "Team & app"
 * holds the club library and app tools. Every pre-split item must remain
 * reachable under exactly one of the scope groups (plus the untouched
 * Resources/Settings sections). See two-level-app-structure.md §6.
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
import ModalProvider from '@/contexts/ModalProvider';

const noop = () => {};
const onOpenTeamStats = jest.fn();

const renderBar = () =>
  render(
    <ModalProvider>
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
      onToggleTrainingResources={noop}
      onToggleRulesDirectory={noop}
      onToggleGameStatsModal={noop}
      onOpenLoadGameModal={noop}
      onStartNewGame={noop}
      onOpenRosterModal={noop}
      onQuickSave={noop}
      onOpenGameSettingsModal={noop}
      isGameLoaded={true}
      onOpenSeasonTournamentModal={noop}
      onToggleInstructionsModal={noop}
      onOpenSettingsModal={noop}
      onOpenPlayerAssessmentModal={noop}
      onOpenTeamManagerModal={noop}
      onOpenPersonnelManager={noop}
      onOpenPlanner={noop}
      onOpenTeamStats={onOpenTeamStats}
    />
    </ModalProvider>,
  );

/** The section DIV that a group header belongs to (header + its items). */
const section = (heading: string): HTMLElement => {
  const h = screen.getByRole('heading', { name: heading });
  return h.parentElement as HTMLElement;
};

describe('ControlBar menu - scope grouping (restructure PR 0.1)', () => {
  beforeEach(() => {
    renderBar();
    fireEvent.click(screen.getByLabelText(/Settings/i)); // open the hamburger
  });

  it('groups by scope: match items under "This match", club/app items under "Team & app"', () => {
    const match = within(section('This match'));
    for (const item of ['Quick Save', 'Match details', 'Record Performance', 'Game report', 'Match stats']) {
      expect(match.getByRole('button', { name: item })).toBeInTheDocument();
    }

    const club = within(section('Team & app'));
    for (const item of [
      'Load Game...',
      'Start New Game',
      'Match planner',
      'Team stats',
      'All Players',
      'Teams',
      'Personnel Manager',
      'Competitions',
      'Warmup Plan',
      'Rules',
      'Backup & Restore',
    ]) {
      expect(club.getByRole('button', { name: item })).toBeInTheDocument();
    }
  });

  it('the two stats entries route to their own scopes (PR 0.2)', async () => {
    // "Team stats" must call the aggregate-tab opener, not the plain toggle.
    // The menu defers handlers until its close animation settles.
    fireEvent.click(within(section('Team & app')).getByRole('button', { name: 'Team stats' }));
    await waitFor(() => expect(onOpenTeamStats).toHaveBeenCalledTimes(1));
  });

  it('the old scope-mixed group headers are gone', () => {
    for (const gone of ['Game Management', 'Setup & Configuration', 'Analysis & Tools']) {
      expect(screen.queryByRole('heading', { name: gone })).not.toBeInTheDocument();
    }
    expect(screen.queryByText('Game Settings')).not.toBeInTheDocument();
  });

  it('Resources and Settings sections are untouched (already single-scope)', () => {
    expect(screen.getByRole('heading', { name: 'Resources' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'App Settings' })).toBeInTheDocument();
  });
});
