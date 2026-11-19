'use client';

/**
 * One filter bar for the whole stats surface.
 *
 * What it replaces had a split personality: some filters sat in the open,
 * others hid behind a button, and WHICH ones depended on the tab - so the same
 * control looked different from one tab to the next and no habit could form.
 * It also applied instantly, so the table jumped while the coach was still
 * setting up, and a badge said "2 filters" without saying which.
 *
 * Here the bar is always one line in the same place. Closed, it spells out what
 * is active in words. Open, every filter for that tab is in one list and
 * nothing recalculates until Apply.
 *
 * The draft lives here, not in useStatsFilters, so the committed state that the
 * rest of the modal reads is untouched until the coach says so.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiAdjustmentsHorizontal, HiChevronDown } from 'react-icons/hi2';
import { Season, Tournament, Team } from '@/types';
import { getSeasonDisplayName, getTournamentDisplayName } from '@/utils/entityDisplayNames';
import { getTeamDisplayName } from '@/utils/teams';
import type { GameType, Gender } from '@/types/game';
import { StatsTab } from '../types';
import { ClubSeasonFilter } from './ClubSeasonFilter';
import type { TranslationKey } from '@/i18n-types';
import type { StatsFiltersHandlers, StatsFiltersState } from '../hooks/useStatsFilters';
import {
  selectStyle,
  labelStyle,
  cardStyle,
  checkboxStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/styles/modalStyles';

interface StatsFilterPanelProps {
  activeTab: StatsTab;
  seasons: Season[];
  tournaments: Tournament[];
  teams: Team[];
  filters: StatsFiltersState;
  handlers: StatsFiltersHandlers;
  availableClubSeasons?: string[];
  hasConfiguredSeasonDates?: boolean;
  /** Settings still in flight: keeps the club-season select disabled and the
      "not configured" nudge quiet until we actually know. */
  isLoadingClubSeasons?: boolean;
  onOpenSettings?: () => void;
  /** The subject of the view (e.g. the player picker) - not a filter. */
  children?: React.ReactNode;
}

const SELECT = selectStyle;
const LABEL = labelStyle;

