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

const CACHE_NAME = 'matchops-2026-01-20T12-03-01';

// Cache size limit - prevents unbounded growth from dynamically cached assets
// Note: Entire cache is cleared on SW update, so this just limits runtime growth
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
  '/logos/app-logo.png'
];

// Environment check - reduce logging in production
const IS_DEV = self.location.hostname === 'localhost';
const log = IS_DEV ? console.log.bind(console) : () => {};
const logError = console.error.bind(console); // Always log errors

// Helper to trim cache if it exceeds size limit
// Note: Cache API doesn't guarantee key order = insertion order, so this removes
// "first" entries which may not be strictly oldest. This is acceptable because:
// 1. The entire cache is cleared on SW update anyway
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

// Listen for the activate event - clean up old caches
self.addEventListener('activate', (event) => {
  log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name.startsWith('matchops-'))
          .map(cacheName => {
            log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => {
      log('[SW] Activated');
      return clients.claim();
    })
  );
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    log('[SW] SKIP_WAITING received, activating new version');
    self.skipWaiting();
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
  // Cache HTML for offline use, but always try network first to get updates
  if (request.destination === 'document' || request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful HTML responses for offline use
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Offline: try to serve cached HTML first
          return caches.match(request).then((cached) => {
            if (cached) {
              return cached;
            }
            // Fall back to offline.html if specific page not cached
            return caches.match('/offline.html').then((offlinePage) => {
              if (offlinePage) {
                return offlinePage;
              }
              // Final fallback if nothing cached
              return new Response(
                '<html><head><title>Offline</title></head><body style="font-family:system-ui;text-align:center;padding:40px"><h1>Offline</h1><p>Please check your connection and try again.</p></body></html>',
                { headers: { 'Content-Type': 'text/html' } }
              );
            });
          });
        })
    );
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
          logError('[SW] Network request failed for manifest:', err);
          throw err;
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
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // Fetch from network and cache for next time
        return fetch(request).then((fetchResponse) => {
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
        }).catch((err) => {
          logError('[SW] Network request failed for asset:', request.url, err);
          // For assets not in cache and network failed, return error
          // The browser will handle this gracefully (broken image, etc.)
          throw err;
        });
      })
    );
    return;
  }

  // All other requests: network-only
  // (manifest.json, API calls, etc.)
});

// ↑ Auto-generated by scripts/generate-manifest.mjs - do not edit manually
// Build Timestamp: 2026-01-20T12:03:01.282Z