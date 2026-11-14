/**
 * Window event: a game's local copy was replaced by the cloud copy after a save made on
 * an outdated copy was refused (review 3.7). detail: { gameId: string }.
 * Kept in its own module so the page can listen without loading the sync executor.
 */
export const GAME_REPLACED_BY_CLOUD_EVENT = 'matchops:game-replaced-by-cloud';

/**
 * How many times a game's local copy has been replaced by the cloud copy in this tab.
 * A match loaded before a replacement holds the outdated game in memory: its saves must
 * not go out (they would now pass the version check), so the match compares the count
 * it loaded with against the current one before saving (review 3.7).
 */
const replacements = new Map<string, number>();
export function markGameReplacedByCloud(gameId: string): void {
  replacements.set(gameId, (replacements.get(gameId) ?? 0) + 1);
}
/** Undo a mark whose replacement did not complete (the old version check still guards). */
export function unmarkGameReplacedByCloud(gameId: string): void {
  const n = (replacements.get(gameId) ?? 0) - 1;
  if (n > 0) replacements.set(gameId, n); else replacements.delete(gameId);
}
export function gameReplacementCount(gameId: string): number {
  return replacements.get(gameId) ?? 0;
}
