'use client';

/**
 * HomeBasic - the body of Home in the BASIC layout (Perusnäkymä, Onboarding v3
 * step 6). StartScreen keeps its top bar; this replaces the tabbed body and
 * there is no tab bar.
 *
 * Zones, top to bottom:
 *   1. the next-game card (or, with no game booked, the last result and
 *      "Uusi ottelu"; a match under way gets the Continue card),
 *   2. rows that appear once there is something behind them: the team, the
 *      played games (from the first), the statistics (from the third),
 *   3. "Kaikki toiminnot": what the full layout adds, and one switch to it.
 *
 * Copy rule: facts only - "Peluutus valmis · 14 pelaajaa", never a fairness
 * claim.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TFunction } from 'i18next';
import {
  HiOutlineUserGroup,
  HiOutlineFolderOpen,
  HiOutlineChartBar,
  HiOutlineChevronRight,
} from 'react-icons/hi2';
import type { HomeSummary } from '@/utils/homeSummary';
import { getPlanLink } from '@/utils/playtimePlanner/planLinks';
import { getPlan } from '@/utils/playtimePlanner/storage';
import type { PlaytimePlan } from '@/utils/playtimePlanner/types';
import { buildPlanShareText } from '@/utils/planShareText';
import { useModalHardwareBack } from '@/hooks/useModalHardwareBack';
import { useToast } from '@/contexts/ToastProvider';
import logger from '@/utils/logger';
import {
  BasicNextGameCard,
  BasicNoNextGameCard,
  ResumeCard,
  HOME_CARD,
  HOME_FOCUS,
  type BasicCardPlanState,
} from '@/components/HomeDashboard';

/** The plan behind the next game, once looked up. */
interface NextGamePlan {
  state: BasicCardPlanState;
  plan?: PlaytimePlan;
  planGameId?: string;
}

/** Statistics are worth a row once there is something to compare. */
const STATS_ROW_FROM_GAMES = 3;

export interface HomeBasicProps {
  summary: HomeSummary | null | undefined;
  onOpenGame: (id: string) => void;
  onResumeGame?: () => void;
  onNewGame?: () => void;
  /** "Ketkä ovat paikalla?" for a game; 'start' opens the game after it. */
  onOpenAttendance?: (gameId: string, mode: 'save' | 'start') => void;
  /** "Näytä peluutus" for a one-game plan: the compact plan screen. */
  onShowPlan?: (planId: string, gameId: string) => void;
  /** "Näytä peluutus" for a game in a multi-game plan: the full planner on that game. */
  onOpenPlannerAt?: (planId: string, planGameId: string) => void;
  onManageTeams?: () => void;
  onLoadGame?: () => void;
  onViewStats?: () => void;
  /** "Vaihda koko näkymään". */
  onSwitchToFull?: () => void;
  locale: string;
  t: TFunction;
}

const ROW =
  `group/row relative flex w-full min-h-14 items-center gap-3.5 pl-4 pr-4 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06] first:rounded-t-[22px] last:rounded-b-[22px] ${HOME_FOCUS}`;

function BasicRow({ icon: Icon, label, onClick, testId }: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  label: string;
  onClick?: () => void;
  testId?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className={ROW} data-testid={testId}>
      <Icon className="h-[22px] w-[22px] flex-shrink-0 text-ink-2" aria-hidden="true" />
      <span className="flex min-h-14 flex-1 items-center gap-3 border-t border-hairline group-first/row:border-transparent">
        <span className="flex-1 break-words text-base font-semibold leading-snug text-ink">{label}</span>
        <HiOutlineChevronRight className="h-4 w-4 flex-shrink-0 text-ink-3" aria-hidden="true" />
      </span>
    </button>
  );
}

