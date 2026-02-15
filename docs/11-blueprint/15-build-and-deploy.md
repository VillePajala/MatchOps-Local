# 15. Build & Deploy — Build Pipeline, Vercel, Environment Variables, CSP

> **Audience**: AI agent building the new app
> **Purpose**: How to configure the build pipeline and deploy to Vercel

---

## 1. Build Pipeline

### package.json Scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "node scripts/generate-changelog.mjs && node scripts/generate-manifest.mjs && next build",
    "start": "next start",
    "lint": "eslint .",
    "test": "jest",
    "generate:i18n-types": "ts-node scripts/generate-i18n-types.ts"
  }
}
```

**Key**: The `build` script runs changelog and manifest generation BEFORE `next build`. This ensures the PWA manifest and release notes are current. The `lint` script uses `eslint .` directly (not `next lint`) because the project uses ESLint flat config.

### Build Order

```
1. generate-changelog.mjs → public/release-notes.json (for in-app changelog)
2. generate-manifest.mjs  → public/manifest.json + public/sw.js (cache name)
3. next build             → .next/ output (pages, chunks, static assets)
4. Sentry source maps     → uploaded to Sentry (via @sentry/nextjs plugin)
```

---

## 2. Next.js Configuration

```typescript
// next.config.ts

import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // Required by Next.js
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' https://*.supabase.co https://*.ingest.sentry.io https://*.sentry.io",
      "worker-src 'self'",           // Service worker
      "object-src 'none'",           // Block plugins
      "frame-ancestors 'none'",      // Prevent iframe embedding
      "form-action 'self'",          // Restrict form submissions
      "base-uri 'self'",
      "upgrade-insecure-requests",   // Force HTTPS for all resources
    ].join('; '),
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Report-To',
    value: JSON.stringify({
      group: 'csp-endpoint',
      max_age: 10886400,
      endpoints: [{ url: '/api/csp-report' }],
    }),
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

// Sentry configuration
const sentryWebpackPluginOptions = {
  silent: true,
  dryRun: process.env.NODE_ENV !== 'production',
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
};

const shouldUseSentry =
  process.env.NEXT_PUBLIC_SENTRY_DSN &&
  (process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_SENTRY_FORCE_ENABLE === 'true');

// Async export — supports lazy-loaded bundle analyzer and conditional Sentry
export default async function buildConfig(): Promise<NextConfig> {
  let withBundleAnalyzer = (config: NextConfig) => config;
  if (process.env.ANALYZE === 'true') {
    const { default: bundleAnalyzer } = await import('@next/bundle-analyzer');
    withBundleAnalyzer = bundleAnalyzer({ enabled: true });
  }

  const configWithAnalyzer = withBundleAnalyzer(nextConfig);

  return shouldUseSentry
    ? withSentryConfig(configWithAnalyzer, sentryWebpackPluginOptions)
    : configWithAnalyzer;
}
```

---

## 3. Environment Variables

### `.env.example`

```bash
# === Required for Cloud Mode ===
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# === Error Monitoring ===
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_AUTH_TOKEN=sntrys_xxx              # Server-side only
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project

# === Optional ===
NEXT_PUBLIC_SENTRY_FORCE_ENABLE=false     # Force Sentry in dev
ANALYZE=false                              # Bundle analysis
```

### Security Rules

| Pattern | Rule |
|---------|------|
| `NEXT_PUBLIC_*` | Visible to client. NEVER put secrets here. |
| No `NEXT_PUBLIC_` prefix | Server-side only. Safe for secrets. |
| `SENTRY_AUTH_TOKEN` | Server-side. Used for source map upload. |
| `SUPABASE_SERVICE_ROLE_KEY` | NEVER `NEXT_PUBLIC_`. Only in Edge Functions. |

### Per-Environment Configuration

```
Vercel Project Settings:
├── Preview    → Staging Supabase URL + key
├── Production → Production Supabase URL + key
└── Development → .env.local (git-ignored)
```

---

## 4. Vercel Deployment

### Project Setup

```bash
# Install Vercel CLI
npm i -g vercel

# Link project
vercel link

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### Vercel Configuration

In Vercel Dashboard → Project Settings:

- **Framework Preset**: Next.js (auto-detected)
- **Build Command**: `npm run build` (uses the custom script with manifest generation)
- **Output Directory**: `.next` (default)
- **Node.js Version**: 20.x
- **Environment Variables**: Set per environment (preview, production)

### Branch Strategy

```
main/master → Production deployment
feature/*   → Preview deployment (auto)
```

---

## 5. Build Verification Checklist

Before deploying to production:

```bash
# 1. Lint passes
npm run lint

# 2. Tests pass
npm test

# 3. Build succeeds (catches ESLint errors, type errors, unused imports)
npm run build

# 4. No console errors in browser
npm start  # Then check browser console

# 5. PWA works
# - Install from browser
# - Works offline (disable network in DevTools)
# - Update notification shows after redeploy
```

### Common Build Failures

| Error | Fix |
|-------|-----|
| `@typescript-eslint/no-require-imports` | Use `import` not `require()` |
| `@typescript-eslint/no-explicit-any` | Use `unknown` + type assertions |
| `@typescript-eslint/no-unused-vars` | Prefix with `_` or remove |
| Hydration mismatch | Ensure `'use client'` on components using browser APIs |
| Module not found | Check path aliases in `tsconfig.json` |

---

## 6. Bundle Analysis

```bash
ANALYZE=true npm run build
```

Generates bundle visualization. Key things to check:
- Supabase SDK not in local-mode bundle (dynamic import)
- No duplicate dependencies
- Heavy libraries lazy-loaded (xlsx, etc.)

---

## Traps

1. **Build errors ≠ dev errors**: Code that works in `npm run dev` can fail in `npm run build` due to stricter ESLint, tree-shaking, and static analysis. Always test `npm run build` before deploying.

2. **Environment variables must be set in Vercel**: `.env.local` doesn't deploy. Set all required vars in Vercel project settings.

3. **Source maps should be hidden**: `hideSourceMaps: true` in Sentry config prevents exposing source code to the client. Sentry still gets them for error deobfuscation.

4. **CSP must include Supabase URL**: Without `connect-src` including the Supabase URL, all cloud requests are blocked by the browser.

5. **Manifest generation before build**: If `generate-manifest.mjs` doesn't run, the PWA manifest will be stale.
