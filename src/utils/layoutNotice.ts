/**
 * The basic-layout notice ("Aloitat kevennetyllä näkymällä"): WHEN it shows.
 * Pure rules plus one in-memory record of this app session; no storage here.
 *
 * Only accounts on the basic layout ever see it, at most three times:
 *
 *   #1  the first Home visit after the setup wizard (the wizard's last step
 *       lands on Home).
 *   #2  after the coach's FIRST finished game.
 *   #3  after the THIRD finished game. Never again after that.
 *
 * Reminders #2 and #3 never show straight after "Viimeistele ottelu". The rule
 * (simple on purpose): the game must have been finished BEFORE this app session
 * started (the next time the app is opened), or - when the coach finishes it
 * and keeps the app open - at least an hour must have passed since this session
 * first saw it finished. A finished-game count that only rises during the
 * session therefore waits; a count already reached at launch counts at once.
 *
 * Safety, for every notice: Home only (the caller renders it on Home alone),
 * never while a game scheduled for today has not kicked off (match day before
 * kick-off), at most one notice per calendar day, never on the full layout, and
 * nothing at all once the coach chose "Älä näytä enää".
 *
 * The shown / stopped marks live in the account's onboarding milestones
 * (`layoutNotice1Shown`... `layoutNoticeStopped`), so they follow the account to
 * a new phone. If more than one reminder is due at once (three games finished
 * before #2 was ever seen), only the latest is shown and the earlier ones are
 * marked shown with it.
 */

import type { AppLayout, OnboardingMilestone, OnboardingMilestones } from '@/types/settings';
import type { AppState } from '@/types';
import { hasMatchStarted } from '@/utils/homeSummary';
import { todayIso } from '@/utils/todayIso';

export type LayoutNoticeNumber = 1 | 2 | 3;
type ReminderNumber = 2 | 3;

export const LAYOUT_NOTICE_SHOWN: Record<LayoutNoticeNumber, OnboardingMilestone> = {
  1: 'layoutNotice1Shown',
  2: 'layoutNotice2Shown',
  3: 'layoutNotice3Shown',
};

/** Finished games that make each reminder due. */
export const REMINDER_FINISHED_GAMES: Record<ReminderNumber, number> = { 2: 1, 3: 3 };

/** A reminder reached during this session waits this long (or the next app open). */
export const SAME_SESSION_WAIT_MS = 60 * 60 * 1000;

/** What this app session has seen of the account's finished-game count. */
export interface FinishedGamesSession {
  /** The count the session first saw (at launch). */
  baseline: number;
  /** When, during this session, the count first reached each reminder's threshold. */
  reachedAt: Partial<Record<ReminderNumber, number>>;
}

/** The facts Home's data gives the notice. */
export interface LayoutNoticeFacts {
  /** Games of the account at full time (`gameStatus === 'gameEnd'`). */
  finishedGames: number;
  /** Every saved game, finished or not. */
  savedGames: number;
  /** A game is scheduled for today and has not kicked off. */
  matchDayPending: boolean;
}

/** Home's notice facts from the saved games (the scratch workspace excluded). */
export function layoutNoticeFacts(
  games: Record<string, AppState | undefined> | null | undefined,
  today: string,
  scratchId = 'unsaved_game',
): LayoutNoticeFacts {
  const entries = Object.entries(games ?? {}).filter(
    (entry): entry is [string, AppState] => entry[0] !== scratchId && !!entry[1],
  );
  return {
    finishedGames: entries.filter(([, g]) => g.gameStatus === 'gameEnd').length,
    savedGames: entries.length,
    matchDayPending: entries.some(([, g]) => g.gameDate === today && !hasMatchStarted(g, today)),
  };
}

export interface LayoutNoticeInput {
  layout: AppLayout | undefined;
  milestones: OnboardingMilestones | undefined;
  /** The account has been through the setup wizard (finished or skipped). */
  wizardSeen: boolean;
  facts: LayoutNoticeFacts;
  /** This session's view of the finished-game count; null = not observed yet. */
  session: FinishedGamesSession | null;
  now: Date;
}

/** Whether any notice was already shown on `now`'s calendar day (local time). */
function shownToday(milestones: OnboardingMilestones, now: Date): boolean {
  const today = todayIso(now);
  return ([1, 2, 3] as const).some((n) => {
    const at = milestones[LAYOUT_NOTICE_SHOWN[n]];
    return !!at && todayIso(new Date(at)) === today;
  });
}

function reminderDue(n: ReminderNumber, input: LayoutNoticeInput): boolean {
  const { milestones, facts, session, now } = input;
  if (milestones?.[LAYOUT_NOTICE_SHOWN[n]]) return false;
  const needed = REMINDER_FINISHED_GAMES[n];
  if (facts.finishedGames < needed || !session) return false;
  // Finished before this app session started: the next app open is enough.
  if (session.baseline >= needed) return true;
  // Finished during this session: wait at least an hour.
  const reached = session.reachedAt[n];
  return reached !== undefined && now.getTime() - reached >= SAME_SESSION_WAIT_MS;
}

/** The notice to show now, or null. Pure. */
export function dueLayoutNotice(input: LayoutNoticeInput): LayoutNoticeNumber | null {
  const { layout, milestones = {}, wizardSeen, facts, now } = input;
  if (layout !== 'basic') return null;
  if (milestones.layoutNoticeStopped) return null;
  if (milestones.layoutNotice3Shown) return null;
  if (facts.matchDayPending) return null;
  if (shownToday(milestones, now)) return null;
  if (!milestones.layoutNotice1Shown) return wizardSeen ? 1 : null;
  if (reminderDue(3, input)) return 3;
  if (reminderDue(2, input)) return 2;
  return null;
}

/** The marks to write when notice `n` is shown: it and every earlier one. */
export function shownMarks(n: LayoutNoticeNumber): OnboardingMilestone[] {
  return ([1, 2, 3] as const).filter((k) => k <= n).map((k) => LAYOUT_NOTICE_SHOWN[k]);
}

// --- This app session --------------------------------------------------------
// In memory on purpose: "this session" is exactly the lifetime of the page.

const sessions = new Map<string, FinishedGamesSession>();
let noticeShownThisSession = false;

/**
 * Called whenever the account's games were read. The first call for an account
 * sets the baseline; later calls note when a reminder's threshold is reached.
 */
export function observeFinishedGames(accountKey: string, finishedGames: number, nowMs: number = Date.now()): void {
  const session = sessions.get(accountKey);
  if (!session) {
    sessions.set(accountKey, { baseline: finishedGames, reachedAt: {} });
    return;
  }
  for (const n of [2, 3] as const) {
    const needed = REMINDER_FINISHED_GAMES[n];
    if (finishedGames >= needed && session.baseline < needed && session.reachedAt[n] === undefined) {
      session.reachedAt[n] = nowMs;
    }
  }
}

export function getFinishedGamesSession(accountKey: string): FinishedGamesSession | null {
  return sessions.get(accountKey) ?? null;
}

/** One notice per app session at most (a second could only be a repeat). */
export function wasLayoutNoticeShownThisSession(): boolean {
  return noticeShownThisSession;
}

export function markLayoutNoticeShownThisSession(): void {
  noticeShownThisSession = true;
}

/** Test seam. */
export function resetLayoutNoticeSession(): void {
  sessions.clear();
  noticeShownThisSession = false;
}
