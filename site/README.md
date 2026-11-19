# MatchOps Marketing Website

This is the marketing website for MatchOps, a soccer coaching app for Android.

## Overview

This Next.js site serves as:
- **Marketing homepage** - Introducing the app and its unique value proposition
- **Features showcase** - Detailed feature breakdown and benefits
- **Download/installation guide** - Instructions for getting started
- **Online guide** - User guide articles from `content/guide/{fi,en}`, served at `/guide`

## Tech Stack

- **Next.js 16** (Pages Router)
- **React 19**
- **TypeScript**
- **Tailwind CSS 4**
- **MDX** for documentation

## Local Development

```bash
# Install dependencies
npm install

# Run development server (port 3001)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Online Guide

The user guide lives in `content/guide/{fi,en}` and is served at `/guide`. The old
Markdown docs (`/docs/*`) were removed; `next.config.mjs` redirects those URLs to `/guide`.

## Deployment

### Vercel Deployment

1. **Create New Project** in Vercel
2. **Import Git Repository**: `VillePajala/MatchOps-Local`
3. **Configure Project Settings**:
   - **Root Directory**: `site/`
   - **Framework Preset**: Next.js (auto-detected)
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next` (default)
   - **Install Command**: `npm install`
4. **Deploy**

### Environment Variables

No environment variables required for basic deployment.

### Custom Domain

After deployment, configure your custom domain in Vercel:
- Example: `www.matchops.app` or `docs.matchops.app`

## Project Structure

```
site/
├── pages/
│   ├── _app.tsx              # App wrapper with global styles
│   ├── index.tsx             # Homepage
│   ├── features.tsx          # Features page
│   ├── download.tsx          # Download/install page
│   └── docs/                 # Auto-copied docs (gitignored)
│       └── index.tsx         # Docs landing page
├── components/
│   ├── Layout.tsx            # Site layout (nav + footer)
│   └── FeatureCard.tsx       # Reusable feature card
├── styles/
│   └── globals.css           # Global styles + Tailwind
├── public/
│   ├── logos/                # App logos and badge (copied from the app's public/logos)
│   ├── icons/                # Favicons and apple-touch icon (copied from the app)
│   ├── OG.png                # Social share image (1200x630)
│   └── favicon.ico           # Site favicon
├── package.json
├── next.config.mjs           # Next.js + MDX config
├── tailwind.config.js        # Tailwind CSS config
├── tsconfig.json             # TypeScript config
└── .eslintrc.json            # ESLint config
```

## Key Features

### Online Guide
- Markdown articles in `content/guide/{fi,en}` rendered with MDX (GitHub Flavored Markdown)

### Responsive Design
- Mobile-first approach
- Tailwind CSS utilities
- Custom design system matching main app

### SEO Optimization
- Static site generation (SSG)
- Fast page loads
- Pre-rendered content

## Links

- **Main App**: https://matchops.app
- **GitHub**: https://github.com/VillePajala/MatchOps-Local
- **Guide**: Served at `/guide`

## Development Notes

- **Port**: Development server runs on port 3001 (to avoid conflicts with main app on 3000)
- **Auto-sync**: Documentation always mirrors parent `docs/` folder
- **Build time**: ~5-10 seconds for full build (80 pages)

## Contributing

This marketing site is part of the MatchOps-Local monorepo. See parent `../README.md` for contribution guidelines.

## License

All rights reserved. See parent `../LICENSE` for details.
