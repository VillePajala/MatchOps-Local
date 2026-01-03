// Quieten env side-effects for this focused test
jest.mock('@/i18n', () => ({ __esModule: true, default: { isInitialized: true, language: 'en', changeLanguage: jest.fn(() => Promise.resolve()) } }));
jest.mock('@/utils/storage', () => {
  const actual = jest.requireActual('@/utils/storage');
  return {
    ...actual,
    getStorageJSON: jest.fn(async (_key: string, opts?: any) => opts?.defaultValue ?? null),
  };
});
 
// @ts-ignore
console.error = jest.fn();
 
// @ts-ignore
console.warn = jest.fn();

import React from 'react';
import { render, fireEvent, act, screen } from '../../utils/test-utils';
import ControlBar from '@/components/ControlBar';

describe('Menu → Modal deferral guard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const noop = () => {};

  function setup(onOpenLoadGameModal = jest.fn()) {
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
        onToggleTrainingResources={noop}
        onToggleRulesDirectory={noop}
        onToggleGameStatsModal={noop}
        onOpenLoadGameModal={onOpenLoadGameModal}
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
      />
    );
  }

  it('defers modal opening after menu closes (Load Game)', () => {
    const onOpenLoadGameModal = jest.fn();
    setup(onOpenLoadGameModal);

    // Open menu (button aria-label is localized; English = "Settings")
    fireEvent.click(screen.getByLabelText(/Settings/i));

    // Click "Load Game..." in the menu
    fireEvent.click(screen.getByRole('button', { name: /Load Game/i }));

    // Handler should not be called synchronously
    expect(onOpenLoadGameModal).not.toHaveBeenCalled();

    // Simulate the side panel finishing its close transition
    const panel = screen.getByTestId('settings-side-panel');
    act(() => {
      // Fire transitionend on the panel
      fireEvent.transitionEnd(panel, { propertyName: 'transform' });
    });
    expect(onOpenLoadGameModal).toHaveBeenCalledTimes(1);
  });

  it('does not leak listeners when invoked twice before transitionend; calls handler exactly once per close', () => {
    const onOpenLoadGameModal = jest.fn();
    setup(onOpenLoadGameModal);

    // First sequence: open menu and click Load Game (sets up listener + fallback)
    fireEvent.click(screen.getByLabelText(/Settings/i));
    fireEvent.click(screen.getByRole('button', { name: /Load Game/i }));

    // Without firing transitionend, open menu again and click Load Game again
    fireEvent.click(screen.getByLabelText(/Settings/i));
    fireEvent.click(screen.getByRole('button', { name: /Load Game/i }));

    // Fire a transitionend once — should only invoke the latest handler once
    const panel = screen.getByTestId('settings-side-panel');
    act(() => {
      fireEvent.transitionEnd(panel, { propertyName: 'transform' });
    });
    expect(onOpenLoadGameModal).toHaveBeenCalledTimes(1);

    // Repeat: open again and verify a second call occurs (no duplicate from prior)
    fireEvent.click(screen.getByLabelText(/Settings/i));
    fireEvent.click(screen.getByRole('button', { name: /Load Game/i }));
    act(() => {
      fireEvent.transitionEnd(panel, { propertyName: 'transform' });
    });
    expect(onOpenLoadGameModal).toHaveBeenCalledTimes(2);
  });
});
