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

## 7. CI/CD Pipeline (GitHub Actions + Vercel)

### Architecture Overview

```
Developer pushes code
    │
    ▼
GitHub Actions (parallel checks)           Vercel (automatic)
├── ci.yml ─────────────────────┐          ├── Preview deploy (PRs)
│   ├── Lint                    │          └── Production deploy (master)
│   ├── Type Check              │
│   ├── Full Test Suite         │
│   ├── Production Build        │
│   └── Security Scan           │
│       └── all-checks gate ────┤
│                               │
├── test-guards.yml ────────────┤
│   ├── Critical integration    │
│   ├── Component smoke tests   │
│   ├── Performance tests       │
│   ├── Accessibility tests     │
│   └── Build + lint verify     │
│                               │
├── claude-code-review.yml ─────┤     (AI code review on PRs)
│                               │
├── full-test-suite.yml ────────┤     (master push only: integration + perf + a11y)
│                               │
└── update-test-badge.yml ──────┘     (master push only: auto-update README badge)

ALL checks must pass before merge.
Vercel auto-deploys on merge to master (production) and on PR push (preview).
```

### Workflow 1: CI — The Main Gate (`ci.yml`)

Runs on every push to master and every PR. All jobs run in parallel for speed. A summary job (`all-checks`) gates merge by requiring all jobs to pass.

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: ['**']

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  type-check:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npx tsc --noEmit

  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - name: Run all tests
        run: CI=true npx jest --ci --maxWorkers=2 --testTimeout=30000
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        if: always()
        with:
          fail_ci_if_error: false

  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - name: Check build output
        run: |
          if [ -d ".next" ]; then
            echo "Build successful"
            du -sh .next/
          else
            echo "Build failed - no .next directory found"
            exit 1
          fi

  security-scan:
    name: Security Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - name: Run security audit
        run: npm audit --audit-level=moderate
        continue-on-error: true
      - name: Check for outdated packages
        run: npx npm-check-updates --errorLevel 2 || true

  # Summary job — requires ALL above to pass
  all-checks:
    name: All CI Checks Passed
    runs-on: ubuntu-latest
    needs: [lint, type-check, test, build, security-scan]
    if: always()
    steps:
      - name: Verify all checks passed
        if: contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled')
        run: exit 1
      - name: Success
        run: echo "All CI checks passed"
