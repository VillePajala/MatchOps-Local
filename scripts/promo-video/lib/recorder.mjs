/**
 * Scene recorder: drives the real app in headless Chromium at phone size and records it.
 *
 * Everything the hero video taught, kept here so the next video does not relearn it:
 *  - The app is seeded through IndexedDB (key/value store "MatchOpsLocal") before boot, in
 *    local mode, with the welcome and first-visit hints marked seen and the single-tab lock
 *    satisfied. No account, nothing touches staging or prod.
 *  - The clock for scene marks starts when the browser context is created, because that is
 *    when Playwright's recording starts. The screencast also runs slightly slow under load,
 *    so the encoder scales marks by (file length / measured length) per recording.
 *  - A visible cursor (a white ring) glides to every target and rests on it before the tap
 *    ripple, and every tap re-reads the target's box right before clicking, so a still-moving
 *    list never catches a click.
 *  - Native <select> popups are OS windows the recording cannot see, so the open list is
 *    drawn in-page from the select's own options.
 *  - Modals close with the phone's back gesture, which cannot be filmed; the planner's X is
 *    unhidden for the recording and a few same-document history entries keep the modal's
 *    back-pop inside the app.
 *  - The pitch's planned-sub ghost rings animate and stall the screencast: seed the field
 *    without planned subs when the field itself is the subject.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const STYLE = `nextjs-portal{display:none!important}
[role=dialog][aria-label="Ottelusuunnittelu"] button[aria-label="Sulje"]{display:flex!important}
#cur{position:fixed;left:0;top:0;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.45),0 2px 8px rgba(0,0,0,.5);background:rgba(255,255,255,.12);pointer-events:none;z-index:99998;transition:transform .65s cubic-bezier(.4,0,.2,1)}
.tap{position:fixed;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;background:rgba(255,255,255,.55);pointer-events:none;z-index:99999;animation:tap .5s ease-out forwards}@keyframes tap{from{transform:scale(.5);opacity:.9}to{transform:scale(1.6);opacity:0}}`;

const FIRST_VISIT_SURFACES = ['game-setup', 'goal-log', 'match-field', 'planner', 'seasons', 'stats', 'team-form', 'timer'];

export async function openRecorder({ outDir, baseUrl = 'http://localhost:3000', viewport = { width: 390, height: 844 }, scale = 2 } = {}) {
  fs.mkdirSync(path.join(outDir, 'raw'), { recursive: true });
  const browser = await chromium.launch({ args: [`--force-device-scale-factor=${scale}`] });

  async function scene(name, data, { inMatch = false, startCur = [195, 700], only = null } = {}, run) {
    if (only && !only.includes(name)) return null;
    const ctx = await browser.newContext({ viewport, locale: 'fi-FI', timezoneId: 'Europe/Helsinki',
      recordVideo: { dir: path.join(outDir, 'raw'), size: { width: viewport.width * scale, height: viewport.height * scale } } });
    const t0 = Date.now(); const now = () => (Date.now() - t0) / 1000; const marks = [];
    await ctx.addInitScript(({ inMatch, surfaces }) => {
      try {
        localStorage.setItem('matchops_backend_mode', 'local'); localStorage.setItem('matchops_welcome_seen', 'true');
        if (inMatch) localStorage.setItem('matchops_was_in_match', '1'); else localStorage.removeItem('matchops_was_in_match');
        for (const sf of surfaces) localStorage.setItem('matchops_first_visit_' + sf + '_local', '1');
      } catch {}
      // Dev-mode StrictMode double-mount makes the single-tab lock look taken; grant it.
      try { Object.defineProperty(navigator, 'locks', { value: { request: (_n, _o, cb) => Promise.resolve(typeof _o === 'function' ? _o({ name: _n }) : cb({ name: _n })) } }); } catch {}
    }, { inMatch, surfaces: FIRST_VISIT_SURFACES });
    const page = await ctx.newPage();
    await page.goto(baseUrl + '/manifest.json');
    await page.evaluate(async (d) => { await new Promise((res, rej) => { const req = indexedDB.open('MatchOpsLocal', 1);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('keyValueStore')) { const s = db.createObjectStore('keyValueStore', { keyPath: 'key' }); s.createIndex('keyIndex', 'key', { unique: true }); } };
      req.onsuccess = () => { const db = req.result; const tx = db.transaction('keyValueStore', 'readwrite'); const st = tx.objectStore('keyValueStore'); for (const [k, v] of Object.entries(d)) if (v != null) st.put({ key: k, value: JSON.stringify(v) }); tx.oncomplete = () => { db.close(); res(); }; tx.onerror = () => rej(tx.error); };
      req.onerror = () => rej(req.error); }); }, data);

    let curPos = startCur;
    const setCur = async (x, y, dur) => { curPos = [x, y]; await page.evaluate(([x, y, dur, from]) => { let c = document.getElementById('cur'); if (!c) { c = document.createElement('div'); c.id = 'cur'; c.style.transition = 'none'; c.style.transform = `translate(${from[0]}px,${from[1]}px)`; document.body.appendChild(c); void c.offsetWidth; c.style.transition = ''; } if (dur) c.style.transitionDuration = dur + 'ms'; c.style.transform = `translate(${x}px,${y}px)`; }, [x, y, dur, curPos]); };
    const arm = async () => { await page.addStyleTag({ content: STYLE }); await page.evaluate((pos) => {
      for (const b of document.querySelectorAll('button')) if (/Tervetuloa/.test(b.textContent || '')) b.style.display = 'none';
      if (!document.getElementById('cur')) { const c = document.createElement('div'); c.id = 'cur'; c.style.transition = 'none'; c.style.transform = `translate(${pos[0]}px,${pos[1]}px)`; document.body.appendChild(c); void c.offsetWidth; c.style.transition = ''; }
      if (!window.__tap) { window.__tap = 1; document.addEventListener('pointerdown', (e) => { const d = document.createElement('div'); d.className = 'tap'; d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 550); }, true); } }, curPos); };
    const hold = (ms) => page.waitForTimeout(ms);
    const ripple = (x, y) => page.evaluate(([x, y]) => { const d = document.createElement('div'); d.className = 'tap'; d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 550); }, [x, y]);
    const glide = async (loc, rest = 850, dur = 650) => { await loc.scrollIntoViewIfNeeded().catch(() => {}); const b = await loc.boundingBox(); if (!b) throw new Error('glide: target has no box'); const x = b.x + b.width / 2, y = b.y + b.height / 2; await setCur(x, y, dur); await hold(dur + 50 + rest); return [x, y]; };
    const tap = async (loc, rest) => { await glide(loc, rest); const b = await loc.boundingBox(); if (!b) return; const x = b.x + b.width / 2, y = b.y + b.height / 2; if (Math.hypot(x - curPos[0], y - curPos[1]) > 4) { await setCur(x, y); await hold(400); } await page.mouse.click(x, y); };
    const orbit = async (loc) => { const b = await loc.boundingBox(); if (!b) return; for (const [x, y] of [[b.x + 14, b.y + 14], [b.x + b.width - 14, b.y + 14], [b.x + b.width - 14, b.y + b.height - 14], [b.x + 14, b.y + b.height - 14], [b.x + 14, b.y + 14]]) { await setCur(x, y); await hold(520); } await hold(500); };
    const pickFromSelect = async (sel, value) => {
      const [sx, sy] = await glide(page.locator(sel), 500); await ripple(sx, sy);
      await page.evaluate(([sel, value]) => { const s = document.querySelector(sel); const r = s.getBoundingClientRect(); const ul = document.createElement('div'); ul.id = 'fakedd';
        ul.style.cssText = `position:fixed;left:${r.left}px;top:${r.bottom + 4}px;width:${r.width}px;max-height:300px;overflow:hidden;background:#1e293b;border:1px solid #475569;border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.6);z-index:99990;font:15px system-ui;color:#e2e8f0`;
        for (const o of [...s.options].filter(o => o.value && o.value !== '__unknown__' && !o.disabled)) { const li = document.createElement('div'); li.textContent = o.textContent.trim(); li.dataset.v = o.value; li.style.cssText = 'padding:10px 14px;border-bottom:1px solid rgba(71,85,105,.5)'; if (o.value === value) li.dataset.pick = '1'; ul.appendChild(li); }
        document.body.appendChild(ul); }, [sel, value]);
      await hold(700); const [ix, iy] = await glide(page.locator('#fakedd [data-pick="1"]'), 500); await ripple(ix, iy);
      await page.evaluate(() => { const li = document.querySelector('#fakedd [data-pick="1"]'); if (li) li.style.background = '#4f46e5'; }); await hold(350);
      await page.evaluate(() => document.getElementById('fakedd')?.remove()); await page.selectOption(sel, value); await hold(700); };
    const scrollToHeading = async (re, ms = 1100) => { await page.evaluate((src) => { const re = new RegExp(src, 'i'); const h = [...document.querySelectorAll('h2,h3')].find(x => re.test(x.textContent || '')); h?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, re); await hold(ms); };
    const scrollToId = async (id, ms = 1100) => { await page.evaluate((id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), id); await hold(ms); };
    const scrollToSelector = async (sel, block = 'start', ms = 1100) => { await page.evaluate(([sel, block]) => document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block }), [sel, block]); await hold(ms); };
    /** Scroll the nearest scrollable ancestor of `sel` back to its top (un-collapses collapse-on-scroll headers). */
    const scrollPanelTop = async (sel, ms = 1200) => { await page.evaluate((sel) => { let el = document.querySelector(sel)?.parentElement; while (el && el.scrollHeight <= el.clientHeight + 2) el = el.parentElement; if (el) el.scrollTo({ top: 0, behavior: 'smooth' }); }, sel); await hold(ms); };
    const mark = (id) => marks.push({ id, t: now() });
    const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');

    await page.goto(baseUrl + '/', { waitUntil: 'networkidle' });
    if (inMatch) await page.getByRole('button', { name: 'Avaa ajastin' }).waitFor({ timeout: 90000 }); else await page.getByText(/Seuraava ottelu|Viimeksi avattu/).first().waitFor({ timeout: 90000 });
    await page.evaluate(() => { for (let i = 0; i < 4; i++) history.pushState({}, '', '/'); });
    await arm(); await hold(300);
    try { await run({ page, arm, glide, tap, hold, mark, orbit, ripple, pickFromSelect, scrollToHeading, scrollToId, scrollToSelector, scrollPanelTop, text }); }
    catch (e) { await page.screenshot({ path: path.join(outDir, `fail-${name}.png`) }).catch(() => {}); console.error('FAIL', name, page.url(), (await text().catch(() => '')).slice(0, 300)); throw e; }
    const endT = now(); const v = page.video(); await ctx.close(); const p = await v.path();
    const segs = marks.map((m, i) => ({ id: m.id, start: m.t, end: i + 1 < marks.length ? marks[i + 1].t : endT }));
    fs.writeFileSync(path.join(outDir, `rec-${name}.json`), JSON.stringify({ path: p, segs }, null, 1));
    console.log('rec', name, segs.map(s => `${s.id}:${(s.end - s.start).toFixed(1)}s`).join(' '));
    return segs;
  }
  return { scene, close: () => browser.close() };
}
