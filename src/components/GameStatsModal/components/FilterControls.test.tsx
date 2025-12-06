import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FilterControls } from './FilterControls';
import { Season, Tournament, Team, TournamentSeries } from '@/types';
import { StatsTab } from '../types';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

// Test data factories
const createSeason = (overrides: Partial<Season> = {}): Season => ({
  id: 'season-1',
  name: 'Season 2024',
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  ...overrides,
});

const createTournamentSeries = (overrides: Partial<TournamentSeries> = {}): TournamentSeries => ({
  id: 'series-1',
  level: 'A-sarja',
  ...overrides,
});

const createTournament = (overrides: Partial<Tournament> = {}): Tournament => ({
  id: 'tournament-1',
  name: 'Cup 2024',
  startDate: '2024-06-01',
  endDate: '2024-06-30',
  ...overrides,
});

const createTeam = (overrides: Partial<Team> = {}): Team => ({
  id: 'team-1',
  name: 'Team Alpha',
  createdAt: '2024-01-01',
  ...overrides,
});

interface FilterControlsTestProps {
  activeTab?: StatsTab;
  seasons?: Season[];
  tournaments?: Tournament[];
  teams?: Team[];
  selectedSeasonIdFilter?: string | 'all';
  selectedTournamentIdFilter?: string | 'all';
  selectedTeamIdFilter?: string | 'all' | 'legacy';
  selectedSeriesIdFilter?: string | 'all';
  onSeasonFilterChange?: jest.Mock;
  onTournamentFilterChange?: jest.Mock;
  onTeamFilterChange?: jest.Mock;
  onSeriesFilterChange?: jest.Mock;
}

const defaultProps: FilterControlsTestProps = {
  activeTab: 'currentGame',
  seasons: [],
  tournaments: [],
  teams: [],
  selectedSeasonIdFilter: 'all',
  selectedTournamentIdFilter: 'all',
  selectedTeamIdFilter: 'all',
  selectedSeriesIdFilter: 'all',
  onSeasonFilterChange: jest.fn(),
  onTournamentFilterChange: jest.fn(),
  onTeamFilterChange: jest.fn(),
  onSeriesFilterChange: jest.fn(),
};

const renderFilterControls = (props: Partial<FilterControlsTestProps> = {}) => {
  const mergedProps = { ...defaultProps, ...props };
  return render(<FilterControls {...mergedProps as Required<FilterControlsTestProps>} />);
};

