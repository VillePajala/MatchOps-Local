/**
 * GameInfoCard component - displays game metadata information
 * Shows score, teams, date, time, location, and period settings
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineMapPin } from 'react-icons/hi2';
import { mapsSearchUrl } from '@/config/externalLinks';

interface GameInfoCardProps {
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  formattedDate: string;
  gameTime?: string;
  gameLocation?: string;
  /** Which pitch at the venue. Shown beside it, never sent to the map. */
  fieldNumber?: string;
  numPeriods?: number;
  periodDurationMinutes?: number;
  wentToOvertime?: boolean;
  wentToPenalties?: boolean;
  /** Who wore the armband. Absent when no captain was named for this game. */
  captainName?: string;
  /** Penalty-shootout tally (home-away), if the game had a shootout. */
  shootoutScore?: { home: number; away: number };
}

export function GameInfoCard({
  homeTeamName,
  awayTeamName,
  homeScore,
  awayScore,
  formattedDate,
  gameTime,
  gameLocation,
  fieldNumber,
  numPeriods,
  periodDurationMinutes,
  wentToOvertime,
  wentToPenalties,
  captainName,
  shootoutScore,
}: GameInfoCardProps) {
  const { t } = useTranslation();
  const mapsUrl = mapsSearchUrl(gameLocation);

  return (
    <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
      <h3 className="text-xl font-semibold text-slate-200 mb-4">
        {t('gameStatsModal.gameInfoTitle', 'Game Information')}
      </h3>
      <div className="space-y-3">
        <div className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 p-3 rounded-md transition-all">
          <div className="flex justify-center items-center text-center">
            <span className="font-semibold text-slate-100 flex-1 text-right">
              {homeTeamName}
            </span>
            <span className="text-2xl text-amber-400 font-bold mx-4">
              {homeScore} - {awayScore}
              {(wentToOvertime || wentToPenalties) && (
                <span className="text-sm text-slate-400 font-medium ml-2">
                  ({[
                    wentToOvertime && t('gameResult.overtime', 'OT'),
                    wentToPenalties && (shootoutScore
                      ? `${shootoutScore.home}-${shootoutScore.away} ${t('gameResult.penalties', 'PKs')}`
                      : t('gameResult.penalties', 'PKs')),
                  ].filter(Boolean).join(', ')})
                </span>
              )}
            </span>
            <span className="font-semibold text-slate-100 flex-1 text-left">
              {awayTeamName}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-2 gap-3 text-sm">
          <div className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 p-2 rounded-md transition-all">
            <label className="block text-xs text-slate-400">{t('common.date')}</label>
            <span className="font-medium text-slate-200">{formattedDate}</span>
          </div>
          <div className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 p-2 rounded-md transition-all">
            <label className="block text-xs text-slate-400">{t('common.time')}</label>
            <span className="font-medium text-slate-200">
              {gameTime || t('common.notSet')}
            </span>
          </div>
          <div className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 p-2 rounded-md transition-all">
            <label className="block text-xs text-slate-400">{t('common.location')}</label>
            {/* The venue links to a map; the pitch never does. "TN 2" is what
                stops a map finding the place, which is why it sits apart. */}
            <span className="font-medium text-slate-200">
              {mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200 hover:underline"
                  title={t('gameStatsModal.openInMaps', 'Open in Maps')}
                >
                  {gameLocation}
                  <HiOutlineMapPin className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                  <span className="sr-only">{t('gameStatsModal.openInMaps', 'Open in Maps')}</span>
                </a>
              ) : (
                gameLocation || t('common.notSet')
              )}
              {fieldNumber ? (
                <span className="text-slate-400"> · {fieldNumber}</span>
              ) : null}
            </span>
          </div>
          <div className="bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 p-2 rounded-md transition-all">
            <label className="block text-xs text-slate-400">
              {t('newGameSetupModal.periodsLabel')}
            </label>
            <span className="font-medium text-slate-200">
              {numPeriods} x {periodDurationMinutes} min
            </span>
          </div>
          {/* The armband, only when one was named. Spans the row so it never
              sits alone next to an empty half. */}
          {captainName && (
            <div className="col-span-2 bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 p-2 rounded-md transition-all">
              <label className="block text-xs text-slate-400">
                {t('gameSettingsModal.captainTitle', 'Captain')}
              </label>
              <span className="font-medium text-slate-200">{captainName}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
