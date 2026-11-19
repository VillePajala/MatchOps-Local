/**
 * TeamPerformanceCard component - displays team performance statistics
 * Shows wins/losses/ties, goals for/against, averages, and optional assessments
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TranslationKey } from '@/i18n-types';
import RatingBar from '../../RatingBar';
import { ASSESSMENT_MAX, RATING_STYLE_MAX, ratingBandLevel, ratingDisplayNumber } from '@/config/assessmentMetrics';
import type { AssessmentRatingStyle } from '@/types/settings';
import { formatAppDecimal, formatAppPercent } from '@/utils/localeFormat';
import { sectionLabelStyle, cardStyle } from '@/styles/modalStyles';

/** A summary figure: a list-surface tile with a big italic numeral over a tracked label. */
const tile = 's1-list flex flex-col items-center justify-start min-w-0 overflow-hidden pt-4 pb-3 text-center';
const tileNumeral = 'font-display text-[clamp(26px,9vw,34px)] font-extrabold italic leading-[0.9] tabular-nums whitespace-nowrap drop-shadow-[0_2px_0_rgb(0_0_0/0.35)]';
// Sentence case and allowed to wrap: in Inter an uppercase "VOITTOPROSENTTI"
// is wider than a third of a 320-360px phone and was clipped.
const tileLabel = 'mt-2 px-1 text-xs font-semibold leading-tight text-ink-3 break-words';
const kvKey = 'text-[15px] text-ink-2';
const kvValue = 'text-base font-bold text-ink tabular-nums';

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
  /**
   * Used to pick a second card fill. The S1 system has one list surface, so it
   * no longer changes anything; kept so existing callers compile.
   */
  useGradient?: boolean;
  ratingStyle?: AssessmentRatingStyle;
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
  ratingStyle = 'words',
}: TeamPerformanceCardProps) {
  const { t } = useTranslation();

  // Long-term view: summarise a canonical rating as a word band, with the
  // number appended for numeric styles.
  const formatRatingBand = (canonical: number): string => {
    const word = t(`assessmentScale.level${ratingBandLevel(canonical)}` as TranslationKey);
    if (ratingStyle === 'words') return word;
    return `${word} · ${formatAppDecimal(ratingDisplayNumber(canonical, RATING_STYLE_MAX[ratingStyle]))}`;
  };

  const gdTone = goalDifference > 0 ? 'text-win' : goalDifference < 0 ? 'text-loss' : 'text-draw';
  const kvRow = 'relative flex items-center justify-between gap-3 min-h-12 px-4 before:absolute before:top-0 before:left-4 before:right-0 before:h-px before:bg-hairline first:before:hidden';

  return (
    <div className="font-ui">
      <h3 className={`${sectionLabelStyle} px-1 mb-2.5`}>{title}</h3>
      {/* The three figures that summarise the scope as numeral tiles; the
          rest as plain rows below. */}
      <div className="grid grid-cols-[1.1fr_0.8fr_1.2fr] gap-2">
        <div className={tile}>
          <div className={tileNumeral}>
            {/* Wins-draws-losses everywhere (review 5.2), as on Home and in the
                opponent table. Coloured by part for the eye; one plain string
                for screen readers. */}
            <span className="sr-only">{wins}-{ties}-{losses}</span>
            <span aria-hidden="true">
              <span className={wins > 0 ? 'text-win' : 'text-ink-3'}>{wins}</span>
              <span className="text-draw">-{ties}-</span>
              <span className={losses > 0 ? 'text-loss' : 'text-ink-3'}>{losses}</span>
            </span>
          </div>
          {/* Non-breaking hyphens: a wrap may fall before "(W-D-L)", never inside it. */}
          <div className={tileLabel}>{t('common.record', 'Record (W-D-L)').replace(/-/g, '\u2011')}</div>
        </div>
        <div className={tile}>
          <div className={`${tileNumeral} ${gdTone}`}>
            {goalDifference > 0 ? '+' : ''}
            {goalDifference}
          </div>
          <div className={tileLabel}>{t('common.goalDifference', 'Goal Difference')}</div>
        </div>
        <div className={tile}>
          <div className={`${tileNumeral} text-ink`}>{formatAppPercent(winPercentage)}</div>
          <div className={tileLabel}>{t('common.winPercentageShort', 'Win %')}</div>
        </div>
      </div>
      <div className="s1-list mt-2.5 overflow-hidden">
        <div className={kvRow}>
          <span className={kvKey}>{t('common.gamesPlayed', 'Games Played')}</span>
          <span className={kvValue}>{gamesPlayed}</span>
        </div>
        <div className={kvRow}>
          <span className={kvKey}>{t('common.goalsFor', 'Goals For')}</span>
          <span className={kvValue}>{goalsFor}</span>
        </div>
        <div className={kvRow}>
          <span className={kvKey}>{t('common.goalsAgainst', 'Goals Against')}</span>
          <span className={kvValue}>{goalsAgainst}</span>
        </div>
        <div className={kvRow}>
          <span className={kvKey}>{t('common.avgGoalsFor', 'Avg Goals For')}</span>
          <span className={kvValue}>{formatAppDecimal(averageGoalsFor)}</span>
        </div>
        <div className={kvRow}>
          <span className={kvKey}>{t('common.avgGoalsAgainst', 'Avg Goals Against')}</span>
          <span className={kvValue}>{formatAppDecimal(averageGoalsAgainst)}</span>
        </div>
        {lastGameDate && (
          <div className={kvRow}>
            <span className={kvKey}>{t('common.lastGame', 'Last Game')}</span>
            <span className="text-[15px] text-ink-2">{lastGameDate}</span>
          </div>
        )}
      </div>
      {teamAssessmentAverages && (
        <div className={`${cardStyle} mt-2.5`}>
          <h4 className="text-[15px] font-semibold text-ink mb-3">
            {t('playerStats.performanceRatings', 'Performance Ratings')}
          </h4>
          <div className="space-y-2.5 text-sm">
            {Object.entries(teamAssessmentAverages.averages).filter(([, avg]) => avg > 0).map(([metric, avg]) => (
              <div key={metric} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-ink-2">
                  {t(`assessmentMetrics.${metric}` as TranslationKey, metric)}
                </span>
                <RatingBar value={avg} max={ASSESSMENT_MAX} valueLabel={formatRatingBand(avg)} />
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1">
              <span className="w-28 shrink-0 text-ink-2">
                {t('playerAssessmentModal.overallLabel', 'Overall')}
              </span>
              <RatingBar value={teamAssessmentAverages.overall} valueLabel={formatRatingBand(teamAssessmentAverages.overall)} />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-ink-2">
                {t('playerStats.avgRating', 'Avg Rating')}
              </span>
              <RatingBar value={teamAssessmentAverages.finalScore} max={ASSESSMENT_MAX} valueLabel={formatRatingBand(teamAssessmentAverages.finalScore)} />
            </div>
            <div className="text-[13px] text-ink-3 text-right">
              {teamAssessmentAverages.count} {t('playerStats.ratedGames', 'rated games')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
