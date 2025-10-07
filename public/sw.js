// Caching strategy for PWA offline support
const CACHE_VERSION = 'dev-build';
const STATIC_RESOURCES = [
  '/',
  `/manifest.json?v=${CACHE_VERSION}`,
  `/icons/icon-192x192.png?v=${CACHE_VERSION}`,
  `/icons/icon-512x512.png?v=${CACHE_VERSION}`,
  `/logos/match_ops_local_logo_transparent.png?v=${CACHE_VERSION}`,
];
const CACHE_NAME = `matchops-${CACHE_VERSION}`;

async function cacheStaticResources() {
  const cache = await caches.open(CACHE_NAME);

  await Promise.all(
    STATIC_RESOURCES.map(async (resource) => {
      try {
        const request = new Request(resource, { cache: 'reload' });
        const response = await fetch(request);

        if (!response || !response.ok) {
          throw new Error(`Request for ${resource} failed with status ${response?.status}`);
        }

        await cache.put(request, response.clone());

        const url = new URL(request.url);
        if (url.search) {
          const fallbackRequest = new Request(url.pathname);
          await cache.put(fallbackRequest, response.clone());
        }
      } catch (error) {
        console.warn(`[SW] Failed to cache ${resource}:`, error);
      }
    })
  );
}

self.addEventListener('install', (event) => {
  console.log('[SW] Service worker installing...');
  event.waitUntil(cacheStaticResources());
  // Do NOT call self.skipWaiting() here.
  // We want to wait for the user to click the update button.
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Service worker activating...');
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys
          .filter((key) => key.startsWith('matchops-') && key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          })
      );

      await clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message. Activating new service worker.');
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(request);

      if (cachedResponse) {
        console.log('[SW] Serving from cache:', request.url);
        return cachedResponse;
      }

      if (url.search) {
        const fallbackResponse = await cache.match(url.pathname);
        if (fallbackResponse) {
          console.log('[SW] Serving fallback cache for:', request.url);
          return fallbackResponse;
        }
      }

      try {
        const networkResponse = await fetch(request);

        if (networkResponse && networkResponse.ok) {
          const responseForCache = networkResponse.clone();
          event.waitUntil(updateCacheEntries(cache, request, responseForCache, url));
        }

        return networkResponse;
      } catch (error) {
        console.error('[SW] Network request failed:', error);

        if (request.destination === 'document') {
          const offlineResponse = await cache.match('/');
          if (offlineResponse) {
            return offlineResponse;
          }
        }

        return new Response('Service unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
        });
      }
    })()
  );
});

async function updateCacheEntries(cache, request, response, url) {
  try {
    await cache.put(request, response.clone());

    if (url.search) {
      const fallbackRequest = new Request(url.pathname);
      await cache.put(fallbackRequest, response.clone());
    }
  } catch (error) {
    console.warn('[SW] Failed to update cache entries for', request.url, error);
  }
}

// Build Timestamp: 2025-01-01T00:00:00.000Z
