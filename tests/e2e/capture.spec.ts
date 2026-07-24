import { test, expect, Page } from '@playwright/test';
import fs from 'fs';

// Match the old device screenshots' dimensions (1080x2340) so new + reused shots mix cleanly.
test.use({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

// Marketing screenshot capture against the seeded staging demo account.
// Run: npx playwright test capture.spec --project="Mobile Chrome"
const EMAIL = 'screenshots-demo@matchops.dev';
const PW = 'ScreenshotDemo2026!';
const OUT = 'tests/e2e/captures';
const HIDE_DEV_CSS = `nextjs-portal,[data-next-badge-root],[data-next-badge],[data-nextjs-toast],#__next-build-watcher,[id*="dev-tools-indicator"]{display:none!important}`;

async function hideChrome(page: Page) { await page.addStyleTag({ content: HIDE_DEV_CSS }).catch(() => {}); }

async function dismissPrompt(page: Page) {
  // opt-in prompt + backup-reminder banner
  for (const re of [/ei kiitos|no thanks/i, /^dismiss$|^ohita$/i]) {
    const d = page.locator('button', { hasText: re }).first();
    if (await d.count() > 0) { await d.click().catch(() => {}); await page.waitForTimeout(500); }
  }
}

async function login(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);
  await clearAlreadyOpen(page);
  const cloudBtn = page.locator('button', { hasText: /pilvisynkronointi|cloud sync|sign in|kirjaudu/i }).first();
  if (await page.locator('input[type="email"]').count() === 0 && await cloudBtn.count() > 0) {
    await cloudBtn.click().catch(() => {}); await page.waitForTimeout(1500);
  }
  if (await page.locator('input[type="email"]').count() > 0) {
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PW);
    await page.locator('button', { hasText: /sign in|kirjaudu/i }).first().click();
  }
  await page.getByRole('tab').first().waitFor({ timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await dismissPrompt(page);
}

// The single-tab lock trips when a reload races the previous instance's lock
// ("MatchOps is already open in another tab"). Click Try Again until it clears.
async function clearAlreadyOpen(page: Page) {
  for (let i = 0; i < 5; i++) {
    const tryAgain = page.locator('button', { hasText: /try again|yritä uudelleen/i }).first();
    if (await tryAgain.count() === 0) return;
    await page.waitForTimeout(1500);
    await tryAgain.click().catch(() => {});
    await page.waitForTimeout(1500);
  }
}

// Close an open modal via back (max 2 hops so we never over-navigate past the app).
async function ensureHome(page: Page) {
  for (let i = 0; i < 2; i++) {
    const onHome = await page.getByRole('tab').first().isVisible().catch(() => false);
    if (onHome) break;
    await page.goBack().catch(() => {});
    await page.waitForTimeout(700);
  }
  await dismissPrompt(page);
  await hideChrome(page);
}

async function setLang(page: Page, lang: 'en' | 'fi') {
  const btn = page.locator('button', { hasText: new RegExp(`^${lang.toUpperCase()}$`) }).first();
  if (await btn.count() > 0) { await btn.click().catch(() => {}); await page.waitForTimeout(1200); }
}

async function shot(page: Page, name: string) { try { await hideChrome(page); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png` }); } catch { /* skip */ } }
async function closeModal(page: Page) { await page.goBack().catch(() => {}); await page.waitForTimeout(800); }
async function dump(page: Page, tag: string) {
  try {
    const btns = (await page.locator('button:visible').allInnerTexts()).map(s => s.replace(/\n/g, ' ').trim()).filter(Boolean);
    fs.appendFileSync(`${OUT}/_diag.txt`, `\n[${tag}] buttons: ${btns.join(' | ')}\n`);
  } catch { /* skip */ }
}
// Enter a full-screen view (not a modal) via a button, capture, then back to home.
async function enterAndShot(page: Page, re: RegExp, name: string, afterEnter?: (p: Page) => Promise<void>) {
  try {
    const b = page.locator('button', { hasText: re }).first();
    if (await b.count() === 0) return false;
    await b.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await dismissPrompt(page);
    await hideChrome(page);
    if (afterEnter) await afterEnter(page);
    await shot(page, name);
    return true;
  } catch { return false; }
}

async function tab(page: Page, name: string) {
  try {
    const t = page.getByRole('tab', { name });
    await t.first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    if (await t.count() > 0) { await t.first().click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(1200); }
  } catch { /* skip */ }
}
async function openRow(page: Page, re: RegExp, name: string, drillIn = false) {
  try {
    const row = page.locator('button', { hasText: re }).first();
    await row.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
    if (await row.count() === 0) return;
    await row.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
    if (drillIn) {
      // Planner: click into the first plan card to show the interior
      const card = page.locator('button, [role="button"]', { hasText: /Kevätkierros/ }).first();
      if (await card.count() > 0) { await card.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(1800); }
    }
    await shot(page, name);
    await closeModal(page);
    if (drillIn) await closeModal(page);
  } catch { /* skip */ }
}

const L = {
  en: { games: 'Games', club: 'Club', comps: 'Competitions', stats: 'Stats', players: /^Players$/, teams: /^Teams$/, personnel: /^Personnel$/, seasons: /^Seasons\b/, tournaments: /^Tournaments\b/, planner: /Match planner/, playerStats: /Player stats/ },
  fi: { games: 'Pelit', club: 'Seura', comps: 'Kilpailut', stats: 'Tilastot', players: /^Pelaajat$/, teams: /^Joukkueet$/, personnel: /^Taustahenkilöt$/, seasons: /^Kaudet\b/, tournaments: /^Turnaukset\b/, planner: /Ottelusuunnittelu/, playerStats: /Pelaajatilastot/ },
};

async function captureLang(page: Page, lang: 'en' | 'fi') {
  {
    await ensureHome(page);
    await setLang(page, lang);
    const T = L[lang];

    // Planner FIRST (freshest state — the drill-in is flaky when run late)
    await tab(page, T.games); await openRow(page, T.planner, `planner_${lang}`, true);
    await ensureHome(page);

    await tab(page, T.games); await shot(page, `dashboard_${lang}`);
    await tab(page, T.club); await shot(page, `club_${lang}`);
    await tab(page, T.comps); await shot(page, `competitions_${lang}`); await dump(page, `${lang}-comps`);
    await tab(page, T.stats); await shot(page, `stats_${lang}`); await dump(page, `${lang}-stats`);

    // New game setup (depicts the friendly / harjoitusottelu option) — for the friendlies card
    await tab(page, T.games); await openRow(page, /^New Game$|^Uusi ottelu$/, `newgame_${lang}`);

    // Club-tab modals
    await tab(page, T.club);
    await openRow(page, T.players, `roster_${lang}`);
    await tab(page, T.club); await openRow(page, T.teams, `teams_${lang}`);
    await tab(page, T.club); await openRow(page, T.personnel, `personnel_${lang}`);

    // Competitions-tab modals
    await tab(page, T.comps); await openRow(page, T.seasons, `seasons_${lang}`);
    await tab(page, T.comps); await openRow(page, T.tournaments, `tournaments_${lang}`);

    // Stats -> Player stats (club) modal, then drill into a player for the development compass
    await tab(page, T.stats);
    const psRow = page.locator('button', { hasText: T.playerStats }).first();
    await psRow.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
    if (await psRow.count() > 0) {
      await psRow.click().catch(() => {}); await page.waitForTimeout(1500);
      await shot(page, `playerstats_${lang}`);
      const player = page.locator('button, [role="button"]', { hasText: /Jasper|Eeli|Onni/ }).first();
      if (await player.count() > 0) { await player.click().catch(() => {}); await page.waitForTimeout(1800); await shot(page, `development_${lang}`); await page.goBack().catch(() => {}); await page.waitForTimeout(600); }
      await closeModal(page);
    }

    // Match mode: resume the current game via Continue/Jatka -> field + sub-views.
    await ensureHome(page); await tab(page, T.games);
    const entered = await enterAndShot(page, /Continue|Jatka/, `field_${lang}`, async (p) => { await dump(p, `${lang}-match`); });
    if (entered) {
      // Timer overlay (click the mm:ss timer button)
      const timer = page.locator('button', { hasText: /^\d{1,2}:\d{2}$/ }).first();
      if (await timer.count() > 0) { await timer.click().catch(() => {}); await page.waitForTimeout(1200); await shot(page, `timer_${lang}`); await timer.click().catch(() => {}); await page.waitForTimeout(600); }
      // Tactical board (clipboard control)
      const tactics = page.locator('[aria-label*="actic" i], [title*="actic" i], [aria-label*="aktiik" i], [title*="aktiik" i]').first();
      if (await tactics.count() > 0) { await tactics.click().catch(() => {}); await page.waitForTimeout(1500); await hideChrome(page); await shot(page, `tactical_${lang}`); }
      await page.goBack().catch(() => {}); await page.waitForTimeout(1500);
    }

    // Planner LAST (its drill-in can leave the SPA mid-stack)
    await ensureHome(page); await tab(page, T.games);
    await openRow(page, T.planner, `planner_${lang}`, true);
  }
}

for (const lang of ['en', 'fi'] as const) {
  test(`capture screens (${lang})`, async ({ page }) => {
    test.setTimeout(240000);
    fs.mkdirSync(OUT, { recursive: true });
    await login(page);
    await captureLang(page, lang);
    expect(fs.readdirSync(OUT).filter(f => f.endsWith(`_${lang}.png`)).length).toBeGreaterThan(3);
  });
}
