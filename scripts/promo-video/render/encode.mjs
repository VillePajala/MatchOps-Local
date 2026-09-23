/**
 * Cuts every recording into captioned clips and joins them into the hero.
 * Usage: node render/encode.mjs [--style phone|plain] [--out out]
 *  - marks are wall-clock; the screencast file runs slightly slow, so each recording's marks are
 *    scaled by (file length / measured length) before cutting;
 *  - a clip id with a caption gets the caption overlay, one without becomes a plain transition;
 *  - 'phone' composites the recording into the phone frame (out/phone-under|over.png) first;
 *  - the joined hero is re-encoded a notch tighter (crf 24) so it stays under share-page limits.
 */
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const ffmpeg = (await import('ffmpeg-static')).default;
const ROOT = new URL('..', import.meta.url).pathname;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const style = arg('--style', 'phone'); const OUT = path.resolve(ROOT, arg('--out', 'out')); const CLIPS = path.join(OUT, `clips-${style}`);
const run = (args) => execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
const durationOf = (p) => { try { execFileSync(ffmpeg, ['-hide_banner', '-i', p], { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(String(e.stderr)); if (m) return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]); } return null; };
const enc = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-r', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
const G = style === 'phone' ? JSON.parse(fs.readFileSync(path.join(OUT, 'phone-geom.json'), 'utf8')) : null;
const segs = [];
for (const f of fs.readdirSync(OUT).filter(f => f.startsWith('rec-') && f.endsWith('.json'))) {
  const r = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')); const D = durationOf(r.path); const wall = r.segs[r.segs.length - 1].end; const k = D && wall ? D / wall : 1;
  console.log(f, 'file', D?.toFixed(1), 'wall', wall.toFixed(1), 'scale', k.toFixed(3));
  for (const s of r.segs) segs.push({ ...s, start: s.start * k, end: s.end * k, path: r.path });
}
segs.sort((a, b) => a.id - b.id);
fs.mkdirSync(CLIPS, { recursive: true });
const fileId = (id) => { const s = String(id); return s.includes('.') ? s.split('.')[0].padStart(2, '0') + '_' + s.split('.')[1] : s.padStart(2, '0'); };
run(['-loop', '1', '-i', path.join(OUT, 'intro.png'), '-t', '3.2', '-vf', 'fade=t=in:st=0:d=0.5,fade=t=out:st=2.5:d=0.7,format=yuv420p', ...enc, path.join(CLIPS, 'scene00.mp4')]);
const list = ['scene00.mp4'];
for (const s of segs) {
  const out = `scene${fileId(s.id)}.mp4`; const cap = path.join(OUT, `cap_${style}_${String(s.id).replace('.', '_')}.png`); const fade = s.id === 1 ? ',fade=t=in:st=0:d=0.7' : '';
  const inputs = ['-ss', s.start.toFixed(2), '-to', s.end.toFixed(2), '-i', s.path]; let chain;
  if (style === 'phone') { inputs.push('-loop', '1', '-i', path.join(OUT, 'phone-under.png'), '-i', path.join(OUT, 'phone-over.png')); chain = `[0:v]scale=${G.SW}:${G.SH}[ph];[1:v][ph]overlay=${G.SX}:${G.SY}:shortest=1[v1];[v1][2:v]overlay=0:0[v2]`; }
  else chain = `[0:v]scale=-2:1920,pad=1080:1920:(ow-iw)/2:0:color=0x0b1220[v2]`;
  const capIdx = inputs.filter(a => a === '-i').length;
  if (fs.existsSync(cap)) { inputs.push('-i', cap); chain += `;[v2][${capIdx}:v]overlay=0:0[v3]`; } else chain += `;[v2]null[v3]`;
  chain += `;[v3]null${fade},format=yuv420p[out]`;
  run([...inputs, '-filter_complex', chain, '-map', '[out]', ...enc, path.join(CLIPS, out)]); list.push(out);
}
run(['-loop', '1', '-i', path.join(OUT, 'end.png'), '-t', '3', '-vf', 'fade=t=in:st=0:d=0.5,format=yuv420p', ...enc, path.join(CLIPS, 'scene99.mp4')]); list.push('scene99.mp4');
fs.writeFileSync(path.join(CLIPS, 'list.txt'), list.map(p => `file '${p}'`).join('\n'));
const hero = path.join(OUT, `matchops-hero-${style}.mp4`);
run(['-f', 'concat', '-safe', '0', '-i', path.join(CLIPS, 'list.txt'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', hero]);
console.log('clips', list.length, '->', hero, (fs.statSync(hero).size / 1e6).toFixed(1) + ' MB', durationOf(hero)?.toFixed(1) + ' s');
