# Deployment Guide

This guide covers deploying both the MatchOps-Local PWA and the marketing website from the same repository.

## Repository Structure

```
MatchOps-Local/
├── src/                      # Main PWA application
├── site/                     # Marketing website
└── docs/                     # Documentation (shared)
```

## Two Vercel Projects, One Repository

This monorepo uses Vercel's "Root Directory" feature to deploy two separate applications:

### 1. Main PWA Application
- **URL**: `https://matchops.com`
- **Root Directory**: `.` (repository root)
- **Framework**: Next.js
- **Purpose**: The actual MatchOps-Local PWA application

### 2. Marketing Website
- **URL**: `https://www.matchops.com` or `https://docs.matchops.com`
- **Root Directory**: `site/`
- **Framework**: Next.js
- **Purpose**: Marketing site + documentation

---

## Deploying the Marketing Website (New)

### Step 1: Create Vercel Project

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New..."** → **"Project"**
3. **Import** the `VillePajala/MatchOps-Local` repository

### Step 2: Configure Build Settings

**IMPORTANT**: Set the Root Directory to `site/`

```
Root Directory: site/
Framework Preset: Next.js (auto-detected)
Build Command: npm run build
Output Directory: .next
Install Command: npm install
Node Version: 20.x
```

### Step 3: Environment Variables

No environment variables required for basic deployment.

### Step 4: Deploy

1. Click **"Deploy"**
2. Wait for build to complete (~2-3 minutes)
3. Verify deployment at provided URL

### Step 5: Custom Domain (Optional)

1. Go to **Settings** → **Domains**
2. Add custom domain (e.g., `www.matchops.com`)
3. Configure DNS records as instructed by Vercel

---

## Main PWA Deployment (Existing)

The main app is already configured. No changes needed unless you want to update settings.

**Current Configuration**:
```
Root Directory: . (root)
Framework Preset: Next.js
Build Command: npm run build
Output Directory: .next
```

---

## Documentation Workflow

### How It Works

1. **Write documentation** in `docs/` folder (repository root)
2. **Commit and push** to GitHub
3. **Marketing site automatically builds** and copies `docs/` to `site/pages/docs`
4. **Documentation published** at `/docs/*` on marketing site

### Documentation Structure

```
docs/
├── 01-project/
│   ├── overview.md           → /docs/01-project/overview
│   └── local-first-philosophy.md → /docs/01-project/local-first-philosophy
├── 02-technical/
├── 04-features/
└── README.md                 → /docs/README
```

Every markdown file becomes a route automatically!

---

## Vercel Project Configuration

### Marketing Website (`site/`)

**Project Name**: `matchops-marketing` (or similar)

**Git Configuration**:
- **Production Branch**: `master` (or `main`)
- **Automatic deployments**: Enabled
- **Build Command Override**: None (uses package.json)

**Build Settings**:
```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm ci",
  "devCommand": "npm run dev"
}
```

**Root Directory**: `site/` ✅ **CRITICAL**

### Main PWA App (root)

**Project Name**: `matchops-local`

**Root Directory**: `.` (root) ✅ **CRITICAL**

---

## Deployment Checklist

### Before First Deploy

- [ ] Verify `site/package.json` has all dependencies
- [ ] Test local build: `cd site && npm run build`
- [ ] Ensure `.gitignore` excludes `site/.next/` and `site/pages/docs/`
- [ ] Verify logos copied: `site/public/logos/`

### Vercel Setup

- [ ] Create new Vercel project
- [ ] Set Root Directory to `site/`
- [ ] Configure custom domain (if applicable)
- [ ] Enable automatic deployments
- [ ] Test deployment URL

### Post-Deploy

- [ ] Verify homepage loads correctly
- [ ] Check `/features` page
- [ ] Check `/download` page
- [ ] Verify `/docs` routes work
- [ ] Test responsive design (mobile/tablet/desktop)
- [ ] Check navigation links
- [ ] Verify "Try It Now" button links to main app

---

## Troubleshooting

### Build Fails - "Cannot find module"

**Problem**: Missing dependencies
**Solution**:
```bash
cd site
npm install
```

### Build Fails - Tailwind CSS Errors

**Problem**: Custom utilities not recognized
**Solution**: Use CSS variables in `globals.css` instead of `@apply`

### Documentation Not Showing

**Problem**: `pages/docs/` folder empty
**Solution**: Run prebuild manually:
```bash
cd site
npm run prebuild
```

### Root Directory Warning

**Problem**: "Next.js inferred your workspace root"
**Solution**: Add to `site/next.config.mjs`:
```javascript
output: 'standalone',
outputFileTracingRoot: path.join(__dirname, '../'),
```

---

## Updating Content

### Marketing Pages (Homepage, Features, Download)

1. Edit files in `site/pages/`
2. Commit and push
3. Vercel automatically deploys

### Documentation

1. Edit files in `docs/` (repository root)
2. Commit and push
3. Marketing site rebuilds and includes changes

### Logos and Images

1. Update in `public/logos/` (repository root)
2. Run: `cp -r public/logos site/public/`
3. Commit and push

---

## Multiple Environments

### Preview Deployments

Every push to non-production branches creates a preview deployment:
- **URL**: `matchops-marketing-git-<branch>-<org>.vercel.app`
- **Purpose**: Test changes before merging

### Production Deployment

Merges to `master` trigger production deployment:
- **URL**: Your custom domain or Vercel URL
- **Automatic**: Enabled by default

---

## Performance Optimization

### Build Time

- **Expected**: 5-10 seconds for marketing site
- **Documentation**: Auto-copied, adds ~2 seconds

### Bundle Size

- **Homepage**: ~111 KB First Load JS
- **Features/Download**: ~111 KB First Load JS
- **Docs pages**: ~98-111 KB per page (static)

### Caching

- Static pages cached at edge
- Documentation regenerated on each build
- Assets cached with immutable headers

---

## Security

### CSP Headers

Add to `site/next.config.mjs` for production:

```javascript
async headers() {
  return [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: "default-src 'self'; ..."
        }
      ]
    }
  ]
}
```

---

## Support

- **Vercel Docs**: https://vercel.com/docs
- **Next.js Docs**: https://nextjs.org/docs
- **Issues**: https://github.com/VillePajala/MatchOps-Local/issues

---

## Summary

1. **Two projects, one repo**: Use Root Directory to deploy separately
2. **Marketing site**: `site/` folder with automatic doc sync
3. **Documentation**: Write once in `docs/`, publish automatically
4. **Deploy**: Push to GitHub, Vercel handles the rest
