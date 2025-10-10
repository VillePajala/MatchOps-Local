import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import GoalLogModal, { type GameEvent } from './GoalLogModal';
import { Player } from '@/types';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n.test';

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
      <GoalLogModal
        isOpen={true}
        onClose={jest.fn()}
        onLogGoal={jest.fn()}
        onLogOpponentGoal={jest.fn()}
        availablePlayers={players}
        currentTime={30}
        currentGameId="game-1"
        gameEvents={defaultGameEvents}
        onUpdateGameEvent={jest.fn()}
        onDeleteGameEvent={jest.fn()}
        {...props}
      />
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
});
