/**
 * Roster-removal detection for the live-game pruning cascade (L.2).
 *
 * The club roster is edited in the page-level roster modal
 * (useRosterSettingsController); the game side observes the shared
 * masterRoster query and must prune players deleted DURING the session from
 * the live field/selection. Only ids seen in a previous snapshot count as
 * removed - a first snapshot never reports removals, so loading a legacy
 * game whose players were deleted long ago is untouched (this matches the
 * old explicit remove-handler cascade semantics).
 */
import type { Player } from '@/types';

export interface RosterRemovalDiff {
  /** Ids present in the previous snapshot but missing from the current roster. */
  removedIds: Set<string>;
  /** The snapshot to carry to the next comparison. */
  nextSnapshot: Set<string>;
}

export function diffRemovedRosterIds(
  previousSnapshot: Set<string> | null,
  currentRoster: Player[] | undefined,
): RosterRemovalDiff {
  const nextSnapshot = new Set((currentRoster || []).map((p) => p.id));
  if (!previousSnapshot) {
    return { removedIds: new Set(), nextSnapshot };
  }
  const removedIds = new Set([...previousSnapshot].filter((id) => !nextSnapshot.has(id)));
  return { removedIds, nextSnapshot };
}