describe('FilterControls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Season Tab', () => {
    it('shows season filter dropdown on season tab', () => {
      const seasons = [
        createSeason({ id: 'season-1', name: 'Season 2024' }),
        createSeason({ id: 'season-2', name: 'Season 2025' }),
      ];
      renderFilterControls({ activeTab: 'season', seasons });

      const seasonSelect = screen.getByDisplayValue('All Seasons');
      expect(seasonSelect).toBeInTheDocument();
      expect(screen.getByText('Season 2024')).toBeInTheDocument();
      expect(screen.getByText('Season 2025')).toBeInTheDocument();
    });

    it('calls onSeasonFilterChange when season selection changes', () => {
      const onSeasonFilterChange = jest.fn();
      const seasons = [createSeason({ id: 'season-1', name: 'Season 2024' })];
      renderFilterControls({ activeTab: 'season', seasons, onSeasonFilterChange });

      const seasonSelect = screen.getByDisplayValue('All Seasons');
      fireEvent.change(seasonSelect, { target: { value: 'season-1' } });

      expect(onSeasonFilterChange).toHaveBeenCalledWith('season-1');
    });

    it('does not show tournament filter on season tab', () => {
      renderFilterControls({
        activeTab: 'season',
        tournaments: [createTournament()],
      });

      expect(screen.queryByText('All Tournaments')).not.toBeInTheDocument();
    });
  });

  describe('Tournament Tab', () => {
    it('shows tournament filter dropdown on tournament tab', () => {
      const tournaments = [
        createTournament({ id: 'tournament-1', name: 'Cup 2024' }),
        createTournament({ id: 'tournament-2', name: 'League 2024' }),
      ];
      renderFilterControls({ activeTab: 'tournament', tournaments });

      const tournamentSelect = screen.getByDisplayValue('All Tournaments');
      expect(tournamentSelect).toBeInTheDocument();
      expect(screen.getByText('Cup 2024')).toBeInTheDocument();
      expect(screen.getByText('League 2024')).toBeInTheDocument();
    });

    it('calls onTournamentFilterChange when tournament selection changes', () => {
      const onTournamentFilterChange = jest.fn();
      const onSeriesFilterChange = jest.fn();
      const tournaments = [createTournament({ id: 'tournament-1', name: 'Cup 2024' })];
      renderFilterControls({
        activeTab: 'tournament',
        tournaments,
        onTournamentFilterChange,
        onSeriesFilterChange,
      });

      const tournamentSelect = screen.getByDisplayValue('All Tournaments');
      fireEvent.change(tournamentSelect, { target: { value: 'tournament-1' } });

      expect(onTournamentFilterChange).toHaveBeenCalledWith('tournament-1');
    });

    it('resets series filter when tournament changes', () => {
      const onTournamentFilterChange = jest.fn();
      const onSeriesFilterChange = jest.fn();
      const tournaments = [createTournament({ id: 'tournament-1', name: 'Cup 2024' })];
      renderFilterControls({
        activeTab: 'tournament',
        tournaments,
        onTournamentFilterChange,
        onSeriesFilterChange,
      });

      const tournamentSelect = screen.getByDisplayValue('All Tournaments');
      fireEvent.change(tournamentSelect, { target: { value: 'tournament-1' } });

      expect(onSeriesFilterChange).toHaveBeenCalledWith('all');
    });

    it('does not show season filter on tournament tab', () => {
      renderFilterControls({
        activeTab: 'tournament',
        seasons: [createSeason()],
      });

      expect(screen.queryByText('All Seasons')).not.toBeInTheDocument();
    });
  });

  describe('Series Filter', () => {
    const tournamentWithSeries = createTournament({
      id: 'tournament-1',
      name: 'Cup 2024',
      series: [
        createTournamentSeries({ id: 'series-a', level: 'A-sarja' }),
        createTournamentSeries({ id: 'series-b', level: 'B-sarja' }),
      ],
    });

    it('shows series dropdown when tournament with series is selected', () => {
      renderFilterControls({
        activeTab: 'tournament',
        tournaments: [tournamentWithSeries],
        selectedTournamentIdFilter: 'tournament-1',
      });

      expect(screen.getByDisplayValue('All Series')).toBeInTheDocument();
      expect(screen.getByText('A-sarja')).toBeInTheDocument();
      expect(screen.getByText('B-sarja')).toBeInTheDocument();
    });

    it('does not show series dropdown when "all" tournaments selected', () => {
      renderFilterControls({
        activeTab: 'tournament',
        tournaments: [tournamentWithSeries],
        selectedTournamentIdFilter: 'all',
      });

      expect(screen.queryByDisplayValue('All Series')).not.toBeInTheDocument();
    });

    it('does not show series dropdown when tournament has no series', () => {
      const tournamentWithoutSeries = createTournament({
        id: 'tournament-1',
        name: 'Cup 2024',
        series: [],
      });
      renderFilterControls({
        activeTab: 'tournament',
        tournaments: [tournamentWithoutSeries],
        selectedTournamentIdFilter: 'tournament-1',
      });

      expect(screen.queryByDisplayValue('All Series')).not.toBeInTheDocument();
    });

    it('does not show series dropdown when tournament series is undefined', () => {
      const tournamentWithUndefinedSeries = createTournament({
        id: 'tournament-1',
        name: 'Cup 2024',
        series: undefined,
      });
      renderFilterControls({
        activeTab: 'tournament',
        tournaments: [tournamentWithUndefinedSeries],
        selectedTournamentIdFilter: 'tournament-1',
      });

      expect(screen.queryByDisplayValue('All Series')).not.toBeInTheDocument();
    });

    it('does not show series dropdown on season tab', () => {
      const seasonWithTournamentHavingSeries = [tournamentWithSeries];
      renderFilterControls({
        activeTab: 'season',
        tournaments: seasonWithTournamentHavingSeries,
        selectedTournamentIdFilter: 'tournament-1',
      });

      expect(screen.queryByDisplayValue('All Series')).not.toBeInTheDocument();
    });

    it('calls onSeriesFilterChange when series selection changes', () => {
      const onSeriesFilterChange = jest.fn();
      renderFilterControls({
        activeTab: 'tournament',
        tournaments: [tournamentWithSeries],
        selectedTournamentIdFilter: 'tournament-1',
        onSeriesFilterChange,
      });

      const seriesSelect = screen.getByDisplayValue('All Series');
      fireEvent.change(seriesSelect, { target: { value: 'series-a' } });

      expect(onSeriesFilterChange).toHaveBeenCalledWith('series-a');
    });
  });

  describe('Team Filter', () => {
    it('shows team filter when teams are available', () => {
      const teams = [
        createTeam({ id: 'team-1', name: 'Team Alpha' }),
        createTeam({ id: 'team-2', name: 'Team Beta' }),
      ];
      renderFilterControls({ activeTab: 'season', teams });

      const teamSelect = screen.getByDisplayValue('All Teams');
      expect(teamSelect).toBeInTheDocument();
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
      expect(screen.getByText('Team Beta')).toBeInTheDocument();
      expect(screen.getByText('Legacy Games')).toBeInTheDocument();
    });

    it('does not show team filter when teams array is empty', () => {
      renderFilterControls({ activeTab: 'season', teams: [] });

      expect(screen.queryByText('All Teams')).not.toBeInTheDocument();
    });

    it('calls onTeamFilterChange when team selection changes', () => {
      const onTeamFilterChange = jest.fn();
      const teams = [createTeam({ id: 'team-1', name: 'Team Alpha' })];
      renderFilterControls({ activeTab: 'season', teams, onTeamFilterChange });

      const teamSelect = screen.getByDisplayValue('All Teams');
      fireEvent.change(teamSelect, { target: { value: 'team-1' } });

      expect(onTeamFilterChange).toHaveBeenCalledWith('team-1');
    });

    it('allows selecting legacy games', () => {
      const onTeamFilterChange = jest.fn();
      const teams = [createTeam({ id: 'team-1', name: 'Team Alpha' })];
      renderFilterControls({ activeTab: 'season', teams, onTeamFilterChange });

      const teamSelect = screen.getByDisplayValue('All Teams');
      fireEvent.change(teamSelect, { target: { value: 'legacy' } });

      expect(onTeamFilterChange).toHaveBeenCalledWith('legacy');
    });
  });

  describe('Grid Layout', () => {
    const tournamentWithSeries = createTournament({
      id: 'tournament-1',
      name: 'Cup 2024',
      series: [createTournamentSeries({ id: 'series-a', level: 'A-sarja' })],
    });
    const teams = [createTeam()];

    it('uses grid-cols-1 when currentGame tab with no filters', () => {
      const { container } = renderFilterControls({ activeTab: 'currentGame' });
      const gridDiv = container.firstChild as HTMLElement;
      expect(gridDiv.className).toContain('grid-cols-1');
    });

    it('uses grid-cols-1 when overall tab with no teams', () => {
      const { container } = renderFilterControls({ activeTab: 'overall', teams: [] });
      const gridDiv = container.firstChild as HTMLElement;
      expect(gridDiv.className).toContain('grid-cols-1');
    });

    it('uses grid-cols-2 for season tab with teams', () => {
      const { container } = renderFilterControls({
        activeTab: 'season',
        seasons: [createSeason()],
        teams,
      });
      const gridDiv = container.firstChild as HTMLElement;
      expect(gridDiv.className).toContain('grid-cols-2');
    });

    it('uses grid-cols-2 for tournament tab without series but with teams', () => {
      const tournamentWithoutSeries = createTournament({ id: 'tournament-1', series: [] });
      const { container } = renderFilterControls({
        activeTab: 'tournament',
        tournaments: [tournamentWithoutSeries],
        selectedTournamentIdFilter: 'tournament-1',
        teams,
      });
      const gridDiv = container.firstChild as HTMLElement;
      expect(gridDiv.className).toContain('grid-cols-2');
    });

    it('uses grid-cols-2 for tournament tab with series but no teams', () => {
      const { container } = renderFilterControls({
        activeTab: 'tournament',
        tournaments: [tournamentWithSeries],
        selectedTournamentIdFilter: 'tournament-1',
        teams: [],
      });
      const gridDiv = container.firstChild as HTMLElement;
      expect(gridDiv.className).toContain('grid-cols-2');
    });

    it('uses grid-cols-3 for tournament tab with series and teams', () => {
      const { container } = renderFilterControls({
        activeTab: 'tournament',
        tournaments: [tournamentWithSeries],
        selectedTournamentIdFilter: 'tournament-1',
        teams,
      });
      const gridDiv = container.firstChild as HTMLElement;
      expect(gridDiv.className).toContain('grid-cols-3');
    });
  });

  describe('Tab-specific Filter Visibility', () => {
    it('shows only team filter on currentGame tab', () => {
      const teams = [createTeam()];
      renderFilterControls({
        activeTab: 'currentGame',
        seasons: [createSeason()],
        tournaments: [createTournament()],
        teams,
      });

      expect(screen.queryByText('All Seasons')).not.toBeInTheDocument();
      expect(screen.queryByText('All Tournaments')).not.toBeInTheDocument();
      expect(screen.getByText('All Teams')).toBeInTheDocument();
    });

    it('shows only team filter on overall tab', () => {
      const teams = [createTeam()];
      renderFilterControls({
        activeTab: 'overall',
        seasons: [createSeason()],
        tournaments: [createTournament()],
        teams,
      });

      expect(screen.queryByText('All Seasons')).not.toBeInTheDocument();
      expect(screen.queryByText('All Tournaments')).not.toBeInTheDocument();
      expect(screen.getByText('All Teams')).toBeInTheDocument();
    });

    it('shows only team filter on player tab', () => {
      const teams = [createTeam()];
      renderFilterControls({
        activeTab: 'player',
        seasons: [createSeason()],
        tournaments: [createTournament()],
        teams,
      });

      expect(screen.queryByText('All Seasons')).not.toBeInTheDocument();
      expect(screen.queryByText('All Tournaments')).not.toBeInTheDocument();
      expect(screen.getByText('All Teams')).toBeInTheDocument();
    });
  });

  describe('Selected Values', () => {
    it('displays the selected season value', () => {
      const seasons = [createSeason({ id: 'season-1', name: 'Season 2024' })];
      renderFilterControls({
        activeTab: 'season',
        seasons,
        selectedSeasonIdFilter: 'season-1',
      });

      const seasonSelect = screen.getByDisplayValue('Season 2024');
      expect(seasonSelect).toBeInTheDocument();
    });

    it('displays the selected tournament value', () => {
      const tournaments = [createTournament({ id: 'tournament-1', name: 'Cup 2024' })];
      renderFilterControls({
        activeTab: 'tournament',
        tournaments,
        selectedTournamentIdFilter: 'tournament-1',
      });

      const tournamentSelect = screen.getByDisplayValue('Cup 2024');
      expect(tournamentSelect).toBeInTheDocument();
    });

    it('displays the selected series value', () => {
      const tournamentWithSeries = createTournament({
        id: 'tournament-1',
        series: [createTournamentSeries({ id: 'series-a', level: 'A-sarja' })],
      });
      renderFilterControls({
        activeTab: 'tournament',
        tournaments: [tournamentWithSeries],
        selectedTournamentIdFilter: 'tournament-1',
        selectedSeriesIdFilter: 'series-a',
      });

      const seriesSelect = screen.getByDisplayValue('A-sarja');
      expect(seriesSelect).toBeInTheDocument();
    });

    it('displays the selected team value', () => {
      const teams = [createTeam({ id: 'team-1', name: 'Team Alpha' })];
      renderFilterControls({
        activeTab: 'season',
        teams,
        selectedTeamIdFilter: 'team-1',
      });

      const teamSelect = screen.getByDisplayValue('Team Alpha');
      expect(teamSelect).toBeInTheDocument();
    });
  });
});
