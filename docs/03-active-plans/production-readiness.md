# Production Readiness Fix Plan

Status: Authoritative (canonical checklist)

IMPORTANT — Authoritative Checklist
- This is the canonical, execution-focused checklist for production readiness.
- For background, rationale, and phased strategy, see development/PRODUCTION_READINESS_ROADMAP.md.

Start Here
- Who executes: Assign Owners below per section.
- How to track: Check off Acceptance items per section.
- Where to ask: Open issues with label "production-readiness".

Table of Contents
- 0) Prerequisites
- 1) Security Headers & CSP
- 2) Service Worker (SW) Hardening
- 3) De-duplicate PWA Components
- 4) Logging Normalization
- 5) Monitoring with Sentry (@sentry/nextjs)
- 6) Gate Analytics
- 7) i18n Lazy Loading
- 8) Test Stability Fix (window.location redefine)
- 9) CI / Dependency Security
- 10) Verification Plan (Staging)
- 11) Rollout & Rollback

---

## 0) Prerequisites

- Owner: TBD
- Target Date: TBD

- Node.js LTS installed locally and in CI.
- Ability to run the app locally: `npm i && npm run dev`.
- Vercel (or target platform) environment variables configured separately per environment (dev/staging/prod).
- Create a staging environment for validation before production rollout.

---

## 1) Security Headers & CSP

- Owner: TBD
- Target Date: TBD

Goal: enforce baseline web security via HTTP response headers.

Files to change:
- `next.config.ts` (add `async headers()` that returns an array of header rules).

