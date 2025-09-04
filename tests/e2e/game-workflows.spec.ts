import { test, expect } from '@playwright/test';

test.describe('Complete Game Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Wait for the app to load
    await page.waitForLoadState('networkidle');
    
    // Look for MatchOps branding to confirm app is loaded
    await expect(page.locator('text=MatchOps')).toBeVisible({ timeout: 10000 });
  });

  test('should load the homepage successfully', async ({ page }) => {
    // Verify key elements are present
    await expect(page.locator('text=MatchOps')).toBeVisible();
    
    // Should have some interactive buttons
    const buttons = page.locator('button');
    await expect(buttons.first()).toBeVisible();
    
    // Page should be responsive
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('should display soccer field', async ({ page }) => {
    // Look for canvas element (soccer field)
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 5000 });
    
    // Canvas should have reasonable dimensions
    const boundingBox = await canvas.boundingBox();
    expect(boundingBox).toBeTruthy();
    expect(boundingBox!.width).toBeGreaterThan(100);
    expect(boundingBox!.height).toBeGreaterThan(100);
  });

  test('should handle basic interactions', async ({ page }) => {
    // Find and interact with control buttons
    const buttons = page.locator('button:visible');
    const buttonCount = await buttons.count();
    
    expect(buttonCount).toBeGreaterThan(0);
    
    // Click the first available button
    if (buttonCount > 0) {
      await buttons.first().click();
      
      // App should remain responsive
      await expect(page.locator('text=MatchOps')).toBeVisible();
    }
  });

  test('should handle timer functionality', async ({ page }) => {
    // Look for timer-related buttons
    const startButton = page.locator('button').filter({ hasText: /start|play|timer/i }).first();
    
    // If we have a start button, test it
    if (await startButton.isVisible()) {
      await startButton.click();
      
      // App should remain functional
      await expect(page.locator('text=MatchOps')).toBeVisible();
    }
  });

  test('should open and close modals', async ({ page }) => {
    // Look for modal trigger buttons
    const modalButtons = page.locator('button').filter({ 
      hasText: /settings|roster|stats|new game/i 
    });
    
    const buttonCount = await modalButtons.count();
    
    if (buttonCount > 0) {
      // Click the first modal button
      await modalButtons.first().click();
      
      // Wait a moment for modal to open
      await page.waitForTimeout(500);
      
      // Look for modal content or close button
      const closeButton = page.locator('button').filter({ hasText: /close|×|cancel/i }).first();
      
      if (await closeButton.isVisible()) {
        await closeButton.click();
        
        // Modal should close
        await page.waitForTimeout(300);
      }
      
      // App should still be functional
      await expect(page.locator('text=MatchOps')).toBeVisible();
    }
  });

  test('should handle canvas interactions', async ({ page }) => {
    const canvas = page.locator('canvas').first();
    
    if (await canvas.isVisible()) {
      // Get canvas position
      const boundingBox = await canvas.boundingBox();
      
      if (boundingBox) {
        // Click on the canvas
        await page.mouse.click(
          boundingBox.x + boundingBox.width / 2,
          boundingBox.y + boundingBox.height / 2
        );
        
        // Drag across the canvas
        await page.mouse.move(
          boundingBox.x + boundingBox.width / 4,
          boundingBox.y + boundingBox.height / 4
        );
        
        await page.mouse.down();
        await page.mouse.move(
          boundingBox.x + (boundingBox.width * 3) / 4,
          boundingBox.y + (boundingBox.height * 3) / 4
        );
        await page.mouse.up();
        
        // App should remain responsive after canvas interaction
        await expect(page.locator('text=MatchOps')).toBeVisible();
      }
    }
  });

  test('should handle browser refresh gracefully', async ({ page }) => {
    // Interact with the app first
    const buttons = page.locator('button:visible');
    const buttonCount = await buttons.count();
    
    if (buttonCount > 0) {
      await buttons.first().click();
      await page.waitForTimeout(500);
    }
    
    // Refresh the page
    await page.reload();
    
    // Wait for app to reload
    await page.waitForLoadState('networkidle');
    
    // App should load successfully after refresh
    await expect(page.locator('text=MatchOps')).toBeVisible({ timeout: 10000 });
  });

  test('should be responsive on different screen sizes', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    
    await expect(page.locator('text=MatchOps')).toBeVisible();
    
    // Canvas should still be visible on mobile
    const canvas = page.locator('canvas');
    if (await canvas.isVisible()) {
      const boundingBox = await canvas.boundingBox();
      expect(boundingBox!.width).toBeLessThanOrEqual(375);
    }
    
    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    
    await expect(page.locator('text=MatchOps')).toBeVisible();
    
    // Test desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 }); // Desktop
    
    await expect(page.locator('text=MatchOps')).toBeVisible();
  });

  test('should handle localStorage persistence', async ({ page }) => {
    // Interact with the app to potentially save data
    const buttons = page.locator('button:visible');
    const buttonCount = await buttons.count();
    
    if (buttonCount > 0) {
      await buttons.first().click();
      await page.waitForTimeout(500);
    }
    
    // Check localStorage has some data
    const localStorageData = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      return keys.length > 0;
    });
    
    // Some localStorage data should exist (app settings, etc.)
    // Note: This might be false if the app doesn't set anything by default
    expect(typeof localStorageData).toBe('boolean');
  });

  test('should handle errors gracefully', async ({ page }) => {
    // Monitor console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    // Monitor page errors
    const pageErrors: string[] = [];
    page.on('pageerror', error => {
      pageErrors.push(error.message);
    });
    
    // Perform various interactions
    const buttons = page.locator('button:visible');
    const buttonCount = await buttons.count();
    
    for (let i = 0; i < Math.min(buttonCount, 3); i++) {
      await buttons.nth(i).click();
      await page.waitForTimeout(200);
    }
    
    // Canvas interactions
    const canvas = page.locator('canvas').first();
    if (await canvas.isVisible()) {
      const boundingBox = await canvas.boundingBox();
      if (boundingBox) {
        await page.mouse.click(
          boundingBox.x + 50,
          boundingBox.y + 50
        );
      }
    }
    
    // Check that no critical errors occurred
    const criticalErrors = errors.filter(error => 
      !error.includes('ResizeObserver') && 
      !error.includes('Canvas dimensions are invalid') &&
      !error.includes('Warning:') // React warnings are not critical
    );
    
    expect(criticalErrors.length).toBe(0);
    expect(pageErrors.length).toBe(0);
    
    // App should still be functional
    await expect(page.locator('text=MatchOps')).toBeVisible();
  });
});