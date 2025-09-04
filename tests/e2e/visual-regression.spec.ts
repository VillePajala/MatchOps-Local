import { test, expect } from '@playwright/test';

test.describe('Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Wait for the app to load completely
    await page.waitForLoadState('networkidle');
    
    // Wait for MatchOps branding to ensure app is ready
    await expect(page.locator('text=MatchOps')).toBeVisible({ timeout: 10000 });
  });

  test('homepage should match visual baseline', async ({ page }) => {
    // Hide dynamic content that might change between runs
    await page.addStyleTag({
      content: `
        [data-testid="current-time"],
        .timer-display,
        .loading-spinner {
          visibility: hidden !important;
        }
      `
    });

    // Take a screenshot of the full page
    await expect(page).toHaveScreenshot('homepage-full-page.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('soccer field should match visual baseline', async ({ page }) => {
    // Wait for canvas to be rendered
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 5000 });
    
    // Wait a moment for canvas rendering to complete
    await page.waitForTimeout(1000);

    // Take a screenshot of just the soccer field area
    await expect(canvas).toHaveScreenshot('soccer-field-canvas.png', {
      animations: 'disabled',
    });
  });

  test('mobile viewport should match visual baseline', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    
    // Wait for responsive layout changes
    await page.waitForTimeout(500);
    
    // Hide dynamic elements
    await page.addStyleTag({
      content: `
        [data-testid="current-time"],
        .timer-display {
          visibility: hidden !important;
        }
      `
    });

    await expect(page).toHaveScreenshot('homepage-mobile.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('tablet viewport should match visual baseline', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    
    // Wait for responsive layout changes
    await page.waitForTimeout(500);
    
    // Hide dynamic elements
    await page.addStyleTag({
      content: `
        [data-testid="current-time"],
        .timer-display {
          visibility: hidden !important;
        }
      `
    });

    await expect(page).toHaveScreenshot('homepage-tablet.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('control bar should match visual baseline', async ({ page }) => {
    // Locate the control bar area
    const controlBar = page.locator('[data-testid="control-bar"], .control-bar, nav').first();
    
    // If we can't find a specific control bar, target the button area
    const buttonArea = page.locator('button').first().locator('..').locator('..');
    const targetElement = await controlBar.isVisible() ? controlBar : buttonArea;

    await expect(targetElement).toHaveScreenshot('control-bar.png', {
      animations: 'disabled',
    });
  });

  test('empty field state should match visual baseline', async ({ page }) => {
    // Ensure we start with an empty field
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    
    // Wait for any initial animations to complete
    await page.waitForTimeout(1000);

    await expect(canvas).toHaveScreenshot('empty-soccer-field.png', {
      animations: 'disabled',
    });
  });

  test('dark mode should match visual baseline (if available)', async ({ page }) => {
    // Try to enable dark mode if the toggle exists
    const darkModeToggle = page.locator('[data-testid="dark-mode-toggle"], [aria-label*="dark"], button:has-text("Dark")').first();
    
    if (await darkModeToggle.isVisible()) {
      await darkModeToggle.click();
      await page.waitForTimeout(500); // Wait for theme transition
      
      // Hide dynamic elements
      await page.addStyleTag({
        content: `
          [data-testid="current-time"],
          .timer-display {
            visibility: hidden !important;
          }
        `
      });

      await expect(page).toHaveScreenshot('homepage-dark-mode.png', {
        fullPage: true,
        animations: 'disabled',
      });
    } else {
      // Skip this test if dark mode is not available
      test.skip(true, 'Dark mode toggle not found');
    }
  });

  test('high contrast mode should match visual baseline', async ({ page }) => {
    // Force high contrast styles
    await page.addStyleTag({
      content: `
        * {
          filter: contrast(1.5) !important;
        }
        [data-testid="current-time"],
        .timer-display {
          visibility: hidden !important;
        }
      `
    });

    await expect(page).toHaveScreenshot('homepage-high-contrast.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('modal dialogs should match visual baseline', async ({ page }) => {
    // Look for modal trigger buttons
    const modalButtons = page.locator('button').filter({ 
      hasText: /settings|roster|stats|new game|help/i 
    });
    
    const buttonCount = await modalButtons.count();
    
    if (buttonCount > 0) {
      // Click the first modal button
      await modalButtons.first().click();
      
      // Wait for modal to appear
      await page.waitForTimeout(500);
      
      // Look for modal container
      const modal = page.locator('[role="dialog"], .modal, [data-testid="modal"]').first();
      
      if (await modal.isVisible()) {
        await expect(modal).toHaveScreenshot('modal-dialog.png', {
          animations: 'disabled',
        });
        
        // Close modal for cleanup
        const closeButton = page.locator('button').filter({ hasText: /close|×|cancel/i }).first();
        if (await closeButton.isVisible()) {
          await closeButton.click();
        }
      }
    }
  });

  test('responsive breakpoints should match visual baselines', async ({ page }) => {
    const breakpoints = [
      { name: 'small-mobile', width: 320, height: 568 },
      { name: 'large-mobile', width: 414, height: 896 },
      { name: 'small-tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1280, height: 800 },
      { name: 'large-desktop', width: 1920, height: 1080 },
    ];

    for (const breakpoint of breakpoints) {
      await page.setViewportSize({ 
        width: breakpoint.width, 
        height: breakpoint.height 
      });
      
      // Wait for layout changes
      await page.waitForTimeout(500);
      
      // Hide dynamic elements
      await page.addStyleTag({
        content: `
          [data-testid="current-time"],
          .timer-display {
            visibility: hidden !important;
          }
        `
      });

      await expect(page).toHaveScreenshot(`homepage-${breakpoint.name}.png`, {
        animations: 'disabled',
      });
    }
  });
});