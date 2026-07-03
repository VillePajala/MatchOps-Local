import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import PlanSubsEditor from './PlanSubsEditor';
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
];

// GK=Alex started; Sam and Jo are on the bench.
const makeGame = (subs: PlanGame['subs'] = []): PlanGame => ({
  id: 'g1',
  label: 'Game 1',
  formationId: '5v5-2-2',
  numberOfPeriods: 2,
  periodMinutes: 12,
  included: true,
  startingSlots: [{ slotId: 'gk', playerId: 'p1' }],
  subs,
});

afterEach(() => cleanup());

describe('PlanSubsEditor', () => {
  it('adds a substitution at the default half-time minute', () => {
    const onAdd = jest.fn();
    render(<PlanSubsEditor game={makeGame()} players={players} onAdd={onAdd} onRemove={jest.fn()} />);

    // Two selects: position (filled slots) and player-on (bench).
    const [posSelect, inSelect] = screen.getAllByRole('combobox');
    fireEvent.change(posSelect, { target: { value: 'gk' } });
    fireEvent.change(inSelect, { target: { value: 'p2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add substitution' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const sub = onAdd.mock.calls[0][0];
    expect(sub).toMatchObject({ slotId: 'gk', inPlayerId: 'p2', timeSeconds: 12 * 60 });
  });

  it('lists an existing sub and removes it', () => {
    const onRemove = jest.fn();
    const game = makeGame([{ id: 'x1', slotId: 'gk', inPlayerId: 'p2', timeSeconds: 720 }]);
    render(<PlanSubsEditor game={game} players={players} onAdd={jest.fn()} onRemove={onRemove} />);

    expect(screen.getByText(/12' — Sam → GK/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledWith('x1');
  });

  it('prompts to place starters when the lineup is empty', () => {
    const emptyLineup: PlanGame = { ...makeGame(), startingSlots: [] };
    render(<PlanSubsEditor game={emptyLineup} players={players} onAdd={jest.fn()} onRemove={jest.fn()} />);
    expect(screen.getByText('Place your starters first.')).toBeInTheDocument();
  });

  it('excludes the starter and the already-incoming player from the bench options', () => {
    // Alex starts (GK); Sam already coming on -> only Jo remains selectable.
    const game = makeGame([{ id: 'x1', slotId: 'gk', inPlayerId: 'p2', timeSeconds: 720 }]);
    render(<PlanSubsEditor game={game} players={players} onAdd={jest.fn()} onRemove={jest.fn()} />);
    const inSelect = screen.getAllByRole('combobox')[1];
    const optionValues = Array.from(inSelect.querySelectorAll('option')).map((o) => (o as HTMLOptionElement).value);
    expect(optionValues).toEqual(['', 'p3']); // '' = "Choose…", p3 = Jo
  });
});
