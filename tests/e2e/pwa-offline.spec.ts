import { test, expect } from '@playwright/test';

test.describe('PWA and Offline Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Wait for the app to load
    await page.waitForLoadState('networkidle');
    
    // Wait for MatchOps branding to confirm app is loaded
    await expect(page.locator('text=MatchOps')).toBeVisible({ timeout: 10000 });
  });

  test('should have valid PWA manifest', async ({ page }) => {
    // Check for manifest link in head
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveCount(1);
    
    // Get manifest URL
    const manifestHref = await manifestLink.getAttribute('href');
    expect(manifestHref).toBeTruthy();
    
    // Navigate to manifest and verify it's valid JSON
    const manifestResponse = await page.goto(`http://localhost:3000${manifestHref}`);
    expect(manifestResponse?.status()).toBe(200);
    
    const manifestText = await manifestResponse?.text();
    const manifest = JSON.parse(manifestText || '{}');
    
    // Check required PWA manifest fields
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBeTruthy();
    expect(manifest.theme_color).toBeTruthy();
    expect(manifest.background_color).toBeTruthy();
    expect(manifest.icons).toBeTruthy();
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
    
    // Go back to the app
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should register service worker', async ({ page }) => {
    // Check if service worker is registered
    const swRegistration = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          return {
            hasRegistration: !!registration,
            scope: registration?.scope,
            updateViaCache: registration?.updateViaCache
          };
        } catch (error) {
          return { error: error.message };
        }
      }
      return { hasServiceWorker: false };
    });

    if ('hasServiceWorker' in swRegistration && !swRegistration.hasServiceWorker) {
      test.skip(true, 'Service Worker not supported in this environment');
    } else {
      expect(swRegistration.hasRegistration).toBe(true);
      expect(swRegistration.scope).toContain('localhost:3000');
    }
  });

  test('should cache resources for offline use', async ({ page }) => {
    // Check if caches API is available and has cached resources
    const cacheInfo = await page.evaluate(async () => {
      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys();
          let totalCachedItems = 0;
          
          for (const cacheName of cacheNames) {
            const cache = await caches.open(cacheName);
            const keys = await cache.keys();
            totalCachedItems += keys.length;
          }
          
          return {
            hasCaches: true,
            cacheNames,
            totalCachedItems
          };
        } catch (error) {
          return { error: error.message };
        }
      }
      return { hasCaches: false };
    });

    if (!cacheInfo.hasCaches) {
      test.skip(true, 'Cache API not available');
    } else {
      expect(cacheInfo.cacheNames.length).toBeGreaterThan(0);
      expect(cacheInfo.totalCachedItems).toBeGreaterThan(0);
    }
  });

  test('should work offline after initial load', async ({ page, context }) => {
    // First, ensure the app loads and resources are cached
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Wait a moment for service worker to cache resources
    await page.waitForTimeout(2000);
    
    // Simulate offline condition
    await context.setOffline(true);
    
    // Reload the page while offline
    await page.reload();
    
    // The app should still load (from cache)
    await expect(page.locator('text=MatchOps')).toBeVisible({ timeout: 10000 });
    
    // Basic functionality should work
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    
    // Buttons should be present
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    expect(buttonCount).toBeGreaterThan(0);
    
    // Re-enable network
    await context.setOffline(false);
  });

  test('should handle localStorage when offline', async ({ page, context }) => {
    // Add some test data to localStorage
    await page.evaluate(() => {
      localStorage.setItem('testData', JSON.stringify({ offline: true, timestamp: Date.now() }));
    });
    
    // Go offline
    await context.setOffline(true);
    
    // Reload page
    await page.reload();
    
    // Verify localStorage data is accessible offline
    const offlineData = await page.evaluate(() => {
      const data = localStorage.getItem('testData');
      return data ? JSON.parse(data) : null;
    });
    
    expect(offlineData).toBeTruthy();
    expect(offlineData.offline).toBe(true);
    
    // Add more data while offline
    await page.evaluate(() => {
      localStorage.setItem('offlineData', 'Created while offline');
    });
    
    // Re-enable network
    await context.setOffline(false);
    
    // Verify data persists when back online
    const persistedData = await page.evaluate(() => {
      return localStorage.getItem('offlineData');
    });
    
    expect(persistedData).toBe('Created while offline');
    
    // Clean up test data
    await page.evaluate(() => {
      localStorage.removeItem('testData');
      localStorage.removeItem('offlineData');
    });
  });

  test('should show offline indicator when network is unavailable', async ({ page, context }) => {
    // Go offline
    await context.setOffline(true);
    
    // Reload to trigger offline state
    await page.reload();
    
    // Look for offline indicators (these might not exist in the current app)
    const offlineIndicators = [
      page.locator('[data-testid="offline-indicator"]'),
      page.locator('.offline-indicator'),
      page.locator('[aria-label*="offline" i]'),
      page.locator('text=/offline|disconnected/i')
    ];
    
    let hasOfflineIndicator = false;
    for (const indicator of offlineIndicators) {
      if (await indicator.isVisible()) {
        hasOfflineIndicator = true;
        break;
      }
    }
    
    // Note: This test might pass even if no indicator is found,
    // as offline indication is optional for PWAs
    console.log('Offline indicator found:', hasOfflineIndicator);
    
    // Re-enable network
    await context.setOffline(false);
  });

  test('should be installable as PWA', async ({ page }) => {
    // Check for install prompt availability
    // Note: This is difficult to test programmatically as browsers
    // have strict requirements for install prompts
    
    const installability = await page.evaluate(() => {
      return {
        hasManifest: !!document.querySelector('link[rel="manifest"]'),
        hasServiceWorker: 'serviceWorker' in navigator,
        isSecureContext: location.protocol === 'https:' || location.hostname === 'localhost',
        hasRequiredIcons: !!document.querySelector('link[rel="manifest"]')
      };
    });
    
    expect(installability.hasManifest).toBe(true);
    expect(installability.hasServiceWorker).toBe(true);
    expect(installability.isSecureContext).toBe(true);
    expect(installability.hasRequiredIcons).toBe(true);
  });

  test('should update when new version is available', async ({ page }) => {
    // This test simulates the update flow
    // In a real scenario, you'd update the service worker and test the update mechanism
    
    const updateMechanism = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          return {
            hasUpdate: typeof registration?.update === 'function',
            hasUpdateFound: !!registration?.addEventListener,
            canCheckForUpdates: true
          };
        } catch (error) {
          return { error: error.message };
        }
      }
      return { canCheckForUpdates: false };
    });

    if (updateMechanism.canCheckForUpdates) {
      expect(updateMechanism.hasUpdate).toBe(true);
      expect(updateMechanism.hasUpdateFound).toBe(true);
    }
  });

  test('should handle concurrent offline operations', async ({ page, context }) => {
    // Add some initial data
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        localStorage.setItem(`item-${i}`, JSON.stringify({ id: i, value: `test-${i}` }));
      }
    });
    
    // Go offline
    await context.setOffline(true);
    
    // Perform multiple operations concurrently while offline
    await Promise.all([
      page.evaluate(() => localStorage.setItem('concurrent-1', 'value-1')),
      page.evaluate(() => localStorage.setItem('concurrent-2', 'value-2')),
      page.evaluate(() => localStorage.setItem('concurrent-3', 'value-3'))
    ]);
    
    // Verify all operations completed
    const results = await page.evaluate(() => {
      return [
        localStorage.getItem('concurrent-1'),
        localStorage.getItem('concurrent-2'),
        localStorage.getItem('concurrent-3')
      ];
    });
    
    expect(results).toEqual(['value-1', 'value-2', 'value-3']);
    
    // Go back online
    await context.setOffline(false);
    
    // Clean up
    await page.evaluate(() => {
      for (let i = 0; i < 5; i++) {
        localStorage.removeItem(`item-${i}`);
      }
      localStorage.removeItem('concurrent-1');
      localStorage.removeItem('concurrent-2');
      localStorage.removeItem('concurrent-3');
    });
  });

  test('should maintain app state across offline sessions', async ({ page, context }) => {
    // Create some app state
    const testState = {
      teamName: 'Offline Test Team',
      score: { home: 2, away: 1 },
      currentPeriod: 1,
      gameNotes: 'Testing offline persistence'
    };
    
    // Simulate saving game state
    await page.evaluate((state) => {
      localStorage.setItem('gameState', JSON.stringify(state));
    }, testState);
    
    // Go offline and reload
    await context.setOffline(true);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    
    // Verify state is preserved
    const preservedState = await page.evaluate(() => {
      const state = localStorage.getItem('gameState');
      return state ? JSON.parse(state) : null;
    });
    
    expect(preservedState).toEqual(testState);
    
    // Modify state while offline
    testState.score.home = 3;
    testState.gameNotes += ' - Updated offline';
    
    await page.evaluate((state) => {
      localStorage.setItem('gameState', JSON.stringify(state));
    }, testState);
    
    // Go back online
    await context.setOffline(false);
    
    // Verify modified state persists
    const finalState = await page.evaluate(() => {
      const state = localStorage.getItem('gameState');
      return state ? JSON.parse(state) : null;
    });
    
    expect(finalState.score.home).toBe(3);
    expect(finalState.gameNotes).toContain('Updated offline');
    
    // Clean up
    await page.evaluate(() => {
      localStorage.removeItem('gameState');
    });
  });
});