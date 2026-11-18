/**
 * GameInfoCard component - displays game metadata information
 * Shows score, teams, date, time, location, and period settings
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineMapPin } from 'react-icons/hi2';
import { mapsSearchUrl } from '@/config/externalLinks';
import { sectionLabelStyle } from '@/styles/modalStyles';
import type { GameResult } from '@/utils/gameResult';

/** A meta field's tracked label, its numeral value and its text value. */
const metaKey = 'mb-0.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-3';
const metaNumeral = 'font-display text-2xl font-bold leading-[1.1] tabular-nums';
const metaText = 'text-base font-semibold leading-snug break-words';

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
  /** Present when the venue was picked, which makes the link exact. */
  locationLat?: number;
  locationLng?: number;
  numPeriods?: number;
  periodDurationMinutes?: number;
  wentToOvertime?: boolean;
  wentToPenalties?: boolean;
  /** Who wore the armband. Absent when no captain was named for this game. */
  captainName?: string;
  /** Penalty-shootout tally (home-away), if the game had a shootout. */
  shootoutScore?: { home: number; away: number };
  /** Goals in extra time (home-away), shown beside the final score (review 11.1). */
  extraTimeScore?: { home: number; away: number };
  /** The result from the coach's side; colours the score and the card's light. */
  result?: GameResult;
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
  locationLat,
  locationLng,
  numPeriods,
  periodDurationMinutes,
  wentToOvertime,
  wentToPenalties,
  captainName,
  shootoutScore,
  extraTimeScore,
  result,
}: GameInfoCardProps) {
  const { t } = useTranslation();
  const mapsUrl = mapsSearchUrl(gameLocation, locationLat, locationLng);

  const resultCode = result ?? null;
  const heroTint = resultCode === 'W' ? 's1-hero-win' : resultCode === 'L' ? 's1-hero-loss' : 's1-hero-quiet';
  const numeral = resultCode === 'W' ? 's1-numeral-win' : resultCode === 'L' ? 's1-numeral-loss' : 's1-numeral';
  const extraNote = (wentToOvertime || wentToPenalties || extraTimeScore)
    ? `(${[
        extraTimeScore
          ? `${t('gameResult.extraTime', 'ET')} ${extraTimeScore.home}-${extraTimeScore.away}`
          : wentToOvertime && t('gameResult.overtime', 'OT'),
        wentToPenalties && (shootoutScore
          ? `${shootoutScore.home}-${shootoutScore.away} ${t('gameResult.penalties', 'PKs')}`
          : t('gameResult.penalties', 'PKs')),
      ].filter(Boolean).join(', ')})`
    : null;

  return (
    <div className="font-ui">
      <h3 className={`${sectionLabelStyle} px-1 mb-2.5`}>
        {t('gameStatsModal.gameInfoTitle', 'Game Information')}
      </h3>
      {/* The result as the home screen shows it: a hero card whose light and
          numeral take the result's colour (green win, red loss, white draw). */}
      <div className={`s1-hero ${heroTint} px-[18px] pt-[18px] pb-1.5 text-ink`}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 pb-3.5">
          <span className="min-w-0 break-words font-display text-xl font-bold leading-[1.05]">
            {homeTeamName}
          </span>
          <span className="flex flex-col items-center">
            <span className={`${numeral} whitespace-nowrap pl-0.5 pr-2 font-display text-[54px] font-extrabold italic leading-[0.95] tabular-nums`}>
              {homeScore}–{awayScore}
            </span>
            {extraNote && (
              <span className="mt-1 text-[13px] font-medium text-ink-3 whitespace-nowrap">{extraNote}</span>
            )}
          </span>
          <span className="min-w-0 break-words text-right font-display text-xl font-bold leading-[1.05]">
            {awayTeamName}
          </span>
        </div>
        <dl className="grid grid-cols-2 border-t border-hairline">
          <div className="py-2.5">
            <dt className={metaKey}>{t('common.date')}</dt>
            <dd className={metaNumeral}>{formattedDate}</dd>
          </div>
          <div className="py-2.5">
            <dt className={metaKey}>{t('common.time')}</dt>
            <dd className={gameTime ? metaNumeral : metaText}>
              {gameTime || t('common.notSet')}
            </dd>
          </div>
          <div className="col-span-2 flex items-center gap-3 border-t border-hairline py-2.5">
            <HiOutlineMapPin className="w-5 h-5 flex-none text-ink-3" aria-hidden="true" />
            <div className="min-w-0">
              <dt className={metaKey}>{t('common.location')}</dt>
              {/* The venue links to a map; the pitch never does. "TN 2" is what
                  stops a map finding the place, which is why it sits apart. */}
              <dd className={metaText}>
                {mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded underline-offset-[3px] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
                    title={t('gameStatsModal.openInMaps', 'Open in Maps')}
                  >
                    {gameLocation}
                    <span className="sr-only">{t('gameStatsModal.openInMaps', 'Open in Maps')}</span>
                  </a>
                ) : (
                  gameLocation || t('common.notSet')
                )}
                {fieldNumber ? (
                  <span> · {fieldNumber}</span>
                ) : null}
              </dd>
            </div>
          </div>
          <div className="col-span-2 border-t border-hairline py-2.5">
            <dt className={metaKey}>
              {t('newGameSetupModal.periodsLabel')}
            </dt>
            <dd className={metaNumeral}>
              {numPeriods} x {periodDurationMinutes} min
            </dd>
          </div>
          {/* The armband, only when one was named. Spans the row so it never
              sits alone next to an empty half. */}
          {captainName && (
            <div className="col-span-2 border-t border-hairline py-2.5">
              <dt className={metaKey}>
                {t('gameSettingsModal.captainTitle', 'Captain')}
              </dt>
              <dd className={metaText}>{captainName}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
