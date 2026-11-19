'use client';

/**
 * The next game's plan on Home, shared by BOTH layouts: the basic card
 * (HomeBasic) and the full layout's "Seuraava ottelu" card (StartScreen ->
 * HomeDashboard). It looks up whether the game was made from a plan and, when
 * it was, gives "Näytä suunnitelma" and "Jaa" their behaviour.
 */

import { useCallback, useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import { getPlanLink } from '@/utils/playtimePlanner/planLinks';
import { getPlan } from '@/utils/playtimePlanner/storage';
import type { PlaytimePlan } from '@/utils/playtimePlanner/types';
import { buildPlanShareText } from '@/utils/planShareText';
import type { HomeUpcomingGame } from '@/utils/homeSummary';
import { useToast } from '@/contexts/ToastProvider';
import logger from '@/utils/logger';

/** What Home knows about the game's plan (looked up asynchronously). */
export type NextGamePlanState = 'loading' | 'none' | 'ready';

interface NextGamePlanLookup {
  state: NextGamePlanState;
  plan?: PlaytimePlan;
  planGameId?: string;
}

/** Looks up whether the game was made from a plan, and which. */
function useNextGamePlanLookup(gameId: string | undefined, refreshKey: unknown): NextGamePlanLookup {
  // Tagged with the game it answers for, so a different next game never shows
  // the previous game's plan while its own lookup runs.
  const [result, setResult] = useState<NextGamePlanLookup & { forId?: string }>({ state: 'loading' });
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
        logger.warn('[useNextGamePlan] plan lookup failed', { error });
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

export interface UseNextGamePlanOptions {
  /** The game on the card; null/undefined skips the lookup (state 'none'). */
  game: HomeUpcomingGame | null | undefined;
  /**
   * Re-runs the lookup when it changes. Home passes its summary, which is
   * rebuilt whenever Home re-reads its data (a modal closed, the match was
   * left) - also when a plan could have been made or removed.
   */
  refreshKey: unknown;
  /** "Näytä suunnitelma" for a one-game plan: the compact plan screen. */
  onShowPlan?: (planId: string, gameId: string) => void;
  /** "Näytä suunnitelma" for a game in a multi-game plan: the full planner on that game. */
  onOpenPlannerAt?: (planId: string, planGameId: string) => void;
  locale: string;
  t: TFunction;
}

export interface NextGamePlan {
  state: NextGamePlanState;
  /** Opens the plan; undefined when no opener was wired. */
  showPlan?: () => void;
  /** The OS share sheet, else the clipboard (with a toast). */
  share: () => void;
}

export function useNextGamePlan({
  game,
  refreshKey,
  onShowPlan,
  onOpenPlannerAt,
  locale,
  t,
}: UseNextGamePlanOptions): NextGamePlan {
  const { showToast } = useToast();
  const lookup = useNextGamePlanLookup(game?.id, refreshKey);

  const showPlan = useCallback(() => {
    if (!game || !lookup.plan || !lookup.planGameId) return;
    // The compact screen is a one-game view; a game from a multi-game plan
    // opens the planner on its own game instead.
    if (lookup.plan.games.length === 1) onShowPlan?.(lookup.plan.id, game.id);
    else onOpenPlannerAt?.(lookup.plan.id, lookup.planGameId);
  }, [game, lookup, onShowPlan, onOpenPlannerAt]);

  const share = useCallback(async () => {
    if (!game || !lookup.plan || !lookup.planGameId) return;
    const text = buildPlanShareText(
      lookup.plan,
      lookup.planGameId,
      {
        teamName: game.teamName ?? '',
        opponent: game.opponent,
        date: game.date,
        time: game.time,
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
        logger.warn('[useNextGamePlan] share failed, copying instead', e);
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast(t('basicHome.copied', 'Rotation copied - paste it into the chat.'), 'success');
    } catch (e) {
      logger.warn('[useNextGamePlan] copy failed', e);
      showToast(t('basicHome.shareFailed', 'Could not share the rotation.'), 'error');
    }
  }, [game, lookup, locale, t, showToast]);

  const shareNow = useCallback(() => void share(), [share]);

  return {
    state: lookup.state,
    showPlan: onShowPlan || onOpenPlannerAt ? showPlan : undefined,
    share: shareNow,
  };
}
