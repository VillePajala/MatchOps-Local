'use client';

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TournamentSeries } from '@/types';
import { LEVELS } from '@/config/gameOptions';
import type { TranslationKey } from '@/i18n-types';

interface TournamentSeriesManagerProps {
  series: TournamentSeries[];
  onSeriesChange: (series: TournamentSeries[]) => void;
}

/**
 * Manages tournament series (competition levels) for a tournament.
 * Allows adding and removing series with level validation.
 * Extracted from TournamentDetailsModal for improved testability.
 */
const TournamentSeriesManager: React.FC<TournamentSeriesManagerProps> = ({
  series,
  onSeriesChange,
}) => {
  const { t } = useTranslation();

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
    // Generate unique ID - crypto.randomUUID available in all browsers supporting IndexedDB
    const newSeries: TournamentSeries = {
      id: `series_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      level: newSeriesLevel,
    };
    onSeriesChange([...series, newSeries]);
    setNewSeriesLevel('');
    setIsAddingNewSeries(false);
  };

  const handleRemoveSeries = (seriesId: string) => {
    onSeriesChange(series.filter(s => s.id !== seriesId));
  };

  const handleCancelAdd = () => {
    setIsAddingNewSeries(false);
    setNewSeriesLevel('');
  };

  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">
        {t('tournamentDetailsModal.seriesLabel', 'Series (Competition Levels)')}
      </label>

      {/* Display existing series */}
      {series.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {series.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-1 bg-slate-600 px-2 py-1 rounded-md text-sm"
            >
              <span>{t(`common.level${s.level}` as TranslationKey, s.level)}</span>
              <button
                type="button"
                onClick={() => handleRemoveSeries(s.id)}
                className="text-slate-400 hover:text-red-400 ml-1"
                aria-label={`${t('tournamentDetailsModal.removeSeries', 'Remove series')}: ${t(`common.level${s.level}` as TranslationKey, s.level)}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new series UI */}
      {isAddingNewSeries ? (
        <div className="flex gap-2">
          <select
            value={newSeriesLevel}
            onChange={(e) => setNewSeriesLevel(e.target.value)}
            className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-indigo-500 focus:border-indigo-500"
            aria-label={t('tournamentDetailsModal.selectLevelForNewSeries', 'Select level for new series')}
          >
            <option value="">{t('common.selectLevel', '-- Select Level --')}</option>
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
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-sm text-sm font-medium border border-indigo-400/30"
            aria-label={t('tournamentDetailsModal.confirmAddSeries', 'Confirm add series')}
          >
            {t('common.add', 'Add')}
          </button>
          <button
            type="button"
            onClick={handleCancelAdd}
            className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-sm text-sm font-medium border border-slate-400/30"
          >
            {t('common.cancel', 'Cancel')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAddingNewSeries(true)}
          disabled={availableLevels.length === 0}
          className="px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-sm text-sm font-medium border border-slate-400/30"
          aria-label={t('tournamentDetailsModal.addSeries', 'Add series')}
        >
          + {t('tournamentDetailsModal.addSeries', 'Add Series')}
        </button>
      )}
    </div>
  );
};

export default TournamentSeriesManager;
