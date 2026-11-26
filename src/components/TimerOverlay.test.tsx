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

  /**
   * The score shows the live situation from OUR side: both numbers green while
   * we lead, red while we trail, neutral white when level (0-0 included).
   * Home/away decides which number is ours.
   * @critical
   */
  describe('score colour by live situation', () => {
    const scoreNumerals = (home: number, away: number) => {
      const digits = screen.getAllByTestId('steady-digits').slice(0, 2);
      expect(digits[0]).toHaveTextContent(String(home));
      expect(digits[1]).toHaveTextContent(String(away));
      return digits;
    };

    it.each([
      // [homeOrAway, homeScore, awayScore, expected class]
      ['home', 0, 0, 's1-numeral'],
      ['home', 2, 2, 's1-numeral'],
      ['home', 2, 1, 's1-numeral-win'],
      ['home', 0, 1, 's1-numeral-loss'],
      // Away game: the AWAY number is ours.
      ['away', 0, 1, 's1-numeral-win'],
      ['away', 2, 1, 's1-numeral-loss'],
      ['away', 1, 1, 's1-numeral'],
    ] as const)('%s game %i-%i colours both numbers %s', (homeOrAway, homeScore, awayScore, expected) => {
      render(<TimerOverlay {...baseProps} homeOrAway={homeOrAway} homeScore={homeScore} awayScore={awayScore} />);
      for (const el of scoreNumerals(homeScore, awayScore)) {
        expect(el).toHaveClass(expected);
        for (const other of ['s1-numeral', 's1-numeral-win', 's1-numeral-loss'].filter((c) => c !== expected)) {
          expect(el).not.toHaveClass(other);
        }
      }
    });
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
    const group = {
      timeSeconds: 1500,
      inNames: ['Eino', 'Niilo', 'Veeti'],
      outNames: ['Aapo', 'Elias', 'Leevi'],
      inShortNames: ['Eino', 'Niilo', 'Veeti'],
      outShortNames: ['Aapo', 'Elias', 'Leevi'],
      swapNames: [] as string[],
      swapShortNames: [] as string[],
    };

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

    /**
     * Compact block (owner, 2026-11-19): the short disc names on two arrow
     * lines; screen readers still hear "On"/"Off" and the full names.
     */
    it('shows the short names on arrow lines and keeps the full names for screen readers', () => {
      const named = {
        timeSeconds: 1200,
        inNames: ['Tomas Qvist', 'Muhammed Toor', 'Sauli Siintamo'],
        outNames: ['Jasper Tuulmägi', 'Timo Petrov', 'Jimi Myyrä'],
        inShortNames: ['Tomas', 'Muhammed', 'Sauli'],
        outShortNames: ['Jasper', 'Timo', 'Jimi'],
        swapNames: [],
        swapShortNames: [],
      };
      render(<TimerOverlay {...baseProps} gameStatus="inProgress" plannedSubGroup={named} />);
      const on = screen.getByTestId('planned-sub-on');
      const off = screen.getByTestId('planned-sub-off');
      const visibleText = (el: HTMLElement) =>
        Array.from(el.querySelectorAll('[aria-hidden="true"]')).map((n) => n.textContent).join(' ');
      expect(visibleText(on)).toBe('↑ Tomas, Muhammed, Sauli');
      expect(visibleText(off)).toBe('↓ Jasper, Timo, Jimi');
      const srText = (el: HTMLElement) => el.querySelector('.sr-only')?.textContent;
      expect(srText(on)).toBe('On: Tomas Qvist, Muhammed Toor, Sauli Siintamo');
      expect(srText(off)).toBe('Off: Jasper Tuulmägi, Timo Petrov, Jimi Myyrä');
    });

    /**
     * The goal buttons sit right under start/pause, above the plan and the
     * secondary actions, so they are on the first screen and never end up
     * behind the control capsule (owner, 2026-11-19).
     * @critical
     */
    it('puts the goal buttons under start/pause, before the plan, sub-timer reset and dictation', () => {
      const dictation = {
        isSupported: true, available: true, permission: 'unknown' as const, needsIntro: false,
        isRecording: false, clipCount: 0, lastClip: null,
        start: jest.fn(), stop: jest.fn(), acknowledgeIntro: jest.fn(),
      };
      render(<TimerOverlay {...baseProps} gameStatus="inProgress" plannedSubGroup={group} dictation={dictation} />);
      const order = [
        screen.getByTestId('tour-timer-startpause'),
        screen.getByTestId('tour-log-goal'),
        screen.getByRole('button', { name: /opponent \+1/i }),
        screen.getByTestId('planned-sub-group'),
        screen.getByRole('button', { name: /reset sub timer/i }),
        screen.getByTestId('dictation-hold'),
      ];
      for (let i = 1; i < order.length; i++) {
        expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    });

    it('says how many earlier groups were also due', () => {
      render(<TimerOverlay {...baseProps} gameStatus="inProgress" plannedSubGroup={group} plannedSubsEarlier={2} />);
      expect(screen.getByTestId('planned-sub-group')).toHaveTextContent(/\+2/);
    });

    it('omits the off line when every slot was empty', () => {
      render(<TimerOverlay {...baseProps} gameStatus="inProgress" plannedSubGroup={{ ...group, outNames: [], outShortNames: [] }} />);
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

    /** Review R7: no step-count-looking badge on the hand-off. */
    it('carries no "x/y" count', () => {
      render(<TimerOverlay {...baseProps} gameStatus="gameEnd" onFinishGame={jest.fn()} />);
      expect(screen.getByTestId('timer-finish-game')).not.toHaveTextContent(/\d\/\d/);
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
    const openPanel = () => fireEvent.click(screen.getByTestId('extra-time-link'));

    /** Review R7: a quiet link at full time, not a second amber button. */
    it('starts as a quiet link under the finish hand-off; the panel has no amber button', () => {
      render(<TimerOverlay {...fullTime} onFinishGame={jest.fn()} onStartExtraTime={jest.fn()} />);
      expect(screen.queryByTestId('extra-time-panel')).not.toBeInTheDocument();
      const link = screen.getByTestId('extra-time-link');
      expect(link.className).not.toContain('s1-primary');
      openPanel();
      expect(screen.getByTestId('start-extra-time').className).not.toContain('s1-primary');
      // The finish hand-off stays the only primary action.
      expect(screen.getByTestId('timer-finish-game').className).toContain('s1-primary');
    });

    it('offers extra time at full time, 2 x 15 min by default, and starts it on tap', () => {
      const onStartExtraTime = jest.fn();
      render(<TimerOverlay {...fullTime} onStartExtraTime={onStartExtraTime} />);
      openPanel();
      expect(minutesInput()).toHaveValue(15);
      fireEvent.click(screen.getByTestId('start-extra-time'));
      expect(onStartExtraTime).toHaveBeenCalledWith(2, 15);
    });

    it('takes 1 period and the length typed in; futsal defaults to 5 min', () => {
      const onStartExtraTime = jest.fn();
      render(<TimerOverlay {...fullTime} gameType="futsal" onStartExtraTime={onStartExtraTime} />);
      openPanel();
      expect(minutesInput()).toHaveValue(5);
      const panel = within(screen.getByTestId('extra-time-panel'));
      fireEvent.click(panel.getAllByRole('button', { pressed: false })[0]);
      fireEvent.change(minutesInput(), { target: { value: '10' } });
      fireEvent.click(screen.getByTestId('start-extra-time'));
      expect(onStartExtraTime).toHaveBeenCalledWith(1, 10);
    });

    it('follows the game type until a length is typed (the game can load after mount)', () => {
      const { rerender } = render(<TimerOverlay {...fullTime} onStartExtraTime={jest.fn()} />);
      openPanel();
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
      openPanel();
      fireEvent.change(minutesInput(), { target: { value: '' } });
      expect(screen.getByTestId('start-extra-time')).toBeDisabled();
    });

    it('is not offered before full time, once extra time exists, or without the handler', () => {
      const { rerender } = render(<TimerOverlay {...baseProps} gameStatus="periodEnd" currentPeriod={1} timeElapsedInSeconds={600} onStartExtraTime={jest.fn()} />);
      expect(screen.queryByTestId('extra-time-link')).not.toBeInTheDocument();
      rerender(<TimerOverlay {...fullTime} currentPeriod={4} timeElapsedInSeconds={2400} extraTimePeriods={2} extraTimeMinutes={5} onStartExtraTime={jest.fn()} />);
      expect(screen.queryByTestId('extra-time-link')).not.toBeInTheDocument();
      rerender(<TimerOverlay {...fullTime} />);
      expect(screen.queryByTestId('extra-time-link')).not.toBeInTheDocument();
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

  describe('one sub mechanism at a time (sub timer visibility)', () => {
    const withHistory = {
      ...baseProps,
      gameStatus: 'inProgress' as const,
      isTimerRunning: true,
      timeElapsedInSeconds: 400,
      lastSubTime: 300,
      completedIntervalDurations: [{ period: 1, duration: 300, timestamp: 300 }],
    };

    /**
     * Hidden sub timer: no interval in the info line, no "Since sub", no
     * reset button, no interval history, no sub alert colour on the clock -
     * but the game length still opens the menu with the switch.
     * @critical
     */
    it('hides every part of the interval sub timer when the host says so', () => {
      render(<TimerOverlay {...withHistory} subAlertLevel="due" showSubTimer={false} onShowSubTimerChange={jest.fn()} />);
      const infoButton = screen.getByTestId('timer-sub-interval');
      expect(infoButton).toHaveTextContent('2 × 10 min');
      expect(infoButton).not.toHaveTextContent(/sub 5 min/);
      expect(screen.getByTestId('timer-since-sub')).toBeEmptyDOMElement();
      expect(screen.queryByRole('button', { name: 'Reset sub timer' })).not.toBeInTheDocument();
      expect(screen.queryByText('Play Time History')).not.toBeInTheDocument();
      expect(screen.getByTestId('timer-clock').querySelector('.text-red-400')).toBeNull();

      fireEvent.click(infoButton);
      const menu = screen.getByTestId('timer-interval-menu');
      expect(within(menu).queryByRole('button', { name: /decrease interval/i })).not.toBeInTheDocument();
      expect(within(menu).getByRole('switch', { name: 'Show sub timer' })).not.toBeChecked();
    });

    it('keeps the whole sub timer, alerts and history when shown', () => {
      render(<TimerOverlay {...withHistory} subAlertLevel="due" showSubTimer onShowSubTimerChange={jest.fn()} />);
      expect(screen.getByTestId('timer-sub-interval')).toHaveTextContent(/sub 5 min/);
      expect(screen.getByTestId('timer-since-sub')).toHaveTextContent('01:40');
      expect(screen.getByRole('button', { name: 'Reset sub timer' })).toBeEnabled();
      expect(screen.getByText('Play Time History')).toBeInTheDocument();
      expect(screen.getByTestId('timer-clock').querySelector('.text-red-400')).not.toBeNull();
      fireEvent.click(screen.getByTestId('timer-sub-interval'));
      expect(screen.getByRole('button', { name: /decrease interval/i })).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'Show sub timer' })).toBeChecked();
    });

    it('the menu switch reports the new choice', () => {
      const onShowSubTimerChange = jest.fn();
      render(<TimerOverlay {...withHistory} showSubTimer={false} hasPlan onShowSubTimerChange={onShowSubTimerChange} />);
      fireEvent.click(screen.getByTestId('timer-sub-interval'));
      fireEvent.click(screen.getByRole('switch', { name: 'Show sub timer' }));
      expect(onShowSubTimerChange).toHaveBeenCalledWith(true);
    });

    /** A game without a plan: the menu offers the planner (closing the timer first). */
    it('offers "Make a plan for this game" only for a game without a plan', () => {
      const onOpenPlanner = jest.fn();
      const onClose = jest.fn();
      const { unmount } = render(
        <TimerOverlay {...withHistory} hasPlan={false} onOpenPlanner={onOpenPlanner} onClose={onClose} onShowSubTimerChange={jest.fn()} />,
      );
      fireEvent.click(screen.getByTestId('timer-sub-interval'));
      fireEvent.click(screen.getByRole('button', { name: 'Make a plan for this game' }));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onOpenPlanner).toHaveBeenCalledTimes(1);
      unmount();

      render(<TimerOverlay {...withHistory} hasPlan showSubTimer={false} onOpenPlanner={onOpenPlanner} onShowSubTimerChange={jest.fn()} />);
      fireEvent.click(screen.getByTestId('timer-sub-interval'));
      expect(screen.queryByRole('button', { name: 'Make a plan for this game' })).not.toBeInTheDocument();
    });

    /**
     * A partial plan: nothing planned ahead any more, so the block's place
     * offers the sub timer for the rest of the game.
     * @critical
     */
    it('offers "Show sub timer" where the plan block was once the plan has nothing ahead', () => {
      const onShowSubTimerChange = jest.fn();
      const { rerender } = render(
        <TimerOverlay {...withHistory} hasPlan showSubTimer={false} plannedSubGroup={null} onShowSubTimerChange={onShowSubTimerChange} />,
      );
      fireEvent.click(screen.getByTestId('timer-plan-ended-show-sub-timer'));
      expect(onShowSubTimerChange).toHaveBeenCalledWith(true);

      // Not while a planned change is still on screen, not once the timer shows,
      // not without a plan, and not after full time.
      const group = { timeSeconds: 900, inNames: ['Eino'], outNames: ['Aapo'], inShortNames: ['Eino'], outShortNames: ['Aapo'], swapNames: [], swapShortNames: [] };
      rerender(<TimerOverlay {...withHistory} hasPlan showSubTimer={false} plannedSubGroup={group} onShowSubTimerChange={onShowSubTimerChange} />);
      expect(screen.queryByTestId('timer-plan-ended-show-sub-timer')).not.toBeInTheDocument();
      rerender(<TimerOverlay {...withHistory} hasPlan showSubTimer plannedSubGroup={null} onShowSubTimerChange={onShowSubTimerChange} />);
      expect(screen.queryByTestId('timer-plan-ended-show-sub-timer')).not.toBeInTheDocument();
      rerender(<TimerOverlay {...withHistory} hasPlan={false} showSubTimer={false} plannedSubGroup={null} onShowSubTimerChange={onShowSubTimerChange} />);
      expect(screen.queryByTestId('timer-plan-ended-show-sub-timer')).not.toBeInTheDocument();
      rerender(<TimerOverlay {...withHistory} gameStatus="gameEnd" hasPlan showSubTimer={false} plannedSubGroup={null} onShowSubTimerChange={onShowSubTimerChange} />);
      expect(screen.queryByTestId('timer-plan-ended-show-sub-timer')).not.toBeInTheDocument();
    });
  });

  describe('position swaps in the planned block', () => {
    const base = { timeSeconds: 600, inNames: [], outNames: [], inShortNames: [], outShortNames: [] };
    const visibleText = (el: HTMLElement) =>
      Array.from(el.querySelectorAll('[aria-hidden="true"]')).map((n) => n.textContent).join(' ');

    it('a pure swap is one swap line, with no on or off line', () => {
      render(<TimerOverlay {...baseProps} gameStatus="inProgress" plannedSubGroup={{ ...base, swapNames: ['Väinö Virta', 'Onni Oja'], swapShortNames: ['Väinö', 'Onni'] }} />);
      expect(screen.queryByTestId('planned-sub-on')).not.toBeInTheDocument();
      expect(screen.queryByTestId('planned-sub-off')).not.toBeInTheDocument();
      const swap = screen.getByTestId('planned-sub-swap');
      expect(visibleText(swap)).toBe('↔ Väinö and Onni swap positions');
      expect(swap.querySelector('.sr-only')).toHaveTextContent('Väinö Virta and Onni Oja swap positions');
    });

    it('a swap next to a real sub keeps the on/off lines for the real change', () => {
      render(
        <TimerOverlay
          {...baseProps}
          gameStatus="inProgress"
          plannedSubGroup={{ ...base, inNames: ['Eino'], inShortNames: ['Eino'], outNames: ['Aapo'], outShortNames: ['Aapo'], swapNames: ['Väinö', 'Onni'], swapShortNames: ['Väinö', 'Onni'] }}
        />,
      );
      expect(visibleText(screen.getByTestId('planned-sub-on'))).toBe('↑ Eino');
      expect(visibleText(screen.getByTestId('planned-sub-off'))).toBe('↓ Aapo');
      expect(visibleText(screen.getByTestId('planned-sub-swap'))).toBe('↔ Väinö and Onni swap positions');
    });

    it('one player changing position, and a rotation of three, read naturally', () => {
      const { rerender } = render(<TimerOverlay {...baseProps} gameStatus="inProgress" plannedSubGroup={{ ...base, swapNames: ['Bo'], swapShortNames: ['Bo'] }} />);
      expect(visibleText(screen.getByTestId('planned-sub-swap'))).toBe('↔ Bo changes position');
      rerender(<TimerOverlay {...baseProps} gameStatus="inProgress" plannedSubGroup={{ ...base, swapNames: ['A', 'B', 'C'], swapShortNames: ['A', 'B', 'C'] }} />);
      expect(visibleText(screen.getByTestId('planned-sub-swap'))).toBe('↔ Swapping positions: A, B, C');
    });
  });
});
