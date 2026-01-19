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
});
