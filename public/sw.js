/**
 * Service Worker for MatchOps-Local PWA
 *
 * Caching Strategy:
 * - Static assets (JS, CSS, images, fonts): Cache-first with network fallback
 * - HTML documents: Network-only (never cached to ensure app updates work)
 * - manifest.json: Stale-while-revalidate (fast load, background update)
 * - External requests: Pass through to network
 *
 * Production-hardened:
 * - No HTML caching to prevent stale app versions
 * - Versioned cache for clean updates
 * - Minimal logging (errors only in production)
 * - Dedicated offline page for graceful offline experience
 */

const CACHE_NAME = 'matchops-2025-12-07T11-53-59';

// Static resources to precache (NO HTML - HTML should never be cached)
// Exception: offline.html is a static fallback page for when network is unavailable
const STATIC_RESOURCES = [
  '/manifest.json',
  '/offline.html',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/logos/app-logo.png'
];

// Environment check - reduce logging in production
const IS_DEV = self.location.hostname === 'localhost';
const log = IS_DEV ? console.log.bind(console) : () => {};
const logError = console.error.bind(console); // Always log errors

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
        cacheNames.map((cacheName) => {
          // Delete ALL old caches (different version)
          if (cacheName !== CACHE_NAME && cacheName.startsWith('matchops-')) {
            log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
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

  // NEVER cache HTML documents - always fetch from network
  // This ensures app updates are always reflected
  if (request.destination === 'document' || request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        // If offline, serve the cached offline page
        return caches.match('/offline.html');
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
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
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
// Build Timestamp: 2025-12-07T11:53:59.796Z