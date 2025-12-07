# Play Store Release: PR-Chunked Implementation Plan

**Created**: December 7, 2025
**Status**: 🎯 **PRIORITY 1 - NEXT UP**
**Purpose**: Practical, PR-by-PR guide for Play Store release
**Related**: [master-execution-guide.md](./master-execution-guide.md) | [UNIFIED-ROADMAP.md](./UNIFIED-ROADMAP.md)

---

## Executive Summary

This document provides a **PR-chunked implementation plan** for releasing MatchOps-Local to the Google Play Store. Each PR is isolated, testable, and mergeable independently.

### Effort Estimate

| Phase | PRs | Hours | Risk |
|-------|-----|-------|------|
| P1: Security Hardening | #1-2 | 4-6h | LOW |
| P2: PWA & Store Packaging | #3-5 | 8-12h | MEDIUM |
| P3: Quality Gates | #6-7 | 4-6h | LOW |
| P4: Monetization | #8-10 | 8-12h | MEDIUM |
| P5: Release | #11 | 2-4h | LOW |
| **Total** | **11 PRs** | **26-40h** | |

**Timeline**: 2-3 weeks of focused work

---

## Branching Strategy

```
master
  └── release/play-store-v1  (integration branch)
        ├── ps/1-csp-headers → PR #1
        ├── ps/2-service-worker → PR #2
        ├── ps/3-manifest-icons → PR #3
        ├── ps/4-twa-setup → PR #4
        ├── ps/5-store-assets → PR #5
        ├── ps/6-accessibility → PR #6
        ├── ps/7-performance → PR #7
        ├── ps/8-billing-integration → PR #8
        ├── ps/9-feature-gating → PR #9
        ├── ps/10-paywall-ui → PR #10
        └── ps/11-store-submission → PR #11
              └── Final PR: release/play-store-v1 → master
```

### Branch Commands

```bash
# Create integration branch from master
git checkout master
git pull origin master
git checkout -b release/play-store-v1

# For each PR, branch from integration
git checkout release/play-store-v1
git checkout -b ps/1-csp-headers

# After PR merged to integration, update and continue
git checkout release/play-store-v1
git pull origin release/play-store-v1
git checkout -b ps/2-service-worker
```

---

## Phase P1: Security Hardening

**Goal**: Strengthen web security for production
**Risk**: LOW (configuration changes, no behavior change)
**Effort**: 4-6 hours

### PR #1: CSP Headers & Security Configuration (2-3h)

**Branch**: `ps/1-csp-headers`

**Purpose**: Add Content Security Policy and security headers appropriate for local-first PWA

**Tasks**:
1. Add CSP headers in `next.config.ts`
2. Configure allowed sources:
   - `self` for scripts/styles
   - Sentry for error reporting
   - Play Store API for license validation (future)
3. Add other security headers (X-Frame-Options, etc.)
4. Test that app functions correctly with CSP

**Files Changed**:
- `next.config.ts` (add headers configuration)
- Possibly `middleware.ts` if needed

**CSP Configuration** (local-first appropriate):
```typescript
// next.config.ts
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires these
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' https://*.sentry.io https://play.googleapis.com",
      "frame-ancestors 'none'",
    ].join('; ')
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];
```

**Acceptance Criteria**:
- [ ] CSP headers present in production build
- [ ] No CSP violations in console during normal use
- [ ] Sentry still works (error reporting)
- [ ] All app functionality works
- [ ] `npm run build` succeeds

---

### PR #2: Service Worker Hardening (2-3h)

**Branch**: `ps/2-service-worker`

**Purpose**: Ensure service worker caching is production-ready

**Tasks**:
1. Review `public/sw.js` caching strategy
2. Restrict caching to static assets only
3. Avoid caching HTML (prevents stale app)
4. Add versioned cache cleanup
5. Ensure update flow works correctly
6. Test offline functionality

**Current Issues to Address**:
- Remove `'/'` from pre-cache if present
- Add cache versioning for clean updates
- Ensure `skipWaiting` and `clientsClaim` work correctly

**Files Changed**:
- `public/sw.js`