```

**Key design decisions**:
- **Parallel jobs**: Lint, type-check, test, build, security-scan all run simultaneously
- **Summary gate**: `all-checks` job uses `needs: [...]` + `if: always()` to aggregate results — this is the single required status check in branch protection
- **`--maxWorkers=2`**: CI runners have limited CPU — too many workers causes OOM kills
- **`--testTimeout=30000`**: IndexedDB operations can be slow in CI
- **Security scan is `continue-on-error: true`**: Informational — don't block PRs on advisory warnings

### Workflow 2: Critical Path Guards (`test-guards.yml`)

Runs targeted test suites that are faster than the full suite. Comments on PR failures.

```yaml
name: Critical Path Guards
on:
  push:
    branches: [master, main, develop, feature/*]
  pull_request:
    branches: ['**']

jobs:
  critical-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run type-check
      - run: npm run test:critical       # Core user workflow tests
      - run: npm run test:smoke          # Component smoke tests
      - run: npm run test:performance    # Performance regression tests
      - run: npm run test:a11y           # Accessibility tests

      # Full coverage only on [full-test] commit tag or manual trigger
      - name: Full coverage (optional)
        if: contains(github.event.head_commit.message, '[full-test]') || github.event_name == 'workflow_dispatch'
        run: npm run test:ci

      # Comment on PR if tests fail
      - name: Comment on failure
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            if (context.eventName === 'pull_request') {
              github.rest.issues.createComment({
                issue_number: context.issue.number,
                owner: context.repo.owner,
                repo: context.repo.repo,
                body: `CRITICAL TESTS FAILED — Core functionality may be broken!\n\nPlease review and fix before merging.`
              });
            }

  build-verification:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: critical-tests
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run build
      - run: npm run lint

  # E2E tests — only when [e2e] tag in commit message
  e2e-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    needs: critical-tests
    if: github.event_name == 'pull_request' && contains(github.event.head_commit.message, '[e2e]')
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: e2e-report
          path: playwright-report/
          retention-days: 7
```

**Key patterns**:
- **Tiered test strategy**: Critical tests run fast on every PR; full suite is opt-in via `[full-test]` commit tag
- **E2E is opt-in**: Playwright tests only run when `[e2e]` appears in the commit message (expensive, not needed for every PR)
- **PR failure comments**: Automatically notifies PR author when critical tests fail
- **Test scripts mapping**: Define `test:critical`, `test:smoke`, `test:performance`, `test:a11y` in `package.json` using Jest path patterns

### Workflow 3: Full Test Suite (`full-test-suite.yml`)

Runs comprehensive tests only on master pushes (not PRs). Covers tests too slow for PR feedback loops.

```yaml
name: Full Test Suite
on:
  push:
    branches: [master]
    paths: ['src/**', 'tests/**', 'package.json', 'package-lock.json']
  workflow_dispatch:

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: npm ci
      - run: npm run test:integration
        timeout-minutes: 10

  performance-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: npm ci
      - run: npm run test:performance
        timeout-minutes: 5

  accessibility-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: npm ci
      - run: npm run test:a11y
        timeout-minutes: 5
```

### Workflow 4: AI Code Review (`claude-code-review.yml`)

Automatic AI code review on every PR using Claude Code Action.

```yaml
name: Claude Code Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  claude-review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1
      - uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          prompt: |
            Review this PR for: code quality, potential bugs, performance,
            security concerns, and test coverage.
            Use the repository's CLAUDE.md for style and convention guidance.
            Use `gh pr comment` to leave your review.
          claude_args: '--allowed-tools "Bash(gh pr comment:*),Bash(gh pr diff:*),Bash(gh pr view:*)"'
```

**Setup**: Requires `CLAUDE_CODE_OAUTH_TOKEN` secret. See [Claude Code Action docs](https://github.com/anthropics/claude-code-action) for authentication setup.

### Workflow 5: Test Badge Auto-Update (`update-test-badge.yml`)

Keeps the README test count badge current. Runs after master pushes that touch source/test files.

```yaml
name: Update Test Badge
on:
  push:
    branches: [master]
    paths: ['src/**', 'tests/**', '*.config.*', 'package.json']

jobs:
  update-badge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: npm ci
      - name: Run tests and extract count
        id: test-count
        run: |
          TEST_OUTPUT=$(CI=true npx jest --ci --maxWorkers=2 --testTimeout=10000 2>&1) || true
          PASSING=$(echo "$TEST_OUTPUT" | grep -oP 'Tests:\s+(\d+ failed, )?\K\d+(?= passed)' | tail -1)
          echo "passing=$PASSING" >> $GITHUB_OUTPUT
      - name: Update README badge
        run: |
          PASSING=${{ steps.test-count.outputs.passing }}
          BADGE_COUNT=$(( (PASSING / 5) * 5 ))
          sed -i "s/tests-[0-9]*+-/tests-${BADGE_COUNT}+-/" README.md
      - name: Commit changes
        run: |
          git config --local user.email "github-actions[bot]@users.noreply.github.com"
          git config --local user.name "github-actions[bot]"
          git diff --quiet README.md || (git add README.md && git commit -m "chore: update test count badge [skip ci]" && git push || true)
```

**Key**: Uses `[skip ci]` in the commit message to prevent infinite CI loops when the badge commit triggers another push.

### Vercel Automatic Deployment

Vercel handles deployment automatically — no GitHub Actions workflow needed for deploys.

```
Git Push
    │
    ├── Push to PR branch  → Vercel Preview Deployment (unique URL per commit)
    │                         └── URL posted as PR comment automatically
    │
    └── Merge to master    → Vercel Production Deployment
                              └── Deployed to production domain
```

**How it works**:
1. Connect your GitHub repo to Vercel (one-time setup via Vercel dashboard)
2. Vercel automatically builds and deploys on every push
3. Preview deployments for PRs, production deployments for master
4. Build command: `npm run build` (includes manifest + changelog generation)
5. Environment variables set per environment in Vercel dashboard (Preview, Production)

**No GitHub Actions workflow needed** — Vercel's GitHub integration handles this natively. This is separate from (and parallel to) CI checks.

### Recommended package.json Test Scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest --ci --maxWorkers=1 --testTimeout=8000 src/",
    "test:critical": "jest --ci --testPathPatterns='critical|integration' --maxWorkers=2",
    "test:smoke": "jest --ci --testPathPatterns='smoke' --maxWorkers=2",
    "test:performance": "jest --ci --testPathPatterns='performance' --maxWorkers=1",
    "test:a11y": "jest --ci --testPathPatterns='a11y|accessibility' --maxWorkers=1",
    "test:integration": "jest --ci --testPathPatterns='integration' --maxWorkers=2",
    "test:ci": "jest --ci --maxWorkers=2 --testTimeout=30000",
    "type-check": "tsc --noEmit"
  }
}
```

**Key**: Jest 30 uses `--testPathPatterns` (plural). The singular `--testPathPattern` silently does nothing.

### Branch Protection Setup

In GitHub repo settings → Branches → Branch protection rules for `master`:

- **Require status checks to pass**: Enable
  - Required checks: `All CI Checks Passed` (the summary gate from ci.yml)
- **Require branches to be up to date**: Enable
- **Require pull request reviews**: Enable (at least 1 approval)
- **Do not allow bypassing**: Enable for safety

---

## Traps

1. **Build errors ≠ dev errors**: Code that works in `npm run dev` can fail in `npm run build` due to stricter ESLint, tree-shaking, and static analysis. Always test `npm run build` before deploying.

2. **Environment variables must be set in Vercel**: `.env.local` doesn't deploy. Set all required vars in Vercel project settings.

3. **Source maps should be hidden**: `hideSourceMaps: true` in Sentry config prevents exposing source code to the client. Sentry still gets them for error deobfuscation.

4. **CSP must include Supabase URL**: Without `connect-src` including the Supabase URL, all cloud requests are blocked by the browser.

5. **Manifest generation before build**: If `generate-manifest.mjs` doesn't run, the PWA manifest will be stale.
