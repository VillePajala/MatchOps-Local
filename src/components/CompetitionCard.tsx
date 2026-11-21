'use client';

import React from 'react';
import type { TFunction } from 'i18next';
import type { GameType, Gender } from '@/types';
import { CLUB_SEASON_OFF_SEASON } from '@/utils/entityDisplayNames';
import { formatAppDateRange } from '@/utils/localeFormat';
import { daysBetween } from '@/utils/todayIso';
import type { TeamRecord } from '@/utils/teamRecord';

/**
 * One league / tournament card body in the Sarjat / Turnaukset manager
 * (owner, 2026-11-21, variant A - the same card as the teams list): the name,
 * ONE quiet meta line, and a result line once games have been played - or,
 * for one that has not started yet, when it starts.
 *
 * The wrapper (the card with its actions menu) belongs to the caller. Spans
 * only, so it is valid inside a button.
 */
export interface CompetitionCardItem {
  name: string;
  archived?: boolean;
  clubSeason?: string;
  gameType?: GameType;
  gender?: Gender;
  ageGroup?: string;
  startDate?: string;
  endDate?: string;
  series?: Array<{ id: string; level: string }>;
}

/**
 * The meta line's parts, in order, only those the item has (so no dangling
 * separators). Tournaments lead with their dates, leagues with the club season.
 */
export function competitionMetaParts(
  item: CompetitionCardItem,
  kind: 'season' | 'tournament',
  t: TFunction,
  language?: string,
): string[] {
  const lead = kind === 'tournament'
    ? formatAppDateRange(item.startDate, item.endDate, language)
    : item.clubSeason && item.clubSeason !== CLUB_SEASON_OFF_SEASON ? item.clubSeason : null;
  const gender = item.gender === 'boys'
    ? t('common.genderBoys', 'Boys')
    : item.gender === 'girls' ? t('common.genderGirls', 'Girls') : null;
  const parts: Array<string | null | undefined> = [
    lead,
    item.gameType === 'futsal' ? t('common.futsal', 'Futsal') : null,
    gender,
    ...(item.series ?? []).map((s) => t(`common.level${s.level}`, s.level)),
    item.ageGroup,
  ];
  return parts.filter((p): p is string => !!p && p.trim() !== '');
}

/** "+4" / "−3" (a real minus sign) / "0", and the result colour it reads as. */
export function goalDifferenceDisplay(diff: number): { text: string; className: string } {
  if (diff > 0) return { text: `+${diff}`, className: 'text-win' };
  if (diff < 0) return { text: `−${Math.abs(diff)}`, className: 'text-loss' };
  return { text: '0', className: 'text-draw' };
}

/** "Starts today / tomorrow / in N days" - null unless the start is today or later. */
export function startsInLabel(startDate: string | undefined, today: string, t: TFunction): string | null {
  if (!startDate || startDate < today) return null;
  const days = daysBetween(today, startDate);
  if (days === 0) return t('seasonTournamentModal.startsToday', 'Starts today');
  if (days === 1) return t('seasonTournamentModal.startsTomorrow', 'Starts tomorrow');
  return t('seasonTournamentModal.startsInDays', 'Starts in {{count}} days', { count: days });
}

export function CompetitionCard({ item, kind, record, today, t, language }: {
  item: CompetitionCardItem;
  kind: 'season' | 'tournament';
  /** Its played games' record; undefined while it is still loading. */
  record?: TeamRecord;
  /** The coach's today (todayIso) - the "starts in" chip counts from it. */
  today: string;
  t: TFunction;
  language?: string;
}) {
  const meta = competitionMetaParts(item, kind, t, language);
  const played = record && record.gamesPlayed > 0 ? record : null;
  // Only once the record is known: a played tournament must not flash "Starts in".
  const startsIn = record && !played ? startsInLabel(item.startDate, today, t) : null;
  const gd = played ? goalDifferenceDisplay(played.goalDifference) : null;

  return (
    <span className="block min-w-0 flex-1">
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-display text-[22px] font-bold leading-[1.1] text-ink">{item.name}</span>
        {item.archived && (
          <span className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-white/[0.06] px-2 text-xs font-semibold text-ink-2">
            {t('seasonTournamentModal.archivedBadge', 'Archived')}
          </span>
        )}
      </span>
      {meta.length > 0 && (
        <span
          className="mt-0.5 block truncate text-[13px] leading-5 text-ink-3"
          title={meta.join(' · ')}
          data-testid="competition-meta"
        >
          {meta.join(' · ')}
        </span>
      )}
      {played && gd && (
        <span className="mt-1.5 block truncate text-[13px] font-medium leading-5 text-ink-2" data-testid="competition-record">
          {t('seasonTournamentModal.recordGames', '{{count}} games', { count: played.gamesPlayed })}
          {' · '}
          {/* W-D-L reads as "two dash zero dash one" aloud; say it in words. */}
          <span className="sr-only">
            {t('seasonTournamentModal.recordAria', '{{wins}} wins, {{draws}} draws, {{losses}} losses', {
              wins: played.wins, draws: played.ties, losses: played.losses,
            })}
          </span>
          <span aria-hidden="true" className="font-display text-[17px] font-extrabold italic tracking-[0.02em]" data-testid="competition-wdl">
            <span className="text-win">{played.wins}</span>
            <span className="text-ink-3">-</span>
            <span className="text-draw">{played.ties}</span>
            <span className="text-ink-3">-</span>
            <span className="text-loss">{played.losses}</span>
          </span>
          {' · '}
          {t('seasonTournamentModal.goalDifference', 'goal diff')}{' '}
          <span className={`font-semibold tabular-nums ${gd.className}`} data-testid="competition-goal-diff">{gd.text}</span>
        </span>
      )}
      {startsIn && (
        <span
          className="mt-2 inline-flex h-6 items-center rounded-full bg-white/[0.06] px-2.5 text-xs font-medium text-ink-2"
          data-testid="competition-starts-in"
        >
          {startsIn}
        </span>
      )}
    </span>
  );
}

export default CompetitionCard;
