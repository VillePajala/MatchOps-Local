import { waitFor } from '@testing-library/react';

/**
 * Tests for Service Worker configuration and caching strategy
 * @critical - Service worker affects app updates and offline behavior
 */

describe('Service Worker Configuration', () => {
  const fs = require('fs');
  const path = require('path');

  let swContent: string;

  beforeAll(() => {
    const swPath = path.join(process.cwd(), 'public', 'sw.js');
    swContent = fs.readFileSync(swPath, 'utf8');
  });

  describe('Caching Strategy', () => {
    it('should have versioned cache name', () => {
      expect(swContent).toMatch(/const CACHE_NAME = ['"]matchops-/);
    });

    it('should use network-first for HTML documents with cache fallback', () => {
      // Check that HTML/navigate requests are handled
      expect(swContent).toContain("request.destination === 'document'");
      expect(swContent).toContain("request.mode === 'navigate'");
      // Network-first: try fetch, cache response, fallback to cache on failure.
      // (Document cache/match key specifics are asserted in the dedicated
      // query-stripped-key test below — the document handler no longer uses the
      // raw request as the cache key.)
      expect(swContent).toContain('fetch(request)');
    });

    it('should cache documents under a query-stripped key to bound cache growth', () => {
      // Documents are cached/matched by origin+pathname (not the full URL), so
      // infinitely-varying query strings for one route can't grow the cache unbounded.
      expect(swContent).toContain('const documentCacheKey = url.origin + url.pathname');
      expect(swContent).toContain('cache.put(documentCacheKey');
      expect(swContent).toContain('caches.match(documentCacheKey)');
    });

    it('should have offline assets in precache list', () => {
      expect(swContent).toContain("'/offline.html'");
      expect(swContent).toContain("'/offline.css'");
      expect(swContent).toContain("'/offline.js'");
    });

    it('should serve offline page when network fails for HTML', () => {
      expect(swContent).toContain("caches.match('/offline.html')");
    });

    it('should have final fallback if nothing cached', () => {
      // If neither the requested page nor offline.html is cached, return minimal inline HTML
      expect(swContent).toContain('Final fallback if nothing cached');
      expect(swContent).toContain("new Response(");
      expect(swContent).toContain("'Content-Type': 'text/html'");
    });

    it('should have cache size limit', () => {
      expect(swContent).toContain('MAX_CACHE_ENTRIES');
      expect(swContent).toContain('trimCache');
    });

    it('should use cache-first for static assets', () => {
      expect(swContent).toContain("request.destination === 'script'");
      expect(swContent).toContain("request.destination === 'style'");
      expect(swContent).toContain("request.destination === 'image'");
      expect(swContent).toContain("request.destination === 'font'");
    });

    it('should use stale-while-revalidate for manifest.json', () => {
      expect(swContent).toContain("url.pathname === '/manifest.json'");
      // Should return cached response immediately
      expect(swContent).toContain('cachedResponse || fetchPromise');
    });

    it('should include icons in precache', () => {
      expect(swContent).toContain("'/icons/icon-192x192.png'");
      expect(swContent).toContain("'/icons/icon-512x512.png'");
    });

    it('should include manifest in precache', () => {
      expect(swContent).toContain("'/manifest.json'");
    });
  });

  describe('Update Flow', () => {
    it('should NOT auto-activate (wait for user)', () => {
      // Should have comment about not calling skipWaiting in install
      expect(swContent).toContain('Do NOT call self.skipWaiting() here');
    });

    it('should respond to SKIP_WAITING message', () => {
      expect(swContent).toContain("event.data.type === 'SKIP_WAITING'");
      expect(swContent).toContain('self.skipWaiting()');
    });

    it('should claim clients on activate', () => {
      expect(swContent).toContain('clients.claim()');
    });
  });

  describe('Error Handling', () => {
    it('should have error logging for cache failures', () => {
      expect(swContent).toContain('[SW] Cache put failed');
    });

    it('should have error logging for network failures', () => {
      expect(swContent).toContain('[SW] Network request failed');
    });

    it('should have error logging for installation failures', () => {
      expect(swContent).toContain('[SW] Installation failed');
    });
  });

  describe('External Requests', () => {
    it('should pass through external requests', () => {
      expect(swContent).toContain('url.origin !== location.origin');
      expect(swContent).toContain('return; // Let browser handle external requests');
    });
  });

  describe('Production Optimizations', () => {
    it('should have environment-aware logging', () => {
      expect(swContent).toContain("self.location.hostname === 'localhost'");
      expect(swContent).toContain('IS_DEV');
    });

    it('should always log errors regardless of environment', () => {
      expect(swContent).toContain('logError = console.error');
    });
  });
});

/**
 * Tests for offline page branding and structure
 * @critical - Offline page is the fallback when network is unavailable
 */
describe('Offline Page Branding', () => {
  const fs = require('fs');
  const path = require('path');

  let offlineHtmlContent: string;

  beforeAll(() => {
    const offlinePath = path.join(process.cwd(), 'public', 'offline.html');
    offlineHtmlContent = fs.readFileSync(offlinePath, 'utf8');
  });

  describe('Page Structure', () => {
    it('should have DOCTYPE html declaration', () => {
      expect(offlineHtmlContent).toContain('<!DOCTYPE html>');
    });

    it('should have proper language attribute', () => {
      expect(offlineHtmlContent).toContain('lang="en"');
    });

    it('should have viewport meta tag', () => {
      expect(offlineHtmlContent).toContain('viewport');
      expect(offlineHtmlContent).toContain('width=device-width');
    });

    it('should link to offline.css stylesheet', () => {
      expect(offlineHtmlContent).toContain('href="/offline.css"');
    });

    it('should link to offline.js script', () => {
      expect(offlineHtmlContent).toContain('src="/offline.js"');
    });
  });

  describe('Branding', () => {
    it('should have MatchOps in title', () => {
      expect(offlineHtmlContent).toContain('<title>Offline - MatchOps</title>');
    });

    it('should display MatchOps brand name', () => {
      expect(offlineHtmlContent).toContain('<h1>MatchOps</h1>');
    });

    it('should include app logo', () => {
      expect(offlineHtmlContent).toContain('/icons/icon-192x192.png');
      expect(offlineHtmlContent).toContain('alt="MatchOps"');
    });

    it('should have favicon', () => {
      expect(offlineHtmlContent).toContain('rel="icon"');
      expect(offlineHtmlContent).toContain('favicon');
    });
  });

  describe('User Experience', () => {
    it('should have retry button', () => {
      expect(offlineHtmlContent).toContain('id="retry-btn"');
      expect(offlineHtmlContent).toContain('Try Again');
    });

    it('should explain offline behavior', () => {
      expect(offlineHtmlContent).toContain('Unable to Load App');
      expect(offlineHtmlContent).toContain('works fully offline');
    });

    it('should reassure about data safety', () => {
      expect(offlineHtmlContent).toContain('data is safe');
    });

    it('should have noscript fallback', () => {
      expect(offlineHtmlContent).toContain('<noscript>');
      expect(offlineHtmlContent).toContain('JavaScript is required');
    });
  });

  describe('Accessibility', () => {
    it('should have alt text on logo image', () => {
      expect(offlineHtmlContent).toMatch(/img[^>]*alt="[^"]+"/);
    });

    it('should have explicit width and height on images', () => {
      expect(offlineHtmlContent).toMatch(/img[^>]*width="\d+"/);
      expect(offlineHtmlContent).toMatch(/img[^>]*height="\d+"/);
    });
  });
});

/**
 * Runs the real public/sw.js in a sandbox with an in-memory Cache Storage, to
 * check how caches behave across a version update.
 * @critical - an update must never leave the app unable to start offline.
 */
describe('Service Worker cache lifecycle across an update', () => {
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');

  const ORIGIN = 'https://app.test';
  const swSource: string = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');
  const currentName = /const CACHE_NAME = '([^']+)'/.exec(swSource)![1];
  const OLD = 'matchops-previous-build';

  class FakeResponse {
    constructor(public body: string, public ok = true, public status = 200) {}
    clone() { return new FakeResponse(this.body, this.ok, this.status); }
    async text() { return this.body; }
  }
  type Key = string | { url: string };
  const keyOf = (k: Key) => (typeof k === 'string' ? (k.startsWith('/') ? ORIGIN + k : k) : k.url);

  /** In-memory CacheStorage: caches.match searches caches in creation order, like browsers. */
  const makeCacheStorage = () => {
    const stores = new Map<string, Map<string, FakeResponse>>();
    const open = async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name)!;
      return {
        match: async (k: Key) => m.get(keyOf(k))?.clone(),
        put: async (k: Key, r: FakeResponse) => { m.set(keyOf(k), r); },
        add: async (k: Key) => { m.set(keyOf(k), new FakeResponse('precached ' + keyOf(k))); },
        keys: async () => [...m.keys()],
        delete: async (k: Key) => m.delete(keyOf(k)),
      };
    };
    return {
      stores,
      api: {
        open,
        keys: async () => [...stores.keys()],
        delete: async (name: string) => stores.delete(name),
        match: async (k: Key) => {
          for (const m of stores.values()) {
            const hit = m.get(keyOf(k));
            if (hit) return hit.clone();
          }
          return undefined;
        },
      },
    };
  };

  /** Boots the new sw.js with an old version's cache already on the device. */
  const boot = (online: boolean, registration: Record<string, unknown> = { installing: null, waiting: null }) => {
    const storage = makeCacheStorage();
    const old = new Map<string, FakeResponse>([
      [ORIGIN + '/', new FakeResponse('old shell')],
      [ORIGIN + '/_next/static/chunks/app-OLD.js', new FakeResponse('old app chunk')],
      [ORIGIN + '/_next/static/chunks/shared-SAME.js', new FakeResponse('unchanged chunk')],
      [ORIGIN + '/logos/logo.png', new FakeResponse('old logo')],
    ]);
    storage.stores.set(OLD, old);
    storage.stores.set('other-app-cache', new Map());
    const handlers: Record<string, (e: unknown) => void> = {};
    const fetchMock = jest.fn(async (req: { url: string }) => {
      if (!online) throw new TypeError('Failed to fetch');
      return new FakeResponse('network ' + req.url);
    });
    const sandbox: Record<string, unknown> = {
      caches: storage.api,
      clients: { claim: jest.fn().mockResolvedValue(undefined) },
      fetch: (req: { url: string }) => fetchMock(req),
      Response: FakeResponse,
      URL,
      // Looked up per call, so jest's fake timers apply when a test enables them.
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
      console: { log: () => {}, error: () => {} },
      location: { origin: ORIGIN, hostname: 'app.test' },
      addEventListener: (type: string, fn: (e: unknown) => void) => { handlers[type] = fn; },
      skipWaiting: jest.fn(),
      registration,
    };
    sandbox.self = sandbox;
    vm.runInNewContext(swSource, sandbox);

    const run = async (type: string, extra: Record<string, unknown> = {}) => {
      let pending: Promise<unknown> = Promise.resolve();
      let response: Promise<unknown> | undefined;
      handlers[type]({
        ...extra,
        waitUntil: (p: Promise<unknown>) => { pending = p; },
        respondWith: (p: Promise<unknown>) => { response = p; },
      });
      await pending;
      return response ? ((await response) as FakeResponse) : undefined;
    };
    const request = (p: string, destination: string) =>
      ({ request: { url: ORIGIN + p, destination, mode: destination === 'document' ? 'navigate' : 'no-cors', method: 'GET' } });
    return {
      storage,
      fetchMock,
      setOnline: (v: boolean) => { online = v; },
      activate: () => run('activate'),
      appReady: () => run('message', { data: { type: 'APP_READY' } }),
      navigate: (p = '/') => run('fetch', request(p, 'document')),
      /** The page's response alone, without waiting for the worker's background work. */
      navigateResponseOnly: (p = '/') => {
        let response: Promise<FakeResponse> | undefined;
        handlers.fetch({
          ...request(p, 'document'),
          waitUntil: () => {},
          respondWith: (r: Promise<FakeResponse>) => { response = r; },
        });
        return response!;
      },
      script: (p: string) => run('fetch', request(p, 'script')),
      image: (p: string) => run('fetch', request(p, 'image')),
    };
  };

  it('keeps the previous version cache when the new worker activates', async () => {
    const sw = boot(false);
    await sw.activate();
    expect(sw.storage.stores.has(OLD)).toBe(true);
  });

  /**
   * The reported failure: the update downloaded at home, the app was closed,
   * and the first launch (which activates the new worker) happens offline.
   * @critical
   */
  it('an offline launch right after activation still boots from the previous cache', async () => {
    const sw = boot(false);
    await sw.activate();
    expect((await sw.navigate())!.body).toBe('old shell');
    expect((await sw.script('/_next/static/chunks/app-OLD.js'))!.body).toBe('old app chunk');
  });

  it('APP_READY keeps old caches while this version has not loaded its own shell', async () => {
    const sw = boot(false);
    await sw.activate();
    await sw.navigate();
    await sw.appReady();
    expect(sw.storage.stores.has(OLD)).toBe(true);
    // Serving the old shell offline must not count as "this version loaded".
    expect(sw.storage.stores.get(currentName)?.has(ORIGIN + '/') ?? false).toBe(false);
  });

  /** @critical - unchanged chunks keep the same hashed URL across builds. */
  it('after an online boot, APP_READY drops old matchops caches and unchanged chunks survive', async () => {
    const sw = boot(true);
    await sw.activate();
    await sw.navigate();
    // The shell write is fire-and-forget in the worker; wait for it to land.
    await waitFor(() => expect(sw.storage.stores.get(currentName)?.has(ORIGIN + '/')).toBe(true));
    // An unchanged chunk is served from the old cache (no network) and adopted.
    sw.fetchMock.mockClear();
    expect((await sw.script('/_next/static/chunks/shared-SAME.js'))!.body).toBe('unchanged chunk');
    expect(sw.fetchMock).not.toHaveBeenCalled();
    await sw.appReady();
    expect(sw.storage.stores.has(OLD)).toBe(false);
    expect(sw.storage.stores.has('other-app-cache')).toBe(true);
    // Next launch offline: the unchanged chunk is still there.
    sw.setOnline(false);
    expect((await sw.script('/_next/static/chunks/shared-SAME.js'))!.body).toBe('unchanged chunk');
    expect((await sw.navigate())!.body).toBe('network ' + ORIGIN + '/');
  });

  it('prefers this version shell over the previous one when offline', async () => {
    const sw = boot(false);
    sw.storage.stores.set(currentName, new Map([[ORIGIN + '/', new FakeResponse('new shell')]]));
    await sw.activate();
    expect((await sw.navigate())!.body).toBe('new shell');
  });

  /**
   * While an update waits, the page's controller is the OLD worker and gets
   * APP_READY. It must not delete the newer version's cache.
   */
  it('APP_READY on the old worker leaves a pending newer version cache alone', async () => {
    const sw = boot(true, { installing: null, waiting: { state: 'installed' } });
    sw.storage.stores.set(currentName, new Map([[ORIGIN + '/', new FakeResponse('shell')]]));
    sw.storage.stores.set('matchops-NEWER', new Map([[ORIGIN + '/offline.html', new FakeResponse('offline')]]));
    await sw.appReady();
    expect(sw.storage.stores.has('matchops-NEWER')).toBe(true);
    expect(sw.storage.stores.has(OLD)).toBe(true);
  });

  /** Unhashed files (logos) must not be carried over from an older version. */
  it('fetches an unhashed image fresh after an update, and uses the old copy only offline', async () => {
    const online = boot(true);
    await online.activate();
    expect((await online.image('/logos/logo.png'))!.body).toBe('network ' + ORIGIN + '/logos/logo.png');

    const offline = boot(false);
    await offline.activate();
    expect((await offline.image('/logos/logo.png'))!.body).toBe('old logo');
    // ...and it is not adopted into the new version's cache.
    expect(offline.storage.stores.get(currentName)?.has(ORIGIN + '/logos/logo.png') ?? false).toBe(false);
  });
  /**
   * Loading-speed stage 1: a launch on a slow network gets this version's cached shell
   * after NAVIGATION_NETWORK_TIMEOUT_MS - but only when the files it needs are cached.
   */
  describe('navigation on a slow network', () => {
    const TIMEOUT_MS = Number(/const NAVIGATION_NETWORK_TIMEOUT_MS = (\d+)/.exec(swSource)![1]);
    const SHELL = '<html><script src="/_next/static/chunks/app-NEW.js"></script>'
      + '<link rel="stylesheet" href="/_next/static/chunks/style-NEW.css"/>'
      + '<script>self.__next_f.push([1,"{\\"chunks\\":[\\"static/chunks/lazy-NEW.js\\"]}"])</script></html>';

    /** A network that answers only when the test says so. */
    const slowNetwork = (sw: ReturnType<typeof boot>) => {
      let answer!: (r: FakeResponse) => void;
      sw.fetchMock.mockImplementation(() => new Promise<FakeResponse>((resolve) => { answer = resolve; }));
      return { answer: (body: string) => answer(new FakeResponse(body)) };
    };
    const ownCache = (sw: ReturnType<typeof boot>, entries: Array<[string, string]>) => {
      sw.storage.stores.set(currentName, new Map(entries.map(([k, v]) => [ORIGIN + k, new FakeResponse(v)])));
    };
    /** Starts a navigation and lets the clock run past the time limit. */
    const navigateSlowly = async (sw: ReturnType<typeof boot>) => {
      const result = sw.navigateResponseOnly();
      await jest.advanceTimersByTimeAsync(TIMEOUT_MS + 10);
      return result;
    };

    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); });

    it('the time limit is about three seconds', () => {
      expect(TIMEOUT_MS).toBeGreaterThanOrEqual(2000);
      expect(TIMEOUT_MS).toBeLessThanOrEqual(5000);
    });

    /** @critical */
    it('serves the cached shell when everything it needs is cached, and still caches the network answer', async () => {
      const sw = boot(true);
      const net = slowNetwork(sw);
      ownCache(sw, [
        ['/', SHELL],
        ['/_next/static/chunks/app-NEW.js', 'js'],
        ['/_next/static/chunks/style-NEW.css', 'css'],
        ['/_next/static/chunks/lazy-NEW.js', 'js'],
      ]);
      const response = sw.navigateResponseOnly();
      await jest.advanceTimersByTimeAsync(TIMEOUT_MS + 10);
      // Served before the network answered.
      expect((await response).body).toBe(SHELL);
      // The late network answer replaces the cached page for the next launch.
      net.answer('fresh shell');
      await jest.advanceTimersByTimeAsync(1);
      expect(sw.storage.stores.get(currentName)!.get(ORIGIN + '/')!.body).toBe('fresh shell');
    });

    it('understands the Vercel build paths (/_next/static/immutable/...)', async () => {
      const sw = boot(true);
      slowNetwork(sw);
      const vercelShell = '<script src="/_next/static/immutable/chunks/app-V.js"></script>'
        + '<script>self.__next_f.push([1,"{\\"chunks\\":[\\"static/immutable/chunks/lazy-V.js\\"]}"])</script>';
      ownCache(sw, [
        ['/', vercelShell],
        ['/_next/static/immutable/chunks/app-V.js', 'js'],
        ['/_next/static/immutable/chunks/lazy-V.js', 'js'],
      ]);
      expect((await navigateSlowly(sw)).body).toBe(vercelShell);

      // ...and one missing file still blocks it.
      const sw2 = boot(true);
      slowNetwork(sw2);
      ownCache(sw2, [['/', vercelShell], ['/_next/static/immutable/chunks/app-V.js', 'js']]);
      let served: FakeResponse | undefined;
      void navigateSlowly(sw2).then((r) => { served = r; });
      await jest.advanceTimersByTimeAsync(TIMEOUT_MS * 3);
      expect(served).toBeUndefined();
    });

    it('answers from the network as before when it is fast enough', async () => {
      const sw = boot(true);
      ownCache(sw, [['/', SHELL], ['/_next/static/chunks/app-NEW.js', 'js']]);
      const response = await sw.navigate();
      expect(response!.body).toBe('network ' + ORIGIN + '/');
    });

    /** @critical - the cached page may come from a deploy whose files are gone. */
    it('keeps waiting for the network when a file the cached shell needs is missing', async () => {
      const sw = boot(true);
      const net = slowNetwork(sw);
      ownCache(sw, [
        ['/', SHELL],
        ['/_next/static/chunks/app-NEW.js', 'js'],
        ['/_next/static/chunks/style-NEW.css', 'css'],
        // lazy-NEW.js (named only in the inline payload) is not cached
      ]);
      let served: FakeResponse | undefined;
      const pending = navigateSlowly(sw).then((r) => { served = r; });
      await jest.advanceTimersByTimeAsync(TIMEOUT_MS * 3);
      expect(served).toBeUndefined();
      net.answer('fresh shell');
      await pending;
      expect(served!.body).toBe('fresh shell');
    });

    /** @critical - right after an update the coach must get the new version. */
    it('does not serve the previous version shell on a slow network', async () => {
      const sw = boot(true); // the OLD cache holds '/' and its chunk, this version's holds nothing
      const net = slowNetwork(sw);
      let served: FakeResponse | undefined;
      const pending = navigateSlowly(sw).then((r) => { served = r; });
      await jest.advanceTimersByTimeAsync(TIMEOUT_MS * 3);
      expect(served).toBeUndefined();
      net.answer('new version shell');
      await pending;
      expect(served!.body).toBe('new version shell');
    });

    it('a slow network that then fails falls back to the offline copy as before', async () => {
      const sw = boot(true);
      let fail!: (e: Error) => void;
      sw.fetchMock.mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
      const pending = navigateSlowly(sw);
      fail(new TypeError('Failed to fetch'));
      // This version has no shell; the previous version's copy is the offline fallback.
      expect((await pending)!.body).toBe('old shell');
    });

    it('does not serve a cached page that names no build files', async () => {
      const sw = boot(true);
      const net = slowNetwork(sw);
      ownCache(sw, [['/', '<html>nothing to check</html>']]);
      let served: FakeResponse | undefined;
      const pending = navigateSlowly(sw).then((r) => { served = r; });
      await jest.advanceTimersByTimeAsync(TIMEOUT_MS * 3);
      expect(served).toBeUndefined();
      net.answer('fresh shell');
      await pending;
      expect(served!.body).toBe('fresh shell');
    });
  });
});
