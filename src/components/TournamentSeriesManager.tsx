'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { TournamentSeries } from '@/types';
import { LEVELS } from '@/config/gameOptions';
import type { TranslationKey } from '@/i18n-types';
import { labelStyle, selectStyle, secondaryButtonStyle, fieldErrorStyle } from '@/styles/modalStyles';

/** A fresh level id. crypto.randomUUID is available in every browser that has IndexedDB. */
const newSeriesId = (): string => `series_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

/** How many saved games and teams point at a level, by level id. */
export type SeriesUsage = Record<string, { games: number; teams: number }>;

interface TournamentSeriesManagerProps {
  series: TournamentSeries[];
  onSeriesChange: (series: TournamentSeries[]) => void;
  /**
   * Review 7.15: a level that games or teams use cannot be removed - they would
   * keep an id that no longer exists (no level badge, unreachable by the Level
   * filter, a team's binding lost). Same rule as deleting a tournament in use.
   */
  seriesUsage?: SeriesUsage;
  /** False while the usage is still loading: removal waits, so it cannot skip the check. */
  usageReady?: boolean;
}

/**
 * Manages tournament series (competition levels) for a tournament.
 * Allows adding and removing series with level validation.
 * Extracted from TournamentDetailsModal for improved testability.
 */
const TournamentSeriesManager: React.FC<TournamentSeriesManagerProps> = ({
  series,
  onSeriesChange,
  seriesUsage,
  usageReady = true,
}) => {
  const { t } = useTranslation();
  // The level whose removal was refused, for the message under the chips.
  const [blockedSeriesId, setBlockedSeriesId] = useState<string | null>(null);
  // Levels removed in this edit, by level name: re-adding one gets its old id back,
  // so anything still pointing at it (e.g. a game saved elsewhere meanwhile) matches.
  const removedIdsRef = useRef<Record<string, string>>({});

  // UI state for adding new series
  const [isAddingNewSeries, setIsAddingNewSeries] = useState(false);
  const [newSeriesLevel, setNewSeriesLevel] = useState('');

  // Get available levels (exclude already selected)
  const availableLevels = useMemo(
    () => LEVELS.filter(lvl => !series.some(s => s.level === lvl)),
    [series]
  );

  const handleAddSeries = () => {
    // Validate level is from allowed list (dropdown enforces this, but defensive check)
    if (!newSeriesLevel || !LEVELS.includes(newSeriesLevel)) return;
    // Prevent duplicate levels (UI dropdown also filters, but defensive check for data integrity)
    if (series.some(s => s.level === newSeriesLevel)) return;
    const newSeries: TournamentSeries = {
      id: removedIdsRef.current[newSeriesLevel] ?? newSeriesId(),
      level: newSeriesLevel,
    };
    onSeriesChange([...series, newSeries]);
    setNewSeriesLevel('');
    setIsAddingNewSeries(false);
  };

  const handleRemoveSeries = (seriesId: string) => {
    const usage = seriesUsage?.[seriesId];
    if (usage && (usage.games > 0 || usage.teams > 0)) {
      setBlockedSeriesId(seriesId);
      return;
    }
    setBlockedSeriesId(null);
    const removed = series.find(s => s.id === seriesId);
    if (removed) removedIdsRef.current[removed.level] = removed.id;
    onSeriesChange(series.filter(s => s.id !== seriesId));
  };

  const handleCancelAdd = () => {
    setIsAddingNewSeries(false);
    setNewSeriesLevel('');
  };

  return (
    <div>
      <label className={labelStyle}>
        {t('tournamentDetailsModal.seriesLabel', 'Competition levels')}
      </label>

      {/* Display existing series */}
      {series.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {series.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-1 pl-3.5 pr-1 min-h-11 rounded-full bg-white/[0.06] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.10)] font-ui text-sm font-medium text-ink"
            >
              <span>{t(`common.level${s.level}` as TranslationKey, s.level)}</span>
              <button
                type="button"
                onClick={() => handleRemoveSeries(s.id)}
                disabled={!usageReady}
                className="inline-flex items-center justify-center min-h-9 min-w-9 rounded-full text-lg leading-none text-ink-3 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
                aria-label={`${t('tournamentDetailsModal.removeSeries', 'Remove level')}: ${t(`common.level${s.level}` as TranslationKey, s.level)}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {blockedSeriesId && seriesUsage?.[blockedSeriesId] && (
        <p className={`${fieldErrorStyle} mb-2`} role="alert" data-testid="series-in-use">
          {t('tournamentDetailsModal.levelInUse', 'This level is in use: {{games}} games, {{teams}} teams. Move them to another level first.', {
            games: seriesUsage[blockedSeriesId].games,
            teams: seriesUsage[blockedSeriesId].teams,
          })}
        </p>
      )}

      {/* Add new series UI */}
      {isAddingNewSeries ? (
        <div className="flex flex-wrap gap-2">
          <select
            value={newSeriesLevel}
            onChange={(e) => setNewSeriesLevel(e.target.value)}
            className={`${selectStyle} basis-full`}
            aria-label={t('tournamentDetailsModal.selectLevelForNewSeries', 'Select the new level')}
          >
            <option value="">{t('common.selectLevel', 'Select Level')}</option>
            {LEVELS.map(lvl => (
              <option
                key={lvl}
                value={lvl}
                disabled={series.some(s => s.level === lvl)}
              >
                {t(`common.level${lvl}` as TranslationKey, lvl)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAddSeries}
            disabled={!newSeriesLevel}
            className={`${secondaryButtonStyle} flex-1`}
            aria-label={t('tournamentDetailsModal.confirmAddSeries', 'Confirm add level')}
          >
            {t('common.add', 'Add')}
          </button>
          <button
            type="button"
            onClick={handleCancelAdd}
            className={`${secondaryButtonStyle} flex-1`}
          >
            {t('common.cancel', 'Cancel')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAddingNewSeries(true)}
          disabled={availableLevels.length === 0}
          className={secondaryButtonStyle}
          aria-label={t('tournamentDetailsModal.addSeries', 'Add level')}
        >
          + {t('tournamentDetailsModal.addSeries', 'Add level')}
        </button>
      )}
    </div>
  );
};

export default TournamentSeriesManager;
