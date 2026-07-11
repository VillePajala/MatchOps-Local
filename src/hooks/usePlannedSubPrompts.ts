/**
 * Playing-Time Planner Phase 2 — live timer sub-prompts (PR 2.3).
 *
 * Reads the planned sub schedule for the current game (the local-only 2.1 store) and,
 * as the match clock advances, surfaces the earliest planned sub whose time has passed
 * and that the coach hasn't dismissed yet. Advisory only: it never touches the field or
 * records an event — the coach substitutes as normal. The prompt persists until
 * dismissed and fires once per planned sub (dismissing removes it for good this game).
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { getGameSubs, type PlannedGameSub } from '@/utils/playtimePlanner/gameSubs';
import logger from '@/utils/logger';
import type { Player } from '@/types';

export interface PlannedSubPrompt {
  subId: string;
  timeSeconds: number;
  /** Display name of the player coming on. */
  inName: string;
  /** Display name of the player coming off, or null if the slot was empty. */
  outName: string | null;
}

export interface UsePlannedSubPromptsResult {
  /** The earliest due, not-yet-dismissed planned sub, or null. */
  prompt: PlannedSubPrompt | null;
  /** Acknowledge a prompt so it won't show again this game. */
  dismiss: (subId: string) => void;
}

const nameFor = (players: Player[], id: string | null): string | null => {
  if (!id) return null;
  return players.find((p) => p.id === id)?.name ?? null;
};

/**
 * @param gameId               the current game's id (null when no game is loaded)
 * @param timeElapsedInSeconds the match clock
 * @param players              roster used to resolve player ids to names
 * @param refreshKey           bump to force a re-read of the stored schedule for the
 *                             same game (e.g. after re-applying an edited plan). The
 *                             store isn't reactive, so without this the loaded subs
 *                             stay stale until the game id changes.
 */
const EMPTY_IDS: ReadonlySet<string> = new Set();

export function usePlannedSubPrompts(
  gameId: string | null,
  timeElapsedInSeconds: number,
  players: Player[],
  refreshKey = 0,
): UsePlannedSubPromptsResult {
  // Loaded subs and dismissals are stamped with the game they belong to. The memo
  // treats a mismatch as empty, so a game change takes effect immediately (no stale
  // prompts) without any synchronous setState in the effect.
  const [loaded, setLoaded] = useState<{ gameId: string; subs: PlannedGameSub[] } | null>(null);
  const [dismissed, setDismissed] = useState<{ gameId: string | null; ids: Set<string> }>(() => ({
    gameId: null,
    ids: new Set(),
  }));

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

  const dismiss = useCallback(
    (subId: string) => {
      setDismissed((prev) => {
        const ids = prev.gameId === gameId ? new Set(prev.ids) : new Set<string>();
        ids.add(subId);
        return { gameId, ids };
      });
    },
    [gameId],
  );

  const prompt = useMemo<PlannedSubPrompt | null>(() => {
    const subs = loaded && loaded.gameId === gameId ? loaded.subs : [];
    const dismissedIds = dismissed.gameId === gameId ? dismissed.ids : EMPTY_IDS;
    const due = subs
      .filter((s) => s.timeSeconds <= timeElapsedInSeconds && !dismissedIds.has(s.id))
      .sort((a, b) => a.timeSeconds - b.timeSeconds);
    const next = due[0];
    if (!next) return null;
    const inName = nameFor(players, next.inPlayerId);
    return {
      subId: next.id,
      timeSeconds: next.timeSeconds,
      inName: inName ?? next.inPlayerId,
      outName: nameFor(players, next.outPlayerId),
    };
  }, [loaded, gameId, dismissed, timeElapsedInSeconds, players]);

  return { prompt, dismiss };
}
