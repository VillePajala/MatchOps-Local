/**
 * Unit tests for CollapsibleFilters - focuses on which controls are visible
 * per active tab (the Period / club-season filter in particular).
 * @integration
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CollapsibleFilters } from './CollapsibleFilters';
import type { StatsFiltersState, StatsFiltersHandlers } from '../hooks/useStatsFilters';
import type { StatsTab } from '../types';

const baseFilters: StatsFiltersState = {
  selectedSeasonIdFilter: 'all',
  selectedTournamentIdFilter: 'all',
  selectedTeamIdFilter: 'all',
  selectedSeriesIdFilter: 'all',
  selectedGameTypeFilter: 'all',
  selectedGenderFilter: 'all',
  selectedClubSeason: 'all',
};

const noop = () => {};
const baseHandlers: StatsFiltersHandlers = {
  onSeasonFilterChange: noop,
  onTournamentFilterChange: noop,
  onTeamFilterChange: noop,
  onSeriesFilterChange: noop,
  onGameTypeFilterChange: noop,
  onGenderFilterChange: noop,
  onClubSeasonChange: noop,
  clearCollapsibleFilters: noop,
  resetAllFilters: noop,
};

const renderFilters = (
  activeTab: StatsTab,
  overrides: Partial<React.ComponentProps<typeof CollapsibleFilters>> = {},
) =>
  render(
    <CollapsibleFilters
      activeTab={activeTab}
      seasons={[]}
      tournaments={[]}
      teams={[]}
      filters={baseFilters}
      handlers={baseHandlers}
      onOpenSettings={noop}
      {...overrides}
    />,
  );

// Open the collapsible panel so its inner controls are in the DOM.
const openPanel = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
  });
};

describe('CollapsibleFilters - Period (club-season) visibility', () => {
  it('shows the Period filter on the Friendlies tab', async () => {
    renderFilters('friendlies');
    await openPanel();
    expect(screen.getByText('Period')).toBeInTheDocument();
  });

  it('shows the Period filter on the Overall tab', async () => {
    renderFilters('overall');
    await openPanel();
    expect(screen.getByText('Period')).toBeInTheDocument();
  });

  it('hides the Period filter when onClubSeasonChange is missing', async () => {
    renderFilters('friendlies', { handlers: { ...baseHandlers, onClubSeasonChange: undefined as unknown as StatsFiltersHandlers['onClubSeasonChange'] } });
    await openPanel();
    expect(screen.queryByText('Period')).not.toBeInTheDocument();
  });

  it('hides the Period filter when onOpenSettings is missing', async () => {
    renderFilters('friendlies', { onOpenSettings: undefined });
    await openPanel();
    expect(screen.queryByText('Period')).not.toBeInTheDocument();
  });
});
