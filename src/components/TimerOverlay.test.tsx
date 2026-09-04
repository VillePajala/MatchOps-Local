import React from 'react';
import { render, screen, fireEvent, waitFor } from '../../tests/utils/test-utils';
import { within } from '@testing-library/react';
import TimerOverlay from './TimerOverlay';

describe('TimerOverlay', () => {
  const baseProps = {
    timeElapsedInSeconds: 0,
    subAlertLevel: 'none' as const,
    onSubstitutionMade: jest.fn(),
    completedIntervalDurations: [],
    subIntervalMinutes: 5,
    onSetSubInterval: jest.fn(),
    isTimerRunning: false,
    onStartPauseTimer: jest.fn(),
    onResetTimer: jest.fn(),
    onToggleGoalLogModal: jest.fn(),
    onRecordOpponentGoal: jest.fn(),
    teamName: 'Home',
    opponentName: 'Away',
    homeScore: 0,
    awayScore: 0,
    homeOrAway: 'home' as const,
    numberOfPeriods: 2 as const,
    periodDurationMinutes: 10,
    currentPeriod: 1,
    gameStatus: 'notStarted' as const,
    lastSubTime: 0,
    onOpponentNameChange: jest.fn(),
    onTeamNameChange: jest.fn(),
    isLoaded: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls onStartPauseTimer when Start is clicked', () => {
    render(<TimerOverlay {...baseProps} />);
    const startButton = screen.getByRole('button', { name: /start/i });
    fireEvent.click(startButton);
    expect(baseProps.onStartPauseTimer).toHaveBeenCalledTimes(1);
  });

  it('adjusts sub interval via +/- buttons with 0.5 increments when game not started', () => {
    render(<TimerOverlay {...baseProps} subIntervalMinutes={5} />);
    const dec = screen.getByRole('button', { name: /decrease interval/i });
    const inc = screen.getByRole('button', { name: /increase interval/i });

    fireEvent.click(inc);
    expect(baseProps.onSetSubInterval).toHaveBeenCalledWith(5.5);
    fireEvent.click(dec);
    // The component uses current prop (5), so decrement calls with 4.5
    expect(baseProps.onSetSubInterval).toHaveBeenCalledWith(4.5);
  });

  it('displays half-minute intervals with one decimal place', () => {
    render(<TimerOverlay {...baseProps} subIntervalMinutes={2.5} />);
    // Should display "2.5" not "2.5000..."
    expect(screen.getByText('2.5')).toBeInTheDocument();
  });

  it('displays whole-minute intervals without decimal', () => {
    render(<TimerOverlay {...baseProps} subIntervalMinutes={3} />);
    // Should display "3" not "3.0"
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('disables decrease button at minimum 0.5 minutes', () => {
    render(<TimerOverlay {...baseProps} subIntervalMinutes={0.5} />);
    const dec = screen.getByRole('button', { name: /decrease interval/i });
    expect(dec).toBeDisabled();
  });

  it('enables decrease button above 0.5 minutes', () => {
    render(<TimerOverlay {...baseProps} subIntervalMinutes={1} />);
    const dec = screen.getByRole('button', { name: /decrease interval/i });
    expect(dec).not.toBeDisabled();
  });

  it('opens reset confirmation and calls onResetTimer on confirm', async () => {
    render(<TimerOverlay {...baseProps} timeElapsedInSeconds={10} />);
    const resetButton = screen.getByRole('button', { name: /reset/i });
    fireEvent.click(resetButton);

    // Confirmation modal should appear
    const dialog = await screen.findByRole('dialog', { name: /reset timer/i });
    const confirmInDialog = within(dialog).getByRole('button', { name: /reset/i });
    fireEvent.click(confirmInDialog);

    await waitFor(() => expect(baseProps.onResetTimer).toHaveBeenCalledTimes(1));
  });

  it('confirms opponent goal and calls onRecordOpponentGoal', async () => {
    render(<TimerOverlay {...baseProps} />);
    const oppGoalButton = screen.getByRole('button', { name: /opponent \+1|vastustaja \+1/i });
    fireEvent.click(oppGoalButton);

    const dialog = await screen.findByRole('dialog', { name: /record opponent goal/i });
    const confirmInDialog = within(dialog).getByRole('button', { name: /confirm/i });
    fireEvent.click(confirmInDialog);

    await waitFor(() => expect(baseProps.onRecordOpponentGoal).toHaveBeenCalledTimes(1));
  });

  describe('planned sub nudge (Playing-Time Planner)', () => {
    const prompt = { subId: 's1', timeSeconds: 720, inName: 'Niko', outName: 'Sam' };

    it('shows the due planned sub during play and dismisses it', () => {
      const onDismiss = jest.fn();
      render(
        <TimerOverlay
          {...baseProps}
          gameStatus="inProgress"
          plannedSubPrompt={prompt}
          onDismissPlannedSub={onDismiss}
        />,
      );
      expect(screen.getByText(/Niko/)).toBeInTheDocument();
      expect(screen.getByText(/Sam/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Got it/i }));
      expect(onDismiss).toHaveBeenCalledWith('s1');
    });

    it('does not show the nudge before the game starts', () => {
      render(<TimerOverlay {...baseProps} gameStatus="notStarted" plannedSubPrompt={prompt} />);
      expect(screen.queryByRole('button', { name: /Got it/i })).not.toBeInTheDocument();
    });

    it('keeps the nudge through a period break (half-time is when subs happen)', () => {
      render(<TimerOverlay {...baseProps} gameStatus="periodEnd" plannedSubPrompt={prompt} />);
      expect(screen.getByRole('button', { name: /Got it/i })).toBeInTheDocument();
    });

    it('does not show the nudge after full time - nobody left to substitute', () => {
      render(<TimerOverlay {...baseProps} gameStatus="gameEnd" plannedSubPrompt={prompt} />);
      expect(screen.queryByRole('button', { name: /Got it/i })).not.toBeInTheDocument();
    });
  });

  describe('Kirjuri dictation button (PR 2)', () => {
    const controls = () => ({
      isSupported: true,
      permission: 'unknown' as const,
      isRecording: false,
      clipCount: 0,
      needsIntro: false,
      acknowledgeIntro: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
    });

    it('is absent when the feature is not wired', () => {
      render(<TimerOverlay {...baseProps} />);
      expect(screen.queryByTestId('dictation-hold')).not.toBeInTheDocument();
    });

    /** @critical - press starts, release stops: the whole in-game interaction. */
    it('press starts and release stops the recorder', () => {
      const dictation = controls();
      render(<TimerOverlay {...baseProps} dictation={dictation} />);
      const button = screen.getByTestId('dictation-hold');
      fireEvent.pointerDown(button);
      expect(dictation.start).toHaveBeenCalledTimes(1);
      fireEvent.pointerUp(button);
      expect(dictation.stop).toHaveBeenCalledTimes(1);
    });

    it('the first press explains and asks instead of recording; confirming acknowledges', () => {
      const dictation = { ...controls(), needsIntro: true };
      render(<TimerOverlay {...baseProps} dictation={dictation} />);
      fireEvent.pointerDown(screen.getByTestId('dictation-hold'));
      expect(dictation.start).not.toHaveBeenCalled();
      expect(screen.getByText('Voice notes')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Continue'));
      expect(dictation.acknowledgeIntro).toHaveBeenCalledTimes(1);
    });

    it('a held key toggles once, not on every auto-repeat', () => {
      const dictation = controls();
      render(<TimerOverlay {...baseProps} dictation={dictation} />);
      const button = screen.getByTestId('dictation-hold');
      fireEvent.keyDown(button, { key: ' ' });
      fireEvent.keyDown(button, { key: ' ', repeat: true });
      fireEvent.keyDown(button, { key: ' ', repeat: true });
      expect(dictation.start).toHaveBeenCalledTimes(1);
      expect(dictation.stop).not.toHaveBeenCalled();
    });

    it('is disabled when unsupported or denied, with the reason as title', () => {
      const { unmount } = render(<TimerOverlay {...baseProps} dictation={{ ...controls(), isSupported: false }} />);
      expect(screen.getByTestId('dictation-hold')).toBeDisabled();
      expect(screen.getByTestId('dictation-hold').title).toMatch(/not supported/i);
      unmount();
      render(<TimerOverlay {...baseProps} dictation={{ ...controls(), permission: 'denied' }} />);
      expect(screen.getByTestId('dictation-hold')).toBeDisabled();
      expect(screen.getByTestId('dictation-hold').title).toMatch(/denied/i);
    });

    it('shows the stored clip count and the recording state', () => {
      const { unmount } = render(<TimerOverlay {...baseProps} dictation={{ ...controls(), clipCount: 3 }} />);
      expect(screen.getByTestId('dictation-clip-count')).toHaveTextContent('3');
      unmount();
      render(<TimerOverlay {...baseProps} dictation={{ ...controls(), isRecording: true, clipCount: 3 }} />);
      expect(screen.getByTestId('dictation-hold')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByTestId('dictation-clip-count')).not.toBeInTheDocument();
    });
  });

});
