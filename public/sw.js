/**
 * Service Worker for MatchOps-Local PWA
 *
 * Caching Strategy:
 * - Static assets (JS, CSS, images, fonts): Cache-first with network fallback
 * - HTML documents: Network-first with cache fallback (enables offline startup)
 * - manifest.json: Stale-while-revalidate (fast load, background update)
 * - External requests: Pass through to network
 *
 * Production-hardened:
 * - Network-first HTML ensures users get latest version when online
 * - Cached HTML enables offline app startup
 * - Versioned cache for clean updates
 * - Minimal logging (errors only in production)
 * - Dedicated offline page for graceful offline experience
 */

const CACHE_NAME = 'matchops-2026-09-19T16-15-00';

// Cache size limit - prevents unbounded growth from dynamically cached assets
// Note: the previous version's cache is removed once this version has booted
// (APP_READY), so this just limits runtime growth
const MAX_CACHE_ENTRIES = 100;

// Static resources to precache (NO HTML - HTML should never be cached)
// Exception: offline.html is a static fallback page for when network is unavailable
const STATIC_RESOURCES = [
  '/manifest.json',
  '/offline.html',
  '/offline.css',
  '/offline.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/logos/app-logo.png',
  '/logos/app-logo-yellow.png'
];

// Environment check - reduce logging in production
const IS_DEV = self.location.hostname === 'localhost';
const log = IS_DEV ? console.log.bind(console) : () => {};
const logError = console.error.bind(console); // Always log errors

// Helper to trim cache if it exceeds size limit
// Note: Cache API doesn't guarantee key order = insertion order, so this removes
// "first" entries which may not be strictly oldest. This is acceptable because:
// 1. The previous version's cache is removed after an update anyway
// 2. This just prevents unbounded growth within a single SW version
async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_CACHE_ENTRIES) {
    const deleteCount = keys.length - MAX_CACHE_ENTRIES;
    log(`[SW] Trimming cache: removing ${deleteCount} entries`);
    await Promise.all(keys.slice(0, deleteCount).map(key => cache.delete(key)));
  }
}

// Listen for the install event - cache static resources
self.addEventListener('install', (event) => {
  log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      log('[SW] Caching static resources');
      return Promise.all(
        STATIC_RESOURCES.map(url =>
          cache.add(url).catch(err => {
            logError(`[SW] Failed to cache ${url}:`, err);
            return Promise.resolve();
          })
        )
      );
    }).then(() => {
      log('[SW] Installed successfully');
    }).catch(err => {
      logError('[SW] Installation failed:', err);
      throw err;
    })
  );
  // Do NOT call self.skipWaiting() here.
  // Wait for user to click the update button.
});

/**
 * Old caches are NOT deleted on activate. A waiting worker is often activated
 * by an OFFLINE launch (the app was closed after the update downloaded, then
 * opened at the pitch). Deleting the previous cache there threw away the only
 * copy of the app shell and its chunks, and the coach got the offline page.
 * The previous cache keeps serving until this version has booted once with its
 * own shell cached - see cleanupOldCaches (APP_READY).
 */
self.addEventListener('activate', (event) => {
  log('[SW] Activating...');
  event.waitUntil(
    clients.claim().then(() => {
      log('[SW] Activated');
    })
  );
});

/**
 * Deletes every other matchops-* cache, but only once THIS version's cache
 * holds the app shell ('/'), i.e. it has been loaded online under this worker.
 * Called when a page reports it booted (APP_READY): by then the chunks that
 * boot needed are in this cache too (fetched, or copied from an older cache by
 * matchAndAdopt).
 */
async function cleanupOldCaches() {
  // The page posts to its controller. While a newer version is installing or
  // waiting, that controller is THIS (older) worker, and "every other cache"
  // would include the newer version's. Leave cleanup to the newer version.
  const reg = self.registration;
  if (reg && (reg.installing || reg.waiting)) {
    log('[SW] A newer version is pending - leaving cache cleanup to it');
    return;
  }
  const current = await caches.open(CACHE_NAME);
  const shell = await current.match(self.location.origin + '/');
  if (!shell) {
    log('[SW] Shell not cached by this version yet - keeping old caches');
    return;
  }
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name !== CACHE_NAME && name.startsWith('matchops-'))
      .map((name) => {
        log('[SW] Deleting old cache:', name);
        return caches.delete(name);
      })
  );
}

