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

    it('should NOT cache HTML documents', () => {
      // Check that HTML/navigate requests go to network
      expect(swContent).toContain("request.destination === 'document'");
      expect(swContent).toContain("request.mode === 'navigate'");
      // And that they use fetch, not cache
      expect(swContent).toContain('fetch(request).catch');
    });

    it('should have offline.html in precache list', () => {
      expect(swContent).toContain("'/offline.html'");
    });

    it('should serve offline page when network fails for HTML', () => {
      expect(swContent).toContain("caches.match('/offline.html')");
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

  describe('Cache Cleanup', () => {
    it('should delete old caches on activate', () => {
      expect(swContent).toContain('caches.keys()');
      expect(swContent).toContain('caches.delete(cacheName)');
    });

    it('should only delete matchops caches and keep current version', () => {
      // Uses filter to select only old matchops caches for deletion
      expect(swContent).toContain("name !== CACHE_NAME && name.startsWith('matchops-')");
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
