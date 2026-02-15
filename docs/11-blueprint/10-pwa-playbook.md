# 10. PWA Playbook — Service Worker, Manifest, Install, Offline, Update

> **Audience**: AI agent building the new app
> **Purpose**: How to make the app installable, offline-capable, and auto-updating

---

## Architecture

```
┌──────────────────────────────────────────────┐
│                  PWA Layer                    │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │ Service  │  │ Manifest │  │  Install   │ │
│  │ Worker   │  │ .json    │  │  Prompt    │ │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘ │
│       │              │              │        │
│  Caching        App metadata    Native-like  │
│  Offline        Icons, name     install UX   │
│  Update flow    Theme color                  │
└──────────────────────────────────────────────┘
```

---

## 1. Service Worker — Caching Strategy

### Three caching strategies for different resource types:

```javascript
// public/sw.js

const CACHE_NAME = 'practice-planner-2026-02-14T12-00-00';

const STATIC_RESOURCES = [
  '/manifest.json',
  '/offline.html',
  '/offline.css',
  '/offline.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/app-logo.png',         // Precache logos used in the app
];

// === INSTALL: Precache static resources ===
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        STATIC_RESOURCES.map(url =>
          cache.add(url).catch(err => {
            console.error(`Failed to cache ${url}:`, err);
          })
        )
      );
    })
  );
  // Do NOT call self.skipWaiting() — wait for user to click update button
});

// === ACTIVATE: Clean up old caches ===
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter(name => name !== CACHE_NAME && name.startsWith('practice-planner-'))
          .map(name => caches.delete(name))
      )
    ).then(() => clients.claim())
  );
});

// === FETCH: Three strategies ===
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin
  if (url.origin !== location.origin) return;

  // 1. HTML → Network-first (get latest), cache for offline
  if (request.destination === 'document' || request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request)
            .then(cached => cached || caches.match('/offline.html'))
        )
    );
    return;
  }

  // 2. manifest.json → Stale-while-revalidate
  if (url.pathname === '/manifest.json') {
    event.respondWith(
      caches.match(request).then(cached => {
        const fetchPromise = fetch(request).then(response => {
          // Use strict status check (not response.ok) to avoid caching redirects (301/302)
          if (response.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
          }
          return response;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 3. Static assets (JS, CSS, images, fonts) → Cache-first
  if (['script', 'style', 'image', 'font'].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (request.method === 'GET' && response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
          }
          return response;
        });
      })
    );
    return;
  }

  // 4. Everything else → Network-only (API calls, etc.)
});

// === MESSAGE: Accept update from client ===
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
```

**Key decisions**:
- **No `skipWaiting()` on install** — let user decide when to update (prevents mid-session disruption)
- **HTML is network-first** — always get latest when online, use cache only when offline
- **Assets are cache-first** — Next.js content-hashes assets, so cached versions are always correct
- **Versioned cache name** — changing the timestamp forces cache refresh on deploy

---

## 2. Manifest Generation

Generate the manifest dynamically (different names for staging/production):

```javascript
// scripts/generate-manifest.mjs

import fs from 'fs';

const manifest = {
  name: 'Practice Planner',
  short_name: 'PracticePlan',
  start_url: '/',
  display: 'standalone',
  background_color: '#0f172a',
  theme_color: '#0f172a',
  icons: [
    { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

fs.writeFileSync('public/manifest.json', JSON.stringify(manifest, null, 2));
```

Add to build script: `"build": "node scripts/generate-manifest.mjs && next build"`

---

## 3. Service Worker Registration

```tsx
// src/components/ServiceWorkerRegistration.tsx

'use client';

import { useState, useEffect, useCallback } from 'react';
import UpdateBanner from './UpdateBanner';

export default function ServiceWorkerRegistration() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);

  const checkForUpdate = useCallback((registration: ServiceWorkerRegistration) => {
    // Phase 1: Check if a waiting worker already exists
    if (registration.waiting) {
      setWaitingWorker(registration.waiting);
      setShowUpdate(true);
      return;
    }

    // Phase 2: Listen for new workers installing
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      newWorker?.addEventListener('statechange', () => {
        // Phase 3: Worker installed and ready to activate
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          setWaitingWorker(newWorker);
          setShowUpdate(true);
        }
      });
    });
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;

    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        checkForUpdate(registration);

        // Poll for updates hourly
        const interval = setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);

        // Also check on visibility change (user returns to tab)
        const handleVisibility = () => {
          if (document.visibilityState === 'visible') {
            registration.update();
          }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
          clearInterval(interval);
          document.removeEventListener('visibilitychange', handleVisibility);
        };
      })
      .catch(err => {
        console.error('SW registration failed:', err);
      });

    // Reload when new worker takes control
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }, [checkForUpdate]);

  const handleUpdate = () => {
    waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
    setShowUpdate(false);
  };

  // UpdateBanner is a controlled/presentational component
  return showUpdate ? <UpdateBanner onUpdate={handleUpdate} /> : null;
}
```

