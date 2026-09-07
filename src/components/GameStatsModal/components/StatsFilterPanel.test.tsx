/**
 * @critical - the point of this panel is that nothing recalculates until the
 * coach says so. What it replaced applied on every change, so the table jumped
 * while they were still setting up.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatsFilterPanel } from './StatsFilterPanel';
import type { StatsFiltersState, StatsFiltersHandlers } from '../hooks/useStatsFilters';
import type { Season, Tournament, Team } from '@/types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback?: string) => fallback ?? _k }),
}));

const filters: StatsFiltersState = {
  selectedSeasonIdFilter: 'all',
  selectedTournamentIdFilter: 'all',
  selectedTeamIdFilter: 'all',
  selectedSeriesIdFilter: 'all',
  selectedGameTypeFilter: 'all',
  selectedGenderFilter: 'all',
  selectedClubSeason: 'all',
};

const makeHandlers = (): StatsFiltersHandlers => ({
  onSeasonFilterChange: jest.fn(),
  onTournamentFilterChange: jest.fn(),
  onTeamFilterChange: jest.fn(),
  onSeriesFilterChange: jest.fn(),
  onGameTypeFilterChange: jest.fn(),
  onGenderFilterChange: jest.fn(),
  onClubSeasonChange: jest.fn(),
  clearCollapsibleFilters: jest.fn(),
  resetAllFilters: jest.fn(),
});

const seasons = [{ id: 's1', name: 'Aluesarja' }] as Season[];
const tournaments = [{ id: 't1', name: 'Cup', series: [{ id: 'x1', level: 'Elite' }] }] as unknown as Tournament[];
const teams = [{ id: 'teamA', name: 'FC Oma' }] as Team[];

const renderPanel = (over: Partial<React.ComponentProps<typeof StatsFilterPanel>> = {}) => {
  const handlers = over.handlers ?? makeHandlers();
  render(
    <StatsFilterPanel
      activeTab="season"
      seasons={seasons}
      tournaments={tournaments}
      teams={teams}
      filters={over.filters ?? filters}
      availableClubSeasons={['24/25']}
      onOpenSettings={jest.fn()}
      {...over}
      handlers={handlers}
    />,
  );
  return handlers;
};

describe('StatsFilterPanel', () => {
  it('starts closed, showing one bar', () => {
    renderPanel();
    expect(screen.getByTestId('stats-filter-bar')).toBeInTheDocument();
    expect(screen.queryByTestId('stats-filter-panel')).not.toBeInTheDocument();
  });

  it('opens and closes on the bar', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('stats-filter-bar'));
    expect(screen.getByTestId('stats-filter-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('stats-filter-bar'));
    expect(screen.queryByTestId('stats-filter-panel')).not.toBeInTheDocument();
  });

  /** The whole reason for the redesign. */
  it('changes nothing until Apply', () => {
    const h = renderPanel();
    fireEvent.click(screen.getByTestId('stats-filter-bar'));
    fireEvent.change(screen.getByLabelText('League'), { target: { value: 's1' } });
    fireEvent.change(screen.getByLabelText('Sport Type'), { target: { value: 'futsal' } });

    expect(h.onSeasonFilterChange).not.toHaveBeenCalled();
    expect(h.onGameTypeFilterChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('stats-filter-apply'));
    expect(h.onSeasonFilterChange).toHaveBeenCalledWith('s1');
    expect(h.onGameTypeFilterChange).toHaveBeenCalledWith('futsal');
  });

  it('closes on Apply', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('stats-filter-bar'));
    fireEvent.click(screen.getByTestId('stats-filter-apply'));
    expect(screen.queryByTestId('stats-filter-panel')).not.toBeInTheDocument();
  });

  it('forgets edits that were never applied', () => {
    const h = renderPanel();
    fireEvent.click(screen.getByTestId('stats-filter-bar'));
    fireEvent.change(screen.getByLabelText('League'), { target: { value: 's1' } });
    fireEvent.click(screen.getByTestId('stats-filter-bar')); // abandon
    fireEvent.click(screen.getByTestId('stats-filter-bar')); // reopen

    expect((screen.getByLabelText('League') as HTMLSelectElement).value).toBe('all');
    expect(h.onSeasonFilterChange).not.toHaveBeenCalled();
  });

  it('Clear resets the draft without committing it', () => {
    const h = renderPanel({ filters: { ...filters, selectedGameTypeFilter: 'futsal' } });
    fireEvent.click(screen.getByTestId('stats-filter-bar'));
    fireEvent.click(screen.getByTestId('stats-filter-clear'));

    expect((screen.getByLabelText('Sport Type') as HTMLSelectElement).value).toBe('all');
    expect(h.onGameTypeFilterChange).not.toHaveBeenCalled();
  });

  /** The closed bar has to say WHAT is active, not just how many. */
  it('spells out the active filters in words', () => {
    renderPanel({ filters: { ...filters, selectedSeasonIdFilter: 's1', selectedGameTypeFilter: 'futsal' } });
    const summary = screen.getByTestId('stats-filter-summary');
    expect(summary).toHaveTextContent('Aluesarja');
    expect(summary).toHaveTextContent('Futsal');
  });

  it('says nothing when nothing is filtered', () => {
    renderPanel();
    expect(screen.queryByTestId('stats-filter-summary')).not.toBeInTheDocument();
  });

  it('offers the level only for a tournament that has levels', () => {
    renderPanel({ activeTab: 'tournament', filters: { ...filters, selectedTournamentIdFilter: 't1' } });
    fireEvent.click(screen.getByTestId('stats-filter-bar'));
    expect(screen.getByLabelText('Level')).toBeInTheDocument();
  });

  it('does not offer a team filter on the player tab', () => {
    renderPanel({ activeTab: 'player' });
    fireEvent.click(screen.getByTestId('stats-filter-bar'));
    expect(screen.queryByLabelText('Team')).not.toBeInTheDocument();
  });
});
