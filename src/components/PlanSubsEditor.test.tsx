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

// Sub CREATION moved to the field's bottom sheet (PlanSubSheet); this editor is
// now the review-and-remove list only.
describe('PlanSubsEditor', () => {
  it('lists an existing sub with who comes on AND off, and removes it', () => {
    const onRemove = jest.fn();
    const game = makeGame([{ id: 'x1', slotId: 'gk', inPlayerId: 'p2', timeSeconds: 720 }]);
    render(<PlanSubsEditor game={game} players={players} onRemove={onRemove} />);

    expect(screen.getByText(/12' Sam in for Alex \(GK\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledWith('x1');
  });

  it('is list-only: no add form (creation lives on the field)', () => {
    render(<PlanSubsEditor game={makeGame()} players={players} onRemove={jest.fn()} />);
    // No dropdown form (and no instruction copy) remains.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText(/To add one/)).not.toBeInTheDocument();
  });

  it('shows the empty state when nothing is scheduled', () => {
    render(<PlanSubsEditor game={makeGame()} players={players} onRemove={jest.fn()} />);
    expect(screen.getByText('No substitutions yet.')).toBeInTheDocument();
  });
});