export function StatsFilterPanel({
  activeTab,
  seasons,
  tournaments,
  teams,
  filters,
  handlers,
  availableClubSeasons = [],
  hasConfiguredSeasonDates = false,
  isLoadingClubSeasons = false,
  onOpenSettings,
  children,
}: StatsFilterPanelProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  /**
   * A tab change closes the panel, during render rather than in an effect.
   *
   * Switching tab resets the filters and changes which ones exist, so a panel
   * left open would be showing the previous tab's question. The first version
   * derived "open" from the tab it was opened on; that closed on the way out
   * but reopened by itself on the way back, carrying a draft the coach never
   * applied. Closing on the change itself has no way back.
   */
  const [tabSeen, setTabSeen] = useState(activeTab);
  if (tabSeen !== activeTab) {
    setTabSeen(activeTab);
    setOpen(false);
  }
  const [draft, setDraft] = useState<StatsFiltersState>(filters);

  const showSeason = activeTab === 'season';
  const showTournament = activeTab === 'tournament';
  const draftTournament = tournaments.find((tour) => tour.id === draft.selectedTournamentIdFilter);
  const showSeries = showTournament && !!draftTournament?.series?.length;
  const showTeam = teams.length > 0 && activeTab !== 'currentGame' && activeTab !== 'player';
  const showSport = activeTab !== 'currentGame';
  const showGender = activeTab !== 'currentGame';
  const showFriendlies = activeTab === 'overall' || activeTab === 'player';
  const showClubSeason =
    !!onOpenSettings && ['season', 'tournament', 'overall', 'player'].includes(activeTab);

  /** What is active, in words, so the closed bar tells the whole story. */
  const summary = useMemo(() => {
    const parts: string[] = [];
    if (showSeason && filters.selectedSeasonIdFilter !== 'all') {
      const s = seasons.find((x) => x.id === filters.selectedSeasonIdFilter);
      if (s) parts.push(getSeasonDisplayName(s));
    }
    if (showTournament && filters.selectedTournamentIdFilter !== 'all') {
      const x = tournaments.find((y) => y.id === filters.selectedTournamentIdFilter);
      if (x) parts.push(getTournamentDisplayName(x));
      const level = x?.series?.find((y) => y.id === filters.selectedSeriesIdFilter);
      if (level) parts.push(t(`common.level${level.level}` as TranslationKey, level.level));
    }
    if (showTeam && filters.selectedTeamIdFilter !== 'all') {
      const team = teams.find((x) => x.id === filters.selectedTeamIdFilter);
      parts.push(
        filters.selectedTeamIdFilter === 'legacy'
          ? t('loadGameModal.legacyGamesFilter', 'Legacy Games')
          : team
            ? getTeamDisplayName(team, seasons, tournaments, { futsalLabel: t('common.gameTypeFutsal', 'Futsal') })
            : '',
      );
    }
    if (showClubSeason && filters.selectedClubSeason !== 'all') {
      // Say it the way ClubSeasonFilter says it. Pushing the raw value put the
      // internal token 'off-season' on screen, untranslated.
      parts.push(
        filters.selectedClubSeason === 'off-season'
          ? t('playerStats.offPeriod', 'Off-Period')
          : `${t('common.year', 'Year')} ${filters.selectedClubSeason}`,
      );
    }
    if (showSport && filters.selectedGameTypeFilter !== 'all') {
      parts.push(
        filters.selectedGameTypeFilter === 'futsal'
          ? t('common.gameTypeFutsal', 'Futsal')
          : t('common.gameTypeSoccer', 'Soccer'),
      );
    }
    if (showGender && filters.selectedGenderFilter !== 'all') {
      parts.push(
        filters.selectedGenderFilter === 'girls'
          ? t('common.genderGirls', 'Girls')
          : t('common.genderBoys', 'Boys'),
      );
    }
    if (showFriendlies && filters.includeFriendlies) {
      parts.push(t('gameStatsModal.friendliesIncluded', 'Friendlies included'));
    }
    return parts.filter(Boolean);
  }, [filters, seasons, tournaments, teams, showSeason, showTournament, showTeam, showClubSeason, showSport, showGender, showFriendlies, t]);

  const apply = useCallback(() => {
    // Tournament first: changing it resets the series, so a series chosen in
    // the same pass would otherwise be wiped straight after being set.
    if (draft.selectedTournamentIdFilter !== filters.selectedTournamentIdFilter) {
      handlers.onTournamentFilterChange(draft.selectedTournamentIdFilter);
    }
    if (draft.selectedSeasonIdFilter !== filters.selectedSeasonIdFilter) {
      handlers.onSeasonFilterChange(draft.selectedSeasonIdFilter);
    }
    if (draft.selectedSeriesIdFilter !== filters.selectedSeriesIdFilter) {
      handlers.onSeriesFilterChange(draft.selectedSeriesIdFilter);
    }
    if (draft.selectedTeamIdFilter !== filters.selectedTeamIdFilter) {
      handlers.onTeamFilterChange(draft.selectedTeamIdFilter);
    }
    if (draft.selectedGameTypeFilter !== filters.selectedGameTypeFilter) {
      handlers.onGameTypeFilterChange(draft.selectedGameTypeFilter);
    }
    if (draft.selectedGenderFilter !== filters.selectedGenderFilter) {
      handlers.onGenderFilterChange(draft.selectedGenderFilter);
    }
    if (draft.selectedClubSeason !== filters.selectedClubSeason) {
      handlers.onClubSeasonChange(draft.selectedClubSeason);
    }
    if (draft.includeFriendlies !== filters.includeFriendlies) {
      handlers.onIncludeFriendliesChange(draft.includeFriendlies);
    }
    setOpen(false);
  }, [draft, filters, handlers]);

  const clear = useCallback(() => {
    // Resets the DRAFT only. Nothing commits without Apply, including this.
    setDraft({
      selectedSeasonIdFilter: 'all',
      selectedTournamentIdFilter: 'all',
      selectedTeamIdFilter: 'all',
      selectedSeriesIdFilter: 'all',
      selectedGameTypeFilter: 'all',
      selectedGenderFilter: 'all',
      selectedClubSeason: 'all',
      includeFriendlies: false,
    });
  }, []);

  /**
   * Escape closes the panel and stops there.
   *
   * GameStatsModal listens for Escape on the document to close itself, so
   * without this a coach mid-edit loses the whole modal and the draft with it.
   * Capture phase, because that handler is already bound by the time this one
   * mounts and bubble-phase listeners on document run in registration order.
   */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  const set = <K extends keyof StatsFiltersState>(key: K, value: StatsFiltersState[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="mt-0.5 mb-5 font-ui">
      {children}
      <button
        type="button"
        onClick={() => {
          // Seed on open, not in an effect: the coach edits from what is on
          // screen, and abandoning the panel leaves the committed filters
          // exactly as they were.
          if (!open) setDraft(filters);
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        data-testid="stats-filter-bar"
        // Active filters are a selection, so the pill takes the amber ring.
        className={`w-full min-h-12 flex items-center gap-3 px-4 rounded-full text-[15px] font-semibold text-ink s1-ghost transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action ${
          summary.length > 0 ? 'shadow-[inset_0_0_0_1.5px_var(--color-action)]!' : ''
        } ${children ? 'mt-3' : ''}`}
      >
        <HiAdjustmentsHorizontal className="w-5 h-5 shrink-0 text-ink-2" aria-hidden="true" />
        <span className="shrink-0">{t('gameStatsModal.filters', 'Filters')}</span>
        {summary.length > 0 && (
          <span className="truncate text-[13px] font-medium text-ink-2" data-testid="stats-filter-summary">
            · {summary.join(', ')}
          </span>
        )}
        <HiChevronDown
          className={`w-[18px] h-[18px] ml-auto shrink-0 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          className={`${cardStyle} mt-2.5 space-y-3.5`}
          data-testid="stats-filter-panel"
        >
          {showSeason && (
            <div>
              <label className={LABEL} htmlFor="filter-season">{t('gameStatsModal.seasonFilterLabel', 'League')}</label>
              <select id="filter-season" className={SELECT} value={draft.selectedSeasonIdFilter}
                onChange={(e) => set('selectedSeasonIdFilter', e.target.value)}>
                <option value="all">{t('gameStatsModal.filterAllSeasons', 'All Leagues')}</option>
                {seasons.map((s) => <option key={s.id} value={s.id}>{getSeasonDisplayName(s)}</option>)}
              </select>
            </div>
          )}

          {showTournament && (
            <div>
              <label className={LABEL} htmlFor="filter-tournament">{t('gameStatsModal.tournamentFilterLabel', 'Tournament')}</label>
              <select id="filter-tournament" className={SELECT} value={draft.selectedTournamentIdFilter}
                onChange={(e) => setDraft((d) => ({ ...d, selectedTournamentIdFilter: e.target.value, selectedSeriesIdFilter: 'all' }))}>
                <option value="all">{t('gameStatsModal.filterAllTournaments', 'All Tournaments')}</option>
                {tournaments.map((x) => <option key={x.id} value={x.id}>{getTournamentDisplayName(x)}</option>)}
              </select>
            </div>
          )}

          {showSeries && (
            <div>
              <label className={LABEL} htmlFor="filter-series">{t('gameStatsModal.seriesFilterLabel', 'Level')}</label>
              <select id="filter-series" className={SELECT} value={draft.selectedSeriesIdFilter}
                onChange={(e) => set('selectedSeriesIdFilter', e.target.value)}>
                <option value="all">{t('gameStatsModal.filterAllSeries', 'All Levels')}</option>
                {/* s.level is a raw enum ('Kilpa'), which has a translation.
                    Rendering it directly showed Finnish to English users. */}
                {draftTournament?.series?.map((s) => (
                  <option key={s.id} value={s.id}>{t(`common.level${s.level}` as TranslationKey, s.level)}</option>
                ))}
              </select>
            </div>
          )}

          {showTeam && (
            <div>
              <label className={LABEL} htmlFor="filter-team">{t('gameStatsModal.teamFilterLabel', 'Team')}</label>
              <select id="filter-team" className={SELECT} value={draft.selectedTeamIdFilter}
                onChange={(e) => set('selectedTeamIdFilter', e.target.value as StatsFiltersState['selectedTeamIdFilter'])}>
                <option value="all">{t('loadGameModal.allTeamsFilter', 'All Teams')}</option>
                <option value="legacy">{t('loadGameModal.legacyGamesFilter', 'Legacy Games')}</option>
                {teams.map((team) => <option key={team.id} value={team.id}>{getTeamDisplayName(team, seasons, tournaments, { futsalLabel: t('common.gameTypeFutsal', 'Futsal') })}</option>)}
              </select>
            </div>
          )}

          {showClubSeason && (
            <div>
              <label className={LABEL} htmlFor="filter-club-season">{t('seasonDetailsModal.clubSeasonLabel', 'Season')}</label>
              {/* The existing control, not a second copy of it - it already
                  handles the not-yet-configured case and its gear button. */}
              <ClubSeasonFilter
                id="filter-club-season"
                selectedSeason={draft.selectedClubSeason}
                onChange={(value) => set('selectedClubSeason', value)}
                seasons={availableClubSeasons}
                hasConfigured={hasConfiguredSeasonDates}
                isLoading={isLoadingClubSeasons}
                onOpenSettings={onOpenSettings ?? (() => {})}
              />
            </div>
          )}

          {showSport && (
            <div>
              <label className={LABEL} htmlFor="filter-sport">{t('common.gameTypeLabel', 'Sport Type')}</label>
              <select id="filter-sport" className={SELECT} value={draft.selectedGameTypeFilter}
                onChange={(e) => set('selectedGameTypeFilter', e.target.value as GameType | 'all')}>
                <option value="all">{t('common.all', 'All')}</option>
                <option value="soccer">{t('common.gameTypeSoccer', 'Soccer')}</option>
                <option value="futsal">{t('common.gameTypeFutsal', 'Futsal')}</option>
              </select>
            </div>
          )}

          {showGender && (
            <div>
              <label className={LABEL} htmlFor="filter-gender">{t('common.genderLabel', 'Gender')}</label>
              <select id="filter-gender" className={SELECT} value={draft.selectedGenderFilter}
                onChange={(e) => set('selectedGenderFilter', e.target.value as Gender | 'all')}>
                <option value="all">{t('common.all', 'All')}</option>
                <option value="boys">{t('common.genderBoys', 'Boys')}</option>
                <option value="girls">{t('common.genderGirls', 'Girls')}</option>
              </select>
            </div>
          )}

          {showFriendlies && (
            /* Lived in the modal header before. A filter that sits apart from
               the other filters is one the coach does not find. */
            <label className="flex items-center gap-3 min-h-11 text-[15px] text-ink cursor-pointer">
              <input
                type="checkbox"
                className={checkboxStyle}
                checked={draft.includeFriendlies}
                onChange={(e) => set('includeFriendlies', e.target.checked)}
                data-testid="stats-filter-friendlies"
              />
              {t('gameStatsModal.includeFriendlies', 'Include friendly matches')}
            </label>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={clear} data-testid="stats-filter-clear"
              className={`${secondaryButtonStyle} flex-1`}>
              {t('gameStatsModal.filtersClear', 'Clear')}
            </button>
            <button type="button" onClick={apply} data-testid="stats-filter-apply"
              className={`${primaryButtonStyle} flex-1`}>
              {t('gameStatsModal.filtersApply', 'Apply')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
