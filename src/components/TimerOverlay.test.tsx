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

    it('does not show the block before the game starts', () => {
      render(<TimerOverlay {...baseProps} gameStatus="notStarted" plannedSubGroup={group} />);
      expect(screen.queryByTestId('planned-sub-group')).not.toBeInTheDocument();
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
});