/**
 * Looks in this version's cache first, then in any older one. A hit in an
 * older cache is copied into this version's cache, so a file that did not
 * change between builds (same hashed URL) survives the old cache's cleanup.
 * Only for content-hashed URLs (/_next/static/): copying an unhashed file
 * (a logo, ball.png) would carry an outdated copy into every later version.
 */
async function matchAndAdopt(key) {
  const current = await caches.open(CACHE_NAME);
  const own = await current.match(key);
  if (own) return own;
  const older = await caches.match(key);
  if (older) {
    try {
      await current.put(key, older.clone());
    } catch (err) {
      logError('[SW] Could not adopt cached entry:', err);
    }
  }
  return older;
}

/**
 * Cache-first for static assets. Content-hashed build files can be taken from
 * any version's cache (and adopted). Unhashed files only come from this
 * version's cache or the network; an older version's copy is used only when
 * the network fails, so a replaced logo is picked up after an update.
 */
async function cachedAsset(request, url) {
  const immutable = url.pathname.startsWith('/_next/static/');
  const cached = immutable
    ? await matchAndAdopt(request)
    : await caches.open(CACHE_NAME).then((current) => current.match(request));
  if (cached) return cached;

  try {
    const fetchResponse = await fetch(request);
    // Only cache successful GET requests
    if (request.method === 'GET' && fetchResponse.status === 200) {
      const responseClone = fetchResponse.clone();
      caches.open(CACHE_NAME).then(async (cache) => {
        await cache.put(request, responseClone);
        // Trim cache if it exceeds size limit
        await trimCache(cache);
      }).catch(err => {
        logError('[SW] Cache put failed:', err);
      });
    }
    return fetchResponse;
  } catch (err) {
    // Offline: an older version's copy beats a broken image.
    const older = immutable ? undefined : await caches.match(request);
    if (older) return older;
    logError('[SW] Network request failed for asset:', request.url, err);
    // For assets not in cache and network failed, return error
    // The browser will handle this gracefully (broken image, etc.)
    throw err;
  }
}

/**
 * How long a launch waits for the network before it uses the cached app shell.
 * On a weak connection (the pitch) the HTML request alone could take many seconds
 * while the whole app was already on the device.
 */
const NAVIGATION_NETWORK_TIMEOUT_MS = 3000;
const NETWORK_TIMED_OUT = Symbol('network timed out');

/**
 * Offline (the request failed): the cached HTML for this route - this version's copy
 * first, else the previous version's - then offline.html, then an inline page.
 * Not adopted: '/' in this version's cache must mean "loaded online under this
 * version", which is what cleanupOldCaches relies on.
 */
function offlineDocument(documentCacheKey) {
  return caches.open(CACHE_NAME)
    .then((current) => current.match(documentCacheKey))
    .then((own) => own || caches.match(documentCacheKey))
    .then((cached) => {
      if (cached) {
        return cached;
      }
      // Fall back to offline.html if specific page not cached
      return caches.match('/offline.html').then((offlinePage) => {
        if (offlinePage) {
          return offlinePage;
        }
        // Final fallback if nothing cached (bilingual to match offline.html)
        return new Response(
          '<html><head><title>Offline / Ei yhteyttä</title></head><body style="font-family:system-ui;text-align:center;padding:40px"><h1>Ei yhteyttä / Offline</h1><p>Tarkista yhteys ja yritä uudelleen.</p><p style="color:#888">Please check your connection and try again.</p></body></html>',
          { headers: { 'Content-Type': 'text/html' } }
        );
      });
    });
}

