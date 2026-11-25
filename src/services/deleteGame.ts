/**
 * Delete one match and everything that only exists because of it.
 *
 * Shared by the saved-games list (useLoadGameController) and basic Home's
 * "Poista" on a game that never kicked off (review R2), so both leave the same
 * nothing behind: the game, its clock anchor, its planned-sub schedule and plan
 * link, its Playbook themes, and its voice clips. The cleanup after the game itself is best effort -
 * a failure there is logged, never reported as a failed delete.
 *
 * Returns the deleted id, or null when the game was not found. Throws when the
 * delete itself fails (the caller shows the message).
 */

import { deleteGame as utilDeleteGame } from '@/utils/savedGames';
import { clearTimerAnchor } from '@/utils/timerAnchor';
import { deleteGameSubs } from '@/utils/playtimePlanner/gameSubs';
import { deletePlanLink } from '@/utils/playtimePlanner/planLinks';
import { deleteGameThemes } from '@/playbook/gameThemes';
import { deleteClipsForGame } from '@/utils/audioClipStore';
import logger from '@/utils/logger';

export async function deleteGameWithCleanup(gameId: string, userId: string | undefined): Promise<string | null> {
  const deletedGameId = await utilDeleteGame(gameId, userId);
  if (!deletedGameId) return null;
  clearTimerAnchor(gameId); // a deleted game's clock can never resume
  // Planner bookkeeping: drop the game's planned-sub schedule and plan link so
  // they don't accumulate as orphans (best-effort).
  try {
    await Promise.all([deleteGameSubs(gameId), deletePlanLink(gameId)]);
  } catch (cleanupError) {
    logger.warn('[deleteGame] Planner cleanup after game delete failed (non-fatal):', cleanupError);
  }
  // Playbook themes picked for the game (best effort, like the planner's).
  await deleteGameThemes(gameId).catch((themeError) =>
    logger.warn('[deleteGame] Theme cleanup after game delete failed (non-fatal):', themeError));
  // The match's voice recordings go with it (review 6.5): personal audio about
  // named children, unreachable from any screen once the game is gone. Best
  // effort; the 30-day rotation at app start is the backstop.
  await deleteClipsForGame(gameId, userId).catch((clipError) =>
    logger.warn('[deleteGame] Voice clip cleanup after game delete failed (non-fatal):', clipError));
  return deletedGameId;
}
