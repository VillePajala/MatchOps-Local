// Writes public/sitemap.xml before every build: the home page, the guide and
// each guide article, and the legal pages, in Finnish (default, unprefixed)
// and English (/en), each with its hreflang alternates. The marketing-assets
// page is internal (noindex) and left out.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SITE_URL = 'https://www.match-ops.com'; // keep in sync with lib/site.ts
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const slugs = (lang) =>
  fs
    .readdirSync(path.join(root, 'content/guide', lang))
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => f.replace(/\.mdx$/, ''));

const fiSlugs = new Set(slugs('fi'));
const guideSlugs = slugs('en').filter((s) => fiSlugs.has(s)).sort();

const pages = [
  '/',
  '/guide',
  ...guideSlugs.map((s) => `/guide/${s}`),
  '/privacy',
  '/terms',
  '/delete-account',
  '/technical',
];

const url = (p, lang) => {
  const prefix = lang === 'en' ? '/en' : '';
  return p === '/' ? `${SITE_URL}${prefix || '/'}` : `${SITE_URL}${prefix}${p}`;
};

const entries = pages.flatMap((p) =>
  ['fi', 'en'].map(
    (lang) => `  <url>
    <loc>${url(p, lang)}</loc>
    <xhtml:link rel="alternate" hreflang="fi" href="${url(p, 'fi')}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${url(p, 'en')}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${url(p, 'fi')}"/>
  </url>`,
  ),
);

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>
`;

fs.writeFileSync(path.join(root, 'public/sitemap.xml'), xml);
console.log(`sitemap.xml: ${entries.length} URLs`);
