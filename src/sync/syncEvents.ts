/**
 * Window event: a game's local copy was replaced by the cloud copy after a save made on
 * an outdated copy was refused (review 3.7). detail: { gameId: string }.
 * Kept in its own module so the page can listen without loading the sync executor.
 */
export const GAME_REPLACED_BY_CLOUD_EVENT = 'matchops:game-replaced-by-cloud';

/**
 * Sync stored another device's newer copy of a non-game record on this device, or
 * removed one deleted there (review 3.13b). Screens and caches must re-read, or a
 * save from an open form would write the older copy back as a fresh edit.
 */
export const CLOUD_COPY_ADOPTED_EVENT = 'matchops:cloud-copy-adopted';

/**
 * How many times a game's local copy has been replaced by the cloud copy in this tab
 * (per tab, like the app's other locks - see CLAUDE.md, multi-tab limitation).
 * A match loaded before a replacement holds the outdated game in memory: its saves must
 * not go out (they would now pass the version check), so the match compares the count
 * it loaded with against the current one before saving (review 3.7).
 */
const replacements = new Map<string, number>();
export function markGameReplacedByCloud(gameId: string): void {
  replacements.set(gameId, (replacements.get(gameId) ?? 0) + 1);
}
export function gameReplacementCount(gameId: string): number {
  return replacements.get(gameId) ?? 0;
}

/**
 * Window event: the auth session was refreshed or a user signed in (review 3.10). The
 * sync engine lifts a pause caused by auth failures - otherwise a pause from a false
 * "session expired" (bad signal) lasted until the coach found "Sync now".
 */
export const AUTH_SESSION_REFRESHED_EVENT = 'matchops:auth-session-refreshed';