**Key patterns**:
- **3-phase update flow**: (1) Check for existing waiting worker, (2) Listen for new worker installing, (3) Worker installed and ready.
- **Hourly polling** + **visibility-change check**: Ensures updates are detected even if the app stays open for days.
- **UpdateBanner is presentational**: `ServiceWorkerRegistration` owns all SW logic; `UpdateBanner` just renders the button.

---

## 4. Update Banner

When a new service worker is waiting, show an update notification:

```tsx
// src/components/UpdateBanner.tsx

'use client';

import { useState, useEffect } from 'react';

export default function UpdateBanner() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleUpdate = (registration: ServiceWorkerRegistration) => {
      setWaitingWorker(registration.waiting);
      setShowUpdate(true);
    };

    navigator.serviceWorker.ready.then(registration => {
      // Check for waiting worker on load
      if (registration.waiting) {
        handleUpdate(registration);
      }

      // Listen for future updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            handleUpdate(registration);
          }
        });
      });
    });

    // Reload when new worker takes control
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }, []);

  const handleUpdate = () => {
    waitingWorker?.postMessage({ type: 'SKIP_WAITING' });
    setShowUpdate(false);
  };

  if (!showUpdate) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg z-50">
      <p>A new version is available!</p>
      <button onClick={handleUpdate} className="mt-2 bg-white text-blue-600 px-4 py-1 rounded">
        Update Now
      </button>
    </div>
  );
}
```

**Key flow**:
1. New SW installs (precaches new assets)
2. New SW enters `waiting` state (old SW still controls)
3. User sees update banner
4. User clicks "Update Now" → `SKIP_WAITING` message
5. New SW activates → `controllerchange` fires → page reloads

---

## 5. Offline Page

```html
<!-- public/offline.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline — Practice Planner</title>
  <link rel="stylesheet" href="/offline.css">
</head>
<body>
  <div class="container">
    <h1>You're offline</h1>
    <p>Please check your internet connection and try again.</p>
    <button id="retry-btn">Retry</button>
  </div>
  <!-- External script for CSP compliance (no inline onclick handlers) -->
  <script src="/offline.js"></script>
</body>
</html>
```

```javascript
// public/offline.js
// Separated from inline handler for Content Security Policy compliance
document.getElementById('retry-btn').addEventListener('click', function() {
  location.reload();
});
```

---

## 6. Install Prompt

```tsx
// src/components/InstallPrompt.tsx

'use client';

import { useState, useEffect } from 'react';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    setShowPrompt(false);
    setDeferredPrompt(null);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 bg-emerald-600 text-white p-4 rounded-lg shadow-lg z-50">
      <p>Install Practice Planner for the best experience</p>
      <div className="flex gap-2 mt-2">
        <button onClick={handleInstall} className="bg-white text-emerald-600 px-4 py-1 rounded">
          Install
        </button>
        <button onClick={() => setShowPrompt(false)} className="text-white/80">
          Not now
        </button>
      </div>
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}
```

---

## Traps

1. **Private/incognito mode**: PWA installation is impossible in private mode (all browsers). IndexedDB is restricted. Detect and show a helpful message.

2. **SW `skipWaiting()` on install is dangerous**: It activates the new worker immediately, which can break an in-progress session. Always let the user choose when to update.

3. **Cache name must change on every deploy**: Use a timestamp or build hash. Otherwise users get stale assets forever.

4. **Don't cache HTML aggressively**: Network-first for HTML ensures users get the latest code. Cache-first would serve stale app versions.

5. **SW registration in production only**: Don't register in development — it caches dev assets and makes HMR impossible.

6. **iOS limitations**: iOS PWAs have no `beforeinstallprompt` event. The install prompt is only shown in Safari via the share menu. Consider showing manual instructions for iOS users.
