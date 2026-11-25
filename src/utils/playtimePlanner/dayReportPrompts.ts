/**
 * When to OFFER the day report ("Turnauspäivän raportti") outside the plan.
 *
 * The plan's own entry shows once one of its games is played. Two more places
 * offer it once the whole day is done - every game made from the plan played:
 *
 * - the finish screen ("Viimeistele ottelu") of the day's last game, and
 * - Home, as a row "<plan> valmis · Tee raportti" - until the day report is
 *   written or a week has passed since the last game (a prompt that never
 *   goes away turns into noise).
 *
 * Pure: the callers load plans, links and games.
 */

import type { AppState } from '@/types/game';
import { daysBetween } from '@/utils/todayIso';
import { createdGameIdsForPlan } from './createFromPlan';
import { isDayGameFinished, isDayGamePlayed } from './dayReport';
import type { PlanLinksCollection } from './planLinks';
import type { PlaytimePlan } from './types';

/** Home offers the report for this many days after the day's last game (day 0 = that day). */
export const DAY_REPORT_PROMPT_DAYS = 7;

export interface PlanDayStatus {
  /** Real games made from the plan (that still exist). */
  linked: number;
  /** Of those, finished. */
  finished: number;
  /** At least one game, and every one of them finished. */
  allFinished: boolean;
  /** The latest game date among them (YYYY-MM-DD), when any has one. */
  lastGameDate?: string;
}

/**
 * The state of a plan's day. `currentGameId` names the game whose finish
 * screen is open: that game counts once it is played at all, because the
 * coach finishing it is what ends it.
 */
export function planDayStatus(
  plan: PlaytimePlan,
  links: PlanLinksCollection,
  games: Record<string, AppState>,
  currentGameId?: string,
): PlanDayStatus {
  const ids = Object.values(createdGameIdsForPlan(games, links, plan.id));
  let finished = 0;
  let lastGameDate: string | undefined;
  for (const id of ids) {
    const game = games[id];
    if (!game) continue;
    const done = id === currentGameId ? isDayGamePlayed(game) : isDayGameFinished(game);
    if (done) finished += 1;
    const date = game.gameDate?.slice(0, 10);
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && (!lastGameDate || date > lastGameDate)) lastGameDate = date;
  }
  return {
    linked: ids.length,
    finished,
    allFinished: ids.length > 0 && finished === ids.length,
    ...(lastGameDate ? { lastGameDate } : {}),
  };
}

export interface DayReportPrompt {
  planId: string;
  planName: string;
  lastGameDate: string;
}

/**
 * The plans Home should offer a day report for, the most recent day first:
 * not archived, every game made from it finished, no day report written yet,
 * and the last game at most DAY_REPORT_PROMPT_DAYS - 1 days ago. A day with no
 * game date is never offered (the week cannot be counted).
 */
export function findDayReportPrompts(
  plans: PlaytimePlan[],
  links: PlanLinksCollection,
  games: Record<string, AppState>,
  today: string,
): DayReportPrompt[] {
  const out: DayReportPrompt[] = [];
  for (const plan of plans) {
    if (plan.archived || plan.dayReport?.trim()) continue;
    const status = planDayStatus(plan, links, games);
    if (!status.allFinished || !status.lastGameDate) continue;
    // A date ahead of today (a mis-dated game) is not a finished day.
    if (status.lastGameDate > today) continue;
    if (daysBetween(status.lastGameDate, today) >= DAY_REPORT_PROMPT_DAYS) continue;
    out.push({ planId: plan.id, planName: plan.name.trim(), lastGameDate: status.lastGameDate });
  }
  return out.sort((a, b) => b.lastGameDate.localeCompare(a.lastGameDate) || a.planName.localeCompare(b.planName));
}