/** Looks up whether the next game was made from a plan, and which. */
function useNextGamePlan(gameId: string | undefined, refreshKey: unknown): NextGamePlan {
  // Tagged with the game it answers for, so a different next game never shows
  // the previous game's plan while its own lookup runs.
  const [result, setResult] = useState<NextGamePlan & { forId?: string }>({ state: 'loading' });
  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    (async () => {
      try {
        const link = await getPlanLink(gameId);
        const plan = link ? await getPlan(link.planId) : null;
        const found = !!plan && !!link && plan.games.some((g) => g.id === link.planGameId);
        if (!cancelled) {
          setResult(
            found
              ? { forId: gameId, state: 'ready', plan: plan!, planGameId: link!.planGameId }
              : { forId: gameId, state: 'none' },
          );
        }
      } catch (error) {
        logger.warn('[HomeBasic] plan lookup failed', { error });
        if (!cancelled) setResult({ forId: gameId, state: 'none' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, refreshKey]);
  if (!gameId) return { state: 'none' };
  return result.forId === gameId ? result : { state: 'loading' };
}

/** "Kaikki toiminnot": a short list of what the full layout adds, and the switch. */
function AllFeaturesSheet({ onClose, onSwitchToFull, t }: {
  onClose: () => void;
  onSwitchToFull?: () => void;
  t: TFunction;
}) {
  useModalHardwareBack(true, onClose);
  const items = [
    t('allFeatures.itemTabs', 'Home with tabs: games, club, competitions and statistics'),
    t('allFeatures.itemPlanner', 'Rotation planning for several games, such as a tournament day'),
    t('allFeatures.itemCompetitions', 'Leagues and tournaments'),
    t('allFeatures.itemClub', 'Staff, warm-up plan and rules'),
    t('allFeatures.itemTravel', 'Venues and departure times'),
    t('allFeatures.itemExternal', 'Games played elsewhere in player statistics'),
  ];
  // Portalled to the body: Home's scrolling body is its own stacking context
  // (and masked), so a fixed sheet inside it would sit under the top bar.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70"
      onClick={onClose}
      data-testid="all-features-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('allFeatures.title', 'All features')}
        data-testid="all-features-sheet"
        className="s1-sheet w-full max-w-md max-h-[85vh] overflow-y-auto rounded-t-[28px] px-5 pt-3 pb-[max(24px,env(safe-area-inset-bottom))] font-ui text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
        <h2 className="font-display text-[26px] font-bold leading-tight">{t('allFeatures.title', 'All features')}</h2>
        <p className="mt-1.5 text-[15px] leading-snug text-ink-2">
          {t('allFeatures.intro', 'The basic layout shows what matters on match day. The full layout adds:')}
        </p>
        <ul className="mt-3 space-y-2" data-testid="all-features-list">
          {items.map((item) => (
            <li key={item} className="flex gap-2.5 text-[15px] leading-snug text-ink">
              <span className="mt-[9px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-action" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => {
            onClose();
            onSwitchToFull?.();
          }}
          disabled={!onSwitchToFull}
          data-testid="switch-to-full"
          className={`s1-primary mt-5 flex h-14 w-full items-center justify-center rounded-full px-5 text-base font-bold ${HOME_FOCUS}`}
        >
          {t('allFeatures.switchToFull', 'Switch to the full layout')}
        </button>
        <p className="mt-2.5 text-center text-[13px] text-ink-3">
          {t('allFeatures.switchNote', 'Nothing is removed. You can switch back in Settings.')}
        </p>
      </div>
    </div>,
    document.body,
  );
}

const HomeBasic: React.FC<HomeBasicProps> = ({
  summary,
  onOpenGame,
  onResumeGame,
  onNewGame,
  onOpenAttendance,
  onShowPlan,
  onOpenPlannerAt,
  onManageTeams,
  onLoadGame,
  onViewStats,
  onSwitchToFull,
  locale,
  t,
}) => {
  const { showToast } = useToast();
  const [allFeaturesOpen, setAllFeaturesOpen] = useState(false);
  const upcoming = summary?.upcoming ?? null;
  // The summary is rebuilt whenever Home re-reads its data (a modal closed, the
  // match was left), which is also when a plan could have been made or removed.
  const nextPlan = useNextGamePlan(upcoming?.id, summary);

  const handleShowPlan = useCallback(() => {
    if (!upcoming || !nextPlan.plan || !nextPlan.planGameId) return;
    // The compact screen is a one-game view; a game from a multi-game plan
    // opens the planner on its own game instead.
    if (nextPlan.plan.games.length === 1) onShowPlan?.(nextPlan.plan.id, upcoming.id);
    else onOpenPlannerAt?.(nextPlan.plan.id, nextPlan.planGameId);
  }, [upcoming, nextPlan, onShowPlan, onOpenPlannerAt]);

  const handleShare = useCallback(async () => {
    if (!upcoming || !nextPlan.plan || !nextPlan.planGameId) return;
    const text = buildPlanShareText(
      nextPlan.plan,
      nextPlan.planGameId,
      {
        teamName: upcoming.teamName ?? '',
        opponent: upcoming.opponent,
        date: upcoming.date,
        time: upcoming.time,
        language: locale,
      },
      t,
    );
    if (!text) return;
    // The OS share sheet where there is one; the clipboard otherwise (the
    // GameRecapModal pattern). Dismissing the sheet is not an error.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        logger.warn('[HomeBasic] share failed, copying instead', e);
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast(t('basicHome.copied', 'Rotation copied - paste it into the chat.'), 'success');
    } catch (e) {
      logger.warn('[HomeBasic] copy failed', e);
      showToast(t('basicHome.shareFailed', 'Could not share the rotation.'), 'error');
    }
  }, [upcoming, nextPlan, locale, t, showToast]);

  const resumeInProgress = summary?.resume?.inProgress ? summary.resume : null;
  const last = summary?.resume ?? summary?.lastPlayed ?? null;
  const counts = summary?.countsReady ? summary.counts : undefined;
  const playedCount = summary?.playedCount ?? 0;

  return (
    <div className="flex min-h-full flex-col gap-3.5" data-testid="home-basic">
      {upcoming ? (
        <BasicNextGameCard
          game={upcoming}
          planState={nextPlan.state}
          onOpen={() => onOpenGame(upcoming.id)}
          onPrimary={() => onOpenAttendance?.(upcoming.id, upcoming.daysAway === 0 ? 'start' : 'save')}
          onShowPlan={onShowPlan || onOpenPlannerAt ? handleShowPlan : undefined}
          onShare={() => void handleShare()}
          locale={locale}
          t={t}
        />
      ) : resumeInProgress ? (
        <ResumeCard resume={resumeInProgress} onResume={onResumeGame} locale={locale} t={t} />
      ) : (
        <BasicNoNextGameCard
          last={last}
          onOpenLast={last ? () => onOpenGame(last.id) : undefined}
          onNewGame={onNewGame}
          locale={locale}
          t={t}
        />
      )}

      <div className={`${HOME_CARD} flex flex-col`}>
        <BasicRow
          icon={HiOutlineUserGroup}
          label={
            counts && counts.players > 0
              ? t('basicHome.teamRow', 'Team · {{count}} players', { count: counts.players })
              : t('basicHome.teamRowEmpty', 'Team')
          }
          onClick={onManageTeams}
          testId="basic-team-row"
        />
        {playedCount > 0 && (
          <BasicRow
            icon={HiOutlineFolderOpen}
            label={t('basicHome.playedRow', 'Played games · {{count}}', { count: playedCount })}
            onClick={onLoadGame}
            testId="basic-played-row"
          />
        )}
        {playedCount >= STATS_ROW_FROM_GAMES && (
          <BasicRow
            icon={HiOutlineChartBar}
            label={t('basicHome.statsRow', 'Statistics · {{count}} games', { count: playedCount })}
            onClick={onViewStats}
            testId="basic-stats-row"
          />
        )}
      </div>

      {/* "Uusi ottelu" is the card's own action when nothing is booked; with a
          game booked it is here, one tap below the card. */}
      {upcoming && onNewGame && (
        <button
          type="button"
          onClick={onNewGame}
          className={`s1-ghost flex h-12 w-full items-center justify-center rounded-full px-4 text-[15px] font-semibold text-ink ${HOME_FOCUS}`}
          data-testid="basic-new-game-secondary"
        >
          {t('basicHome.newGame', 'New game')}
        </button>
      )}

      <div className="flex-1" />
      <button
        type="button"
        onClick={() => setAllFeaturesOpen(true)}
        data-testid="all-features"
        className={`s1-ghost flex h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-[15px] font-semibold text-ink-2 ${HOME_FOCUS}`}
      >
        {t('allFeatures.title', 'All features')}
        <HiOutlineChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>

      {allFeaturesOpen && (
        <AllFeaturesSheet onClose={() => setAllFeaturesOpen(false)} onSwitchToFull={onSwitchToFull} t={t} />
      )}
    </div>
  );
};

export default HomeBasic;
