'use client';

/**
 * The plan report's prompts outside the planner: Home's ("Joulufutis 12.12. valmis · Tee raportti"),
 * shared by both layouts. The most recent plan whose games are all finished
 * and whose day report is not written yet, for a week after its last game
 * (findDayReportPrompts holds the rule).
 */

import { useEffect, useRef, useState } from 'react';
import { useDataStore } from '@/hooks/useDataStore';
import { getSavedGames } from '@/utils/savedGames';
import { getPlan, getPlans } from '@/utils/playtimePlanner/storage';
import { getAllPlanLinks, getPlanLink } from '@/utils/playtimePlanner/planLinks';
import { findDayReportPrompts, planDayStatus, promptsDayReport, type DayReportPrompt } from '@/utils/playtimePlanner/dayReportPrompts';
import { isDayGamePlayed } from '@/utils/playtimePlanner/dayReport';
import type { AppState } from '@/types/game';
import { todayIso } from '@/utils/todayIso';
import logger from '@/utils/logger';

/**
 * @param enabled  false skips the lookup (layout not known yet).
 * @param refreshKey  re-runs the lookup when it changes (Home's summary is
 *   rebuilt whenever Home re-reads its data - a match was left, a modal closed).
 */
export function useDayReportPrompt(enabled: boolean, refreshKey: unknown): DayReportPrompt | null {
  const { userId } = useDataStore();
  const [prompt, setPrompt] = useState<DayReportPrompt | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const [plans, links, games] = await Promise.all([getPlans(), getAllPlanLinks(), getSavedGames(userId)]);
        const found = findDayReportPrompts(Object.values(plans), links, games, todayIso());
        if (!cancelled) setPrompt(found[0] ?? null);
      } catch (error) {
        // A missing prompt is harmless; Home must not fail over it.
        logger.warn('[useDayReportPrompt] lookup failed', { error });
        if (!cancelled) setPrompt(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey, userId]);

  return enabled ? prompt : null;
}

/** The plan whose report the finish screen offers. */
export interface LastPlanGame {
  planId: string;
  planName: string;
}

/**
 * The finish screen's "Suunnitelman viimeinen peli pelattu · <plan> · Raportti":
 * the plan the open game was made from, when the plan has 2+ games made from
 * it and every one is now finished - this was the plan's last game
 * (promptsDayReport holds the rule). The open game counts as it is on screen
 * (`currentGame`) and counts once it is played at all: the coach finishing it
 * is what ends it.
 *
 * Returns the plan, or null.
 */
export function useLastDayGamePlan(
  currentGameId: string | null | undefined,
  currentGame: AppState | undefined,
  enabled: boolean,
): LastPlanGame | null {
  const { userId } = useDataStore();
  const [result, setResult] = useState<{ forGameId: string; plan: LastPlanGame | null } | null>(null);
  // Re-checked when the game's played-ness can change, not on every keystroke;
  // the game itself is read through a ref at lookup time.
  const playedNow = currentGame ? isDayGamePlayed(currentGame) : false;
  const currentGameRef = useRef(currentGame);
  useEffect(() => {
    currentGameRef.current = currentGame;
  }, [currentGame]);
  const active = enabled && !!currentGameId && playedNow;

  useEffect(() => {
    if (!active || !currentGameId) return;
    let cancelled = false;
    void (async () => {
      try {
        const link = await getPlanLink(currentGameId);
        const plan = link ? await getPlan(link.planId) : null;
        if (!plan || plan.archived) {
          if (!cancelled) setResult({ forGameId: currentGameId, plan: null });
          return;
        }
        const [links, games] = await Promise.all([getAllPlanLinks(), getSavedGames(userId)]);
        const onScreen = currentGameRef.current;
        const merged = onScreen ? { ...games, [currentGameId]: onScreen } : games;
        const status = planDayStatus(plan, links, merged, currentGameId);
        if (!cancelled) {
          setResult({
            forGameId: currentGameId,
            plan: promptsDayReport(status) ? { planId: plan.id, planName: plan.name.trim() } : null,
          });
        }
      } catch (error) {
        logger.warn('[useLastDayGamePlan] lookup failed', { error });
        if (!cancelled) setResult({ forGameId: currentGameId, plan: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, currentGameId, userId]);

  return active && result?.forGameId === currentGameId ? result.plan : null;
}
