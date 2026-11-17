'use client';

/**
 * The official-league dropdown with its Level and Area filters (review 7.L11).
 * Match details had the filters; New Game listed all ~45 leagues unfiltered. One
 * component now serves both.
 *
 * The filters are a BROWSE control (CR-M4): they only narrow the visible list and
 * never change or clear the chosen league, which stays shown even when the
 * filters would hide it.
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FINNISH_YOUTH_LEAGUES,
  CUSTOM_LEAGUE_ID,
  LEAGUE_AREA_FILTERS,
  LEAGUE_LEVEL_FILTERS,
  getLeagueById,
  type LeagueAreaFilter,
  type LeagueLevelFilter,
} from '@/config/leagues';
import type { TranslationKey } from '@/i18n-types';

export interface LeagueSelectWithFiltersProps {
  /** id of the league <select> (its label points here). */
  id: string;
  /** Suffix of the filter selects' ids: league-level-filter-{suffix}, league-area-filter-{suffix}. */
  filterIdSuffix: string;
  value: string;
  onChange: (leagueId: string) => void;
  placeholder: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLSelectElement>) => void;
}

export default function LeagueSelectWithFilters({
  id,
  filterIdSuffix,
  value,
  onChange,
  placeholder,
  onKeyDown,
}: LeagueSelectWithFiltersProps) {
  const { t } = useTranslation();
  const [areaFilter, setAreaFilter] = useState<LeagueAreaFilter>('all');
  const [levelFilter, setLevelFilter] = useState<LeagueLevelFilter>('all');

  // When the league changes (the modal opens on a game's league, a season fills one
  // in, or the coach picks one), the filters move to it so it is never hidden.
  // Changing a filter does not change the value, so browsing is left alone.
  // Adjusted during render on a value change (React's pattern for state derived
  // from a changing prop), not in an effect.
  const [alignedTo, setAlignedTo] = useState<string | null>(null);
  if (value !== alignedTo) {
    setAlignedTo(value);
    const league = value && value !== CUSTOM_LEAGUE_ID ? getLeagueById(value) : undefined;
    if (league) {
      // Leagues without level/area metadata show under "all".
      setLevelFilter((league.level as LeagueLevelFilter) || 'all');
      setAreaFilter((league.area as LeagueAreaFilter) || 'all');
    }
  }

  const filteredLeagues = useMemo(
    () =>
      FINNISH_YOUTH_LEAGUES.filter((league) => {
        // Always include the custom option.
        if (league.isCustom) return true;
        if (levelFilter !== 'all' && league.level !== levelFilter) return false;
        // The area filter applies only to leagues that have an area (regional/local);
        // national and other leagues pass it.
        if (areaFilter !== 'all' && league.area) return league.area === areaFilter;
        return true;
      }),
    [areaFilter, levelFilter],
  );

  // Keep the chosen league visible when the filters would exclude it (CR-M4).
  const hiddenSelected =
    value && value !== CUSTOM_LEAGUE_ID && !filteredLeagues.some((l) => l.id === value) ? getLeagueById(value) : undefined;

  const filterClass =
    'w-full px-2 py-1.5 bg-slate-600 border border-slate-500 rounded text-sm text-white focus:ring-indigo-500 focus:border-indigo-500';

  return (
    <>
      <div className="flex gap-2 mb-2">
        <div className="flex-1">
          <label htmlFor={`league-level-filter-${filterIdSuffix}`} className="sr-only">
            {t('leagues.filterByLevel', 'Filter by level')}
          </label>
          <select
            id={`league-level-filter-${filterIdSuffix}`}
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as LeagueLevelFilter)}
            className={filterClass}
          >
            {LEAGUE_LEVEL_FILTERS.map((level) => (
              <option key={level.id} value={level.id}>
                {t(level.labelKey as TranslationKey, level.id === 'all' ? 'All Levels' : level.id)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label htmlFor={`league-area-filter-${filterIdSuffix}`} className="sr-only">
            {t('leagues.filterByArea', 'Filter by area')}
          </label>
          <select
            id={`league-area-filter-${filterIdSuffix}`}
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value as LeagueAreaFilter)}
            className={filterClass}
          >
            {LEAGUE_AREA_FILTERS.map((area) => (
              <option key={area.id} value={area.id}>
                {t(area.labelKey as TranslationKey, area.id === 'all' ? 'All Areas' : area.id)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
      >
        <option value="">{placeholder}</option>
        {hiddenSelected && <option value={hiddenSelected.id}>{hiddenSelected.name}</option>}
        {filteredLeagues.map((league) => (
          <option key={league.id} value={league.id}>{league.name}</option>
        ))}
      </select>
      {(areaFilter !== 'all' || levelFilter !== 'all') && (
        <p className="mt-1 text-sm text-slate-400">
          {t('leagues.showingCount', '{{count}} leagues', { count: filteredLeagues.filter((l) => !l.isCustom).length })}
        </p>
      )}
    </>
  );
}