**Acceptance Criteria**:
- [ ] Static assets cached correctly
- [ ] HTML not cached (fresh on each load)
- [ ] App updates when new version deployed
- [ ] Offline mode works for cached assets
- [ ] No stale content issues

---

## Phase P2: PWA & Store Packaging

**Goal**: Prepare app for Play Store submission
**Risk**: MEDIUM (external tools, store requirements)
**Effort**: 8-12 hours

### PR #3: PWA Manifest & Icons (3-4h)

**Branch**: `ps/3-manifest-icons`

**Purpose**: Finalize PWA manifest with production values

**Tasks**:
1. Review `manifest.json` / dynamic manifest
2. Ensure all required fields present:
   - `name`, `short_name`
   - `description`
   - `start_url`
   - `display: standalone`
   - `theme_color`, `background_color`
3. Create/verify maskable icons (192x192, 512x512)
4. Verify icons display correctly on Android
5. Test PWA installability

**Files Changed**:
- `public/manifest.json` or `scripts/generate-manifest.mjs`
- `public/icons/` (add/update icons)

**Icon Requirements**:
```json
{
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

**Acceptance Criteria**:
- [ ] Lighthouse PWA audit passes
- [ ] App installable as PWA
- [ ] Icons display correctly (not cut off)
- [ ] App name correct in launcher

---

### PR #4: TWA Build Setup (3-4h)

**Branch**: `ps/4-twa-setup`

**Purpose**: Set up Trusted Web Activity for Play Store

**Tasks**:
1. Install Bubblewrap CLI
2. Initialize TWA project
3. Configure `assetlinks.json` for domain verification
4. Build signed APK/AAB
5. Test on Android device/emulator

**New Files**:
- `twa/` directory with Bubblewrap config
- `.well-known/assetlinks.json` (or configured in Next.js)

**Commands**:
```bash
# Install Bubblewrap
npm install -g @aspect/aspect-cli @nicolo-ribaudo/nicolo-aspect-cli
npx @nicolo-ribaudo/nicolo-aspect-cli init

