/**
 * Automated screenshot generator for marketing assets.
 * Takes clean mobile screenshots by driving the app UI with Playwright.
 * Run: node scripts/take-screenshots.mjs
 *
 * Prerequisites: dev server running on localhost:3000
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'public', 'screenshots');
const BASE_URL = 'http://localhost:3000';

// iPhone 14 Pro viewport
const VIEWPORT = { width: 393, height: 852 };
const DEVICE_SCALE = 3;

async function takeScreenshot(page, name, msg) {
  const filePath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`  ✓ ${name}.png` + (msg ? ` — ${msg}` : ''));
  return filePath;
}

async function clickText(page, text, timeout = 3000) {
  const el = page.getByText(text, { exact: false });
  if (await el.isVisible({ timeout }).catch(() => false)) {
    await el.click();
    return true;
  }
  return false;
}

async function clickButton(page, name, timeout = 3000) {
  const el = page.getByRole('button', { name });
  if (await el.isVisible({ timeout }).catch(() => false)) {
    await el.click();
    return true;
  }
  return false;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
    locale: 'fi-FI',
    serviceWorkers: 'block',
  });

  const page = await context.newPage();

  // Suppress dev overlay console noise
  page.on('console', () => {});
  page.on('pageerror', () => {});

  // Skip welcome screen via localStorage
  console.log('1. Setting up...');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('matchops_welcome_seen', 'true');
    localStorage.setItem('i18nextLng', 'fi');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Dismiss Next.js dev error overlay if present
  const dismissError = page.locator('button:has-text("✕"), button:has-text("×"), [aria-label="Close"]');
  if (await dismissError.first().isVisible({ timeout: 1000 }).catch(() => false)) {
    await dismissError.first().click();
    await page.waitForTimeout(500);
  }

  // Screenshot: Start screen (first-time user)
  console.log('2. Start screen...');
  await takeScreenshot(page, 'pw-start-screen', 'first-time user view');

  // Hide Next.js dev error indicator at bottom
  await page.evaluate(() => {
    const indicators = document.querySelectorAll('[data-nextjs-toast], nextjs-portal');
    indicators.forEach(el => el.remove());
  });

  // Click "Aloita tästä" to enter the app
  console.log('3. Entering app...');
  if (await clickText(page, 'Aloita tästä')) {
    await page.waitForTimeout(2000);
  } else if (await clickText(page, 'Uusi peli')) {
    await page.waitForTimeout(2000);
  }

  // Dismiss "Valmis aloittamaan?" overlay if present
  const dismissX = page.locator('button:has-text("×"), [aria-label="Close"], [aria-label="Sulje"]');
  for (let i = 0; i < 3; i++) {
    if (await dismissX.first().isVisible({ timeout: 1000 }).catch(() => false)) {
      await dismissX.first().click();
      await page.waitForTimeout(500);
    }
  }

  // Hide dev overlay again after navigation
  await page.evaluate(() => {
    const indicators = document.querySelectorAll('[data-nextjs-toast], nextjs-portal');
    indicators.forEach(el => el.remove());
  });
  await page.waitForTimeout(500);

  // Take game view screenshot (empty field, clean)
  await takeScreenshot(page, 'pw-game-view', 'soccer field (empty)');

  // Look for the timer display in control bar and click it
  const timerEl = page.locator('text=/\\d{2}:\\d{2}/').first();
  if (await timerEl.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('4. Timer view...');
    await timerEl.click();
    await page.waitForTimeout(1500);
    await takeScreenshot(page, 'pw-timer-view', 'timer/events');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // Try the menu (hamburger icon)
  const menuBtn = page.locator('[data-testid="menu-button"], button[aria-label*="menu"], button[aria-label*="valikko"]').first();
  if (await menuBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    console.log('5. Menu...');
    await menuBtn.click();
    await page.waitForTimeout(1000);
    await takeScreenshot(page, 'pw-menu', 'side menu');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  console.log('\nDone! Check public/screenshots/pw-*.png');
  await browser.close();
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
