/**
 * TeamPerformanceCard component - displays team performance statistics
 * Shows wins/losses/ties, goals for/against, averages, and optional assessments
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TranslationKey } from '@/i18n-types';
import RatingBar from '../../RatingBar';

interface TeamAssessmentAverages {
  count: number;
  averages: Record<string, number>;
  overall: number;
  finalScore: number;
}

interface TeamPerformanceCardProps {
  title: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  winPercentage: number;
  goalDifference: number;
  goalsFor: number;
  goalsAgainst: number;
  averageGoalsFor: number;
  averageGoalsAgainst: number;
  teamAssessmentAverages?: TeamAssessmentAverages | null;
  lastGameDate?: string;
  useGradient?: boolean;
}

export function TeamPerformanceCard({
  title,
  gamesPlayed,
  wins,
  losses,
  ties,
  winPercentage,
  goalDifference,
  goalsFor,
  goalsAgainst,
  averageGoalsFor,
  averageGoalsAgainst,
  teamAssessmentAverages,
  lastGameDate,
  useGradient = false,
}: TeamPerformanceCardProps) {
  const { t } = useTranslation();

  const cardClassName = useGradient
    ? "bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40 p-4 rounded-lg shadow-inner transition-all"
    : "bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner";

  return (
    <div className={cardClassName}>
      <h3 className="text-xl font-semibold text-slate-200 mb-4">{title}</h3>
      <div className="space-y-0 text-sm">
        <div className="flex justify-between items-center py-1.5 px-2 border-b border-slate-700/50">
          <span className="text-slate-300">{t('common.gamesPlayed', 'Games Played')}</span>
          <span className="text-yellow-400 font-bold">{gamesPlayed}</span>
        </div>
        <div className="flex justify-between items-center py-1.5 px-2 border-b border-slate-700/50">
          <span className="text-slate-300">{t('common.record', 'Record')}</span>
          <span className="text-yellow-400 font-bold">
            {wins}-{losses}-{ties}
          </span>
        </div>
        <div className="flex justify-between items-center py-1.5 px-2 border-b border-slate-700/50">
          <span className="text-slate-300">{t('common.winPercentage', 'Win %')}</span>
          <span className="text-yellow-400 font-bold">{winPercentage.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between items-center py-1.5 px-2 border-b border-slate-700/50">
          <span className="text-slate-300">{t('common.goalDifference', 'Goal Diff')}</span>
          <span
            className={`font-bold ${goalDifference >= 0 ? 'text-green-400' : 'text-red-400'}`}
          >
            {goalDifference >= 0 ? '+' : ''}
            {goalDifference}
          </span>
        </div>
        <div className="flex justify-between items-center py-1.5 px-2 border-b border-slate-700/50">
          <span className="text-slate-300">{t('common.goalsFor', 'Goals For')}</span>
          <span className="text-yellow-400 font-bold">{goalsFor}</span>
        </div>
        <div className="flex justify-between items-center py-1.5 px-2 border-b border-slate-700/50">
          <span className="text-slate-300">{t('common.goalsAgainst', 'Goals Against')}</span>
          <span className="text-yellow-400 font-bold">{goalsAgainst}</span>
        </div>
        <div className="flex justify-between items-center py-1.5 px-2 border-b border-slate-700/50">
          <span className="text-slate-300">{t('common.avgGoalsFor', 'Avg Goals For')}</span>
          <span className="text-yellow-400 font-bold">{averageGoalsFor.toFixed(1)}</span>
        </div>
        <div className="flex justify-between items-center py-1.5 px-2">
          <span className="text-slate-300">{t('common.avgGoalsAgainst', 'Avg Goals Against')}</span>
          <span className="text-yellow-400 font-bold">{averageGoalsAgainst.toFixed(1)}</span>
        </div>
        {lastGameDate && (
          <div className="flex justify-between items-center py-1.5 px-2 border-t border-slate-700/50">
            <span className="text-slate-300">{t('common.lastGame', 'Last Game')}</span>
            <span className="text-slate-400 text-xs">{lastGameDate}</span>
          </div>
        )}
      </div>
      {teamAssessmentAverages && (
        <div className="mt-4">
          <h4 className="text-md font-semibold text-slate-100 mb-2">
            {t('playerStats.performanceRatings', 'Performance Ratings')}
          </h4>
          <div className="space-y-2 text-sm">
            {Object.entries(teamAssessmentAverages.averages).map(([metric, avg]) => (
              <div key={metric} className="flex items-center space-x-2 px-2">
                <span className="w-28 shrink-0 text-slate-100">
                  {t(`assessmentMetrics.${metric}` as TranslationKey, metric)}
                </span>
                <RatingBar value={avg} />
              </div>
            ))}
            <div className="flex items-center space-x-2 px-2 mt-2">
              <span className="w-28 shrink-0 text-slate-100">
                {t('playerAssessmentModal.overallLabel', 'Overall')}
              </span>
              <RatingBar value={teamAssessmentAverages.overall} />
            </div>
            <div className="flex items-center space-x-2 px-2">
              <span className="w-28 shrink-0 text-slate-100">
                {t('playerStats.avgRating', 'Avg Rating')}
              </span>
              <RatingBar value={teamAssessmentAverages.finalScore} />
            </div>
            <div className="text-xs text-slate-400 text-right">
              {teamAssessmentAverages.count} {t('playerStats.ratedGames', 'rated')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
