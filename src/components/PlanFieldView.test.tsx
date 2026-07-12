import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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
    expect(
      screen.getByText('Tap a player to place them, or a position first.'),
    ).toBeInTheDocument();

    // Tap the goalkeeper slot (unique aria-label), then a bench player.
    fireEvent.click(screen.getByLabelText('GK: empty'));
    fireEvent.click(screen.getByRole('button', { name: 'Alex' }));

    expect(onAssign).toHaveBeenCalledWith('gk', 'p1');
  });

  it('quick-places a bench player into the first empty outfield slot (not the GK)', () => {
    const onAssign = jest.fn();
    render(<PlanFieldView game={makeGame()} players={players} onAssign={onAssign} />);

    // No slot selected: tapping a bench player drops them into the first empty
    // slot, skipping the goalkeeper so nobody is silently made the keeper.
    fireEvent.click(screen.getByRole('button', { name: 'Sam' }));
    expect(onAssign).toHaveBeenCalledTimes(1);
    expect(onAssign).toHaveBeenCalledWith('s0', 'p2');
  });

  it('auto-fills every empty slot from the bench', () => {
    const onAssign = jest.fn();
    render(<PlanFieldView game={makeGame()} players={players} onAssign={onAssign} />);

    fireEvent.click(screen.getByRole('button', { name: 'Auto-fill' }));
    // 5 slots (GK + 4 field), 5 bench players → all slots filled, distinct players.
    expect(onAssign).toHaveBeenCalledTimes(5);
    const assignedPlayers = onAssign.mock.calls.map((c) => c[1]);
    expect(new Set(assignedPlayers).size).toBe(5);
  });

  it('shows a sub badge on a slot that has a planned substitution', () => {
    const game: PlanGame = {
      ...makeGame([{ slotId: 'gk', playerId: 'p1' }]),
      subs: [{ id: 's1', slotId: 'gk', timeSeconds: 6 * 60, inPlayerId: 'p2' }],
    };
    render(<PlanFieldView game={game} players={players} onAssign={jest.fn()} />);
    // The badge marks the scheduled change on the pitch (minute + incoming player).
    expect(screen.getByText(/⇄ 6'/)).toBeInTheDocument();
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

  it('shows cumulative plan minutes on bench chips and filled discs when provided', () => {
    render(
      <PlanFieldView
        game={makeGame([{ slotId: 'gk', playerId: 'p1' }])}
        players={players}
        onAssign={jest.fn()}
        minutesByPlayer={{
          p1: { minutes: 42, band: 'fair' },
          p2: { minutes: 6, band: 'under' },
        }}
      />,
    );
    // Bench chip: name + tinted minutes (number AND colour, never colour alone).
    expect(screen.getByRole('button', { name: /Sam 6'/ })).toBeInTheDocument();
    // Filled disc: minutes under the disc.
    expect(screen.getByText("42'")).toBeInTheDocument();
  });

  it('excludes assigned players from the bench', () => {
    render(
      <PlanFieldView
        game={makeGame([{ slotId: 'gk', playerId: 'p1' }])}
        players={players}
        onAssign={jest.fn()}
      />,
    );
    // Bench buttons list the unassigned players, not the placed one. Alex sits on
    // the GK disc (accessible name "GK: Alex"), so there is no bench button "Alex".
    expect(screen.queryByRole('button', { name: 'Alex' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sam' })).toBeInTheDocument();
  });
});
