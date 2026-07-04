import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, cleanup, within } from '@testing-library/react';
import PlanBalanceView from './PlanBalanceView';
import type { PlaytimePlan, PlanGame } from '@/utils/playtimePlanner/types';

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

// One 24-min game, 5v5-2-2 (5 slots). Alex plays the whole game as GK; the four
// others never take the field -> Alex at 100% of a 24' fair share, the rest at 0%.
const game = (overrides: Partial<PlanGame> = {}): PlanGame => ({
  id: 'g1',
  label: 'Game 1',
  formationId: '5v5-2-2',
  numberOfPeriods: 2,
  periodMinutes: 12,
  included: true,
  startingSlots: [{ slotId: 'gk', playerId: 'p1' }],
  subs: [],
  ...overrides,
});

const plan = (games: PlanGame[]): PlaytimePlan => ({
  id: 'p',
  name: 'Plan',
  version: 1,
  createdAt: 'x',
  updatedAt: 'x',
  players: [
    { id: 'p1', name: 'Alex' },
    { id: 'p2', name: 'Sam' },
    { id: 'p3', name: 'Jo' },
    { id: 'p4', name: 'Max' },
    { id: 'p5', name: 'Kai' },
  ],
  games,
});

afterEach(() => cleanup());

describe('PlanBalanceView', () => {
  it('shows the fair share and counted games', () => {
    render(<PlanBalanceView plan={plan([game()])} />);
    // available = 24min × 5 slots = 120 / 5 players = 24' fair share.
    expect(screen.getByText("Share 24' each · 1 games counted")).toBeInTheDocument();
  });

  it('sorts worst-off first, Alex (at fair share) last', () => {
    render(<PlanBalanceView plan={plan([game()])} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(5);
    // Worst-off (0%) first; Alex at 100% of fair share is last.
    expect(within(items[0]).getByText('0% of share')).toBeInTheDocument();
    expect(within(items[items.length - 1]).getByText('Alex')).toBeInTheDocument();
    expect(within(items[items.length - 1]).getByText('100% of share')).toBeInTheDocument();
  });

  it('warns about players not playing an included game', () => {
    render(<PlanBalanceView plan={plan([game()])} />);
    // Sam/Jo/Max/Kai never take the field -> flagged as not playing Game 1.
    expect(screen.getAllByText('Not playing: Game 1').length).toBeGreaterThan(0);
  });

  it('reports no games counted when none are included', () => {
    render(<PlanBalanceView plan={plan([game({ included: false })])} />);
    expect(screen.getByText('No games counted yet. Mark games as included.')).toBeInTheDocument();
  });
});
