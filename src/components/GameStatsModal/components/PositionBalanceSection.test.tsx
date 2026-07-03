import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PositionBalanceSection } from './PositionBalanceSection';
import type { Player } from '@/types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, def?: string) => def ?? _key }),
}));

const players = [
  { id: 'p1', name: 'Emma' },
  { id: 'p2', name: 'Noah' },
  { id: 'p3', name: 'Aada' },
] as unknown as Player[];

const g = (pp: Record<string, string[]>) => ({ playerPositions: pp });
// Emma: defense every game (narrow). Noah + Aada: varied.
const games = [
  g({ p1: ['cb'], p2: ['st'], p3: ['cm'] }),
  g({ p1: ['cb'], p2: ['cm'], p3: ['cb'] }),
  g({ p1: ['lb'], p2: ['st'], p3: ['st'] }),
];

describe('PositionBalanceSection', () => {
  it('shows the empty state when nothing is recorded', () => {
    render(<PositionBalanceSection games={[]} players={players} />);
    expect(screen.getByText(/No positions recorded/i)).toBeInTheDocument();
  });

  it('renders a row per player, with line counts and a Narrow pill for a single-line player', () => {
    render(<PositionBalanceSection games={games} players={players} />);

    const emmaRow = screen.getByText('Emma').closest('tr')!;
    expect(within(emmaRow).getByText('Narrow')).toBeInTheDocument();
    expect(within(emmaRow).getByText('3')).toBeInTheDocument(); // DEF in all 3 games

    const noahRow = screen.getByText('Noah').closest('tr')!;
    expect(within(noahRow).queryByText('Narrow')).not.toBeInTheDocument();
  });

  it('shows a coverage row', () => {
    render(<PositionBalanceSection games={games} players={players} />);
    expect(screen.getByText('Players')).toBeInTheDocument();
  });

  it('toggles the columns between lines and exact positions', () => {
    render(<PositionBalanceSection games={games} players={players} />);
    // Lines mode
    expect(screen.getByText('DEF')).toBeInTheDocument();
    // Switch to positions -> exact-slot headers (e.g. CB)
    fireEvent.click(screen.getByRole('button', { name: 'Positions' }));
    expect(screen.getByText('CB')).toBeInTheDocument();
    expect(screen.queryByText('DEF')).not.toBeInTheDocument();
  });
});
