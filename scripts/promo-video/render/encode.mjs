/**
 * Cuts every recording into captioned clips and joins them into the hero.
 * Usage: node render/encode.mjs [--style phone|plain] [--out out/hero] [--assets out] [--music track.mp3] [--music-lufs -18]
 *  --out is one video's folder (its rec-*.json, captions and clips); --assets holds the shared intro/end/phone frames.
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
const style = arg('--style', 'phone'); const music = arg('--music', null); const musicLufs = Number(arg('--music-lufs', '-18')); const OUT = path.resolve(ROOT, arg('--out', 'out/hero')); const ASSETS = path.resolve(ROOT, arg('--assets', 'out')); const NAME = path.basename(OUT); const CLIPS = path.join(OUT, `clips-${style}`);
const run = (args) => execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
const durationOf = (p) => { try { execFileSync(ffmpeg, ['-hide_banner', '-i', p], { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(String(e.stderr)); if (m) return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]); } return null; };
const enc = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-r', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
const G = style === 'phone' ? JSON.parse(fs.readFileSync(path.join(ASSETS, 'phone-geom.json'), 'utf8')) : null;
const segs = [];
for (const f of fs.readdirSync(OUT).filter(f => f.startsWith('rec-') && f.endsWith('.json'))) {
  const r = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')); const D = durationOf(r.path); const wall = r.segs[r.segs.length - 1].end; const k = D && wall ? D / wall : 1;
  console.log(f, 'file', D?.toFixed(1), 'wall', wall.toFixed(1), 'scale', k.toFixed(3));
  for (const s of r.segs) segs.push({ ...s, start: s.start * k, end: s.end * k, path: r.path });
}
segs.sort((a, b) => a.id - b.id);
fs.mkdirSync(CLIPS, { recursive: true });
const fileId = (id) => { const s = String(id); return s.includes('.') ? s.split('.')[0].padStart(2, '0') + '_' + s.split('.')[1] : s.padStart(2, '0'); };
run(['-loop', '1', '-i', path.join(ASSETS, 'intro.png'), '-t', '3.2', '-vf', 'fade=t=in:st=0:d=0.5:color=0x0b1220,fade=t=out:st=2.5:d=0.7:color=0x0b1220,format=yuv420p', ...enc, path.join(CLIPS, 'scene00.mp4')]);
const list = ['scene00.mp4'];
for (const s of segs) {
  const out = `scene${fileId(s.id)}.mp4`; const cap = path.join(OUT, `cap_${style}_${String(s.id).replace('.', '_')}.png`); const fade = s.id === 1 ? ',fade=t=in:st=0:d=0.7' : '';
  const inputs = ['-ss', s.start.toFixed(2), '-to', s.end.toFixed(2), '-i', s.path]; let chain;
  if (style === 'phone') { inputs.push('-loop', '1', '-i', path.join(ASSETS, 'phone-under.png'), '-i', path.join(ASSETS, 'phone-over.png')); chain = `[0:v]scale=${G.SW}:${G.SH}[ph];[1:v][ph]overlay=${G.SX}:${G.SY}:shortest=1[v1];[v1][2:v]overlay=0:0[v2]`; }
  else chain = `[0:v]scale=-2:1920,pad=1080:1920:(ow-iw)/2:0:color=0x0b1220[v2]`;
  const capIdx = inputs.filter(a => a === '-i').length;
  if (fs.existsSync(cap)) { inputs.push('-i', cap); chain += `;[v2][${capIdx}:v]overlay=0:0[v3]`; } else chain += `;[v2]null[v3]`;
  chain += `;[v3]null${fade},format=yuv420p[out]`;
  run([...inputs, '-filter_complex', chain, '-map', '[out]', ...enc, path.join(CLIPS, out)]); list.push(out);
}
run(['-loop', '1', '-i', path.join(ASSETS, 'end.png'), '-t', '3', '-vf', 'fade=t=in:st=0:d=0.5:color=0x0b1220,format=yuv420p', ...enc, path.join(CLIPS, 'scene99.mp4')]); list.push('scene99.mp4');
fs.writeFileSync(path.join(CLIPS, 'clips.txt'), list.map(p => `file '${p}'`).join('\n'));

/**
 * The joined hero is NOT the clips glued together: a cut at every caption duplicates or drops a
 * frame and pops the band, which reads as a flicker. Instead each recording is rendered in one
 * pass with its captions switched on by time (each band fades over 0.25 s), and the only cuts are
 * where the recordings themselves change, softened by a short dip to the navy background.
 */
