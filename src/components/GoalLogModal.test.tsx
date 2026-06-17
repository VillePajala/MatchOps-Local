import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import GoalLogModal, { type GameEvent } from './GoalLogModal';
import { Player } from '@/types';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n.test';
import { ToastProvider } from '@/contexts/ToastProvider';

const players: Player[] = [
  { id: 'p1', name: 'John Doe', nickname: 'John', color: '#fff', isGoalie: false },
  { id: 'p2', name: 'Jane Smith', nickname: 'Jane', color: '#000', isGoalie: false },
];

const defaultGameEvents: GameEvent[] = [
  { id: 'goal-1', type: 'goal', time: 15, scorerId: 'p1', assisterId: 'p2' },
];

const renderModal = (props = {}) =>
  render(
    <I18nextProvider i18n={i18n}>
      <ToastProvider>
        <GoalLogModal
          isOpen={true}
          onClose={jest.fn()}
          onLogGoal={jest.fn()}
          onLogOpponentGoal={jest.fn()}
          availablePlayers={players}
          currentTime={30}
          currentGameId="game-1"
          gameEvents={defaultGameEvents}
          homeScore={1}
          awayScore={0}
          homeOrAway="home"
          onUpdateGameEvent={jest.fn()}
          onDeleteGameEvent={jest.fn()}
          onRecalculateScore={jest.fn()}
          {...props}
        />
      </ToastProvider>
    </I18nextProvider>
  );

describe('GoalLogModal', () => {
  it('calls onLogGoal with selected scorer', () => {
    const onLogGoal = jest.fn();
    renderModal({ onLogGoal });

    fireEvent.change(screen.getByLabelText(/Scorer/i), { target: { value: 'p1' } });
    fireEvent.click(screen.getByRole('button', { name: /Log Goal/i }));

    expect(onLogGoal).toHaveBeenCalledWith('p1', undefined);
  });

  it('calls onLogOpponentGoal with current time', () => {
    const onLogOpponentGoal = jest.fn();
    renderModal({ onLogOpponentGoal });

    fireEvent.click(screen.getByText(/Opponent \+1/i));
    expect(onLogOpponentGoal).toHaveBeenCalledWith(30);
  });

  it('logs an Unknown-scorer goal with an undefined scorer', () => {
    const onLogGoal = jest.fn();
    renderModal({ onLogGoal });

    fireEvent.change(screen.getByLabelText(/Scorer/i), { target: { value: '__unknown__' } });
    fireEvent.click(screen.getByRole('button', { name: /Log Goal/i }));

    expect(onLogGoal).toHaveBeenCalledWith(undefined, undefined);
  });

  it('allows a known assister on an Unknown-scorer goal', () => {
    const onLogGoal = jest.fn();
    renderModal({ onLogGoal });

    fireEvent.change(screen.getByLabelText(/Scorer/i), { target: { value: '__unknown__' } });
    // Assister stays usable even though the scorer is unknown
    expect(screen.getByLabelText(/Assister/i)).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Assister/i), { target: { value: 'p2' } });
    fireEvent.click(screen.getByRole('button', { name: /Log Goal/i }));

    expect(onLogGoal).toHaveBeenCalledWith(undefined, 'p2');
  });

  it('offers to recalculate when the saved score disagrees with the goal log', () => {
    const onRecalculateScore = jest.fn();
    // Goal log has 1 'goal' (our) + 0 opponent → log says 1-0; stored score is 5-0 (drifted).
    renderModal({
      onRecalculateScore,
      gameEvents: [{ id: 'g1', type: 'goal', time: 10, scorerId: 'p1' }],
      homeScore: 5,
      awayScore: 0,
      homeOrAway: 'home',
    });

    fireEvent.click(screen.getByRole('button', { name: /Recalculate score from log/i }));
    // Confirm in the dialog (distinct short label)
    fireEvent.click(screen.getByRole('button', { name: /^Recalculate$/i }));

    expect(onRecalculateScore).toHaveBeenCalled();
  });

  it('does not offer recalculation when the score already matches the log', () => {
    renderModal({
      gameEvents: [{ id: 'g1', type: 'goal', time: 10, scorerId: 'p1' }],
      homeScore: 1,
      awayScore: 0,
      homeOrAway: 'home',
    });

    expect(screen.queryByRole('button', { name: /Recalculate score from log/i })).not.toBeInTheDocument();
  });
});
