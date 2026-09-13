'use client';

import { useEffect, useMemo, useState } from 'react';
import { getGameSubs, type PlannedGameSub } from '@/utils/playtimePlanner/gameSubs';
import { buildPlannedGhosts, type PlannedGhost } from '@/utils/playtimePlanner/ghostSubs';
import type { SubSlot } from '@/utils/formations';
import type { Player } from '@/types';
import logger from '@/utils/logger';

/**
 * Faint markers on the field for planned entries no disc represents.
 *
 * Loads the game's planned schedule ONCE per game and derives placements from
 * it. Deliberately not reactive to the match clock, to substitutions, or to
 * anything the coach does: this is a reminder of the plan, not a tracker of
 * the match. The only thing that moves a ghost is a player being dragged onto
 * its slot, which makes it disappear because the disc now says it better.
 *
 * Failing to load is non-fatal by design - the field simply shows no ghosts,
 * exactly as it did before they existed.
 *
 * @module usePlannedGhosts
 * @category Hooks
 */
export function usePlannedGhosts(
  gameId: string | null,
  subSlots: readonly SubSlot[] | undefined,
  players: readonly Player[],
): PlannedGhost[] {
  // Keyed by the game it was read for, so a stale result from the previous
  // game can never be drawn onto this one - and so no state is set
  // synchronously in the effect (react-hooks/set-state-in-effect).
  const [loaded, setLoaded] = useState<{ gameId: string; subs: PlannedGameSub[] } | null>(null);

  useEffect(() => {
    if (!gameId) return;
    let active = true;
    getGameSubs(gameId)
      .then((subs) => { if (active) setLoaded({ gameId, subs }); })
      .catch((err) => {
        logger.warn('[usePlannedGhosts] could not read the planned subs (non-fatal)', err);
        if (active) setLoaded({ gameId, subs: [] });
      });
    return () => { active = false; };
  }, [gameId]);

  return useMemo(() => {
    if (!gameId || loaded?.gameId !== gameId) return [];
    if (!subSlots || subSlots.length === 0) return [];
    return buildPlannedGhosts(loaded.subs, subSlots, players);
  }, [gameId, loaded, subSlots, players]);
}

export default usePlannedGhosts;
