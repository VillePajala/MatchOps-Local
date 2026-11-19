#!/usr/bin/env node
/**
 * Generates EVERY app icon and launch image from the two vector masters:
 *
 *   public/logos/matchops-badge.svg        Full badge (arched MATCHOPS, laurel).
 *                                          Text is already outlines - no fonts needed.
 *   public/logos/matchops-badge-small.svg  Small cut for <= 48 px: ring, ball and a
 *                                          laurel hint, no lettering.
 *
 * Outputs (file names are referenced by the manifest, layout.tsx, sw.js,
 * offline.html, LoadingScreen, InstallPrompt and the field export header):
 *
 *   icons/icon-{192,512}.png           'any' icons, TRANSPARENT corners, badge at 84%
 *                                      of the canvas (LoadingScreen's ring is sized
 *                                      to that). Also the legacy Android splash icon.
 *   icons/icon-maskable-{192,512}.png  Android adaptive icon + Android 12+ splash.
 *                                      Solid canvas, badge at 72%: inside the 80%
 *                                      maskable safe zone. Owner choice 2026-11-19: bigger
 *                                      on the home screen; the Android 12+ splash (a 2/3
 *                                      circle of the same icon) trims only the thin cream rim.
 *                                      the Android 12 splash keeps visible.
 *   icons/play-store-icon-512.png      Google Play listing icon (512, solid canvas,
 *                                      badge at 86%; Play rounds the corners itself).
 *   icons/apple-touch-icon.png         180 px. iOS fills transparency with BLACK, so
 *                                      it gets the canvas fill (badge 156 px).
 *   icons/favicon-{16,32}.png          Small cut, transparent, edge to edge.
 *   favicon.png (32) / favicon.ico     Small cut; the .ico holds 16, 32 and 48 px PNGs.
 *   logos/app-logo-yellow.png          1024 px transparent, badge at 84% (InstallPrompt,
 *   logos/app-logo.png                 field export header, sw.js precache).
 *   splash/apple-splash-W-H.png        iOS launch images (badge = 33.6% of width,
 *                                      centred on the canvas). Sizes come from the
 *                                      existing file names in public/splash.
 *
 * Run: node scripts/generate-splash-icons.mjs
 */
import sharp from 'sharp';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = (p) => join(root, 'public', p);
/** Must equal manifest background_color and the --color-carbon token. */
const CANVAS = '#0f172a';

/** Each master with the viewBox that crops to the badge's outer edge (r240 / r244). */
const MASTERS = {
  full: { svg: readFileSync(pub('logos/matchops-badge.svg'), 'utf8'), crop: '16 16 480 480' },
  small: { svg: readFileSync(pub('logos/matchops-badge-small.svg'), 'utf8'), crop: '12 12 488 488' },
};

/** The badge alone (no margin), rasterised straight from the vector at `size` px. */
function badge(size, master = 'full') {
  const { svg, crop } = MASTERS[master];
  const sized = svg.replace(/<svg([^>]*?)viewBox="[^"]*"([^>]*?)width="\d+" height="\d+"/, `<svg$1viewBox="${crop}"$2width="${size}" height="${size}"`);
  if (sized === svg) throw new Error(`Could not resize the ${master} master: expected viewBox, width and height on <svg>`);
  return sharp(Buffer.from(sized)).png().toBuffer();
}

/** `width` x `height` canvas (transparent unless `fill`), badge of `badgeSize` px centred. */
async function compose(width, height, badgeSize, { fill, master = 'full' } = {}) {
  const background = fill ?? { r: 0, g: 0, b: 0, alpha: 0 };
  const layered = await sharp({ create: { width, height, channels: 4, background } })
    .composite([{ input: await badge(badgeSize, master), left: Math.round((width - badgeSize) / 2), top: Math.round((height - badgeSize) / 2) }])
    .png()
    .toBuffer();
  // Filled images are written without an alpha channel (iOS and launchers treat them as opaque).
  const img = sharp(layered);
  return (fill ? img.flatten({ background: fill }) : img).png({ compressionLevel: 9 }).toBuffer();
}

function write(rel, buf, note) {
  writeFileSync(pub(rel), buf);
  console.log(`✓ public/${rel} (${note})`);
}

/** Minimal ICO container holding PNG-encoded images (supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4); // colour planes
    header.writeUInt16LE(32, e + 6); // bits per pixel
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map((im) => im.png)]);
}

async function main() {
  for (const size of [192, 512]) {
    const b = Math.round(size * 0.84);
    write(`icons/icon-${size}x${size}.png`, await compose(size, size, b), `transparent, badge ${b}px`);
    const m = Math.round(size * 0.72);
    write(`icons/icon-maskable-${size}x${size}.png`, await compose(size, size, m, { fill: CANVAS }), `canvas fill, badge ${m}px`);
  }
  // Google Play listing icon: full-bleed square, Play applies its own rounded mask.
  write('icons/play-store-icon-512.png', await compose(512, 512, 440, { fill: CANVAS }), 'canvas fill, badge 440px');
  write('icons/apple-touch-icon.png', await compose(180, 180, 156, { fill: CANVAS }), 'canvas fill, badge 156px');

  const fav = {};
  for (const size of [16, 32, 48]) fav[size] = await compose(size, size, size, { master: 'small' });
  write('icons/favicon-16x16.png', fav[16], 'small cut');
  write('icons/favicon-32x32.png', fav[32], 'small cut');
  write('favicon.png', fav[32], 'small cut, 32px');
  write('favicon.ico', ico([16, 32, 48].map((size) => ({ size, png: fav[size] }))), 'small cut, 16/32/48');

  const logo = await compose(1024, 1024, Math.round(1024 * 0.84));
  write('logos/app-logo-yellow.png', logo, 'transparent 1024px, badge 860px');
  write('logos/app-logo.png', logo, 'transparent 1024px, badge 860px');

  for (const file of readdirSync(pub('splash'))) {
    const match = /^apple-splash-(\d+)-(\d+)\.png$/.exec(file);
    if (!match) continue;
    const [w, h] = [Number(match[1]), Number(match[2])];
    const b = Math.round(Math.min(w, h) * 0.336);
    write(`splash/${file}`, await compose(w, h, b, { fill: CANVAS }), `${w}x${h}, badge ${b}px`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
