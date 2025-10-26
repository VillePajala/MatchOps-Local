// Empty service worker that unregisters itself
// This ensures no service worker is active on the marketing site

self.addEventListener('install', () => {
  // Skip waiting to activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Unregister this service worker
  event.waitUntil(
    self.registration.unregister().then(() => {
      // Clear all caches
      return caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      });
    })
  );
});
