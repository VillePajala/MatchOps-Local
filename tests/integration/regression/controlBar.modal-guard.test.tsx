// Quieten env noise similar to other ControlBar regression tests
jest.mock('@/i18n', () => ({ __esModule: true, default: { isInitialized: true, language: 'en', changeLanguage: jest.fn(() => Promise.resolve()) } }));
jest.mock('@/utils/storage', () => {
  const actual = jest.requireActual('@/utils/storage');
  return {
    ...actual,
    getStorageJSON: jest.fn(async (_key: string, opts?: { defaultValue?: unknown }) => opts?.defaultValue ?? null),
  };
});

import React from 'react';
import { render, fireEvent, act, screen } from '../../utils/test-utils';
import ControlBar from '@/components/ControlBar';
import ModalProvider, { useModalContext } from '@/contexts/ModalProvider';

const noop = () => {};

function ControlBarHarness() {
  const {
    isLoadGameModalOpen,
    setIsLoadGameModalOpen,
    isNewGameSetupModalOpen,
    setIsNewGameSetupModalOpen,
  } = useModalContext();

  return (
    <>
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
        onToggleGameStatsModal={noop}
        onOpenLoadGameModal={() => setIsLoadGameModalOpen(true)}
        onStartNewGame={() => setIsNewGameSetupModalOpen(true)}
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
      <div data-testid="load-state">{String(isLoadGameModalOpen)}</div>
      <div data-testid="new-state">{String(isNewGameSetupModalOpen)}</div>
      <button type="button" data-testid="close-load" onClick={() => setIsLoadGameModalOpen(false)}>close-load</button>
      <button type="button" data-testid="close-new" onClick={() => setIsNewGameSetupModalOpen(false)}>close-new</button>
    </>
  );
}

describe('ControlBar reducer-driven modal guards', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2025-01-01T00:00:00.000Z') });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  function renderHarness() {
    render(
      <ModalProvider>
        <ControlBarHarness />
      </ModalProvider>,
    );
  }

  function closeMenuAndEmit(handlerLabel: RegExp) {
    fireEvent.click(screen.getByLabelText(/Settings/i));
    fireEvent.click(screen.getByRole('button', { name: handlerLabel }));
    const panel = screen.getByTestId('settings-side-panel');
    act(() => {
      fireEvent.transitionEnd(panel, { propertyName: 'transform' });
    });
  }

  /**
   * Tests critical modal guard behavior: prevents accidental closes during rapid interactions
   * @critical
   * @edge-case
   */
  it('keeps Load Game modal open when a close is requested immediately after opening', () => {
    renderHarness();
    closeMenuAndEmit(/Load Game/i);

    expect(screen.getByTestId('load-state').textContent).toBe('true');
    fireEvent.click(screen.getByTestId('close-load'));
    expect(screen.getByTestId('load-state').textContent).toBe('true');

    act(() => {
      jest.setSystemTime(new Date('2025-01-01T00:00:00.250Z'));
    });
    fireEvent.click(screen.getByTestId('close-load'));
    expect(screen.getByTestId('load-state').textContent).toBe('false');
  });

  /**
   * Tests anti-flash guard: prevents modal from closing when rapidly opened and closed
   * @critical
   * @edge-case
   */
  it('keeps New Game modal open when ControlBar shortcut fires twice rapidly', () => {
    renderHarness();
    closeMenuAndEmit(/New Game/i);

    expect(screen.getByTestId('new-state').textContent).toBe('true');
    fireEvent.click(screen.getByTestId('close-new'));
    expect(screen.getByTestId('new-state').textContent).toBe('true');

    act(() => {
      jest.setSystemTime(new Date('2025-01-01T00:00:00.250Z'));
    });
    fireEvent.click(screen.getByTestId('close-new'));
    expect(screen.getByTestId('new-state').textContent).toBe('false');
  });
});
