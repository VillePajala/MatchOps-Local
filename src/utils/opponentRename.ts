/**
 * Planning a rename of one opponent name across everything that mentions it.
 *
 * Separated from the UI because this is the destructive half: it decides which
 * games and which competition lists get rewritten. A plan is computed, shown to
 * the coach with its counts, and only then applied - nothing here writes.
 *
 * Scope is ONE normalised name at a time (see `opponentNames.ts`). The tool
 * never proposes merging two different names, because it cannot tell whether
 * "IPS Punainen" and "IPS Sininen" are the same club's two teams or two
 * unrelated ones - and they are usually two different squads.
 *
 * @module opponentRename
 * @category Utils
 */

import type { AppState, SavedGamesCollection } from '@/types/game';
import type { Season } from '@/types';
import { normalizeOpponentName, addOpponentToList } from './opponentNames';

export interface OpponentRenamePlan {
  /** The canonical spelling everything will be rewritten to. */
  canonical: string;
  /** Games whose opponentName changes. Games already spelled canonically are excluded. */
  gameIds: string[];
  /** Competitions whose list changes. */
  seasonIds: string[];
  /** True when nothing would change - the UI should not offer to apply it. */
  isNoop: boolean;
}

/**
 * What a rename would touch.
 *
 * Matching is by normalised key, so every spelling of the name is caught; rows
 * that already read exactly `canonical` are left out so the counts shown to the
 * coach are the number of things that actually change.
 */
export function planOpponentRename(
  key: string,
  canonical: string,
  savedGames: SavedGamesCollection | undefined,
  seasons: readonly Season[] | undefined,
): OpponentRenamePlan {
  const target = canonical.trim();
  const normalizedKey = normalizeOpponentName(key);

  const gameIds: string[] = [];
  if (normalizedKey && target) {
    for (const [id, game] of Object.entries(savedGames ?? {})) {
      const name = (game as AppState | undefined)?.opponentName ?? '';
      if (normalizeOpponentName(name) === normalizedKey && name !== target) {
        gameIds.push(id);
      }
    }
  }

  const seasonIds: string[] = [];
  if (normalizedKey && target) {
    for (const season of seasons ?? []) {
      const list = season.opponents ?? [];
      const touches = list.some(
        (name) => normalizeOpponentName(name) === normalizedKey && name !== target,
      );
      if (touches) seasonIds.push(season.id);
    }
  }

  return {
    canonical: target,
    gameIds,
    seasonIds,
    isNoop: !target || (gameIds.length === 0 && seasonIds.length === 0),
  };
}

/**
 * The competition's list after the rename.
 *
 * Every spelling of the name collapses to `canonical`, and `addOpponentToList`
 * keeps that from producing a duplicate when the canonical spelling was already
 * present alongside a variant. Order is otherwise preserved.
 */
export function renameInOpponentList(
  list: readonly string[],
  key: string,
  canonical: string,
): string[] {
  const normalizedKey = normalizeOpponentName(key);
  return list.reduce<string[]>((kept, name) => {
    const replacement = normalizeOpponentName(name) === normalizedKey ? canonical : name;
    return addOpponentToList(kept, replacement);
  }, []);
}
