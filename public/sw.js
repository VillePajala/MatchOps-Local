// Caching strategy for PWA offline support
const CACHE_NAME = 'matchops-v1';
const STATIC_RESOURCES = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/logos/match_ops_local_logo_transparent.png'
];

// Listen for the install event - cache static resources
self.addEventListener('install', (event) => {
  console.log('[SW] Service worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static resources');
      return cache.addAll(STATIC_RESOURCES);
    })
  );
  // Do NOT call self.skipWaiting() here.
  // We want to wait for the user to click the update button.
});

// Listen for the activate event
self.addEventListener('activate', (event) => {
  console.log('[SW] Service worker activating...');
  // Take control of all open clients immediately
  event.waitUntil(clients.claim());
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
        }).catch(() => {
          // Offline fallback for HTML requests
          if (request.destination === 'document') {
            return caches.match('/');
          }
        });
      })
    );
  } else {
    // Pass through external requests
    event.respondWith(fetch(request));
  }
});
// Build Timestamp: 2025-09-27T20:44:18.376Z