/**
 * Pelitapa game themes: the concepts a coach picked to go through with the
 * kids for one game. Types and validation only (no imports), so the data
 * layer can use them without pulling in any Pelitapa UI or engine code.
 *
 * Stored OUTSIDE the game model, like the playing-time planner's per-game
 * stores: locally its own collection (GAME_THEMES_KEY, map gameId -> themes),
 * in the cloud the `game_themes` table (migration 066).
 */

/** One picked concept. The pair is the concept's identity (ids are unique per playbook). */
export interface GameTheme {
  playbookId: string;
  conceptId: string;
}

/** Stored shape: real game id -> its themes in the order they were picked. */
export type GameThemesCollection = Record<string, GameTheme[]>;

/** At most this many per game (the cloud function refuses more). */
export const MAX_GAME_THEMES = 12;

const MAX_ID_LENGTH = 128;

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LENGTH;

export function isGameTheme(v: unknown): v is GameTheme {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return isId(o.playbookId) && isId(o.conceptId);
}

/** The key that tells two themes apart. */
export const gameThemeKey = (t: GameTheme): string => `${t.playbookId}/${t.conceptId}`;

export const sameGameTheme = (a: GameTheme, b: GameTheme): boolean =>
  a.playbookId === b.playbookId && a.conceptId === b.conceptId;

/**
 * A clean list: valid entries only (extra fields dropped), each concept once
 * (its first position kept), at most MAX_GAME_THEMES.
 */
export function normalizeGameThemes(list: readonly unknown[]): GameTheme[] {
  const out: GameTheme[] = [];
  const seen = new Set<string>();
  for (const v of list) {
    if (!isGameTheme(v)) continue;
    const theme = { playbookId: v.playbookId, conceptId: v.conceptId };
    const key = gameThemeKey(theme);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(theme);
    if (out.length >= MAX_GAME_THEMES) break;
  }
  return out;
}

/** A stored entry is usable when it is an array (its items are cleaned on read). */
export const isGameThemesEntry = (v: unknown): v is unknown[] => Array.isArray(v);
