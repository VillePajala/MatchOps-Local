'use client';

import { useEffect, useMemo, useState } from 'react';
import { getGameSubs, type PlannedGameSub } from '@/utils/playtimePlanner/gameSubs';
import { buildPlannedChains, type PlannedChain } from '@/utils/playtimePlanner/plannedChains';
import type { Player, Point } from '@/types';
import logger from '@/utils/logger';

/**
 * The full plan for this game, one chain per position.
 *
 * Sibling of `usePlannedGhosts`, and deliberately shaped the same way: loaded
 * ONCE per game, never reacting to the match clock or to what the coach does.
 * This is the plan as written.
 *
 * Failing to load is non-fatal - the field simply offers no chain view.
 *
 * @module usePlannedChains
 * @category Hooks
 */
export function usePlannedChains(
  gameId: string | null,
  formationSnapPoints: readonly Point[] | undefined,
  players: readonly Player[],
): PlannedChain[] {
  // Keyed by the game it was read for, so a stale result from the previous
  // game can never be shown for this one - and so no state is set
  // synchronously in the effect (react-hooks/set-state-in-effect).
  const [loaded, setLoaded] = useState<{ gameId: string; subs: PlannedGameSub[] } | null>(null);

  useEffect(() => {
    if (!gameId) return;
    let active = true;
    getGameSubs(gameId)
      .then((subs) => { if (active) setLoaded({ gameId, subs }); })
      .catch((err) => {
        logger.warn('[usePlannedChains] could not read the planned subs (non-fatal)', err);
        if (active) setLoaded({ gameId, subs: [] });
      });
    return () => { active = false; };
  }, [gameId]);

  return useMemo(() => {
    if (!gameId || loaded?.gameId !== gameId) return [];
    if (!formationSnapPoints || formationSnapPoints.length === 0) return [];
    // A game with no planned subs has no plan to show - an eleven of bare
    // position pills would be a worse view of the same thing the discs say.
    if (loaded.subs.length === 0) return [];
    return buildPlannedChains(loaded.subs, formationSnapPoints, players);
  }, [gameId, loaded, formationSnapPoints, players]);
}

export default usePlannedChains;
