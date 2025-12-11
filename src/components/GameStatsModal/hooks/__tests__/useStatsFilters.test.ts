import { renderHook, act } from '@testing-library/react';
import { useStatsFilters } from '../useStatsFilters';

describe('useStatsFilters', () => {
  const assertDefaults = (result: ReturnType<typeof renderHook>['result']) => {
    expect(result.current.filters.selectedSeasonIdFilter).toBe('all');
    expect(result.current.filters.selectedTournamentIdFilter).toBe('all');
    expect(result.current.filters.selectedTeamIdFilter).toBe('all');
    expect(result.current.filters.selectedSeriesIdFilter).toBe('all');
    expect(result.current.filters.selectedGameTypeFilter).toBe('all');
    expect(result.current.filters.selectedClubSeason).toBe('all');
  };

  it('resets all filters when activeTab changes', () => {
    const { result, rerender } = renderHook(
      ({ activeTab }) => useStatsFilters({ activeTab }),
      { initialProps: { activeTab: 'overall' as const } }
    );

    // mutate filters away from defaults
    act(() => {
      result.current.handlers.onSeasonFilterChange('season-1');
      result.current.handlers.onTournamentFilterChange('tour-1');
      result.current.handlers.onTeamFilterChange('team-1');
      result.current.handlers.onSeriesFilterChange('series-1');
      result.current.handlers.onGameTypeFilterChange('soccer');
      result.current.handlers.onClubSeasonChange('club-2024');
    });

    expect(result.current.filters.selectedSeasonIdFilter).toBe('season-1');
    expect(result.current.filters.selectedTournamentIdFilter).toBe('tour-1');
    expect(result.current.filters.selectedTeamIdFilter).toBe('team-1');
    expect(result.current.filters.selectedSeriesIdFilter).toBe('series-1');
    expect(result.current.filters.selectedGameTypeFilter).toBe('soccer');
    expect(result.current.filters.selectedClubSeason).toBe('club-2024');

    // Changing the active tab should reset to defaults
    rerender({ activeTab: 'season' });
    assertDefaults(result);
  });

  it('clears collapsible filters with clearCollapsibleFilters respecting flags', () => {
    const { result } = renderHook(() => useStatsFilters({ activeTab: 'tournament' }));

    act(() => {
      result.current.handlers.onSeriesFilterChange('series-1');
      result.current.handlers.onTeamFilterChange('team-1');
      result.current.handlers.onGameTypeFilterChange('futsal');
      result.current.handlers.onClubSeasonChange('club-2024');
    });

    // Clear only series + game type, leave team/club season untouched
    act(() => {
      result.current.handlers.clearCollapsibleFilters({
        resetSeries: true,
        resetTeam: false,
        resetGameType: true,
        resetClubSeason: false,
      });
    });

    expect(result.current.filters.selectedSeriesIdFilter).toBe('all');
    expect(result.current.filters.selectedGameTypeFilter).toBe('all');
    expect(result.current.filters.selectedTeamIdFilter).toBe('team-1');
    expect(result.current.filters.selectedClubSeason).toBe('club-2024');
  });

  it('resets series when tournament changes', () => {
    const { result } = renderHook(() => useStatsFilters({ activeTab: 'tournament' }));

    act(() => {
      result.current.handlers.onSeriesFilterChange('series-1');
    });
    expect(result.current.filters.selectedSeriesIdFilter).toBe('series-1');

    act(() => {
      result.current.handlers.onTournamentFilterChange('tour-2');
    });
    expect(result.current.filters.selectedSeriesIdFilter).toBe('all');
    expect(result.current.filters.selectedTournamentIdFilter).toBe('tour-2');
  });
});
