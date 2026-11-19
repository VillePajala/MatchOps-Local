/**
 * The plan of one game as plain text, for Home's "Jaa" (Onboarding v3).
 *
 * What a coach sends to the other coaches or the parents' chat: the match,
 * who starts (the keeper marked), who comes on and goes off at which minute,
 * and who is away. Facts only - no claims about fairness (copy rule).
 *
 * Built from the same engine that puts the plan on the game
 * (`buildPrefillFromPlan`), so the text cannot drift from the line-up and the
 * planned subs the match will show.
 */

import type { TFunction } from 'i18next';
import type { PlaytimePlan } from '@/utils/playtimePlanner/types';
import { buildPrefillFromPlan } from '@/utils/playtimePlanner/prefill';
import { formatShortGameDay } from '@/utils/nextGameDates';

export interface PlanShareMeta {
  teamName: string;
  opponent: string;
  /** ISO date of the game. */
  date: string;
  time?: string;
  /** App language, for the weekday. */
  language: string;
}

const clock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

/** The share text, or null when the plan has no such game. */
export function buildPlanShareText(
  plan: PlaytimePlan,
  planGameId: string,
  meta: PlanShareMeta,
  t: TFunction,
): string | null {
  const planGame = plan.games.find((g) => g.id === planGameId);
  if (!planGame) return null;
  const nameOf = new Map(plan.players.map((p) => [p.id, p.name]));
  const roster = plan.players.map((p) => ({ id: p.id, name: p.name }));
  const prefill = buildPrefillFromPlan(plan, planGame, roster);

  const lines: string[] = [];
  lines.push([meta.teamName, meta.opponent].filter(Boolean).join(' – '));
  lines.push([formatShortGameDay(meta.date, meta.language), meta.time].filter(Boolean).join(' '));
  lines.push('');

  // Keeper first, then the rest in pitch order.
  const starters = [...prefill.playersOnField].sort((a, b) => Number(!!b.isGoalie) - Number(!!a.isGoalie));
  if (starters.length > 0) {
    const names = starters.map((p) =>
      p.isGoalie ? t('planShare.keeper', '{{name}} (GK)', { name: p.name }) : p.name,
    );
    lines.push(`${t('planShare.starting', 'Starting')}: ${names.join(', ')}`);
  }

  // One line per moment, every change at that moment together.
  const byTime = new Map<number, { in: string[]; out: string[] }>();
  for (const sub of prefill.plannedSubs) {
    const entry = byTime.get(sub.timeSeconds) ?? { in: [], out: [] };
    entry.in.push(nameOf.get(sub.inPlayerId) ?? sub.inPlayerId);
    if (sub.outPlayerId) entry.out.push(nameOf.get(sub.outPlayerId) ?? sub.outPlayerId);
    byTime.set(sub.timeSeconds, entry);
  }
  if (byTime.size > 0) {
    lines.push(`${t('planShare.changes', 'Changes')}:`);
    for (const [time, entry] of [...byTime.entries()].sort((a, b) => a[0] - b[0])) {
      const parts = [`${t('planShare.in', 'On')}: ${entry.in.join(', ')}`];
      if (entry.out.length > 0) parts.push(`${t('planShare.out', 'Off')}: ${entry.out.join(', ')}`);
      lines.push(`${clock(time)} ${parts.join(' · ')}`);
    }
  }

  const absent = (planGame.absentIds ?? []).map((id) => nameOf.get(id)).filter((n): n is string => !!n);
  if (absent.length > 0) lines.push(`${t('planShare.absent', 'Away')}: ${absent.join(', ')}`);

  return lines.join('\n').trim();
}
