/**
 * Review 7.L4: the empty table said "No Players Match Filter" even with no name
 * filter typed - as if the coach had filtered something out.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { PlayerStatsTable } from '../PlayerStatsTable';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}));

const props = {
  playerStats: [],
  sortColumn: 'totalScore' as const,
  sortDirection: 'desc' as const,
  totals: { gamesPlayed: 0, goals: 0, assists: 0, totalScore: 0 },
  onSort: jest.fn(),
  onPlayerRowClick: jest.fn(),
};

describe('PlayerStatsTable empty state', () => {
  it('says there is nothing for this selection when no name filter is typed', () => {
    render(<PlayerStatsTable {...props} />);
    expect(screen.getByText('No player statistics for this selection.')).toBeInTheDocument();
    expect(screen.queryByText('No Players Match Filter')).not.toBeInTheDocument();
  });

  it('says no players match when a name filter is typed', () => {
    render(<PlayerStatsTable {...props} hasNameFilter />);
    expect(screen.getByText('No Players Match Filter')).toBeInTheDocument();
  });
});
