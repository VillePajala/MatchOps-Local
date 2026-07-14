import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import PlanSubSheet from './PlanSubSheet';
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

// GK=Alex started; Sam and Jo are the bench candidates.
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

describe('PlanSubSheet', () => {
  it('lists subs already planned for the slot and removes one in place', () => {
    const onRemove = jest.fn();
    const game = makeGame([
      { id: 'x1', slotId: 'gk', inPlayerId: 'p2', timeSeconds: 12 * 60 },
      { id: 'x2', slotId: 's0', inPlayerId: 'p3', timeSeconds: 6 * 60 },
    ]);
    render(
      <PlanSubSheet
        game={game}
        slotId="gk"
        players={players}
        onAdd={jest.fn()}
        onRemove={onRemove}
        onClose={jest.fn()}
      />,
    );
    // Only THIS slot's planned change is listed (s0's is not).
    expect(screen.getByText(/12' Sam/)).toBeInTheDocument();
    expect(screen.queryByText(/6' Jo/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledWith('x1');
    // The clicked button unmounts with its row - focus must be parked back on
    // the sheet dialog, not dropped to <body> (where the next Tab could escape
    // into the parent modal while the sheet is still open).
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('names the position + outgoing player and pre-fills the minute to half-time', () => {
    render(
      <PlanSubSheet game={makeGame()} slotId="gk" players={players} onAdd={jest.fn()} onClose={jest.fn()} />,
    );
    expect(screen.getByRole('dialog', { name: 'Substitution · GK (Alex)' })).toBeInTheDocument();
    // 2 × 12 min game -> half-time = 12'.
    expect(screen.getByText("12'")).toBeInTheDocument();
    expect(screen.getByText('half-time')).toBeInTheDocument();
  });

  it('creates the sub with the stepped minute on a single bench tap, then closes', () => {
    const onAdd = jest.fn();
    const onClose = jest.fn();
    render(
      <PlanSubSheet game={makeGame()} slotId="gk" players={players} onAdd={onAdd} onClose={onClose} />,
    );
    // Step 12' -> 10' and pick Sam: two taps total after opening.
    fireEvent.click(screen.getByRole('button', { name: '-1' }));
    fireEvent.click(screen.getByRole('button', { name: '-1' }));
    fireEvent.click(screen.getByRole('button', { name: /Sam/ }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0]).toMatchObject({ slotId: 'gk', inPlayerId: 'p2', timeSeconds: 10 * 60 });
    expect(onClose).toHaveBeenCalled();
  });

  it('clamps the minute strictly below the final whistle', () => {
    // 2×12 min game: max is 23' - a sub AT 24' would grant zero seconds and
    // silently defeat the full-game bench alarm.
    render(
      <PlanSubSheet game={makeGame()} slotId="gk" players={players} onAdd={jest.fn()} onClose={jest.fn()} />,
    );
    const plus = screen.getByRole('button', { name: '+1' });
    for (let i = 0; i < 30; i++) fireEvent.click(plus);
    expect(screen.getByText("23'")).toBeInTheDocument();
  });

  it('excludes players already coming on, and shows tinted cumulative minutes', () => {
    const game = makeGame([{ id: 'x1', slotId: 'gk', inPlayerId: 'p2', timeSeconds: 720 }]);
    render(
      <PlanSubSheet
        game={game}
        slotId="gk"
        players={players}
        minutesByPlayer={{ p3: { minutes: 6, ratio: 0.3 } }}
        onAdd={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    // Sam is already scheduled in -> only Jo remains, carrying his total.
    expect(screen.queryByRole('button', { name: /Sam/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Jo 6'/ })).toBeInTheDocument();
  });

  it('closes on backdrop tap without creating anything', () => {
    const onAdd = jest.fn();
    const onClose = jest.fn();
    render(
      <PlanSubSheet game={makeGame()} slotId="gk" players={players} onAdd={onAdd} onClose={onClose} />,
    );
    fireEvent.click(screen.getByTestId('plan-sub-sheet-backdrop'));
    expect(onClose).toHaveBeenCalled();
    expect(onAdd).not.toHaveBeenCalled();
  });
});
