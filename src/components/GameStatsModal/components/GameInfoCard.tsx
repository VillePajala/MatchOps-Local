/**
 * GameInfoCard component - displays game metadata information
 * Shows score, teams, date, time, location, and period settings
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

interface GameInfoCardProps {
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  formattedDate: string;
  gameTime?: string;
  gameLocation?: string;
  numPeriods?: number;
  periodDurationMinutes?: number;
}

export function GameInfoCard({
  homeTeamName,
  awayTeamName,
  homeScore,
  awayScore,
  formattedDate,
  gameTime,
  gameLocation,
  numPeriods,
  periodDurationMinutes,
}: GameInfoCardProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
      <h3 className="text-xl font-semibold text-slate-200 mb-4">
        {t('gameStatsModal.gameInfoTitle', 'Game Information')}
      </h3>
      <div className="space-y-3">
        <div className="bg-slate-800/40 p-3 rounded-md border border-slate-700/50">
          <div className="flex justify-center items-center text-center">
            <span className="font-semibold text-slate-100 flex-1 text-right">
              {homeTeamName}
            </span>
            <span className="text-2xl text-yellow-400 font-bold mx-4">
              {homeScore} - {awayScore}
            </span>
            <span className="font-semibold text-slate-100 flex-1 text-left">
              {awayTeamName}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-2 gap-3 text-sm">
          <div className="bg-slate-800/40 p-2 rounded-md">
            <label className="block text-xs text-slate-400">{t('common.date')}</label>
            <span className="font-medium text-slate-200">{formattedDate}</span>
          </div>
          <div className="bg-slate-800/40 p-2 rounded-md">
            <label className="block text-xs text-slate-400">{t('common.time')}</label>
            <span className="font-medium text-slate-200">
              {gameTime || t('common.notSet')}
            </span>
          </div>
          <div className="bg-slate-800/40 p-2 rounded-md">
            <label className="block text-xs text-slate-400">{t('common.location')}</label>
            <span className="font-medium text-slate-200">
              {gameLocation || t('common.notSet')}
            </span>
          </div>
          <div className="bg-slate-800/40 p-2 rounded-md">
            <label className="block text-xs text-slate-400">
              {t('newGameSetupModal.periodsLabel')}
            </label>
            <span className="font-medium text-slate-200">
              {numPeriods} x {periodDurationMinutes} min
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
