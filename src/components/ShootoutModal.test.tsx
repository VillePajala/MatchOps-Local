import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ShootoutModal from './ShootoutModal';
import type { Player } from '@/types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, def?: string) => def ?? _key }),
}));

const players = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
] as unknown as Player[];

const renderModal = (overrides: Partial<React.ComponentProps<typeof ShootoutModal>> = {}) => {
  const onSave = jest.fn();
  const onClose = jest.fn();
  render(
    <ShootoutModal
      isOpen
      onClose={onClose}
      availablePlayers={players}
      initialKicks={[]}
      homeOrAway="home"
      onSave={onSave}
      {...overrides}
    />
  );
  return { onSave, onClose };
};

describe('ShootoutModal', () => {
  it('does not render when closed', () => {
    render(
      <ShootoutModal isOpen={false} onClose={jest.fn()} availablePlayers={players} initialKicks={[]} homeOrAway="home" onSave={jest.fn()} />
    );
    expect(screen.queryByText('Penalty Shootout')).not.toBeInTheDocument();
  });

  it('builds the tally from logged kicks and shows the winner', () => {
    renderModal();
    // Your section is rendered before the opponent section, so index 0 = yours.
    const scoredButtons = screen.getAllByRole('button', { name: 'Scored' });
    const missedButtons = screen.getAllByRole('button', { name: 'Missed' });

    fireEvent.click(scoredButtons[0]); // your kick scored → 1-0
    fireEvent.click(missedButtons[1]); // opponent kick missed → still 1-0

    expect(screen.getByText('1 - 0')).toBeInTheDocument();
    expect(screen.getByText('You win the shootout')).toBeInTheDocument();
  });

  it('shows tied state when level', () => {
    renderModal();
    fireEvent.click(screen.getAllByRole('button', { name: 'Scored' })[0]); // you 1
    fireEvent.click(screen.getAllByRole('button', { name: 'Scored' })[1]); // opp 1
    expect(screen.getByText('1 - 1')).toBeInTheDocument();
    expect(screen.getByText('Tied — keep logging until decided')).toBeInTheDocument();
  });

  it('saves the logged kicks (with team + scored) on Save', () => {
    const { onSave } = renderModal();
    fireEvent.click(screen.getAllByRole('button', { name: 'Scored' })[0]); // your home kick
    fireEvent.click(screen.getAllByRole('button', { name: 'Missed' })[1]); // opponent away kick
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const kicks = onSave.mock.calls[0][0];
    expect(kicks).toHaveLength(2);
    expect(kicks[0]).toMatchObject({ team: 'home', scored: true, order: 0 });
    expect(kicks[1]).toMatchObject({ team: 'away', scored: false, order: 1 });
  });

  it('lets you remove a logged kick', () => {
    renderModal();
    fireEvent.click(screen.getAllByRole('button', { name: 'Scored' })[0]);
    expect(screen.getByText('1 - 0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove kick' }));
    expect(screen.getByText('0 - 0')).toBeInTheDocument();
  });
});
