import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import PlanFieldView from './PlanFieldView';
import type { PlanGame, PlanPlayer } from '@/utils/playtimePlanner/types';

const interpolate = (template: string, options?: Record<string, unknown>): string =>
  options
    ? template.replace(/\{\{(\w+)\}\}/g, (_m, k) => (options[k] !== undefined ? String(options[k]) : `{{${k}}}`))
    : template;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, dv?: string | Record<string, unknown>, opts?: Record<string, unknown>) =>
      typeof dv === 'string' ? interpolate(dv, opts) : '',
  }),
}));

const players: PlanPlayer[] = [
  { id: 'p1', name: 'Alex' },
  { id: 'p2', name: 'Sam' },
  { id: 'p3', name: 'Jo' },
  { id: 'p4', name: 'Max' },
  { id: 'p5', name: 'Kai' },
];

const makeGame = (startingSlots: PlanGame['startingSlots'] = []): PlanGame => ({
  id: 'g1',
  label: 'Game 1',
  formationId: '5v5-2-2', // GK + 4 field = 5 slots
  numberOfPeriods: 2,
  periodMinutes: 12,
  included: true,
  startingSlots,
  subs: [],
});

afterEach(() => cleanup());

describe('PlanFieldView', () => {
  it('assigns a bench player to a tapped empty slot', () => {
    const onAssign = jest.fn();
    render(<PlanFieldView game={makeGame()} players={players} onAssign={onAssign} />);

    // Before selecting a slot, the hint is shown.
    expect(screen.getByText('Tap a position to assign a player.')).toBeInTheDocument();

    // Tap the goalkeeper slot (unique aria-label), then a bench player.
    fireEvent.click(screen.getByLabelText('GK: empty'));
    fireEvent.click(screen.getByRole('button', { name: 'Alex' }));

    expect(onAssign).toHaveBeenCalledWith('gk', 'p1');
  });

  it('clears an occupied slot', () => {
    const onAssign = jest.fn();
    render(
      <PlanFieldView
        game={makeGame([{ slotId: 'gk', playerId: 'p1' }])}
        players={players}
        onAssign={onAssign}
      />,
    );

    // GK slot now shows the player in its label.
    fireEvent.click(screen.getByLabelText('GK: Alex'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onAssign).toHaveBeenCalledWith('gk', null);
  });

  it('excludes assigned players from the bench', () => {
    render(
      <PlanFieldView
        game={makeGame([{ slotId: 'gk', playerId: 'p1' }])}
        players={players}
        onAssign={jest.fn()}
      />,
    );
    // Bench (idle view) lists the unassigned players, not the placed one.
    // (Alex still shows on the pitch disc, so scope the check to the bench.)
    const benchSection = screen.getByText('Bench').parentElement as HTMLElement;
    expect(within(benchSection).queryByText('Alex')).not.toBeInTheDocument();
    expect(within(benchSection).getByText('Sam')).toBeInTheDocument();
  });
});
