import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiCog6Tooth } from 'react-icons/hi2';

interface ClubSeasonFilterProps {
  selectedSeason: string;
  onChange: (season: string) => void;
  seasons: string[];
  hasConfigured: boolean;
  isLoading: boolean;
  onOpenSettings: () => void;
}

/**
 * Club Season Filter Component
 *
 * Reusable season filter dropdown with settings gear icon.
 * Used in both Player tab and Overall tab for consistent season filtering UI.
 */
export const ClubSeasonFilter: React.FC<ClubSeasonFilterProps> = ({
  selectedSeason,
  onChange,
  seasons,
  hasConfigured,
  isLoading,
  onOpenSettings,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2 min-w-0">
      <select
        value={selectedSeason}
        onChange={(e) => onChange(e.target.value)}
        disabled={!hasConfigured || isLoading}
        className={`flex-1 min-w-0 px-3 py-1 bg-slate-700 border border-slate-600 rounded-md text-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
          !hasConfigured || isLoading ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        <option value="all">{t('playerStats.allPeriods', 'All Periods')}</option>
        {seasons.map(season => (
          <option key={season} value={season}>
            {season === 'off-season'
              ? t('playerStats.offPeriod', 'Off-Period')
              : `${t('common.year', 'Year')} ${season}`
            }
          </option>
        ))}
      </select>
      <button
        onClick={onOpenSettings}
        className={`p-1.5 rounded-md bg-slate-700 border border-slate-600 text-slate-300 hover:text-indigo-400 hover:border-indigo-500 transition-colors ${
          !hasConfigured && !isLoading ? 'animate-pulse ring-2 ring-indigo-500' : ''
        }`}
        aria-label={t('playerStats.configurePeriodDates', 'Configure Period Dates')}
      >
        <HiCog6Tooth className="w-5 h-5" />
      </button>
    </div>
  );
};
