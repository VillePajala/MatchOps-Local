/**
 * Playbook game themes: the clean-up rules and the local (IndexedDB) store.
 * @critical a coach's picked themes must round-trip and a storage failure must never wipe them
 */

import { normalizeGameThemes, MAX_GAME_THEMES, type GameTheme } from '../gameThemeTypes';
import { createLocalGameThemeStore, type GameThemeStoreIO } from '../localGameThemeStore';
import { GAME_THEMES_KEY } from '@/config/storageKeys';

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(), log: jest.fn() },
}));

const theme = (conceptId: string, playbookId = 'pepo'): GameTheme => ({ playbookId, conceptId });

function memoryIO(initial: Record<string, unknown> = {}) {
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(initial)) data[k] = JSON.stringify(v);
  const io: GameThemeStoreIO & { failReads: boolean } = {
    failReads: false,
    getJSON: async <T,>(key: string, defaultValue: T): Promise<T> => {
      if (io.failReads) throw new Error('IndexedDB read failed');
      return key in data ? (JSON.parse(data[key]) as T) : defaultValue;
    },
    setJSON: async (key: string, value: unknown) => {
      data[key] = JSON.stringify(value);
    },
  };
  return { io, raw: () => (data[GAME_THEMES_KEY] ? JSON.parse(data[GAME_THEMES_KEY]) : undefined) };
}

describe('normalizeGameThemes', () => {
  it('keeps valid themes in order, each concept once, extra fields dropped', () => {
    expect(
      normalizeGameThemes([
        theme('laita'),
        { playbookId: 'pepo', conceptId: 'avaus', note: 'x' },
        theme('laita'),
        theme('laita', 'other-club'),
      ]),
    ).toEqual([theme('laita'), theme('avaus'), theme('laita', 'other-club')]);
  });

  /** @edge-case */
  it('drops malformed entries', () => {
    expect(
      normalizeGameThemes([null, 'x', { playbookId: 'pepo' }, { playbookId: '', conceptId: 'a' }, { playbookId: 'p', conceptId: 'x'.repeat(129) }, theme('ok')]),
    ).toEqual([theme('ok')]);
  });

  /** @edge-case */
  it('caps the list at MAX_GAME_THEMES', () => {
    const many = Array.from({ length: MAX_GAME_THEMES + 5 }, (_, i) => theme(`c${i}`));
    expect(normalizeGameThemes(many)).toHaveLength(MAX_GAME_THEMES);
  });
});

describe('local game theme store', () => {
  it('saves, reads and replaces a game\'s themes', async () => {
    const { io } = memoryIO();
    const store = createLocalGameThemeStore(io);
    await expect(store.getGameThemes('g1')).resolves.toEqual([]);
    await expect(store.setGameThemes('g1', [theme('laita'), theme('avaus')])).resolves.toBe(true);
    await expect(store.getGameThemes('g1')).resolves.toEqual([theme('laita'), theme('avaus')]);
    await store.setGameThemes('g1', [theme('avaus')]);
    await expect(store.getGameThemes('g1')).resolves.toEqual([theme('avaus')]);
  });

  it('keeps games apart and lists them all', async () => {
    const { io } = memoryIO();
    const store = createLocalGameThemeStore(io);
    await store.setGameThemes('g1', [theme('laita')]);
    await store.setGameThemes('g2', [theme('avaus')]);
    await expect(store.getAllGameThemes()).resolves.toEqual({ g1: [theme('laita')], g2: [theme('avaus')] });
  });

  it('an empty list removes the entry instead of storing []', async () => {
    const { io, raw } = memoryIO();
    const store = createLocalGameThemeStore(io);
    await store.setGameThemes('g1', [theme('laita')]);
    await store.setGameThemes('g1', []);
    expect(raw()).toEqual({});
  });

  it('deleteGameThemes removes one game only (game deletion)', async () => {
    const { io } = memoryIO();
    const store = createLocalGameThemeStore(io);
    await store.setGameThemes('g1', [theme('laita')]);
    await store.setGameThemes('g2', [theme('avaus')]);
    await expect(store.deleteGameThemes('g1')).resolves.toBe(true);
    await expect(store.getAllGameThemes()).resolves.toEqual({ g2: [theme('avaus')] });
    // Deleting a game with no themes is a successful no-op.
    await expect(store.deleteGameThemes('nope')).resolves.toBe(true);
  });

  /** @edge-case */
  it('drops a corrupt entry on read without losing the others', async () => {
    const { io } = memoryIO({ [GAME_THEMES_KEY]: { g1: 'garbage', g2: [theme('avaus'), { bad: true }] } });
    const store = createLocalGameThemeStore(io);
    await expect(store.getAllGameThemes()).resolves.toEqual({ g2: [theme('avaus')] });
  });

  /** @critical */
  it('a failed read aborts a write instead of writing back an empty map', async () => {
    const { io, raw } = memoryIO();
    const store = createLocalGameThemeStore(io);
    await store.setGameThemes('g1', [theme('laita')]);
    io.failReads = true;
    await expect(store.setGameThemes('g2', [theme('avaus')])).resolves.toBe(false);
    await expect(store.deleteGameThemes('g1')).resolves.toBe(false);
    io.failReads = false;
    expect(raw()).toEqual({ g1: [theme('laita')] });
  });

  it('restore (cloud hydration) fills in missing games and never overwrites a local selection', async () => {
    const { io } = memoryIO();
    const store = createLocalGameThemeStore(io);
    await store.setGameThemes('g1', [theme('local')]);
    const written = await store.restoreGameThemes({
      g1: [theme('cloud')],
      g2: [theme('avaus'), theme('avaus')],
      g3: [],
    });
    expect(written).toBe(1);
    await expect(store.getAllGameThemes()).resolves.toEqual({ g1: [theme('local')], g2: [theme('avaus')] });
  });
});
