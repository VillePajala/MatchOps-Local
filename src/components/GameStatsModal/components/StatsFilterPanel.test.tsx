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

/**
 * The whole real EN dictionary, not a handful of keys.
 *
 * Every earlier round of this component shipped a label pointing at a key that
 * did not exist (`common.team`, `common.all`), and nothing caught it: t()
 * returns the hardcoded English fallback, i18n-validation only compares EN
 * against FI, so a key missing from BOTH files reads as correct in English and
 * as English in Finnish. Resolving against the real file, and recording every
 * miss, is what makes that visible here.
 */
const mockEN: Record<string, string> = (() => {
  const flat: Record<string, string> = {};
  const walk = (node: unknown, prefix: string) => {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (v && typeof v === 'object') walk(v, `${prefix}${k}.`);
      else flat[`${prefix}${k}`] = String(v);
    }
  };
  walk(jest.requireActual('../../../../public/locales/en/common.json'), '');
  return flat;
})();

const mockMissingKeys = new Set<string>();
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      if (!(key in mockEN)) mockMissingKeys.add(key);
      return mockEN[key] ?? fallback ?? key;
    },
  }),
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
  resetAllFilters: jest.fn(),
});

const seasons = [{ id: 's1', name: 'Aluesarja' }] as Season[];
const tournaments = [{ id: 't1', name: 'Cup', series: [{ id: 'x1', level: 'Kilpa' }] }] as unknown as Tournament[];
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

  /**
   * @critical - a level is stored as a raw enum ('Kilpa') that has a
   * translation. The first version of this rendered the enum, so an English
   * coach saw Finnish. The old fixture used 'Elite', which reads the same in
   * both languages and so could never have caught it.
   */
  it('translates the level names rather than showing the raw value', () => {
    renderPanel({ activeTab: 'tournament', filters: { ...filters, selectedTournamentIdFilter: 't1' } });
    fireEvent.click(screen.getByTestId('stats-filter-bar'));
    expect(screen.getByRole('option', { name: 'Competition' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Kilpa' })).not.toBeInTheDocument();
  });

  /**
   * @critical - the "All" options had no key behind them at all, so a Finnish
   * coach read English. A fallback that happens to match the English copy hides
   * exactly this, which is why the mock resolves real keys.
   */
  it('translates the All options rather than relying on a fallback', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('stats-filter-bar'));
    const sport = screen.getByLabelText('Sport Type') as HTMLSelectElement;
    expect(sport.querySelector('option[value="all"]')?.textContent).toBe('All');
  });

  it('asks only for keys that exist in the locale file, on every tab', () => {
    mockMissingKeys.clear();
    for (const tab of ['season', 'tournament', 'overall', 'player', 'currentGame'] as const) {
      const { unmount } = render(
        <StatsFilterPanel
          activeTab={tab}
          seasons={seasons}
          tournaments={tournaments}
          teams={teams}
          filters={{ ...filters, selectedTournamentIdFilter: 't1', selectedTeamIdFilter: 'legacy',
            selectedClubSeason: 'off-season', selectedGameTypeFilter: 'futsal', selectedGenderFilter: 'girls' }}
          handlers={makeHandlers()}
          availableClubSeasons={['24/25', 'off-season']}
          onOpenSettings={jest.fn()}
        />,
      );
      fireEvent.click(screen.getByTestId('stats-filter-bar'));
      unmount();
    }
    expect([...mockMissingKeys]).toEqual([]);
  });

  it('summarises the off-season period in words, not as its internal token', () => {
    renderPanel({ activeTab: 'overall', filters: { ...filters, selectedClubSeason: 'off-season' } });
    const summary = screen.getByTestId('stats-filter-summary').textContent ?? '';
    expect(summary).toContain('Off-Period');
    expect(summary).not.toContain('off-season');
  });

  it('Escape closes the panel and does not reach the modal behind it', () => {
    const outer = jest.fn();
    document.addEventListener('keydown', outer);
    try {
      renderPanel();
      fireEvent.click(screen.getByTestId('stats-filter-bar'));
      expect(screen.getByTestId('stats-filter-panel')).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByTestId('stats-filter-panel')).not.toBeInTheDocument();
      expect(outer).not.toHaveBeenCalled();
      // Closed now, so the next Escape is the modal's to handle.
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(outer).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('keydown', outer);
    }
  });

  it('translates the gender in the closed-bar summary', () => {
    renderPanel({ filters: { ...filters, selectedGenderFilter: 'girls' } });
    const summary = screen.getByTestId('stats-filter-summary');
    expect(summary).toHaveTextContent('Girls');
    expect(summary).not.toHaveTextContent('girls');
  });

  it('does not offer a team filter on the player tab', () => {
    renderPanel({ activeTab: 'player' });
    fireEvent.click(screen.getByTestId('stats-filter-bar'));
    expect(screen.queryByLabelText('Team')).not.toBeInTheDocument();
  });
});
