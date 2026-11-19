/**
 * Playing-Time Planner — the live "planned subs" block in the timer overlay.
 *
 * Reads the planned sub schedule for the current game and, as the match clock
 * advances, returns the GROUP of planned subs that is due now (every sub planned
 * for the same moment, e.g. six changes at half-time, is one group). A group is
 * due from its time for DUE_WINDOW_SECONDS of match clock - long enough to make
 * the change, and the whole break for a half-time change, because the clock
 * stands still then. After that it clears (review R13: an overdue block that
 * stayed up all period read as a change still to make) and the next group ahead
 * of the clock is shown instead, marked not due, or nothing after the last one
 * (onboarding v3, D3c).
 *
 * A pure function of the clock and the schedule - advisory only. It never touches
 * the field, records nothing and keeps no state of its own:
 * - No dismissal: the block simply moves on when the next group falls due. Stored
 *   dismissals used to resurface or vanish wrongly after a resume.
 * - No check against the discs on the field: coaches do not move discs during play,
 *   so the field keeps showing the starting line-up. Suppressing a sub whose
 *   incoming player "is already on the field" hid every sub that brings a starter
 *   back, and any disc-based rule guesses wrong when the discs don't follow the game.
 */

import { useState, useEffect, useMemo } from 'react';
import { getGameSubs, type PlannedGameSub } from '@/utils/playtimePlanner/gameSubs';
import logger from '@/utils/logger';
import type { Player } from '@/types';

/** Every planned sub due at one moment of the match. */
export interface PlannedSubGroup {
  timeSeconds: number;
  /** Display names of the players coming on. */
  inNames: string[];
  /** Display names of the players coming off (empty slots contribute none). */
  outNames: string[];
}

/** The group the timer shows, and whether its time has come. */
export interface PlannedSubPrompt extends PlannedSubGroup {
  /**
   * True from the group's time until the next group falls due (shown amber);
   * false for the first group while it is still ahead of the clock (quiet).
   */
  due: boolean;
}

export interface UsePlannedSubPromptsResult {
  /**
   * The planned change to show: the latest group due now (`due: true`), or
   * otherwise the next group ahead of the clock (`due: false`). Null when
   * nothing is due and nothing is left ahead.
   */
  current: PlannedSubPrompt | null;
  /** How many earlier groups are also due now (changes planned seconds apart). */
  overdueEarlier: number;
}

/**
 * How long a group stays due, in match-clock seconds after its time. While the
 * clock is stopped (a break) it does not run out.
 */
export const DUE_WINDOW_SECONDS = 60;

/** Key prefix of the per-game dismissals the old prompt kept in sessionStorage. */
const LEGACY_DISMISSED_PREFIX = 'matchops_dismissed_sub_prompts_';

/** Removes the dismissal keys the old prompt left behind (it never cleaned them up). */
function clearLegacyDismissals(): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(LEGACY_DISMISSED_PREFIX)) stale.push(key);
    }
    stale.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Session storage unavailable - nothing to clean.
  }
}

/**
 * Groups the due subs by time. A sub whose incoming player no longer resolves
 * (deleted from the roster after the game was created) is skipped - a line reading
 * "player_171..._abc" helps nobody - and a group left with nobody coming on is dropped.
 */
export function groupDueSubs(
  subs: PlannedGameSub[],
  timeElapsedInSeconds: number,
  players: Player[],
): PlannedSubGroup[] {
  return groupSubs(subs.filter((s) => s.timeSeconds <= timeElapsedInSeconds), players);
}

/** Groups subs by time (any time), resolving names; see groupDueSubs for the rules. */
export function groupSubs(subs: PlannedGameSub[], players: Player[]): PlannedSubGroup[] {
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const byTime = new Map<number, PlannedSubGroup>();
  for (const s of subs) {
    const inName = nameById.get(s.inPlayerId);
    if (!inName) continue;
    const group = byTime.get(s.timeSeconds) ?? { timeSeconds: s.timeSeconds, inNames: [], outNames: [] };
    group.inNames.push(inName);
    const outName = s.outPlayerId ? nameById.get(s.outPlayerId) : undefined;
    if (outName) group.outNames.push(outName);
    byTime.set(s.timeSeconds, group);
  }
  return [...byTime.values()].sort((a, b) => a.timeSeconds - b.timeSeconds);
}

/**
 * @param gameId               the current game's id (null when no game is loaded)
 * @param timeElapsedInSeconds the match clock
 * @param players              roster used to resolve player ids to names
 * @param refreshKey           bump to force a re-read of the stored schedule for the
 *                             same game (e.g. after re-applying an edited plan). The
 *                             store isn't reactive, so without this the loaded subs
 *                             stay stale until the game id changes.
 */
export function usePlannedSubPrompts(
  gameId: string | null,
  timeElapsedInSeconds: number,
  players: Player[],
  refreshKey = 0,
): UsePlannedSubPromptsResult {
  // Loaded subs are stamped with the game they belong to. The memo treats a mismatch
  // as empty, so a game change takes effect immediately (no stale block) without any
  // synchronous setState in the effect.
  const [loaded, setLoaded] = useState<{ gameId: string; subs: PlannedGameSub[] } | null>(null);

  useEffect(() => {
    clearLegacyDismissals();
  }, []);

  useEffect(() => {
    if (!gameId) return;
    let active = true;
    getGameSubs(gameId)
      .then((subs) => {
        if (active) setLoaded({ gameId, subs });
      })
      .catch((err) => {
        logger.error('[usePlannedSubPrompts] Failed to load planned subs (non-fatal):', err);
        if (active) setLoaded({ gameId, subs: [] });
      });
    return () => {
      active = false;
    };
  }, [gameId, refreshKey]);

  return useMemo<UsePlannedSubPromptsResult>(() => {
    const subs = loaded && loaded.gameId === gameId ? loaded.subs : [];
    const groups = groupSubs(subs, players);
    const due = groups.filter(
      (g) => g.timeSeconds <= timeElapsedInSeconds && timeElapsedInSeconds < g.timeSeconds + DUE_WINDOW_SECONDS,
    );
    if (due.length > 0) {
      return { current: { ...due[due.length - 1], due: true }, overdueEarlier: due.length - 1 };
    }
    const upcoming = groups.find((g) => g.timeSeconds > timeElapsedInSeconds);
    return { current: upcoming ? { ...upcoming, due: false } : null, overdueEarlier: 0 };
  }, [loaded, gameId, timeElapsedInSeconds, players]);
}
