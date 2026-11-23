// Renders the link-preview (Open Graph) images public/og/og-fi.png and
// public/og/og-en.png, 1200x630: the badge logo, the name, a benefit line,
// "Ilmainen"/"Free" and a real app screenshot in the MatchOps navy/amber style.
//
// Run from the repository root (Playwright is a root dev dependency):
//   node site/scripts/generate-og-images.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const site = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pub = path.join(site, 'public');
const dataUri = (file, type) => `data:${type};base64,${fs.readFileSync(path.join(pub, file)).toString('base64')}`;

const copy = {
  fi: {
    eyebrow: 'Jalkapallo- ja futsalvalmentajille',
    title: 'Peluutus, vaihdot ja pöytäkirja yhdessä sovelluksessa',
    free: 'Ilmainen',
    extra: 'Ei mainoksia · Tiedot EU:ssa',
    platform: 'Android · Google Play',
  },
  en: {
    eyebrow: 'For football and futsal coaches',
    title: 'Line-ups, substitutions and the match sheet in one app',
    free: 'Free',
    extra: 'No ads · Data in the EU',
    platform: 'Android · Google Play',
  },
};

const html = (lang) => {
  const c = copy[lang];
  const logo = dataUri('logos/matchops-badge.svg', 'image/svg+xml');
  const shot = dataUri(`screenshots/MatchOps_v3_timer_${lang}.jpg`, 'image/jpeg');
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=Inter:wght@400;600&display=block" rel="stylesheet">
<style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: Inter, sans-serif; color: #f8fafc;
    background: radial-gradient(circle at 85% 15%, rgba(245,158,11,.22), transparent 45%),
                radial-gradient(circle at 10% 100%, rgba(56,189,248,.12), transparent 50%), #0f172a; }
  .wrap { display: flex; height: 100%; padding: 64px 72px; gap: 48px; align-items: center; }
  .text { flex: 1; }
  .brand { display: flex; align-items: center; gap: 18px; margin-bottom: 34px; }
  .brand img { width: 76px; height: 76px; }
  .brand span { font-family: Rajdhani, sans-serif; font-weight: 700; font-size: 52px; letter-spacing: .5px; }
  .eyebrow { color: #f59e0b; font-weight: 600; font-size: 22px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 14px; }
  h1 { font-family: Rajdhani, sans-serif; font-weight: 700; font-size: 60px; line-height: 1.02; margin-bottom: 34px; }
  .row { display: flex; align-items: center; gap: 18px; }
  .free { background: #f59e0b; color: #0f172a; font-family: Rajdhani, sans-serif; font-weight: 700; font-size: 34px;
    padding: 6px 26px; border-radius: 999px; }
  .extra { font-size: 22px; color: #cbd5e1; }
  .platform { margin-top: 18px; font-size: 20px; color: #94a3b8; }
  .phone { width: 262px; height: 568px; border-radius: 34px; padding: 6px; background: linear-gradient(145deg,#3a3a3a,#1a1a1a);
    box-shadow: 0 0 0 1px rgba(255,255,255,.1), 0 30px 60px -10px rgba(0,0,0,.7), 0 0 80px -10px rgba(245,158,11,.35); }
  .phone img { width: 100%; height: 100%; object-fit: cover; object-position: top; border-radius: 28px; display: block; }
</style></head><body><div class="wrap">
  <div class="text">
    <div class="brand"><img src="${logo}" alt=""><span>MatchOps</span></div>
    <div class="eyebrow">${c.eyebrow}</div>
    <h1>${c.title}</h1>
    <div class="row"><span class="free">${c.free}</span><span class="extra">${c.extra}</span></div>
    <div class="platform">${c.platform}</div>
  </div>
  <div class="phone"><img src="${shot}" alt=""></div>
</div></body></html>`;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
fs.mkdirSync(path.join(pub, 'og'), { recursive: true });
for (const lang of ['fi', 'en']) {
  await page.setContent(html(lang), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(pub, 'og', `og-${lang}.png`) });
  console.log(`og-${lang}.png`);
}
await browser.close();
