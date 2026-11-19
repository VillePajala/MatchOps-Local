'use client';

import React from 'react';
import type { TFunction } from 'i18next';
import type { GameType, Gender } from '@/types';
import { CLUB_SEASON_OFF_SEASON } from '@/utils/entityDisplayNames';
import { formatAppDate } from '@/utils/localeFormat';

/**
 * The rich league / tournament card: name, context chips, then matches and
 * goals as the Home screen's italic numerals.
 *
 * ONE CARD, TWO PLACES: the Sarjat / Turnaukset manager lists it, and the Home
 * Kilpailut tab shows the active ones inline. The wrapper (a list row with an
 * actions menu there, a plain button here) belongs to the caller; this is the
 * content both share, so the two cannot drift apart. Spans only, so it is
 * valid inside a button.
 */
export interface CompetitionCardItem {
  name: string;
  archived?: boolean;
  clubSeason?: string;
  gameType?: GameType;
  gender?: Gender;
  startDate?: string;
  endDate?: string;
  series?: Array<{ id: string; level: string }>;
}

const CHIP = 'inline-flex items-center h-[26px] px-[11px] rounded-full bg-white/[0.06] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] font-ui text-xs font-semibold tracking-[0.04em] text-ink-2 whitespace-nowrap';

export function CompetitionCard({ item, showDates, games, goals, menu, t }: {
  item: CompetitionCardItem;
  /** Tournaments show their dates under the name; leagues do not. */
  showDates: boolean;
  games: number;
  goals: number;
  /** The manager's actions menu, top right. */
  menu?: React.ReactNode;
  t: TFunction;
}) {
  return (
    <>
      <span className="flex items-start gap-2 pl-[18px] pr-2">
        <span className="block flex-1 min-w-0 pt-1.5">
          <span className="block font-display text-[26px] font-bold leading-[1.1] text-ink break-words">{item.name}</span>
          {showDates && (item.startDate || item.endDate) && (
            <span className="mt-1 block text-sm text-ink-3">
              {item.startDate ? formatAppDate(item.startDate) : ''}
              {item.startDate && item.endDate ? ' – ' : ''}
              {item.endDate ? formatAppDate(item.endDate) : ''}
            </span>
          )}
          {/* Context chips: plain text (green/red mean results only) */}
          <span className="flex flex-wrap gap-2 mt-2">
            {item.archived && (
              <span className={CHIP}>{t('seasonTournamentModal.archivedBadge', 'Archived')}</span>
            )}
            {item.clubSeason && item.clubSeason !== CLUB_SEASON_OFF_SEASON && (
              <span className={CHIP}>
                <span className="sr-only">{t('seasonDetailsModal.clubSeasonLabel', 'Season')}: </span>
                {item.clubSeason}
              </span>
            )}
            {item.gameType === 'futsal' && (
              <span className={CHIP}>
                <span className="sr-only">{t('common.gameTypeLabel', 'Sport Type')}: </span>
                {t('common.futsal', 'Futsal')}
              </span>
            )}
            {item.gender && (
              <span className={CHIP}>
                <span className="sr-only">{t('common.genderLabel', 'Gender')}: </span>
                {item.gender === 'boys' ? t('common.genderBoys', 'Boys') : t('common.genderGirls', 'Girls')}
              </span>
            )}
            {item.series?.map((series) => (
              <span key={series.id} className={CHIP}>
                <span className="sr-only">{t('common.seriesLabel', 'Level')}: </span>
                {t(`common.level${series.level}`, series.level)}
              </span>
            ))}
          </span>
        </span>
        {menu}
      </span>
      {/* Matches / goals as the home screen's italic numerals */}
      <span className="mt-4 flex border-t border-hairline">
        <span className="flex-1 flex items-baseline gap-2.5 px-[18px] pt-3 pb-3.5">
          <span className="s1-numeral pr-[3px] font-display text-[34px] font-bold italic leading-none">{games}</span>
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">{t('seasonTournamentModal.statsGames', 'Games')}</span>
        </span>
        <span className="flex-1 flex items-baseline gap-2.5 px-[18px] pt-3 pb-3.5 border-l border-hairline">
          <span className="s1-numeral pr-[3px] font-display text-[34px] font-bold italic leading-none">{goals}</span>
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">{t('seasonTournamentModal.statsGoals', 'Goals')}</span>
        </span>
      </span>
    </>
  );
}

export default CompetitionCard;
