/**
 * Scene recorder: drives the real app in headless Chromium at phone size and records it.
 *
 * Everything the hero video taught, kept here so the next video does not relearn it:
 *  - The app is seeded through IndexedDB (key/value store "MatchOpsLocal") before boot, in
 *    local mode, with the welcome screen marked seen and the single-tab lock satisfied. No
 *    account, nothing touches staging or prod. The setup wizard, marketing consent and policy
 *    re-consent are cloud-only, so a local recording never meets them; the seeds still say
 *    appLayout 'full' and wizardDone so nothing depends on that.
 *  - "Resume in the match" is a sessionStorage flag (matchops_was_in_match); `inMatch` sets it.
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
 *  - The pitch's planned-sub ghost rings used to stall the screencast; the hero now films the
 *    match view with its planned subs without trouble, but check the frames if a field shot stutters.
 *  - Opening a game or the planner shows a loading screen for a moment: `tapThroughLoad` dips to
 *    navy over it instead of filming a spinner.
 *  - Toasts (the "Maali kirjattu / Kumoa" undo, "saved" notes) are hidden: they cover the
 *    score row and date the film. The Next.js dev indicator (nextjs-portal) is hidden too.
 *  - Modal headers collapse on scroll by a few pixels at a time, so a cursor that keeps scrolling
 *    targets into view makes the header's extras (Toista edellinen peli) flutter. The recorder pins
 *    that region open; a real thumb scroll does not jitter like that.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { LANG, ui } from './ui.mjs';

const STYLE = `nextjs-portal{display:none!important}
div.fixed[role=log][aria-live=polite]{display:none!important}
[role=dialog] button[aria-label="Sulje"],[role=dialog] button[aria-label="Valmis"],[role=dialog] button[aria-label="Close"],[role=dialog] button[aria-label="Done"]{display:flex!important;position:relative;z-index:5}
[role=dialog] div.overflow-hidden.border-b{height:auto!important}
[role=dialog] div.overflow-hidden.border-b>div{transform:none!important}
#cur{position:fixed;left:0;top:0;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.45),0 2px 8px rgba(0,0,0,.5);background:rgba(255,255,255,.12);pointer-events:none;z-index:2147483647;transition:transform .65s cubic-bezier(.4,0,.2,1)}
.tap{position:fixed;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;background:rgba(255,255,255,.55);pointer-events:none;z-index:2147483647;animation:tap .5s ease-out forwards}@keyframes tap{from{transform:scale(.5);opacity:.9}to{transform:scale(1.6);opacity:0}}`;

export async function openRecorder({ outDir, baseUrl = process.env.BASE_URL || 'http://localhost:3000', viewport = { width: 390, height: 844 }, scale = 2 } = {}) {
  fs.mkdirSync(path.join(outDir, 'raw'), { recursive: true });
  const browser = await chromium.launch({ args: [`--force-device-scale-factor=${scale}`] });

  /** `cloud: true` records the real first run against the dev server's staging backend: nothing is seeded and
   *  the app boots to its sign-up form. Use a synthetic address; delete the accounts afterwards. */
  async function scene(name, data, { inMatch = false, startCur = [195, 700], only = null, cloud = false } = {}, run) {
    if (only && !only.includes(name)) return null;
    const ctx = await browser.newContext({ viewport, locale: LANG === 'en' ? 'en-GB' : 'fi-FI', timezoneId: 'Europe/Helsinki',
      recordVideo: { dir: path.join(outDir, 'raw'), size: { width: viewport.width * scale, height: viewport.height * scale } } });
    const t0 = Date.now(); const now = () => (Date.now() - t0) / 1000; const marks = [];
    await ctx.addInitScript(({ inMatch, cloud, lang }) => {
      try {
        localStorage.setItem('matchops_language', lang);
        if (!cloud) { localStorage.setItem('matchops_backend_mode', 'local'); localStorage.setItem('matchops_welcome_seen', 'true'); }
        if (inMatch) sessionStorage.setItem('matchops_was_in_match', '1'); else sessionStorage.removeItem('matchops_was_in_match');
      } catch {}
      // Dev-mode StrictMode double-mount makes the single-tab lock look taken; grant it.
      try { Object.defineProperty(navigator, 'locks', { value: { request: (_n, _o, cb) => Promise.resolve(typeof _o === 'function' ? _o({ name: _n }) : cb({ name: _n })) } }); } catch {}
    }, { inMatch, cloud, lang: LANG });
    const page = await ctx.newPage();
    await page.goto(baseUrl + '/manifest.json');
    if (!cloud) await page.evaluate(async (d) => { await new Promise((res, rej) => { const req = indexedDB.open('MatchOpsLocal', 1);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('keyValueStore')) { const s = db.createObjectStore('keyValueStore', { keyPath: 'key' }); s.createIndex('keyIndex', 'key', { unique: true }); } };
      req.onsuccess = () => { const db = req.result; const tx = db.transaction('keyValueStore', 'readwrite'); const st = tx.objectStore('keyValueStore'); for (const [k, v] of Object.entries(d)) if (v != null) st.put({ key: k, value: JSON.stringify(v) }); tx.oncomplete = () => { db.close(); res(); }; tx.onerror = () => rej(tx.error); };
      req.onerror = () => rej(req.error); }); }, data);

    let curPos = startCur;
    const setCur = async (x, y, dur) => { curPos = [x, y]; await page.evaluate(([x, y, dur, from]) => { let c = document.getElementById('cur'); if (!c) { c = document.createElement('div'); c.id = 'cur'; c.style.transition = 'none'; c.style.transform = `translate(${from[0]}px,${from[1]}px)`; document.body.appendChild(c); void c.offsetWidth; c.style.transition = ''; } if (dur) c.style.transitionDuration = dur + 'ms'; c.style.transform = `translate(${x}px,${y}px)`; }, [x, y, dur, curPos]); };
    const arm = async () => { await page.addStyleTag({ content: STYLE }); await page.evaluate((pos) => {
      for (const b of document.querySelectorAll('button')) if (/Tervetuloa|Welcome/.test(b.textContent || '')) b.style.display = 'none';
      if (!document.getElementById('cur')) { const c = document.createElement('div'); c.id = 'cur'; c.style.transition = 'none'; c.style.transform = `translate(${pos[0]}px,${pos[1]}px)`; document.body.appendChild(c); void c.offsetWidth; c.style.transition = ''; }
      if (!window.__tap) { window.__tap = 1; document.addEventListener('pointerdown', (e) => { const d = document.createElement('div'); d.className = 'tap'; d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 550); }, true); } }, curPos); };
    const hold = (ms) => page.waitForTimeout(ms);
    const ripple = (x, y) => page.evaluate(([x, y]) => { const d = document.createElement('div'); d.className = 'tap'; d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 550); }, [x, y]);
    const glide = async (loc, rest = 850, dur = 650) => { await loc.scrollIntoViewIfNeeded().catch(() => {}); const b = await loc.boundingBox(); if (!b) throw new Error('glide: target has no box'); const x = b.x + b.width / 2, y = b.y + b.height / 2; await setCur(x, y, dur); await hold(dur + 50 + rest); return [x, y]; };
    /** Cursor to a screen point (for canvas targets such as a pitch position). */
    const glideTo = async (x, y, rest = 850, dur = 650) => { await setCur(x, y, dur); await hold(dur + 50 + rest); return [x, y]; };
    const tapAt = async (x, y, rest) => { await glideTo(x, y, rest); await page.mouse.click(x, y); };
    /** Press on a point, move to another with the cursor riding along, release (pitch disc drags). */
    const drag = async (x1, y1, x2, y2, { dur = 900, rest = 900 } = {}) => {
      await glideTo(x1, y1, 350); await page.mouse.move(x1, y1); await page.mouse.down(); await hold(250);
      await setCur(x2, y2, dur); const steps = 24; for (let i = 1; i <= steps; i++) { await page.mouse.move(x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps); await hold(dur / steps); }
      await hold(150); await page.mouse.up(); await hold(rest); };
    /** A finger tap at a point: synthetic touchstart/touchend on the element there. Some gestures
     *  exist only for touch (tap one pitch disc, tap another: they swap); the mouse path drags instead. */
    const touchTap = async (x, y, rest = 850) => { await glideTo(x, y, rest); await ripple(x, y); await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y); if (!el) return; const t = new Touch({ identifier: Date.now() % 100000, target: el, clientX: x, clientY: y, pageX: x, pageY: y, radiusX: 2, radiusY: 2, force: 1 });
      const fire = (type, touches) => el.dispatchEvent(new TouchEvent(type, { touches, targetTouches: touches, changedTouches: [t], bubbles: true, cancelable: true }));
      fire('touchstart', [t]); fire('touchend', []); }, [x, y]); await hold(300); };
    /** Tap a field and type into it at a human pace. */
    const type = async (loc, str, { delay = 55, rest = 300 } = {}) => { await tap(loc, rest); await loc.pressSequentially(str, { delay }); };
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
    /** Tap something that opens a screen with a loading state ("Ladataan peliä...", the planner's
     *  "Ladataan..."): the screen dips to navy for the load and comes back once `ready` resolves, so
     *  the film shows a short cut instead of a spinner. */
    const tapThroughLoad = async (loc, ready, rest = 700) => {
      await glide(loc, rest); const b = await loc.boundingBox(); if (!b) throw new Error('tapThroughLoad: no box');
      // The veil goes down first and sits above everything but the cursor: the app's loading screens
      // stack very high (the game's "Ladataan peliä..." splash covered a lower veil), and a veil that
      // starts after the click lets the first loading frames through.
      await ripple(b.x + b.width / 2, b.y + b.height / 2);
      await page.evaluate(() => { const v = document.createElement('div'); v.id = 'veil'; v.style.cssText = 'position:fixed;inset:0;background:#0b1220;z-index:2147483646;opacity:0;transition:opacity .15s;pointer-events:none'; document.body.appendChild(v); void v.offsetWidth; v.style.opacity = '1'; });
      await hold(180); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      await ready(); await hold(800); await arm();
      await page.evaluate(() => { const v = document.getElementById('veil'); if (!v) return; v.style.transition = 'opacity .3s'; v.style.opacity = '0'; setTimeout(() => v.remove(), 350); }); await hold(350); };
    /** Write the app's whole IndexedDB payload to `file`, so the next recording can start from exactly
     *  what this one left (the lineup the plan produced, the goal just logged). The app saves on a
     *  short debounce: hold a moment after the last change before calling it. */
    const dump = async (file) => { const d = await page.evaluate(() => new Promise((res, rej) => { const req = indexedDB.open('MatchOpsLocal');
      req.onsuccess = () => { const db = req.result; const all = db.transaction('keyValueStore').objectStore('keyValueStore').getAll(); all.onsuccess = () => { const o = {}; for (const r of all.result) { try { o[r.key] = JSON.parse(r.value); } catch { o[r.key] = r.value; } } db.close(); res(o); }; all.onerror = () => rej(all.error); };
      req.onerror = () => rej(req.error); })); fs.writeFileSync(file, JSON.stringify(d)); return d; };
    /** A still for checking a scene by eye while writing it (out/<video>/shot-<name>.png); not part of the video. */
    const shot = (n) => page.screenshot({ path: path.join(outDir, `shot-${n}.png`) });
    const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');

    await page.goto(baseUrl + '/', { waitUntil: 'networkidle' });
    try {
      if (cloud) await page.getByTestId('login-intro-create').waitFor({ timeout: 90000 });
      else if (inMatch) await page.getByRole('button', { name: ui.openTimer }).waitFor({ timeout: 90000 }); else await page.getByText(/Seuraava ottelu|Viimeksi avattu|Uusi ottelu|Jatka|Next match|Last opened|New game|Continue/i).first().waitFor({ timeout: 90000 });
    } catch (e) { await page.screenshot({ path: path.join(outDir, `fail-${name}-boot.png`) }).catch(() => {}); throw e; }
    await page.evaluate(() => { for (let i = 0; i < 4; i++) history.pushState({}, '', '/'); });
    await arm(); await hold(300);
    try { await run({ page, arm, glide, glideTo, tap, tapAt, touchTap, drag, type, hold, mark, orbit, ripple, pickFromSelect, scrollToHeading, scrollToId, scrollToSelector, scrollPanelTop, text, shot, dump, tapThroughLoad }); }
    catch (e) { await page.screenshot({ path: path.join(outDir, `fail-${name}.png`) }).catch(() => {}); console.error('FAIL', name, page.url(), (await text().catch(() => '')).slice(0, 300)); throw e; }
    const endT = now(); const v = page.video(); await ctx.close(); const p = await v.path();
    const segs = marks.map((m, i) => ({ id: m.id, start: m.t, end: i + 1 < marks.length ? marks[i + 1].t : endT }));
    fs.writeFileSync(path.join(outDir, `rec-${name}.json`), JSON.stringify({ path: p, segs }, null, 1));
    console.log('rec', name, segs.map(s => `${s.id}:${(s.end - s.start).toFixed(1)}s`).join(' '));
    return segs;
  }
  return { scene, close: () => browser.close() };
}
