// Caching strategy for PWA offline support
const CACHE_NAME = 'matchops-2025-10-28T08-52-40';
const STATIC_RESOURCES = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/logos/app-logo.png'
];

// Listen for the install event - cache static resources
self.addEventListener('install', (event) => {
  console.log('[SW] Service worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static resources');
      // Cache resources individually to better handle errors
      return Promise.all(
        STATIC_RESOURCES.map(url =>
          cache.add(url).catch(err => {
            console.error(`[SW] Failed to cache ${url}:`, err);
            // Don't fail the entire installation if one resource fails
            return Promise.resolve();
          })
        )
      );
    }).then(() => {
      console.log('[SW] Service worker installed successfully');
    }).catch(err => {
      console.error('[SW] Service worker installation failed:', err);
      throw err;
    })
  );
  // Do NOT call self.skipWaiting() here.
  // We want to wait for the user to click the update button.
});

// Listen for the activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] Service worker activating...');
  event.waitUntil(
    // Clean up old caches
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Service worker activated');
      // Take control of all open clients immediately
      return clients.claim();
    })
  );
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message. Activating new service worker.');
    self.skipWaiting();
  }
});

// Enhanced fetch handler with offline support
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle same-origin requests
  if (url.origin === location.origin) {
    // Use network-first strategy for HTML documents to ensure app updates
    if (request.destination === 'document') {
      event.respondWith(
        fetch(request)
          .then((fetchResponse) => {
            // Cache the new version
            if (fetchResponse.status === 200) {
              const responseClone = fetchResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return fetchResponse;
          })
          .catch(() => {
            // Offline fallback - serve from cache
            return caches.match(request).then((cachedResponse) => {
              return cachedResponse || caches.match('/');
            });
          })
      );
    } else {
      // Use cache-first for all other resources (CSS, JS, images, etc.)
      event.respondWith(
        caches.match(request).then((response) => {
          if (response) {
            console.log('[SW] Serving from cache:', request.url);
            return response;
          }

          // Fetch from network and cache for next time
          return fetch(request).then((fetchResponse) => {
            // Only cache successful responses
            if (fetchResponse.status === 200) {
              const responseClone = fetchResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseClone);
              });
            }
            return fetchResponse;
          });
        })
      );
    }
  } else {
    // Pass through external requests
    event.respondWith(fetch(request));
  }
});
// Build Timestamp: 2025-10-28T08:52:40.005Z