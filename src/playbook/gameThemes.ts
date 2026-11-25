/**
 * Playbook game themes through the active DataStore (local-first: in cloud
 * mode SyncedDataStore writes IndexedDB and queues the cloud push).
 * Kept apart from gameThemeTypes.ts so the data layer can import the types
 * without this module's DataStore dependency (no import cycle).
 */

import { getDataStore } from '@/datastore/factory';
import type { GameTheme } from './gameThemeTypes';

/** The themes picked for one game ([] if none). */
export const getGameThemes = async (gameId: string): Promise<GameTheme[]> =>
  (await getDataStore()).getGameThemes(gameId);

/** Replace a game's themes (an empty list clears them). True on success. */
export const setGameThemes = async (gameId: string, themes: GameTheme[]): Promise<boolean> =>
  (await getDataStore()).setGameThemes(gameId, themes);

/** Remove a game's themes (the game was deleted). True on success. */
export const deleteGameThemes = async (gameId: string): Promise<boolean> =>
  (await getDataStore()).deleteGameThemes(gameId);