// The build's JS/CSS files a page names: "/_next/static/chunks/x.js" in tags, and
// "static/chunks/x.js" in the inline React payload. On Vercel the path has an extra
// "immutable/" ("/_next/static/immutable/chunks/x.js").
const SHELL_ASSET_PATTERN = /(?:\/_next\/)?(static\/(?:immutable\/)?(?:chunks|css)\/[A-Za-z0-9_\-./]+?\.(?:js|css))(?=["'\\?#\s)])/g;

/**
 * True when every JS and CSS file the cached page names is cached too. The page can
 * then start without the network. False when one is missing: the deploy that page
 * came from may be gone from the server, and its files with it - serving it would
 * leave the coach on a broken page instead of waiting for the network.
 */
async function shellAssetsCached(cachedPage) {
  let html;
  try {
    html = await cachedPage.clone().text();
  } catch (err) {
    logError('[SW] Could not read the cached page:', err);
    return false;
  }
  const assets = new Set();
  for (const match of html.matchAll(SHELL_ASSET_PATTERN)) {
    assets.add(self.location.origin + '/_next/' + match[1]);
  }
  // A page naming no build files at all is not a page this check understands.
  if (assets.size === 0) return false;
  for (const asset of assets) {
    if (!(await caches.match(asset))) {
      log('[SW] Cached shell not served - a file it needs is not cached:', asset);
      return false;
    }
  }
  return true;
}

/**
 * Network-first, with a time limit: when the network has not answered within
 * NAVIGATION_NETWORK_TIMEOUT_MS, serve THIS version's cached page if everything it
 * needs is cached (shellAssetsCached), and let the network answer update the cache in
 * the background. Otherwise keep waiting for the network, as before.
 *
 * Only this version's cache: right after an update the new worker has no page of its
 * own yet, and the previous version's page would put the coach back on the old app
 * they just updated from. The older copy is still the offline fallback.
 */
async function navigationResponse(network, documentCacheKey) {
  let timer;
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => resolve(NETWORK_TIMED_OUT), NAVIGATION_NETWORK_TIMEOUT_MS);
  });
  const first = await Promise.race([
    network.then((response) => ({ response }), (error) => ({ error })),
    timedOut,
  ]);
  clearTimeout(timer);

  if (first !== NETWORK_TIMED_OUT) {
    return first.response || offlineDocument(documentCacheKey);
  }

  const own = await caches.open(CACHE_NAME)
    .then((current) => current.match(documentCacheKey))
    .catch(() => undefined);
  if (own && await shellAssetsCached(own)) {
    log('[SW] Network slow - serving the cached app shell');
    return own;
  }
  try {
    return await network;
  } catch {
    return offlineDocument(documentCacheKey);
  }
}

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    log('[SW] SKIP_WAITING received, activating new version');
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'APP_READY') {
    event.waitUntil(
      cleanupOldCaches().catch((err) => logError('[SW] Old cache cleanup failed:', err))
    );
  }
});

// Fetch handler with production-safe caching
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== location.origin) {
    return; // Let browser handle external requests normally
  }

  // Network-first for HTML documents with offline fallback
  // Cache HTML for offline use, but always try network first to get updates.
  // A slow network (no answer in NAVIGATION_NETWORK_TIMEOUT_MS) gets this version's
  // cached shell instead, when everything it needs is cached - see navigationResponse.
  if (request.destination === 'document' || request.mode === 'navigate') {
    // Cache documents under a query-stripped key (origin + pathname). Without this,
    // every distinct query string for the same route created its own cache entry,
    // growing the cache without bound. Routes are finite, so pathname-keyed caching
    // is bounded, and query variants of a route share one offline-fallback entry.
    const documentCacheKey = url.origin + url.pathname;
    const network = fetch(request).then((response) => {
      // Cache successful HTML responses for offline use
      if (response.ok && request.method === 'GET') {
        const clone = response.clone();
        return caches.open(CACHE_NAME)
          .then((cache) => cache.put(documentCacheKey, clone))
          .catch((err) => {
            logError('[SW] Cache put failed for document:', err);
          })
          .then(() => response);
      }
      return response;
    });
    // Keep the worker alive until the network answer is cached - also when the
    // cached shell was served first, so the next launch gets the fresh one.
    event.waitUntil(network.then(() => undefined, () => undefined));
    event.respondWith(navigationResponse(network, documentCacheKey));
    return;
  }

  // Stale-while-revalidate for manifest.json
  // Return cached version immediately, update cache in background
  if (url.pathname === '/manifest.json') {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, networkResponse.clone());
            }).catch(err => {
              logError('[SW] Cache put failed for manifest:', err);
            });
          }
          return networkResponse;
        }).catch((err) => {
          // Don't re-throw. If cachedResponse was returned, the background fetch is
          // fire-and-forget. Return a 503 fallback for when cache also missed.
          logError('[SW] Network request failed for manifest:', err);
          return new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } });
        });
        // Return cached response immediately, or wait for network if not cached
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Cache-first for static assets (JS, CSS, images, fonts)
  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    request.url.includes('/icons/') ||
    request.url.includes('/logos/')
  ) {
    event.respondWith(cachedAsset(request, url));
    return;
  }

  // All other requests: network-only (API calls, etc.)
});

// ↑ CACHE_NAME and Build Timestamp are auto-updated by scripts/generate-manifest.mjs
// Build Timestamp: 2026-09-19T16:15:00.501Z