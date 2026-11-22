/**
 * Pelitapa game themes - the LOCAL (IndexedDB) backend.
 *
 * Same shape and rules as the planner's per-game subs store
 * (utils/playtimePlanner/localPlanStore.ts): a factory over injected JSON IO so
 * it writes the same database as every other entity (the per-user database
 * when signed in), key-locked writes, strict reads inside writes (a failed read
 * must never be written back as an empty map), tolerant reads for queries.
 * LocalDataStore is the only runtime consumer.
 */

import { withKeyLock } from '@/utils/storageKeyLock';
import { GAME_THEMES_KEY } from '@/config/storageKeys';
import logger from '@/utils/logger';
import { isGameThemesEntry, normalizeGameThemes, type GameTheme, type GameThemesCollection } from './gameThemeTypes';

export interface GameThemeStoreIO {
  getJSON<T>(key: string, defaultValue: T): Promise<T>;
  setJSON(key: string, value: unknown): Promise<void>;
}

export interface LocalGameThemeStore {
  getGameThemes(gameId: string): Promise<GameTheme[]>;
  getAllGameThemes(): Promise<GameThemesCollection>;
  setGameThemes(gameId: string, themes: GameTheme[]): Promise<boolean>;
  deleteGameThemes(gameId: string): Promise<boolean>;
  /** Cloud hydration: fill in games with no local entry (local edits win). Returns how many were written. */
  restoreGameThemes(incoming: GameThemesCollection): Promise<number>;
}

export function createLocalGameThemeStore(io: GameThemeStoreIO): LocalGameThemeStore {
  /** Strict: an IO failure throws. A corrupt entry drops only itself. */
  const readOrThrow = async (): Promise<GameThemesCollection> => {
    const raw = await io.getJSON<Record<string, unknown>>(GAME_THEMES_KEY, {});
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const valid: GameThemesCollection = {};
    for (const [gameId, entry] of Object.entries(raw)) {
      if (!isGameThemesEntry(entry)) {
        logger.warn(`[Pelitapa] Dropping invalid stored themes for game "${gameId}"`);
        continue;
      }
      const themes = normalizeGameThemes(entry);
      if (themes.length > 0) valid[gameId] = themes;
    }
    return valid;
  };

  const readTolerant = async (): Promise<GameThemesCollection> => {
    try {
      return await readOrThrow();
    } catch (error) {
      logger.error('[Pelitapa] Failed to read game themes:', error);
      return {};
    }
  };

  const getGameThemes = async (gameId: string): Promise<GameTheme[]> => (await readTolerant())[gameId] ?? [];

  const getAllGameThemes = (): Promise<GameThemesCollection> => readTolerant();

  /** Overwrites the game's themes; an empty list removes the entry. */
  const setGameThemes = async (gameId: string, themes: GameTheme[]): Promise<boolean> => {
    try {
      return await withKeyLock(GAME_THEMES_KEY, async () => {
        const all = await readOrThrow();
        const clean = normalizeGameThemes(themes);
        if (clean.length === 0) delete all[gameId];
        else all[gameId] = clean;
        await io.setJSON(GAME_THEMES_KEY, all);
        return true;
      });
    } catch (error) {
      logger.error('[Pelitapa] Failed to save game themes:', error);
      return false;
    }
  };

  const deleteGameThemes = async (gameId: string): Promise<boolean> => {
    try {
      return await withKeyLock(GAME_THEMES_KEY, async () => {
        const all = await readOrThrow();
        if (!(gameId in all)) return true;
        delete all[gameId];
        await io.setJSON(GAME_THEMES_KEY, all);
        return true;
      });
    } catch (error) {
      logger.error('[Pelitapa] Failed to delete game themes:', error);
      return false;
    }
  };

  const restoreGameThemes = async (incoming: GameThemesCollection): Promise<number> => {
    try {
      return await withKeyLock(GAME_THEMES_KEY, async () => {
        const current = await readOrThrow();
        let written = 0;
        for (const [gameId, entry] of Object.entries(incoming)) {
          if (gameId in current || !Array.isArray(entry)) continue;
          const themes = normalizeGameThemes(entry);
          if (themes.length === 0) continue;
          current[gameId] = themes;
          written += 1;
        }
        if (written > 0) await io.setJSON(GAME_THEMES_KEY, current);
        return written;
      });
    } catch (error) {
      logger.error('[Pelitapa] Failed to restore game themes:', error);
      return 0;
    }
  };

  return { getGameThemes, getAllGameThemes, setGameThemes, deleteGameThemes, restoreGameThemes };
}