const recs = []; for (const s of segs) { let r = recs.find(x => x.path === s.path); if (!r) { r = { path: s.path, segs: [] }; recs.push(r); } r.segs.push(s); }
recs.sort((a, b) => a.segs[0].id - b.segs[0].id);
const parts = ['scene00.mp4'];
recs.forEach((r, ri) => {
  const t0 = r.segs[0].start, t1 = r.segs[r.segs.length - 1].end, D = t1 - t0; const f2 = (x) => x.toFixed(2);
  const inputs = ['-ss', f2(t0), '-to', f2(t1), '-i', r.path]; let chain, n = 1;
  if (style === 'phone') { inputs.push('-loop', '1', '-t', f2(D), '-i', path.join(ASSETS, 'phone-under.png'), '-i', path.join(ASSETS, 'phone-over.png')); chain = `[0:v]scale=${G.SW}:${G.SH}[ph];[1:v][ph]overlay=${G.SX}:${G.SY}:shortest=1[v1];[v1][2:v]overlay=0:0[v]`; n = 3; }
  else chain = `[0:v]scale=-2:1920,pad=1080:1920:(ow-iw)/2:0:color=0x0b1220[v]`;
  let cur = '[v]', k = 0;
  for (const s of r.segs) {
    const cap = path.join(OUT, `cap_${style}_${String(s.id).replace('.', '_')}.png`); if (!fs.existsSync(cap)) continue;
    const a = s.start - t0, b = s.end - t0; const idx = n++; inputs.push('-loop', '1', '-t', f2(D), '-i', cap);
    chain += `;[${idx}:v]format=rgba,fade=t=in:st=${f2(a)}:d=0.25:alpha=1,fade=t=out:st=${f2(b - 0.25)}:d=0.25:alpha=1[c${k}];${cur}[c${k}]overlay=0:0:enable='between(t,${f2(a)},${f2(b)})'[o${k}]`; cur = `[o${k}]`; k++;
  }
  const fin = ri === 0 ? 0.7 : 0.3, fout = ri === recs.length - 1 ? 0.3 : 0.3;
  chain += `;${cur}fade=t=in:st=0:d=${fin}:color=0x0b1220,fade=t=out:st=${f2(D - fout)}:d=${fout}:color=0x0b1220,format=yuv420p[out]`;
  run([...inputs, '-filter_complex', chain, '-map', '[out]', '-t', f2(D), ...enc, path.join(CLIPS, `part${ri}.mp4`)]); parts.push(`part${ri}.mp4`);
  console.log('part', ri, path.basename(r.path), f2(D) + ' s', k + ' captions');
});
parts.push('scene99.mp4');
fs.writeFileSync(path.join(CLIPS, 'list.txt'), parts.map(p => `file '${p}'`).join('\n'));
const hero = path.join(OUT, `matchops-${NAME}-${style}.mp4`);
run(['-f', 'concat', '-safe', '0', '-i', path.join(CLIPS, 'list.txt'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', hero]);
console.log('clips', list.length, '->', hero, (fs.statSync(hero).size / 1e6).toFixed(1) + ' MB', durationOf(hero)?.toFixed(1) + ' s');

/**
 * Music bed under the joined hero (the clips stay silent; social apps add their own sound).
 * The track is repeated with a 2 s crossfade until it outlasts the video, trimmed, fades in over the
 * intro and out over the end card, and is levelled to --music-lufs so any source lands at the same
 * loudness. Video stream is copied, so this is quick. Output: <hero>-music.mp4.
 */
if (music) {
  const D = durationOf(hero); const L = durationOf(music); const XF = 2;
  if (!D || !L) throw new Error('cannot read durations for the music mix');
  let n = 1; while (n * L - (n - 1) * XF < D) n++;
  const inputs = ['-i', hero]; for (let i = 0; i < n; i++) inputs.push('-i', music);
  let chain = ''; let last = '[1:a]';
  for (let i = 2; i <= n; i++) { chain += `${last}[${i}:a]acrossfade=d=${XF}:c1=tri:c2=tri[x${i}];`; last = `[x${i}]`; }
  chain += `${last}atrim=0:${D.toFixed(2)},asetpts=PTS-STARTPTS,loudnorm=I=${musicLufs}:TP=-1.5:LRA=11,afade=t=in:st=0:d=2.5,afade=t=out:st=${(D - 3).toFixed(2)}:d=3[a]`;
  const out = hero.replace(/\.mp4$/, '-music.mp4');
  run([...inputs, '-filter_complex', chain, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', out]);
  console.log('music', path.basename(music), `x${n}`, '->', out, (fs.statSync(out).size / 1e6).toFixed(1) + ' MB');
}
