import type { DebugCategory } from './debug';

// Helper to (re)load the module with fresh env
async function loadDebug() {
  jest.resetModules();
  const mod = await import('./debug');
  return mod.default as { enabled: (category?: DebugCategory) => boolean };
}

describe('debug utility', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_DEBUG;
    delete process.env.NEXT_PUBLIC_DEBUG_ALL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('enabled()', () => {
    it('returns true when NEXT_PUBLIC_DEBUG_ALL=1', async () => {
      process.env.NEXT_PUBLIC_DEBUG_ALL = '1';
      const debug = await loadDebug();
      expect(debug.enabled('home')).toBe(true);
      expect(debug.enabled('history')).toBe(true);
    });

    it('returns true for enabled categories', async () => {
      process.env.NEXT_PUBLIC_DEBUG = 'home,history';
      const debug = await loadDebug();
      expect(debug.enabled('home')).toBe(true);
      expect(debug.enabled('history')).toBe(true);
      expect(debug.enabled('home')).toBe(true);
    });

    it('handles whitespace correctly', async () => {
      process.env.NEXT_PUBLIC_DEBUG = ' home , history ';
      const debug = await loadDebug();
      expect(debug.enabled('home')).toBe(true);
      expect(debug.enabled('history')).toBe(true);
    });

    it('returns false when no debug flags set', async () => {
      const debug = await loadDebug();
      expect(debug.enabled('home')).toBe(false);
      expect(debug.enabled('history')).toBe(false);
    });

    it('returns true when category omitted and any category is enabled', async () => {
      process.env.NEXT_PUBLIC_DEBUG = 'home';
      const debug = await loadDebug();
      expect(debug.enabled()).toBe(true);
    });
  });
});