Steps:
1. Add security headers to `next.config.ts`:
   - `Content-Security-Policy` (CSP) - appropriate for local-first PWA (see below)
   - `Permissions-Policy` (disable features not used)
   - `Referrer-Policy: no-referrer`
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY` (or `frame-ancestors 'none'` in CSP)
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (production HTTPS)

2. **CSP for Local-First PWA** (appropriate scope, not over-engineered):
   ```
   default-src 'self';
   script-src 'self' 'unsafe-inline' 'unsafe-eval';    # Next.js requirements
   style-src 'self' 'unsafe-inline';                    # Tailwind CSS
   img-src 'self' data: blob:;                          # PWA icons
   font-src 'self' data:;                               # Fonts
   connect-src 'self'
     https://*.sentry.io                                 # Error reporting (opt-in)
     https://play.google.com                             # License validation
     https://www.googleapis.com;                         # Play Store API
   manifest-src 'self';                                 # PWA manifest
   worker-src 'self';                                   # Service Worker
   frame-ancestors 'none';                              # No embedding
   ```

3. **What NOT to include** (over-engineering for our use case):
   - ❌ Complex nonce/hash generation (minimal XSS benefit, high complexity)
   - ❌ Strict `script-src` without unsafe-inline (Next.js incompatible)
   - ❌ CDN domains (all assets self-hosted)
   - ❌ Multiple API endpoints (we only have Play Store + Sentry)

4. Gate Sentry/Play Store origins with env flags (omit when disabled for minimal CSP)

5. Local verification:
   - `npm run dev`, check DevTools → Network → Response Headers
   - Watch console for CSP violations; only loosen if legitimate need

6. CI/CD: ensure headers apply in production builds

**Context**: As a local-first PWA with no backend, our CSP is simpler than typical web apps. Focus on XSS prevention, not API security.

Acceptance:
- Security headers visible on all routes.
- No unexpected CSP violations in normal flows.

---

## 2) Service Worker (SW) Hardening

- Owner: TBD
- Target Date: TBD

Goals: safe caching strategy, versioned cache cleanup, reduced runtime noise.

Files to change:
- `public/sw.js`
- (Optional) `scripts/generate-manifest.mjs` for cache version bumping.

Steps:
1. Introduce a versioned cache name (e.g., `const CACHE_NAME = 'matchops-static-v2';`).
2. Limit static pre-cache to known assets (icons, manifest, logo). Avoid `'/'` if you want network‑first for documents.
3. In `install`:
   - `event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_RESOURCES)))`.
   - Remove or guard `console.log` behind a build flag if possible.
4. In `activate`:
   - Delete old caches: iterate `caches.keys()` and remove names not matching `CACHE_NAME`.
   - `event.waitUntil(Promise.all([...]))` and `clients.claim()`.
5. In `fetch`:
   - For `request.destination === 'document'`: use network‑first (fallback to cached `'/'` only if explicitly desired for offline). Do not cache HTML responses long‑term.
   - For static assets (e.g., `request.destination` in `['style','script','image','font']`): use cache‑first; on miss, fetch and cache if response is 200 and cacheable. Optionally honor `Cache-Control` response headers.
   - Avoid caching API/unknown types by default.
6. Reduce logging in production (comment out or guard `console.log`).
7. Keep `SKIP_WAITING` message handling only when user confirms update (already true in UI).
8. Keep `scripts/generate-manifest.mjs` timestamp update to force SW file change; bump `CACHE_NAME` only when strategy/asset lists change.

Verification:
- Build (`npm run build`) and serve (`npm run start`), register SW in browser, inspect Application → Cache Storage for single active cache.
- Confirm old caches removed after new deploy.
- Verify online/offline behavior: assets load offline; HTML updates after user accepts update banner.

Acceptance:
- No stale HTML served after updates (post‑refresh or explicit update).
- Only intended assets cached; cache size remains bounded.

---

## 3) De‑duplicate PWA Components

- Owner: TBD
- Target Date: TBD

Goal: prevent double registration/prompts.

Files to change:
- `src/app/layout.tsx`
- `src/components/ClientWrapper.tsx`

Steps:
1. Decide a single place to render global PWA components. Recommendation: keep both `<ServiceWorkerRegistration />` and `<InstallPrompt />` only in `src/app/layout.tsx`.
2. Ensure there is only one `I18nInitializer` wrapping the app (no duplicate initialization between layout and ClientWrapper).
3. Remove duplicate components from `ClientWrapper`.
4. Validate at runtime that SW registers once and install prompt appears once; translations initialize once.

Acceptance:
- Only one update banner/prompt appears.
- SW registration logs at most once per page load (in dev).

---

## 4) Logging Normalization

- Owner: TBD
- Target Date: TBD

Goal: avoid production `console.*` noise; centralize through `logger`.

Files to change:
- Replace direct `console.log/error` in application code with `logger.log/error`.

Steps:
1. Search for `console.log|console.error` in `src/` and replace with `logger` calls.
2. Optionally gate `logger.error` to also report to Sentry when enabled.
3. Re‑run tests and manual smoke to ensure no behavioral changes.

Acceptance:
- No direct console noise in production; errors still surface via `logger.error` and monitoring (if enabled).

---

## 5) Monitoring with Sentry (@sentry/nextjs)

- Owner: TBD
- Target Date: TBD

Goal: capture runtime errors/performance in production.

Files to change/add:
- `package.json` (dependency): `@sentry/nextjs`
- `sentry.client.config.ts`, `sentry.server.config.ts` (generated by Sentry wizard)
- `src/components/ErrorBoundary.tsx` (optionally enrich reports)
- `.env.example` (document Sentry envs)

Steps:
1. Install: `npm i -E @sentry/nextjs`.
2. Run Sentry wizard: `npx @sentry/wizard@latest -i nextjs` (or add minimal config manually).
3. Configure DSNs via env:
   - `NEXT_PUBLIC_SENTRY_DSN` (public, per env)
   - `SENTRY_AUTH_TOKEN` (server‑only, CI for sourcemaps; never public)
   - `SENTRY_ENVIRONMENT` (production/staging/development)
   - `SENTRY_RELEASE` (CI injected git sha)
4. In `ErrorBoundary`, optionally call `Sentry.captureException(error, { extra: errorInfo })` when Sentry enabled.
5. Verify locally (staging DSN) by throwing a test error.

Acceptance:
- Errors reported to correct Sentry project/environment with release tags.
- No PII or sensitive local storage content is attached.

---

## 6) Gate Analytics

- Owner: TBD
- Target Date: TBD

Goal: avoid analytics in non‑prod or when disabled.

Files to change:
- `src/app/layout.tsx`
- `.env.example`

Steps:
1. Wrap `<Analytics />` with an env/flag check:
   - `process.env.NODE_ENV === 'production' && <Analytics />`
   - Or: `NEXT_PUBLIC_FEATURE_ADVANCED_ANALYTICS=true/false` and check flag.
2. Reflect flag defaults in `.env.example`.

Acceptance:
- Analytics only runs when explicitly enabled.

---

## 7) i18n Lazy Loading

- Owner: TBD
- Target Date: TBD

Goal: reduce initial JavaScript by loading only current locale resources.

Files to change:
- `src/i18n.ts`

Steps:
1. Replace static imports of JSON with dynamic loading using `i18next-http-backend` (already installed) or `import()` per locale.
2. Configure backend to fetch `/locales/{lng}/common.json` (these are in `public/locales`).
3. Initialize i18n with `resources: {}` and `backend` options; set `load: 'languageOnly'` if appropriate.
4. Test language switching and ensure SW caches locale files (optional).

Acceptance:
- Main bundle size decreases; translations still load correctly.

---

## 8) Test Stability Fix (window.location redefine)

- Owner: TBD
- Target Date: TBD

Goal: prevent afterAll failure in JSDOM environment.

Files to change:
- `src/setupTests.mjs`

Steps:
1. In `afterAll`, wrap the `Object.defineProperty(window, 'location', …)` in try/catch, and only redefine if it was previously overridden with a configurable descriptor.
2. Alternative: track a boolean when you override `window.location` in tests and restore only if changed.
3. Run: `npm run test:smoke` and `npm run test:unit` locally.

Acceptance:
- No test suite failure due to `Cannot redefine property: location`.

---

## 9) CI / Dependency Security

- Owner: TBD
- Target Date: TBD

Goal: keep dependencies current and block critical vulnerabilities from shipping.

Files to change:
- `.github/workflows/<ci>.yml` (if present)
- `package.json` (scripts)

Steps:
1. Add CI step to run `npm audit --omit=dev` and fail on `critical` for prod deps.
2. For dev deps, run `npm audit` but treat as non‑blocking; track via issue.
3. Add monthly Dependabot/Renovate for dependency updates.
4. Keep Playwright and Jest in sync with Next 15 / React 19.

Acceptance:
- CI blocks merges on critical prod vulns; regular updates enabled.

---

## 10) Verification Plan (Staging)

- Owner: TBD
- Target Date: TBD

Steps:
1. Deploy branch to staging with Sentry DSN (staging project) and analytics disabled.
2. Validate headers and CSP via DevTools on multiple pages.
3. Exercise offline/PWA flows; confirm cache cleanup and update flow via update banner.
4. Trigger a controlled error to confirm Sentry ingestion.
5. Run automated tests (Jest + Playwright) in CI for the branch.

Acceptance:
- All checks pass without regressions; no unexpected CSP errors; SW behaves as designed.

---

## 11) Rollout & Rollback

- Owner: TBD
- Target Date: TBD

Rollout:
- Merge to main; production deploy.
- Monitor Sentry and user feedback for 24–48h.

Rollback:
- Revert SW changes if offline issues observed (deploy previous SW and cache name);
- Re‑open caches page and instruct users to refresh; hotfix headers if CSP blocks legit resources.

---

## Quick Task Checklist

- [ ] Add security headers/CSP in `next.config.ts`.
- [ ] Harden SW: cache strategy + cleanup + reduced logs.
- [ ] Render PWA components only once (remove duplicates).
- [ ] Normalize logging via `logger`.
- [ ] Integrate Sentry; wire DSN/env; enrich `ErrorBoundary`.
- [ ] Gate analytics by env/flag.
- [ ] i18n lazy loading in `src/i18n.ts`.
- [ ] Fix JSDOM window.location redefine in tests.
- [ ] Add CI audit gates and dependency update automation.
- [ ] Validate on staging; monitor after production rollout.
