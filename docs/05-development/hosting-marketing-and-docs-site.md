---
title: Hosting a Marketing + Docs Website from This Repo (Vercel Monorepo)
---

# Hosting a Marketing + Docs Website from This Repo (Vercel Monorepo)

Purpose: Keep all documentation inside this repository (single source of truth) while publishing a full marketing website where the `/docs` section is generated from this repo’s `docs/` folder.

This guide shows the simplest, durable setup using a Next.js site inside this repo and Vercel’s "Root Directory" setting to deploy only that folder.

## TL;DR

1) Create a Next.js site in `site/` inside this repo
2) Configure MDX and copy `../docs` into `site/pages/docs` during build
3) Push to Git; create a Vercel project with Root Directory `site/`
4) Docs are auto-published at `/docs/*` and always in sync

## Why this approach?

- Single source of truth: Write docs once in `docs/` here.
- Automatic publishing: Vercel builds `site/` and copies docs at build-time.
- Full flexibility: `site/` can be a complete marketing website (hero, features, pricing, blog) while `/docs` renders Markdown as pages.

## Repository Structure

```
repo-root/
  docs/                      # Documentation (source of truth)
  site/                      # Next.js marketing website
    pages/                   # Pages Router (simpler for file-based docs routing)
      index.tsx              # Marketing homepage
      docs/                  # Copied in from ../docs at build time
    public/                  # Static assets for the site
    package.json
    next.config.mjs
    tsconfig.json
```

Note: We recommend the Next.js Pages Router here because it lets MDX files in `pages/docs` automatically become routes, with zero extra routing code.

## Step 1 — Create the Next.js site in `site/`

From the repo root (run these commands locally):

```
npx create-next-app@latest site --ts --eslint --use-npm --no-tailwind --src-dir=false --app=false
```

Flags explained:
- `--app=false`: Uses the older Pages Router (simpler for file-based MDX pages)
- `--ts`: TypeScript
- `--src-dir=false`: Keep standard `pages/` layout

You can add Tailwind later if desired.

## Step 2 — Enable MDX in Next.js

Inside `site/` install MDX packages:

```
cd site
npm install @next/mdx remark-gfm rehype-slug rehype-autolink-headings
```

Create or update `site/next.config.mjs`:

```js
// site/next.config.mjs
import createMDX from '@next/mdx';

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [require('remark-gfm')],
    rehypePlugins: [require('rehype-slug'), require('rehype-autolink-headings')],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
};

export default withMDX(nextConfig);
```

This tells Next.js to treat `.md` and `.mdx` files in `pages/` as routable pages.

## Step 3 — Copy `docs/` into `site/pages/docs` at build time

We’ll copy the project’s `../docs` into the site’s routable `pages/docs` directory during the build. This keeps docs in sync without duplicating them in Git.

In `site/package.json` add scripts:

```json
{
  "scripts": {
    "prebuild": "rm -rf pages/docs && mkdir -p pages && cp -R ../docs pages/docs",
    "build": "next build",
    "start": "next start",
    "dev": "next"
  }
}
```

Notes:
- `prebuild` clears any previous copy and copies from the repo’s `docs/` each time.
- If you need to exclude internal files, consider `rsync` with `--exclude` or an `--exclude-from` file instead of `cp -R`.

Optional — Excluding internal docs:

```json
{
  "scripts": {
    "prebuild": "rm -rf pages/docs && mkdir -p pages && rsync -av --delete --exclude '08-archived' ../docs/ pages/docs/"
  }
}
```

## Step 4 — Add a minimal homepage

Create `site/pages/index.tsx` (replace with your real marketing layout later):

```tsx
// site/pages/index.tsx
import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>MatchOps</h1>
      <p>Local-first app for match preparation and analysis.</p>
      <p><Link href="/docs">Read the docs →</Link></p>
    </main>
  );
}
```

## Step 5 — Verify local build

From `site/`:

```
npm run build
npm start
```

You should see your marketing homepage at `/` and your docs rendered at `/docs/*` (mirroring the folder structure of the repo’s `docs/`).

## Step 6 — Deploy with Vercel (monorepo root)

In Vercel:

1) New Project → Import your Git repository
2) Configure Project:
   - Root Directory: `site/`
   - Framework Preset: Next.js (auto-detected)
   - Install Command: `npm install`
   - Build Command: `npm run build`
   - Output Directory: leave default (Next.js)
3) Deploy

Every push to your repo will rebuild `site/`, which copies docs from `../docs` and publishes them. Your docs are always in sync with code.

## Step 7 — Link from the app

Once deployed, add a “User Guide” link in the app’s Settings to the new site URL (e.g., `https://docs.matchops.com/docs`).

## Customization Tips

- Styling/Theming: Add Tailwind or your CSS framework to `site/`.
- Sidebar/TOC: For more advanced docs navigation, you can add a custom `_app.tsx` and layout, or generate a sidebar from the file tree.
- SEO: Use `next-seo` for metadata, Open Graph tags, and sitemap.
- Excluding Internal Docs: Keep public docs clean by excluding folders like `08-archived` from the copy step.

## Alternatives

- Separate Docs Site (Nextra): Create a `docs-site/` with Nextra and deploy that as another Vercel project. Marketing site stays in `site/`. Pros: fastest docs setup. Cons: two projects.
- Contentlayer: Instead of copying, use Contentlayer to read directly from `../docs` and generate a content graph. Pros: powerful metadata and routing. Cons: extra config.

### Using Contentlayer (high-level sketch)

1) `npm i contentlayer next-contentlayer @types/mdx -D`
2) Create a `contentlayer.config.ts` in `site/` that defines a `Doc` type and loads from `../docs/**/*.md{,x}`
3) Wrap Next config: `export default withContentlayer(withMDX(nextConfig))`
4) Build dynamic doc pages with `allDocs` and catch-all routes

This avoids copying files, but takes more setup. Choose if you want richer querying and metadata.

## Troubleshooting

- Build fails to find `../docs`: Ensure Vercel Root Directory is `site/` and `../docs` exists in Git.
- MDX not rendering: Confirm `pageExtensions` includes `md` and `mdx`, and MDX plugin is configured.
- Broken internal links: Keep relative links within `docs/` consistent. For absolute links, update to the deployed base URL if needed.

## Maintenance

- Write docs in `docs/` (this repo). No change to your workflow.
- The website auto-updates on each push.
- If you reorganize `docs/`, your routes follow the folder structure under `/docs` automatically.

---

With this setup, you get a full marketing site and a live docs section, while keeping the authoritative content inside this repository.

