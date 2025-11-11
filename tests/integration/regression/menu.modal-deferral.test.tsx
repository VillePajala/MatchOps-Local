// Quieten env side-effects for this focused test
jest.mock('@/i18n', () => ({ __esModule: true, default: { isInitialized: true, language: 'en', changeLanguage: jest.fn(() => Promise.resolve()) } }));
jest.mock('@/utils/storage', () => {
  const actual = jest.requireActual('@/utils/storage');
  return {
    ...actual,
    getStorageJSON: jest.fn(async (_key: string, opts?: any) => opts?.defaultValue ?? null),
  };
});
// eslint-disable-next-line no-console
// @ts-ignore
console.error = jest.fn();
// eslint-disable-next-line no-console
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
        onResetField={noop}
        onClearDrawings={noop}
        onAddOpponent={noop}
        isTacticsBoardView={false}
        onToggleTacticsBoard={noop}
        onAddHomeDisc={noop}
        onAddOpponentDisc={noop}
        onPlaceAllPlayers={noop}
        onToggleGoalLogModal={noop}
        onToggleTrainingResources={noop}
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

    // Advance past deferral window (matches ControlBar MODAL_OPEN_DEFERRAL_MS = 150ms)
    act(() => { jest.advanceTimersByTime(160); });
    expect(onOpenLoadGameModal).toHaveBeenCalledTimes(1);
  });
});