# Or use PWABuilder
# https://www.pwabuilder.com/
```

**Asset Links Configuration**:
```json
// public/.well-known/assetlinks.json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.matchops.local",
    "sha256_cert_fingerprints": ["YOUR_SIGNING_KEY_FINGERPRINT"]
  }
}]
```

**Acceptance Criteria**:
- [ ] TWA builds successfully
- [ ] APK/AAB installs on Android device
- [ ] App opens without address bar
- [ ] Asset links verified (green lock)

---

### PR #5: Store Listing Assets (2-4h)

**Branch**: `ps/5-store-assets`

**Purpose**: Prepare all assets for Play Store listing

**Tasks**:
1. Create/gather screenshots (phone + tablet)
2. Write store description (short + full)
3. Create feature graphic (1024x500)
4. Prepare Privacy Policy URL
5. Prepare Terms of Service URL
6. Document app category and content rating

**Deliverables** (not code, but needed):
- Screenshots: 2-8 per device type
- Feature graphic: 1024x500 PNG
- App icon: 512x512 PNG
- Short description: 80 chars
- Full description: 4000 chars
- Privacy Policy: hosted URL
- Terms of Service: hosted URL

**Files Changed**:
- `docs/07-business/store-listing/` (new directory)
- Store listing text files
- Screenshot directory

**Privacy Policy Notes**:
- Data stays on device (local-first)
- No user accounts (local mode)
- Error reporting via Sentry (opt-in)
- License validation only (Play Store API)

**Acceptance Criteria**:
- [ ] All required assets created
- [ ] Privacy Policy accessible via URL
- [ ] Terms of Service accessible via URL
- [ ] Store description finalized in EN

---

## Phase P3: Quality Gates

**Goal**: Ensure app meets quality standards
**Risk**: LOW (testing and auditing)
**Effort**: 4-6 hours

### PR #6: Accessibility Audit (2-3h)

**Branch**: `ps/6-accessibility`

**Purpose**: Fix critical accessibility issues

**Tasks**:
1. Run jest-axe on core screens
2. Fix critical violations (WCAG A/AA)
3. Test with screen reader (TalkBack)
4. Verify touch targets (48x48 minimum)
5. Check color contrast

**Files Changed**:
- Various component files (fixes)
- Test files (add a11y tests)

**Core Screens to Audit**:
- Home page / Soccer field
- Game settings modal
- Load game modal
- Player roster
- Stats views

**Acceptance Criteria**:
- [ ] No critical a11y violations
- [ ] jest-axe tests pass
- [ ] Touch targets ≥48x48
- [ ] Contrast ratios acceptable

---

### PR #7: Performance Baseline (2-3h)

**Branch**: `ps/7-performance`

**Purpose**: Document performance baselines

**Tasks**:
1. Run Lighthouse audit
2. Document baseline metrics
3. Fix any critical performance issues
4. Analyze bundle size
5. Ensure lazy loading works

**Metrics to Document**:
- Lighthouse Performance score
- First Contentful Paint
- Time to Interactive
- Bundle size (main chunks)

**Files Changed**:
- `docs/02-technical/performance-baseline.md` (new)
- Component fixes if needed

**Acceptance Criteria**:
- [ ] Lighthouse Performance ≥80
- [ ] No critical performance issues
- [ ] Bundle size documented
- [ ] Baselines recorded for comparison

### Should Consider (Future PRs)

These improvements are not blocking for Play Store release but would enhance CI/quality infrastructure:

1. **Enforce bundle size thresholds in CI**
   - Add automated bundle size checks to fail CI if thresholds exceeded
   - Reference: See bundle analysis setup in PR #7

2. **Add jest-axe type definitions**
   - Install `@types/jest-axe` or create custom declarations
   - Eliminates verbose type assertions like `(expect(results) as jest.JestMatchers<unknown> & { toHaveNoViolations: () => void })`
   - Makes accessibility tests cleaner

3. **Cross-platform bundle analysis**
   - Current setup uses Linux-specific commands
   - If Windows developers join the team, add cross-platform alternatives
   - Consider using Node.js-based analysis scripts instead of shell commands

---

## Phase P4: Monetization

**Goal**: Implement premium tier with Play Store billing
**Risk**: MEDIUM (external API, payment flow)
**Effort**: 8-12 hours

### PR #8: Play Store Billing Integration (3-4h)

**Branch**: `ps/8-billing-integration`

**Purpose**: Add Play Store billing API integration

**Tasks**:
1. Set up Play Console developer account
2. Create in-app product (one-time purchase)
3. Add billing library/API integration
4. Implement purchase flow
5. Handle purchase verification

**New Files**:
- `src/utils/playStoreBilling.ts`
- `src/hooks/usePremiumStatus.ts`

**Purchase Flow**:
```typescript
// src/utils/playStoreBilling.ts
export async function purchasePremium(): Promise<boolean>;
export async function checkPurchaseStatus(): Promise<boolean>;
export async function restorePurchase(): Promise<boolean>;
```

**Acceptance Criteria**:
- [ ] Can initiate purchase from app
- [ ] Purchase verification works
- [ ] Handles purchase errors gracefully
- [ ] Works in test mode

---

### PR #9: Feature Gating (3-4h)

**Branch**: `ps/9-feature-gating`

**Purpose**: Lock premium features for free users

**Tasks**:
1. Define free vs premium features
2. Create feature gate hook
3. Add gates to premium features
4. Cache license status locally
5. Handle offline mode (cached license)

**Premium Features** (suggested):
- Cloud backup (future)
- Multi-device sync (future)
- Advanced statistics
- Export to Excel
- Custom themes (future)

**Or simpler**: All features free, premium = "support the developer" with badge

**New Files**:
- `src/hooks/useFeatureGate.ts`
- `src/contexts/PremiumContext.tsx`

**Feature Gate Hook**:
```typescript
// src/hooks/useFeatureGate.ts
export function useFeatureGate(feature: PremiumFeature): {
  isAvailable: boolean;
  isPremium: boolean;
  showPaywall: () => void;
};
```

**Acceptance Criteria**:
- [ ] Free features work without purchase
- [ ] Premium features gated
- [ ] License cached for offline use
- [ ] Graceful handling when offline

---

### PR #10: Paywall UI (2-4h)

**Branch**: `ps/10-paywall-ui`

**Purpose**: Create UI for premium upgrade

**Tasks**:
1. Design paywall modal
2. Show feature comparison (free vs premium)
3. Add purchase button
4. Handle loading/success/error states
5. Add "Restore Purchase" option
6. Translations (EN/FI)

**New Files**:
- `src/components/PaywallModal.tsx`
- `src/components/PremiumBadge.tsx` (optional)

**UI Elements**:
- Feature list with checkmarks
- Price display
- Purchase button
- Restore purchase link
- Success/error states

**Acceptance Criteria**:
- [ ] Paywall displays correctly
- [ ] Purchase flow works end-to-end
- [ ] Restore purchase works
- [ ] Translations complete

---

## Phase P5: Release

**Goal**: Submit to Play Store and release
**Risk**: LOW (process, not code)
**Effort**: 2-4 hours

### PR #11: Store Submission (2-4h)

**Branch**: `ps/11-store-submission`

**Purpose**: Final preparation and submission

**Tasks**:
1. Final production build
2. Sign AAB with release key
3. Complete Play Console listing
4. Submit for review
5. Configure staged rollout (10% → 50% → 100%)
6. Set up Sentry release tracking

**Store Submission Checklist**:
- [ ] App signed with release key
- [ ] All store listing fields complete
- [ ] Screenshots uploaded
- [ ] Privacy Policy linked
- [ ] Content rating completed
- [ ] Pricing set (free + IAP)
- [ ] Target countries selected
- [ ] Review submitted

**Post-Submission**:
- [ ] Monitor review status
- [ ] Respond to any reviewer questions
- [ ] Plan staged rollout
- [ ] Configure Sentry alerts

**Acceptance Criteria**:
- [ ] App approved by Play Store
- [ ] Available in Play Store
- [ ] Installs correctly from store
- [ ] In-app purchase works

---

## Final Integration PR

**After all PRs merged to `release/play-store-v1`**:

```bash
# Create final PR from integration branch to master
git checkout release/play-store-v1
git pull origin release/play-store-v1

