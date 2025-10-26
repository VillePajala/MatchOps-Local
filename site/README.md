# MatchOps-Local Marketing Website

This is the marketing website for MatchOps-Local, a local-first soccer coaching PWA.

## Overview

This Next.js site serves as:
- **Marketing homepage** - Introducing the app and its unique value proposition
- **Features showcase** - Detailed feature breakdown and benefits
- **Download/installation guide** - Instructions for getting started
- **Documentation** - Auto-generated from `../docs` during build

## Tech Stack

- **Next.js 15** (Pages Router)
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

## Documentation Sync

The `docs/` folder is automatically copied from the parent `../docs/` directory during the prebuild step. This ensures documentation is always up-to-date with the main project.

**Build process:**
1. `prebuild`: Copies `../docs` to `pages/docs` (excluding `/08-archived`)
2. `build`: Next.js builds all pages including auto-generated doc pages

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
│   ├── logos/                # App logos (copied from parent)
│   └── favicon.ico           # Site favicon
├── package.json
├── next.config.mjs           # Next.js + MDX config
├── tailwind.config.js        # Tailwind CSS config
├── tsconfig.json             # TypeScript config
└── .eslintrc.json            # ESLint config
```

## Key Features

### Automatic Documentation
- Markdown files from `../docs` become routes automatically
- Example: `../docs/01-project/overview.md` → `/docs/01-project/overview`
- MDX support with GitHub Flavored Markdown

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
- **Documentation**: Served at `/docs`

## Development Notes

- **Port**: Development server runs on port 3001 (to avoid conflicts with main app on 3000)
- **ESLint**: Docs folder JavaScript files are ignored in linting
- **Auto-sync**: Documentation always mirrors parent `docs/` folder
- **Build time**: ~5-10 seconds for full build (80 pages)

## Contributing

This marketing site is part of the MatchOps-Local monorepo. See parent `../README.md` for contribution guidelines.

## License

All rights reserved. See parent `../LICENSE` for details.
