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

  /** The interval lives in the info line; tapping it opens the - / + adjuster. */
  const openIntervalAdjuster = () => {
    fireEvent.click(screen.getByTestId('timer-sub-interval'));
  };

  it('adjusts sub interval via +/- buttons with 0.5 increments when game not started', () => {
    render(<TimerOverlay {...baseProps} subIntervalMinutes={5} />);
    openIntervalAdjuster();
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
    openIntervalAdjuster();
    // Should display "2.5" not "2.5000..."
    expect(screen.getByText('2.5')).toBeInTheDocument();
  });

  it('displays whole-minute intervals without decimal', () => {
    render(<TimerOverlay {...baseProps} subIntervalMinutes={3} />);
    openIntervalAdjuster();
    // Should display "3" not "3.0"
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('disables decrease button at the 1-minute minimum (the reducer clamps to 1)', () => {
    render(<TimerOverlay {...baseProps} subIntervalMinutes={1} />);
    openIntervalAdjuster();
    const dec = screen.getByRole('button', { name: /decrease interval/i });
    expect(dec).toBeDisabled();
  });

  it('enables decrease button above 1 minute', () => {
    render(<TimerOverlay {...baseProps} subIntervalMinutes={1.5} />);
    openIntervalAdjuster();
    const dec = screen.getByRole('button', { name: /decrease interval/i });
    expect(dec).not.toBeDisabled();
  });

  describe('sub interval in the info line (1a)', () => {
    it('shows the interval in the info line and keeps the adjuster closed until it is tapped', () => {
      render(<TimerOverlay {...baseProps} subIntervalMinutes={15} />);
      const chip = screen.getByTestId('timer-sub-interval');
      expect(chip).toHaveTextContent('15');
      expect(chip).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('button', { name: /increase interval/i })).not.toBeInTheDocument();
      fireEvent.click(chip);
      expect(chip).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('button', { name: /increase interval/i })).toBeInTheDocument();
      fireEvent.click(chip);
      expect(screen.queryByRole('button', { name: /increase interval/i })).not.toBeInTheDocument();
    });

    it('is the same control while the clock runs, so nothing moves when the game starts', () => {
      render(<TimerOverlay {...baseProps} gameStatus="inProgress" isTimerRunning={true} timeElapsedInSeconds={120} />);
      openIntervalAdjuster();
      fireEvent.click(screen.getByRole('button', { name: /increase interval/i }));
      expect(baseProps.onSetSubInterval).toHaveBeenCalledWith(5.5);
    });
  });

  describe('time since the last substitution (1c)', () => {
    it('is hidden until the first substitution', () => {
      render(<TimerOverlay {...baseProps} gameStatus="inProgress" timeElapsedInSeconds={300} lastSubTime={0} />);
      expect(screen.getByTestId('timer-since-sub')).toBeEmptyDOMElement();
    });

    it('counts from the last substitution once there has been one', () => {
      render(
        <TimerOverlay
          {...baseProps}
          gameStatus="inProgress"
          timeElapsedInSeconds={586}
          lastSubTime={334}
          completedIntervalDurations={[{ period: 1, duration: 334, timestamp: 334 }]}
        />,
      );
      expect(screen.getByTestId('timer-since-sub')).toHaveTextContent(/04:12/);
    });
  });

  it('opens reset confirmation and calls onResetTimer on confirm', async () => {
    render(<TimerOverlay {...baseProps} timeElapsedInSeconds={10} />);
    // Exact name: "Reset sub timer" is a different control (D13).
    const resetButton = screen.getByRole('button', { name: /^reset$/i });
    fireEvent.click(resetButton);

    // Confirmation modal should appear
    const dialog = await screen.findByRole('dialog', { name: /reset timer/i });
    const confirmInDialog = within(dialog).getByRole('button', { name: /reset/i });
    fireEvent.click(confirmInDialog);

    await waitFor(() => expect(baseProps.onResetTimer).toHaveBeenCalledTimes(1));
  });

  /**
   * Review 4.31 (owner decision): "End period" while a period is in play, behind a
   * confirmation that names the time the clock moves to; "End match" on the last one.
   * @critical
   */
  describe('End period now (review 4.31)', () => {
    it('is not offered before kick-off or at a break', () => {
      const onEndPeriod = jest.fn();
      const { rerender } = render(<TimerOverlay {...baseProps} onEndPeriod={onEndPeriod} />);
      expect(screen.queryByTestId('timer-end-period')).not.toBeInTheDocument();
      rerender(<TimerOverlay {...baseProps} onEndPeriod={onEndPeriod} gameStatus="periodEnd" timeElapsedInSeconds={600} />);
      expect(screen.queryByTestId('timer-end-period')).not.toBeInTheDocument();
    });

    it('asks first, naming the time, then ends the period', async () => {
      const onEndPeriod = jest.fn();
      render(<TimerOverlay {...baseProps} onEndPeriod={onEndPeriod} gameStatus="inProgress" isTimerRunning timeElapsedInSeconds={522} />);
      fireEvent.click(screen.getByTestId('timer-end-period'));
      expect(onEndPeriod).not.toHaveBeenCalled(); // never on one tap
      const dialog = await screen.findByRole('dialog', { name: /end period/i });
      expect(dialog).toHaveTextContent(/period 1 now\? The clock moves to 10:00/);
      fireEvent.click(within(dialog).getByRole('button', { name: /end period/i }));
      await waitFor(() => expect(onEndPeriod).toHaveBeenCalledTimes(1));
    });

    it('cancel leaves the period running', async () => {
      const onEndPeriod = jest.fn();
      render(<TimerOverlay {...baseProps} onEndPeriod={onEndPeriod} gameStatus="inProgress" timeElapsedInSeconds={522} />);
      fireEvent.click(screen.getByTestId('timer-end-period'));
      const dialog = await screen.findByRole('dialog', { name: /end period/i });
      fireEvent.click(within(dialog).getByRole('button', { name: /cancel|peruuta/i }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: /end period/i })).not.toBeInTheDocument());
      expect(onEndPeriod).not.toHaveBeenCalled();
    });

    it('is not offered at full time or without a handler', () => {
      const { rerender } = render(<TimerOverlay {...baseProps} onEndPeriod={jest.fn()} gameStatus="gameEnd" currentPeriod={2} timeElapsedInSeconds={1200} />);
      expect(screen.queryByTestId('timer-end-period')).not.toBeInTheDocument();
      rerender(<TimerOverlay {...baseProps} gameStatus="inProgress" timeElapsedInSeconds={300} />);
      expect(screen.queryByTestId('timer-end-period')).not.toBeInTheDocument();
    });

    it('on the last period it is "End match"', () => {
      render(<TimerOverlay {...baseProps} onEndPeriod={jest.fn()} gameStatus="inProgress" currentPeriod={2} timeElapsedInSeconds={1100} />);
      expect(screen.getByTestId('timer-end-period')).toHaveTextContent(/end match/i);
    });
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

  describe('planned subs block (Playing-Time Planner)', () => {
    const group = { timeSeconds: 1500, inNames: ['Eino', 'Niilo', 'Veeti'], outNames: ['Aapo', 'Elias', 'Leevi'] };

    /**
     * Every change due at one moment reads as one block, with no button to
     * dismiss it (it moves on by itself when the next group falls due).
     * @critical
     */
    it('shows the whole due group as one block with no dismiss button', () => {
      render(<TimerOverlay {...baseProps} gameStatus="inProgress" plannedSubGroup={group} />);
      const block = screen.getByTestId('planned-sub-group');
      expect(block).toHaveTextContent('25:00');
      expect(block).toHaveTextContent('Eino, Niilo, Veeti');
      expect(block).toHaveTextContent('Aapo, Elias, Leevi');
      expect(within(block).queryByRole('button')).not.toBeInTheDocument();
    });

    it('says how many earlier groups were also due', () => {
      render(<TimerOverlay {...baseProps} gameStatus="inProgress" plannedSubGroup={group} plannedSubsEarlier={2} />);
      expect(screen.getByTestId('planned-sub-group')).toHaveTextContent(/\+2/);
    });

    it('omits the off line when every slot was empty', () => {
      render(<TimerOverlay {...baseProps} gameStatus="inProgress" plannedSubGroup={{ ...group, outNames: [] }} />);
      expect(screen.getByTestId('planned-sub-group')).not.toHaveTextContent('Aapo');
    });

    /**
     * D3c: the next planned change is always visible. Ahead of the clock it
     * is quiet; once its time comes it turns amber, and stays until the next
     * group is due. Nothing to tap, nothing recorded.
     * @critical
     */
    it('shows the upcoming change quietly before kick-off, and amber once due', () => {
      const { unmount } = render(
        <TimerOverlay {...baseProps} gameStatus="notStarted" plannedSubGroup={{ ...group, due: false }} />,
      );
      const quiet = screen.getByTestId('planned-sub-group');
      expect(quiet).toHaveAttribute('data-due', 'false');
      expect(quiet).toHaveTextContent('Next change');
      expect(quiet).toHaveTextContent('Eino, Niilo, Veeti');
      expect(within(quiet).queryByRole('button')).not.toBeInTheDocument();
      unmount();

      render(<TimerOverlay {...baseProps} gameStatus="inProgress" plannedSubGroup={{ ...group, due: true }} />);
      expect(screen.getByTestId('planned-sub-group')).toHaveAttribute('data-due', 'true');
    });

    it('marks a change planned for the end of a regulation period as at the break', () => {
      // 2 x 10 min: 10:00 is the half-time break; 25:00 is not a break.
      const { unmount } = render(
        <TimerOverlay {...baseProps} gameStatus="periodEnd" plannedSubGroup={{ ...group, timeSeconds: 600 }} />,
      );
      expect(screen.getByTestId('planned-sub-group')).toHaveTextContent('10:00 (at the break)');
      unmount();
      render(<TimerOverlay {...baseProps} gameStatus="inProgress" plannedSubGroup={group} />);
      expect(screen.getByTestId('planned-sub-group')).not.toHaveTextContent('at the break');
    });

    it('keeps the block through a period break (half-time is when subs happen)', () => {
      render(<TimerOverlay {...baseProps} gameStatus="periodEnd" plannedSubGroup={group} />);
      expect(screen.getByTestId('planned-sub-group')).toBeInTheDocument();
    });

    it('does not show the block after full time - nobody left to substitute', () => {
      render(<TimerOverlay {...baseProps} gameStatus="gameEnd" plannedSubGroup={group} />);
      expect(screen.queryByTestId('planned-sub-group')).not.toBeInTheDocument();
    });
  });

  describe('Kirjuri dictation button (PR 2)', () => {
    const controls = () => ({
      isSupported: true,
      available: true,
      permission: 'unknown' as const,
      isRecording: false,
      clipCount: 0, lastClip: null,
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

    it('is disabled with an explanation on the scratch (unsaved) game', () => {
      render(<TimerOverlay {...baseProps} dictation={{ ...controls(), available: false }} />);
      expect(screen.getByTestId('dictation-hold')).toBeDisabled();
      expect(screen.getByTestId('dictation-hold').title).toMatch(/open a game/i);
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


  /** Review 1.11: full time came early and the period length/count was corrected. */
  describe('Start at full time', () => {
    const startButton = () => screen.getByTestId('tour-timer-startpause');

    it('stays disabled ("Game Over") when the game really is over', () => {
      render(<TimerOverlay {...baseProps} gameStatus="gameEnd" currentPeriod={2} timeElapsedInSeconds={1200} />);
      expect(startButton()).toBeDisabled();
      expect(startButton()).toHaveTextContent(/Game Over|Peli ohi/);
    });

    it('offers to continue when the corrected length leaves time to play', () => {
      render(
        <TimerOverlay {...baseProps} gameStatus="gameEnd" currentPeriod={2} periodDurationMinutes={15} timeElapsedInSeconds={1200} />,
      );
      expect(startButton()).toBeEnabled();
      expect(startButton()).toHaveTextContent(/Resume|Jatka/);
      fireEvent.click(startButton());
      expect(baseProps.onStartPauseTimer).toHaveBeenCalled();
    });

    it('is disabled at a break with no period after it', () => {
      render(<TimerOverlay {...baseProps} gameStatus="periodEnd" numberOfPeriods={1} currentPeriod={1} timeElapsedInSeconds={600} />);
      expect(startButton()).toBeDisabled();
    });

    it('offers the next period when a one-period game is corrected to two', () => {
      render(
        <TimerOverlay {...baseProps} gameStatus="gameEnd" numberOfPeriods={2} currentPeriod={1} timeElapsedInSeconds={600} />,
      );
      expect(startButton()).toBeEnabled();
      expect(startButton()).toHaveTextContent(/2/);
    });
  });

  describe('game end hand-off (Phase 1b 7c)', () => {
    it('offers Finish this game, which closes the overlay and opens the spine', () => {
      const onFinishGame = jest.fn();
      const onClose = jest.fn();
      const onOpenPlayerAssessmentModal = jest.fn();
      render(
        <TimerOverlay
          {...baseProps}
          gameStatus="gameEnd"
          onFinishGame={onFinishGame}
          onClose={onClose}
          onOpenPlayerAssessmentModal={onOpenPlayerAssessmentModal}
        />,
      );
      expect(screen.queryByText('Assess players')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('timer-finish-game'));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onFinishGame).toHaveBeenCalledTimes(1);
      expect(onOpenPlayerAssessmentModal).not.toHaveBeenCalled();
    });

    /** At the whistle the only question is how much is left. */
    /**
     * D3b: at full time the hand-off is the one big action, above the clock
     * controls, and the clock is a small readout - no longer the hero.
     */
    it('puts Finish this game above the clock controls and makes it the only amber action', () => {
      render(<TimerOverlay {...baseProps} gameStatus="gameEnd" timeElapsedInSeconds={1200} onFinishGame={jest.fn()} />);
      const finish = screen.getByTestId('timer-finish-game');
      const start = screen.getByTestId('tour-timer-startpause');
      expect(finish.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(finish.className).toContain('s1-primary');
      expect(start.className).not.toContain('s1-primary');
      expect(screen.getByTestId('timer-clock').firstElementChild).toHaveStyle({ fontSize: '2.75rem' });
    });

    it('says how much is left, and nothing when it does not apply', () => {
      const { unmount } = render(
        <TimerOverlay
          {...baseProps}
          gameStatus="gameEnd"
          onFinishGame={jest.fn()}
          finishProgress={{ done: 3, total: 5 }}
        />,
      );
      expect(screen.getByTestId('timer-finish-progress')).toHaveTextContent('3/5');

      unmount();
      render(<TimerOverlay {...baseProps} gameStatus="gameEnd" onFinishGame={jest.fn()} finishProgress={null} />);
      expect(screen.queryByTestId('timer-finish-progress')).not.toBeInTheDocument();
    });

    it('falls back to the assess-players button when no hand-off is wired', () => {
      render(<TimerOverlay {...baseProps} gameStatus="gameEnd" onOpenPlayerAssessmentModal={jest.fn()} />);
      expect(screen.queryByTestId('timer-finish-game')).not.toBeInTheDocument();
      expect(screen.getByText('Assess players')).toBeInTheDocument();
    });

    it('shows neither before the game has ended', () => {
      render(<TimerOverlay {...baseProps} gameStatus="inProgress" onFinishGame={jest.fn()} />);
      expect(screen.queryByTestId('timer-finish-game')).not.toBeInTheDocument();
    });
  });

  /** Review 11.1 (owner 2026-11-17): extra time is offered at full time, never automatic. */
  describe('Extra time', () => {
    const fullTime = { ...baseProps, gameStatus: 'gameEnd' as const, currentPeriod: 2, timeElapsedInSeconds: 1200 };
    const minutesInput = () => within(screen.getByTestId('extra-time-panel')).getByRole('spinbutton');

    it('offers extra time at full time, 2 x 15 min by default, and starts it on tap', () => {
      const onStartExtraTime = jest.fn();
      render(<TimerOverlay {...fullTime} onStartExtraTime={onStartExtraTime} />);
      expect(minutesInput()).toHaveValue(15);
      fireEvent.click(screen.getByTestId('start-extra-time'));
      expect(onStartExtraTime).toHaveBeenCalledWith(2, 15);
    });

    it('takes 1 period and the length typed in; futsal defaults to 5 min', () => {
      const onStartExtraTime = jest.fn();
      render(<TimerOverlay {...fullTime} gameType="futsal" onStartExtraTime={onStartExtraTime} />);
      expect(minutesInput()).toHaveValue(5);
      const panel = within(screen.getByTestId('extra-time-panel'));
      fireEvent.click(panel.getAllByRole('button', { pressed: false })[0]);
      fireEvent.change(minutesInput(), { target: { value: '10' } });
      fireEvent.click(screen.getByTestId('start-extra-time'));
      expect(onStartExtraTime).toHaveBeenCalledWith(1, 10);
    });

    it('follows the game type until a length is typed (the game can load after mount)', () => {
      const { rerender } = render(<TimerOverlay {...fullTime} onStartExtraTime={jest.fn()} />);
      expect(minutesInput()).toHaveValue(15);
      rerender(<TimerOverlay {...fullTime} gameType="futsal" onStartExtraTime={jest.fn()} />);
      expect(minutesInput()).toHaveValue(5);
      fireEvent.change(minutesInput(), { target: { value: '8' } });
      rerender(<TimerOverlay {...fullTime} gameType="soccer" onStartExtraTime={jest.fn()} />);
      expect(minutesInput()).toHaveValue(8);
    });

    it('cannot start with an empty length', () => {
      const onStartExtraTime = jest.fn();
      render(<TimerOverlay {...fullTime} onStartExtraTime={onStartExtraTime} />);
      fireEvent.change(minutesInput(), { target: { value: '' } });
      expect(screen.getByTestId('start-extra-time')).toBeDisabled();
    });

    it('is not offered before full time, once extra time exists, or without the handler', () => {
      const { rerender } = render(<TimerOverlay {...baseProps} gameStatus="periodEnd" currentPeriod={1} timeElapsedInSeconds={600} onStartExtraTime={jest.fn()} />);
      expect(screen.queryByTestId('extra-time-panel')).not.toBeInTheDocument();
      rerender(<TimerOverlay {...fullTime} currentPeriod={4} timeElapsedInSeconds={2400} extraTimePeriods={2} extraTimeMinutes={5} onStartExtraTime={jest.fn()} />);
      expect(screen.queryByTestId('extra-time-panel')).not.toBeInTheDocument();
      rerender(<TimerOverlay {...fullTime} />);
      expect(screen.queryByTestId('extra-time-panel')).not.toBeInTheDocument();
    });

    it('labels extra-time periods and their start button', () => {
      const et = { ...baseProps, extraTimePeriods: 2, extraTimeMinutes: 5 };
      const { rerender } = render(<TimerOverlay {...et} gameStatus="inProgress" isTimerRunning currentPeriod={3} timeElapsedInSeconds={1300} />);
      expect(screen.getByText(/^(ET|JA) 1\/2$/)).toBeInTheDocument();
      rerender(<TimerOverlay {...et} gameStatus="periodEnd" currentPeriod={3} timeElapsedInSeconds={1500} />);
      expect(screen.getByTestId('tour-timer-startpause')).toHaveTextContent(/Start extra time 2|Aloita jatkoajan 2/);
    });
  });

  describe('goal and sub-timer buttons (onboarding v3)', () => {
    /** D16: the team's goal button is "Goal for us" and hands straight to the host. */
    it('"Goal for us" calls the goal handler in one tap', () => {
      render(<TimerOverlay {...baseProps} gameStatus="inProgress" />);
      fireEvent.click(screen.getByRole('button', { name: 'Goal for us' }));
      expect(baseProps.onToggleGoalLogModal).toHaveBeenCalledTimes(1);
    });

    /** D13: the button restarts the interval countdown; it records no substitution. */
    it('labels the interval reset "Reset sub timer" and hides it when the host asks', () => {
      const { unmount } = render(<TimerOverlay {...baseProps} gameStatus="inProgress" isTimerRunning />);
      fireEvent.click(screen.getByRole('button', { name: 'Reset sub timer' }));
      expect(baseProps.onSubstitutionMade).toHaveBeenCalledTimes(1);
      unmount();

      render(<TimerOverlay {...baseProps} gameStatus="inProgress" isTimerRunning showSubTimerReset={false} />);
      expect(screen.queryByRole('button', { name: 'Reset sub timer' })).not.toBeInTheDocument();
    });
  });
});