# Create PR: release/play-store-v1 → master
# Title: "Play Store Release v1.0"
# Description: Summary of all 11 PRs
```

---

## Risk Mitigation

### Testing Strategy

**After EACH PR**:
```bash
npm test                    # All tests pass
npm run lint               # No lint errors
npx tsc --noEmit           # TypeScript compiles
npm run build              # Production build succeeds
npm run dev                # Manual testing works
```

### Rollback Plan

Each PR is small and self-contained. If issues arise:
1. `git revert` the problematic commit
2. Fix the issue
3. Re-apply with fix

### Play Store Rejection Handling

Common rejection reasons and fixes:
- **Privacy Policy**: Ensure it's accessible and accurate
- **Permissions**: Only request what's needed
- **Content Rating**: Complete questionnaire accurately
- **Metadata**: No misleading descriptions

---

## Success Criteria

### Play Store Release Complete When:

- [ ] App approved and live in Play Store
- [ ] Installs correctly on Android devices
- [ ] All features work as expected
- [ ] In-app purchase functional
- [ ] No critical crashes (Sentry monitoring)
- [ ] Staged rollout plan in place

---

## Timeline

| Week | PRs | Focus |
|------|-----|-------|
| Week 1 | #1-4 | Security + PWA setup |
| Week 2 | #5-8 | Assets + Quality + Billing |
| Week 3 | #9-11 | Feature gating + Release |

---

## Related Documentation

- **Master Guide**: [master-execution-guide.md](./master-execution-guide.md)
- **Unified Roadmap**: [UNIFIED-ROADMAP.md](./UNIFIED-ROADMAP.md)
- **Monetization**: `docs/07-business/monetization-strategies.md`
- **Security**: `docs/02-technical/security.md`

---

## Change Log

| Date | Update |
|------|--------|
| 2025-12-07 | Initial plan created with 11 PRs |
